import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { checkEntryCountFits } from '#/boxes/entry-count';

interface Range {
  level: number;
  range_size: number;
}
interface SubSegment {
  ranges: Array<Range>;
}

export class ssixBox extends FullBox {
  static override readonly fourcc = 'ssix' as const;
  box_name = 'CompressedSubsegmentIndexBox' as const;

  subsegments: Array<SubSegment>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.subsegments = [];
    const subsegment_count = stream.readUint32();
    // each subsegment carries at least its 4-byte range_count field
    let invalid = checkEntryCountFits(this, stream, subsegment_count, 4, 'subsegment entries');
    if (invalid) return invalid;
    for (let i = 0; i < subsegment_count; i++) {
      const subsegment = {} as SubSegment;
      this.subsegments.push(subsegment);
      subsegment.ranges = [];
      const range_count = stream.readUint32();
      // every range is a fixed 4-byte (level: 1 byte + range_size: 3 bytes)
      invalid = checkEntryCountFits(this, stream, range_count, 4, 'subsegment ranges');
      if (invalid) return invalid;
      for (let j = 0; j < range_count; j++) {
        const range = {} as Range;
        subsegment.ranges.push(range);
        range.level = stream.readUint8();
        range.range_size = stream.readUint24();
      }
    }
  }
}
