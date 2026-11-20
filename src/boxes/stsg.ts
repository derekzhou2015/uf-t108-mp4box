import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { checkEntryCountFits } from '#/boxes/entry-count';

export class stsgBox extends FullBox {
  static override readonly fourcc = 'stsg' as const;
  box_name = 'SubTrackSampleGroupBox' as const;

  grouping_type: number;
  group_description_index: Array<number>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.grouping_type = stream.readUint32();
    const count = stream.readUint16();
    this.group_description_index = [];
    const invalid = checkEntryCountFits(this, stream, count, 4, 'sub-track group entries');
    if (invalid) return invalid;
    for (let i = 0; i < count; i++) {
      this.group_description_index[i] = stream.readUint32();
    }
  }
}
