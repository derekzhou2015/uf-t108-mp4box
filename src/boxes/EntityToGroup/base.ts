import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';

// ISO/IEC 14496-12:2022 Section 8.18.3 Entity to group box
export class EntityToGroup extends FullBox {
  group_id: number;
  num_entities_in_group: number;
  entity_ids: Array<number>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.group_id = stream.readUint32();
    this.num_entities_in_group = stream.readUint32();
    // fixed fields before entries: group_id (4) + entity count (4) = 8; each id is a uint32
    if (this.validateEntryCount(this.num_entities_in_group, 4, 8) === ErrorCode.ERR_INVALID_DATA) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    this.entity_ids = [];
    for (let i = 0; i < this.num_entities_in_group; i++) {
      const entity_id = stream.readUint32();
      this.entity_ids.push(entity_id);
    }
  }
}
