import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';
import { Log } from '#/log';
import { checkEntryCountFits } from '#/boxes/entry-count';

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
      if (this.size - this.hdr_size < 8) {
        return ErrorCode.ERR_INVALID_DATA;
      }
      this.reserved = stream.readUint24();
      this.field_size = stream.readUint8();
      const sample_count = stream.readUint32();
      if (this.field_size === 4) {
        // two sample sizes are packed per byte; an odd count still consumes ceil(count/2) bytes
        const invalid = checkEntryCountFits(
          this,
          stream,
          Math.floor(sample_count / 2) + (sample_count % 2),
          1,
          'compact sample-size entries',
        );
        if (invalid) return invalid;
        for (let i = 0; i < sample_count; i += 2) {
          const tmp = stream.readUint8();
          this.sample_sizes[i] = (tmp >> 4) & 0xf;
          this.sample_sizes[i + 1] = tmp & 0xf;
        }
      } else if (this.field_size === 8) {
        const invalid = checkEntryCountFits(
          this,
          stream,
          sample_count,
          1,
          'compact sample-size entries',
        );
        if (invalid) return invalid;
        for (let i = 0; i < sample_count; i++) {
          this.sample_sizes[i] = stream.readUint8();
        }
      } else if (this.field_size === 16) {
        const invalid = checkEntryCountFits(
          this,
          stream,
          sample_count,
          2,
          'compact sample-size entries',
        );
        if (invalid) return invalid;
        for (let i = 0; i < sample_count; i++) {
          this.sample_sizes[i] = stream.readUint16();
        }
      } else {
        Log.error(
          'BoxParser',
          'Invalid field size ' + this.field_size + ' in stz2 box, expected 4, 8 or 16',
          stream.isofile,
        );
        return ErrorCode.ERR_INVALID_DATA;
      }
    }
  }
}
