import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';

export class stsgBox extends FullBox {
  static override readonly fourcc = 'stsg' as const;
  box_name = 'SubTrackSampleGroupBox' as const;

  grouping_type: number;
  group_description_index: Array<number>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.grouping_type = stream.readUint32();
    const count = stream.readUint16();
    // fixed fields before entries: grouping_type (4) + count (2) = 6; each index is a uint32
    if (this.validateEntryCount(count, 4, 6) === ErrorCode.ERR_INVALID_DATA) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    this.group_description_index = [];
    for (let i = 0; i < count; i++) {
      this.group_description_index[i] = stream.readUint32();
    }
  }
}
