export interface QuicFlConfig {
  sparsity: number;
  quantBits: number;
  errorFeedback: boolean;
  quantize: boolean;
}

export interface QuicFlState {
  errorAccumulator: number[] | null;
  step: number;
  totalBytesSent: number;
  totalBytesOriginal: number;
}

export interface CompressedGradient {
  indices: Uint32Array;
  values: Float32Array | Int8Array;
  scale?: number;
  offset?: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export class QuicFlCompressor {
  private config: QuicFlConfig;
  private state: QuicFlState;

  constructor(config: Partial<QuicFlConfig> = {}) {
    this.config = {
      sparsity: config.sparsity ?? 0.01,
      quantBits: config.quantBits ?? 4,
      errorFeedback: config.errorFeedback ?? true,
      quantize: config.quantize ?? true,
    };
    this.state = {
      errorAccumulator: null,
      step: 0,
      totalBytesSent: 0,
      totalBytesOriginal: 0,
    };
  }

  reset(): void {
    this.state = {
      errorAccumulator: null,
      step: 0,
      totalBytesSent: 0,
      totalBytesOriginal: 0,
    };
  }

  compress(gradient: number[]): CompressedGradient {
    const n = gradient.length;
    if (n === 0) {
      return {
        indices: new Uint32Array(0),
        values: new Float32Array(0),
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 1,
      };
    }

    let effectiveGrad: number[];
    let errorSource: number[] | null = null;

    if (this.config.errorFeedback && this.state.errorAccumulator) {
      effectiveGrad = new Array(n);
      for (let i = 0; i < n; i++) {
        effectiveGrad[i] = gradient[i] + this.state.errorAccumulator[i];
      }
    } else {
      effectiveGrad = gradient;
    }

    if (this.config.errorFeedback) {
      errorSource = new Array(n);
      for (let i = 0; i < n; i++) errorSource[i] = effectiveGrad[i];
    }

    const k = Math.max(1, Math.min(n - 1, Math.ceil(this.config.sparsity * n)));
    const threshold = this._quickSelectAbs(effectiveGrad, n - k);

    const selectedIndices: number[] = [];
    const selectedValues: number[] = [];
    for (let i = 0; i < n; i++) {
      if (Math.abs(effectiveGrad[i]) >= threshold) {
        selectedIndices.push(i);
        selectedValues.push(effectiveGrad[i]);
      }
    }

    let values: Int8Array | Float32Array;
    let scale: number | undefined;
    let offset: number | undefined;

    if (this.config.quantize && selectedValues.length > 0) {
      let minVal = selectedValues[0];
      let maxVal = selectedValues[0];
      for (let i = 1; i < selectedValues.length; i++) {
        if (selectedValues[i] < minVal) minVal = selectedValues[i];
        if (selectedValues[i] > maxVal) maxVal = selectedValues[i];
      }
      const range = maxVal - minVal;
      const quantMax = (1 << this.config.quantBits) - 1;

      offset = minVal;
      scale = range / quantMax;

      values = new Int8Array(selectedValues.length);
      if (this.config.quantBits <= 4) {
        for (let i = 0; i < selectedValues.length; i++) {
          const q = range < 1e-10 ? 0 : Math.round((selectedValues[i] - minVal) / range * quantMax);
          values[i] = Math.max(0, Math.min(quantMax, q));
        }
      } else {
        const half = 128;
        for (let i = 0; i < selectedValues.length; i++) {
          const q = range < 1e-10 ? 0 : Math.round((selectedValues[i] - minVal) / range * quantMax);
          const clamped = Math.max(0, Math.min(quantMax, q));
          values[i] = clamped - half;
        }
      }
    } else {
      values = new Float32Array(selectedValues);
    }

    const indices = new Uint32Array(selectedIndices);
    const compressedSize = indices.byteLength + values.byteLength + (scale !== undefined ? 8 : 0);
    const originalSize = n * 4;

    if (this.config.errorFeedback && errorSource) {
      const decompressed = this._reconstructFromSelected(
        indices,
        values,
        scale,
        offset,
        n
      );
      if (!this.state.errorAccumulator) {
        this.state.errorAccumulator = new Array(n).fill(0);
      }
      for (let i = 0; i < n; i++) {
        this.state.errorAccumulator[i] = errorSource[i] - decompressed[i];
      }
    }

    this.state.step++;
    this.state.totalBytesSent += compressedSize;
    this.state.totalBytesOriginal += originalSize;

    return {
      indices,
      values,
      scale,
      offset,
      originalSize,
      compressedSize,
      compressionRatio: compressedSize > 0 ? originalSize / compressedSize : 1,
    };
  }

  decompress(compressed: CompressedGradient): number[] {
    return this._reconstructFromSelected(
      compressed.indices,
      compressed.values,
      compressed.scale,
      compressed.offset,
      compressed.originalSize / 4
    );
  }

  getStats(): { compressionRatio: number; bytesSaved: number; step: number } {
    const bytesSaved = this.state.totalBytesOriginal - this.state.totalBytesSent;
    return {
      compressionRatio:
        this.state.totalBytesSent > 0
          ? this.state.totalBytesOriginal / this.state.totalBytesSent
          : 1,
      bytesSaved,
      step: this.state.step,
    };
  }

  updateConfig(config: Partial<QuicFlConfig>): void {
    if (config.sparsity !== undefined) this.config.sparsity = config.sparsity;
    if (config.quantBits !== undefined) {
      this.config.quantBits = config.quantBits === 4 || config.quantBits === 8 ? config.quantBits : 4;
    }
    if (config.errorFeedback !== undefined) this.config.errorFeedback = config.errorFeedback;
    if (config.quantize !== undefined) this.config.quantize = config.quantize;
  }

  static decompressStatic(compressed: CompressedGradient, _sparsity: number): number[] {
    const n = compressed.originalSize / 4;
    const result = new Array(n).fill(0);
    const isQuantized = compressed.values instanceof Int8Array && compressed.scale !== undefined;
    const half = 128;

    for (let i = 0; i < compressed.indices.length; i++) {
      const idx = compressed.indices[i];
      if (isQuantized) {
        const qVal = compressed.values[i] as number;
        const unsigned = compressed.offset !== undefined ? qVal : (compressed.scale !== undefined && compressed.scale > 1e-10 ? qVal + half : qVal);
        if (compressed.offset !== undefined && compressed.scale !== undefined) {
          result[idx] = unsigned * compressed.scale + compressed.offset;
        } else if (compressed.scale !== undefined) {
          const quantMax = 255;
          result[idx] = (unsigned / quantMax * 2 - 1) * compressed.scale;
        } else {
          result[idx] = unsigned;
        }
      } else {
        result[idx] = compressed.values[i] as number;
      }
    }
    return result;
  }

  private _quickSelectAbs(arr: number[], k: number): number {
    const absArr = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) absArr[i] = Math.abs(arr[i]);
    return this._quickSelect(absArr, 0, arr.length - 1, k);
  }

  private _quickSelect(
    arr: number[],
    left: number,
    right: number,
    k: number
  ): number {
    while (left < right) {
      const pivotIndex = this._partition(arr, left, right);
      if (k === pivotIndex) return arr[k];
      if (k < pivotIndex) right = pivotIndex - 1;
      else left = pivotIndex + 1;
    }
    return arr[left];
  }

  private _partition(
    arr: number[],
    left: number,
    right: number
  ): number {
    const pivot = arr[right];
    let i = left;
    for (let j = left; j < right; j++) {
      if (arr[j] <= pivot) {
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
        i++;
      }
    }
    arr[right] = arr[i];
    arr[i] = pivot;
    return i;
  }

  private _reconstructFromSelected(
    indices: Uint32Array,
    values: Float32Array | Int8Array,
    scale: number | undefined,
    offset: number | undefined,
    n: number
  ): number[] {
    const result = new Array(n).fill(0);
    const isQuantized = values instanceof Int8Array && scale !== undefined;
    const half = 128;

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (isQuantized) {
        const qVal = values[i] as number;
        if (offset !== undefined) {
          const unsigned = qVal < 0 ? qVal + half : qVal;
          result[idx] = unsigned * scale + offset;
        } else {
          const unsigned = qVal + half;
          const quantMax = 255;
          result[idx] = (unsigned / quantMax * 2 - 1) * scale;
        }
      } else {
        result[idx] = values[i] as number;
      }
    }
    return result;
  }
}
