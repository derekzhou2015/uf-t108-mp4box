import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';

export class stshBox extends FullBox {
  static override readonly fourcc = 'stsh' as const;
  box_name = 'ShadowSyncSampleBox' as const;

  shadowed_sample_numbers: Array<number>;
  sync_sample_numbers: Array<number>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    const entry_count = stream.readUint32();
    this.shadowed_sample_numbers = [];
    this.sync_sample_numbers = [];
    if (this.version === 0) {
      // 4 bytes for entry_count, each entry is two uint32 sample numbers (8 bytes)
      if (this.validateEntryCount(entry_count, 8, 4) === ErrorCode.ERR_INVALID_DATA) {
        return ErrorCode.ERR_INVALID_DATA;
      }
      for (let i = 0; i < entry_count; i++) {
        this.shadowed_sample_numbers.push(stream.readUint32());
        this.sync_sample_numbers.push(stream.readUint32());
      }
    }
  }

  write(stream: MultiBufferStream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 8 * this.shadowed_sample_numbers.length;
    this.writeHeader(stream);
    stream.writeUint32(this.shadowed_sample_numbers.length);
    for (let i = 0; i < this.shadowed_sample_numbers.length; i++) {
      stream.writeUint32(this.shadowed_sample_numbers[i]);
      stream.writeUint32(this.sync_sample_numbers[i]);
    }
  }
}
