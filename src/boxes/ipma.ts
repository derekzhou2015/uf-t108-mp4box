import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { checkEntryCountFits } from '#/boxes/entry-count';

export interface Assocation {
  id: number;
  props: Array<{ property_index: number; essential: boolean }>;
}

export class ipmaBox extends FullBox {
  static override readonly fourcc = 'ipma' as const;
  box_name = 'ItemPropertyAssociationBox' as const;

  associations: Array<Assocation>;
  version: number;
  flags: number;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    const entry_count = stream.readUint32();
    // each association entry carries at least an item ID (2 or 4 bytes) and an association count (1 byte)
    const minEntrySize = (this.version < 1 ? 2 : 4) + 1;
    const invalid = checkEntryCountFits(
      this,
      stream,
      entry_count,
      minEntrySize,
      'property associations',
    );
    if (invalid) return invalid;
    this.associations = [];
    for (let i = 0; i < entry_count; i++) {
      const id = this.version < 1 ? stream.readUint16() : stream.readUint32();

      const props = [];
      const association_count = stream.readUint8();

      const associationSize = this.flags & 0x1 ? 2 : 1;
      const associationInvalid = checkEntryCountFits(
        this,
        stream,
        association_count,
        associationSize,
        'property associations',
      );
      if (associationInvalid) return associationInvalid;
      for (let j = 0; j < association_count; j++) {
        const tmp = stream.readUint8();
        props.push({
          essential: (tmp & 0x80) >> 7 === 1,
          property_index: this.flags & 0x1 ? ((tmp & 0x7f) << 8) | stream.readUint8() : tmp & 0x7f,
        });
      }

      this.associations.push({
        id,
        props,
      });
    }
  }
}
