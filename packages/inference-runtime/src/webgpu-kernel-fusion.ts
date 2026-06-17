export interface FusionConfig {
  activation: 'relu' | 'gelu' | 'none';
  blockSize: number;
}

export interface FusionResult {
  output: Float32Array;
  gpuTimeMs: number;
  kernelName: string;
}

export class WebGpuKernelFusion {
  private device: any | null = null;
  private adapter: any | null = null;
  private pipelineCache: Map<string, any> = new Map();
  private config: FusionConfig;

  constructor(config?: Partial<FusionConfig>) {
    this.config = {
      activation: 'relu',
      blockSize: 256,
      ...config,
    };
  }

  static isAvailable(): boolean {
    if (typeof navigator === 'undefined') return false;
    return 'gpu' in navigator && (navigator as any).gpu !== null;
  }

  async initialize(): Promise<boolean> {
    if (!WebGpuKernelFusion.isAvailable()) return false;
    try {
      this.adapter = await (navigator as any).gpu.requestAdapter();
      if (!this.adapter) return false;
      this.device = await (this.adapter as any).requestDevice();
      return true;
    } catch {
      return false;
    }
  }

  private createPipeline(shaderCode: string, entryPoint: string = 'main'): any {
    const module = (this.device as any).createShaderModule({ code: shaderCode });
    return (this.device as any).createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint },
    });
  }

  private activationExpr(activation: string): string {
    switch (activation) {
      case 'relu':
        return 'max(val, 0.0)';
      case 'gelu': {
        const c = 0.7978845608028654;
        return `0.5 * val * (1.0 + tanh(${c} * (val + 0.044715 * val * val * val)))`;
      }
      default:
        return 'val';
    }
  }

  private getMatmulShader(activation: string): string {
    const act = this.activationExpr(activation);
    return `
      @group(0) @binding(0) var<storage, read> a: array<f32>;
      @group(0) @binding(1) var<storage, read> b: array<f32>;
      @group(0) @binding(2) var<storage, read_write> c: array<f32>;

      struct Uniforms { M: u32, K: u32, N: u32, pad: u32 };
      @group(0) @binding(3) var<uniform> uniforms: Uniforms;

      var<workgroup> tileA: array<array<f32, 16>, 16>;
      var<workgroup> tileB: array<array<f32, 16>, 16>;

      @compute @workgroup_size(16, 16)
      fn main(
        @builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wgid: vec3<u32>,
      ) {
        let row = wgid.y * 16u + lid.y;
        let col = wgid.x * 16u + lid.x;
        var sum = 0.0;
        let numTiles = (uniforms.K + 15u) / 16u;

        for (var t = 0u; t < numTiles; t = t + 1u) {
          let aRow = row;
          let aCol = t * 16u + lid.x;
          if (aRow < uniforms.M && aCol < uniforms.K) {
            tileA[lid.y][lid.x] = a[aRow * uniforms.K + aCol];
          } else {
            tileA[lid.y][lid.x] = 0.0;
          }

          let bRow = t * 16u + lid.y;
          let bCol = col;
          if (bRow < uniforms.K && bCol < uniforms.N) {
            tileB[lid.y][lid.x] = b[bRow * uniforms.N + bCol];
          } else {
            tileB[lid.y][lid.x] = 0.0;
          }

          workgroupBarrier();

          for (var k = 0u; k < 16u; k = k + 1u) {
            sum = sum + tileA[lid.y][k] * tileB[k][lid.x];
          }

          workgroupBarrier();
        }

        if (row < uniforms.M && col < uniforms.N) {
          let val = sum;
          c[row * uniforms.N + col] = ${act};
        }
      }
    `;
  }

  private getActivationShader(activation: string, workgroupSize: number): string {
    const act = this.activationExpr(activation);
    return `
      @group(0) @binding(0) var<storage, read_write> data: array<f32>;
      @group(0) @binding(1) var<uniform> size: u32;

      @compute @workgroup_size(${workgroupSize})
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        if (gid.x < size) {
          let val = data[gid.x];
          data[gid.x] = ${act};
        }
      }
    `;
  }

  private async readBuffer(buffer: any, _byteLength: number): Promise<Float32Array> {
    await (buffer as any).mapAsync(1);
    const mapped = new Float32Array((buffer as any).getMappedRange());
    const result = new Float32Array(mapped.length);
    result.set(mapped);
    (buffer as any).unmap();
    return result;
  }

  async matmul(
    A: Float32Array, B: Float32Array,
    M: number, K: number, N: number
  ): Promise<FusionResult> {
    return this.matmulActivation(A, B, M, K, N, 'none');
  }

  async matmulActivation(
    A: Float32Array, B: Float32Array,
    M: number, K: number, N: number,
    activation: 'relu' | 'gelu' | 'none'
  ): Promise<FusionResult> {
    if (!this.device) {
      throw new Error('WebGPU not initialized. Call initialize() first.');
    }

    const gpuStart = performance.now();
    const kernelName = `matmul_${activation}`;

    let pipeline = this.pipelineCache.get(kernelName);
    if (!pipeline) {
      pipeline = this.createPipeline(this.getMatmulShader(activation));
      this.pipelineCache.set(kernelName, pipeline);
    }

    const aSize = A.byteLength;
    const bSize = B.byteLength;
    const cSize = M * N * 4;

    const bufferA = (this.device as any).createBuffer({
      size: aSize,
      usage: 0x80 | 0x04,
    });
    const bufferB = (this.device as any).createBuffer({
      size: bSize,
      usage: 0x80 | 0x04,
    });
    const bufferC = (this.device as any).createBuffer({
      size: cSize,
      usage: 0x80 | 0x01,
    });
    const uniformBuf = (this.device as any).createBuffer({
      size: 16,
      usage: 0x40 | 0x04,
    });

    (this.device as any).queue.writeBuffer(bufferA, 0, A.buffer);
    (this.device as any).queue.writeBuffer(bufferB, 0, B.buffer);
    (this.device as any).queue.writeBuffer(uniformBuf, 0, new Uint32Array([M, K, N, 0]).buffer);

    const bindGroup = (this.device as any).createBindGroup({
      layout: (pipeline as any).getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufferA } },
        { binding: 1, resource: { buffer: bufferB } },
        { binding: 2, resource: { buffer: bufferC } },
        { binding: 3, resource: { buffer: uniformBuf } },
      ],
    });

    const workgroupsX = Math.ceil(N / 16);
    const workgroupsY = Math.ceil(M / 16);
    const encoder = (this.device as any).createCommandEncoder();
    const pass = (encoder as any).beginComputePass();
    (pass as any).setPipeline(pipeline);
    (pass as any).setBindGroup(0, bindGroup);
    (pass as any).dispatchWorkgroups(workgroupsX, workgroupsY);
    (pass as any).end();

    const readback = (this.device as any).createBuffer({
      size: cSize,
      usage: 0x02 | 0x08,
    });
    (encoder as any).copyBufferToBuffer(bufferC, 0, readback, 0, cSize);
    (this.device as any).queue.submit([(encoder as any).finish()]);

    const output = await this.readBuffer(readback, cSize);
    const gpuTimeMs = Math.round((performance.now() - gpuStart) * 100) / 100;

    return { output, gpuTimeMs, kernelName };
  }

  async activate(data: Float32Array, activation: 'relu' | 'gelu'): Promise<FusionResult> {
    if (!this.device) {
      throw new Error('WebGPU not initialized. Call initialize() first.');
    }

    const gpuStart = performance.now();
    const kernelName = `activate_${activation}`;

    let pipeline = this.pipelineCache.get(kernelName);
    if (!pipeline) {
      const wgs = Math.min(this.config.blockSize, 256);
      pipeline = this.createPipeline(this.getActivationShader(activation, wgs));
      this.pipelineCache.set(kernelName, pipeline);
    }

    const dataSize = data.byteLength;
    const numElements = data.length;

    const buffer = (this.device as any).createBuffer({
      size: dataSize,
      usage: 0x80 | 0x04 | 0x01,
    });
    const uniformBuf = (this.device as any).createBuffer({
      size: 4,
      usage: 0x40 | 0x04,
    });

    (this.device as any).queue.writeBuffer(buffer, 0, data.buffer);
    (this.device as any).queue.writeBuffer(uniformBuf, 0, new Uint32Array([numElements]).buffer);

    const bindGroup = (this.device as any).createBindGroup({
      layout: (pipeline as any).getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: { buffer: uniformBuf } },
      ],
    });

    const wgs = Math.min(this.config.blockSize, 256);
    const workgroupsX = Math.ceil(numElements / wgs);
    const encoder = (this.device as any).createCommandEncoder();
    const pass = (encoder as any).beginComputePass();
    (pass as any).setPipeline(pipeline);
    (pass as any).setBindGroup(0, bindGroup);
    (pass as any).dispatchWorkgroups(workgroupsX);
    (pass as any).end();

    const readback = (this.device as any).createBuffer({
      size: dataSize,
      usage: 0x02 | 0x08,
    });
    (encoder as any).copyBufferToBuffer(buffer, 0, readback, 0, dataSize);
    (this.device as any).queue.submit([(encoder as any).finish()]);

    const output = await this.readBuffer(readback, dataSize);
    const gpuTimeMs = Math.round((performance.now() - gpuStart) * 100) / 100;

    return { output, gpuTimeMs, kernelName };
  }

  destroy(): void {
    this.pipelineCache.clear();
    if (this.device) {
      (this.device as any).destroy();
      this.device = null;
    }
    this.adapter = null;
  }
}
