import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { checkEntryCountFits } from '#/boxes/entry-count';

export class stssBox extends FullBox {
  static override readonly fourcc = 'stss' as const;
  box_name = 'SyncSampleBox' as const;

  sample_numbers: Array<number>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    const entry_count = stream.readUint32();
    if (this.version === 0) {
      this.sample_numbers = [];
      const invalid = checkEntryCountFits(this, stream, entry_count, 4, 'sync-sample entries');
      if (invalid) return invalid;
      for (let i = 0; i < entry_count; i++) {
        this.sample_numbers.push(stream.readUint32());
      }
    }
  }

  /** @bundle writing/stss.js */
  write(stream: MultiBufferStream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 4 * this.sample_numbers.length;
    this.writeHeader(stream);
    stream.writeUint32(this.sample_numbers.length);
    stream.writeUint32Array(this.sample_numbers);
  }
}
