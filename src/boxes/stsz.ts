import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';
import { checkEntryCountFits } from '#/boxes/entry-count';

export class stszBox extends FullBox {
  static override readonly fourcc = 'stsz' as const;
  box_name = 'SampleSizeBox' as const;

  sample_sizes: Array<number>;
  sample_size: number;
  sample_count: number;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.sample_sizes = [];
    if (this.version === 0) {
      if (this.size - this.hdr_size < 8) {
        return ErrorCode.ERR_INVALID_DATA;
      }
      this.sample_size = stream.readUint32();
      this.sample_count = stream.readUint32();
      if (this.sample_size === 0) {
        // variable-size mode stores one 4-byte entry per sample; the declaration must fit
        // the bytes the box actually carries. Constant-size mode stores no per-sample data,
        // so its count is not bounded by the box size and is reconciled via the track instead.
        const invalid = checkEntryCountFits(
          this,
          stream,
          this.sample_count,
          4,
          'sample-size entries',
        );
        if (invalid) return invalid;
      }
      for (let i = 0; i < this.sample_count; i++) {
        if (this.sample_size === 0) {
          this.sample_sizes.push(stream.readUint32());
        } else {
          this.sample_sizes[i] = this.sample_size;
        }
      }
    }
  }

  /** @bundle writing/stsz.js */
  write(stream: MultiBufferStream) {
    let constant = true;
    this.version = 0;
    this.flags = 0;
    if (this.sample_sizes.length > 0 && this.sample_size === 0) {
      constant = false;
    }
    this.size = 8;
    if (!constant) {
      this.size += 4 * this.sample_sizes.length;
    }
    this.writeHeader(stream);
    stream.writeUint32(this.sample_size);
    stream.writeUint32(this.sample_sizes.length);
    if (!constant) {
      stream.writeUint32Array(this.sample_sizes);
    }
  }

  /** @bundle box-unpack.js */
  unpack(samples) {
    for (let i = 0; i < this.sample_sizes.length; i++) {
      samples[i].size = this.sample_sizes[i];
    }
  }
}
