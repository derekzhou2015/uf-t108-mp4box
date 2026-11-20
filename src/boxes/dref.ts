import { Box, FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';
import { Log } from '#/log';
import { checkEntryCountFits } from '#/boxes/entry-count';
import { parseOneBox } from '#/parser';

export class drefBox extends FullBox {
  static override readonly fourcc = 'dref' as const;
  box_name = 'DataReferenceBox' as const;

  entries: Array<Box>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.entries = [];
    const entry_count = stream.readUint32();
    // every entry is itself a box and therefore occupies at least an 8-byte box header
    const invalid = checkEntryCountFits(this, stream, entry_count, 8, 'data-reference entries');
    if (invalid) return invalid;
    for (let i = 0; i < entry_count; i++) {
      const ret = parseOneBox(stream, false, this.size - (stream.getPosition() - this.start));
      if (ret.code === ErrorCode.OK) {
        const box = ret.box;
        this.entries.push(box);
      } else if (ret.code === ErrorCode.ERR_INVALID_DATA) {
        return ErrorCode.ERR_INVALID_DATA;
      } else {
        return;
      }
    }
  }

  /** @bundle writing/dref.js */
  write(stream: MultiBufferStream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4; //
    this.writeHeader(stream);
    stream.writeUint32(this.entries.length);
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].write(stream);
      this.size += this.entries[i].size;
    }
    /* adjusting the size, now that all sub-boxes are known */
    Log.debug('BoxWriter', 'Adjusting box ' + this.type + ' with new size ' + this.size);
    stream.adjustUint32(this.sizePosition, this.size);
  }
}
