import { FullBox } from '#/box';
import { infeBox } from '#/boxes/infe';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';
import { Log } from '#/log';
import { checkEntryCountFits } from '#/boxes/entry-count';
import { parseOneBox } from '#/parser';
import type { BoxKind } from '@types';

export class iinfBox extends FullBox {
  static override readonly fourcc = 'iinf' as const;
  box_name = 'ItemInfoBox' as const;

  version: number;
  entry_count: number;
  item_infos: Array<infeBox>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    if (this.version === 0) {
      this.entry_count = stream.readUint16();
    } else {
      this.entry_count = stream.readUint32();
    }

    this.item_infos = [];

    // every entry is an 'infe' box and therefore occupies at least an 8-byte box header
    const invalid = checkEntryCountFits(
      this,
      stream,
      this.entry_count,
      8,
      'item-information entries',
    );
    if (invalid) return invalid;
    for (let i = 0; i < this.entry_count; i++) {
      const ret = parseOneBox(stream, false, this.size - (stream.getPosition() - this.start));
      if (ret.code === ErrorCode.OK) {
        const box = ret.box as BoxKind;
        if (box.type === 'infe') {
          this.item_infos[i] = box as infeBox;
        } else {
          Log.error('BoxParser', "Expected 'infe' box, got " + ret.box.type, stream.isofile);
        }
      } else if (ret.code === ErrorCode.ERR_INVALID_DATA) {
        return ErrorCode.ERR_INVALID_DATA;
      } else {
        return;
      }
    }
  }
}
