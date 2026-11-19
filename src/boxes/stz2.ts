import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';
import { Log } from '#/log';

export class stz2Box extends FullBox {
  static override readonly fourcc = 'stz2' as const;
  box_name = 'CompactSampleSizeBox' as const;

  sample_sizes: Array<number>;
  reserved: number;
  field_size: number;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.sample_sizes = [];
    if (this.version === 0) {
      this.reserved = stream.readUint24();
      this.field_size = stream.readUint8();
      const sample_count = stream.readUint32();
      // fixed fields consumed so far: 3 (reserved) + 1 (field_size) + 4 (sample_count) = 8 bytes
      if (this.field_size === 4) {
        // two 4-bit samples are packed per byte (a final odd sample shares its byte)
        const available = this.size - this.hdr_size - 8;
        const requiredBytes = Math.floor((sample_count + 1) / 2);
        if (available < requiredBytes) {
          return ErrorCode.ERR_INVALID_DATA;
        }
        for (let i = 0; i < sample_count; i += 2) {
          const tmp = stream.readUint8();
          this.sample_sizes[i] = (tmp >> 4) & 0xf;
          this.sample_sizes[i + 1] = tmp & 0xf;
        }
      } else if (this.field_size === 8) {
        if (this.validateEntryCount(sample_count, 1, 8) === ErrorCode.ERR_INVALID_DATA) {
          return ErrorCode.ERR_INVALID_DATA;
        }
        for (let i = 0; i < sample_count; i++) {
          this.sample_sizes[i] = stream.readUint8();
        }
      } else if (this.field_size === 16) {
        if (this.validateEntryCount(sample_count, 2, 8) === ErrorCode.ERR_INVALID_DATA) {
          return ErrorCode.ERR_INVALID_DATA;
        }
        for (let i = 0; i < sample_count; i++) {
          this.sample_sizes[i] = stream.readUint16();
        }
      } else {
        Log.error('BoxParser', 'Error in length field in stz2 box', stream.isofile);
        return ErrorCode.ERR_INVALID_DATA;
      }
    }
  }
}
