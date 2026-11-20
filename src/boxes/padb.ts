import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';
import { checkEntryCountFits } from '#/boxes/entry-count';

class PaddingBit {
  constructor(
    public pad1: number,
    public pad2: number,
  ) {}
}

export class padbBox extends FullBox {
  static override readonly fourcc = 'padb' as const;
  box_name = 'PaddingBitsBox' as const;

  padbits: Array<PaddingBit>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    if (this.size - this.hdr_size < 4) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    const sample_count = stream.readUint32();
    this.padbits = [];
    const byte_count = Math.floor((sample_count + 1) / 2);
    const invalid = checkEntryCountFits(this, stream, byte_count, 1, 'padding-bit entries');
    if (invalid) return invalid;
    for (let i = 0; i < byte_count; i++) {
      const bits = stream.readUint8();
      const pad1 = (bits & 0x70) >> 4; // 5,6,7 bits
      const pad2 = bits & 0x07; // 0,1,2 bits
      this.padbits.push(new PaddingBit(pad1, pad2));
    }
  }
}
