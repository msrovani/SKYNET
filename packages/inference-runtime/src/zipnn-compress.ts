export type QuantBitWidth = 2 | 4 | 8;

export interface ZipNNConfig {
  blockSize: number;
  quantBits: QuantBitWidth;
  compressionLevel: 1 | 2 | 3;
  entropyCoder: 'huffman' | 'arithmetic';
}

export interface ZipNNResult {
  compressedData: Uint8Array;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  metadata: ZipNNMetadata;
}

export interface ZipNNMetadata {
  blockSize: number;
  quantBits: number;
  entropyCoder: string;
  originalShape: number[];
  originalDtype: string;
}

function packBits(values: number[], bitsPerValue: number): Uint8Array {
  const totalBits = values.length * bitsPerValue;
  const byteLen = Math.ceil(totalBits / 8);
  const packed = new Uint8Array(byteLen);
  let bitPos = 0;
  for (const v of values) {
    for (let b = 0; b < bitsPerValue; b++) {
      if (v & (1 << b)) {
        const byteIdx = Math.floor(bitPos / 8);
        const bitIdx = bitPos % 8;
        packed[byteIdx] |= (1 << bitIdx);
      }
      bitPos++;
    }
  }
  return packed;
}

function unpackBits(packed: Uint8Array, numValues: number, bitsPerValue: number): number[] {
  const values: number[] = [];
  let bitPos = 0;
  for (let i = 0; i < numValues; i++) {
    let v = 0;
    for (let b = 0; b < bitsPerValue; b++) {
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = bitPos % 8;
      if (packed[byteIdx] & (1 << bitIdx)) {
        v |= (1 << b);
      }
      bitPos++;
    }
    values.push(v);
  }
  return values;
}

export class ZipNNCompressor {
  config: ZipNNConfig;

  constructor(config?: Partial<ZipNNConfig>) {
    this.config = {
      blockSize: config?.blockSize || 256,
      quantBits: config?.quantBits || 4,
      compressionLevel: config?.compressionLevel || 2,
      entropyCoder: config?.entropyCoder || 'huffman',
    };
  }

  async compress(data: Float32Array): Promise<ZipNNResult> {
    if (data.length === 0) {
      return { compressedData: new Uint8Array(36), originalSize: 0, compressedSize: 36, compressionRatio: 1, metadata: { blockSize: this.config.blockSize, quantBits: this.config.quantBits, entropyCoder: this.config.entropyCoder, originalShape: [], originalDtype: 'f32' } };
    }
    const originalSize = data.length * 4;
    const quantizer = new Quantizer(this.config.quantBits);
    const quantized = quantizer.quantize(data);

    const encoder = new EntropyEncoder(this.config.quantBits);
    const encoded = encoder.encode(quantized);

    const minValue = Math.min(...data);
    const maxValue = Math.max(...data);
    const metadata: ZipNNMetadata = {
      blockSize: this.config.blockSize,
      quantBits: this.config.quantBits,
      entropyCoder: this.config.entropyCoder,
      originalShape: [data.length],
      originalDtype: 'f32',
    };

    const compressed = new Uint8Array(36 + encoded.length);
    const view = new DataView(compressed.buffer);
    view.setUint32(0, 0x5A4E4e4a, true);
    view.setUint32(4, 1, true);
    view.setUint32(8, data.length, true);
    view.setUint32(12, this.config.blockSize, true);
    view.setUint32(16, this.config.quantBits, true);
    view.setUint32(20, this.config.entropyCoder === 'huffman' ? 0 : 1, true);
    view.setUint32(24, 0x0001, true);
    view.setFloat32(28, minValue, true);
    view.setFloat32(32, maxValue, true);
    compressed.set(encoded, 36);

    const compressedSize = compressed.length;
    const compressionRatio = compressedSize > 0 ? originalSize / compressedSize : 0;

    return {
      compressedData: compressed,
      originalSize,
      compressedSize,
      compressionRatio: compressionRatio || 1,
      metadata,
    };
  }

  async decompress(compressedData: Uint8Array, metadata: ZipNNMetadata): Promise<Float32Array> {
    const headerSize = compressedData.length >= 36 ? 36 : 28;
    const view = new DataView(compressedData.buffer, compressedData.byteOffset);
    const minValue = headerSize >= 36 ? view.getFloat32(28, true) : -1;
    const maxValue = headerSize >= 36 ? view.getFloat32(32, true) : 1;

    const body = compressedData.slice(headerSize);
    const decoder = new EntropyDecoder();
    const quantized = decoder.decode(body);

    const dequantizer = new Dequantizer(metadata.quantBits, minValue, maxValue);
    const decompressed = dequantizer.dequantize(quantized);

    const expected = metadata.originalShape[0];
    if (decompressed.length >= expected) {
      return decompressed.slice(0, expected);
    }
    const padded = new Float32Array(expected);
    padded.set(decompressed);
    return padded;
  }
}

const MAX_QUANT_LOOKUP: Record<number, number> = { 2: 3, 4: 15, 8: 255 };

class Quantizer {
  private quantBits: number;

  constructor(quantBits: number) {
    this.quantBits = quantBits;
  }

  quantize(data: Float32Array): Uint32Array {
    if (data.length === 0) return new Uint32Array(0);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const maxQuant = MAX_QUANT_LOOKUP[this.quantBits] ?? 255;
    const scale = range < 1e-10 ? 1 : range / maxQuant;

    const quantized = new Uint32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const value = Math.round((data[i] - min) / scale);
      quantized[i] = value < 0 ? 0 : value > maxQuant ? maxQuant : value;
    }

    return quantized;
  }
}

class Dequantizer {
  private quantBits: number;
  private minValue: number;
  private maxValue: number;

  constructor(quantBits: number, minValue = -1, maxValue = 1) {
    this.quantBits = quantBits;
    this.minValue = minValue;
    this.maxValue = maxValue;
  }

  dequantize(quantized: Uint32Array): Float32Array {
    const maxQuant = MAX_QUANT_LOOKUP[this.quantBits] ?? 255;
    const range = this.maxValue - this.minValue;
    const scale = range < 1e-10 ? 1 : range / maxQuant;
    const dequantized = new Float32Array(quantized.length);
    for (let i = 0; i < quantized.length; i++) {
      dequantized[i] = quantized[i] * scale + this.minValue;
    }
    return dequantized;
  }
}

class EntropyEncoder {
  private bitsPerValue: number;

  constructor(bitsPerValue: number) {
    this.bitsPerValue = bitsPerValue;
  }

  encode(data: Uint32Array): Uint8Array {
    const values = Array.from(data);
    const packed = packBits(values, this.bitsPerValue);
    const header = new Uint8Array(8);
    const view = new DataView(header.buffer);
    view.setUint32(0, data.length, true);
    view.setUint32(4, this.bitsPerValue, true);
    const result = new Uint8Array(8 + packed.length);
    result.set(header, 0);
    result.set(packed, 8);
    return result;
  }
}

class EntropyDecoder {
  decode(data: Uint8Array): Uint32Array {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const length = view.getUint32(0, true);
    const bitsPerValue = view.getUint32(4, true);
    const packed = data.slice(8);
    const values = unpackBits(packed, length, bitsPerValue);
    return new Uint32Array(values);
  }
}
