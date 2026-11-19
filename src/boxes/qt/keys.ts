import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';

/*
 * The QTFF keys Atom is typically in a meta Box.
 * https://developer.apple.com/documentation/quicktime-file-format/metadata_item_keys_atom
  static override readonly fourcc = 'ilst' as const;
 * key indexes are 1-based and so we store them in a Object, not an array.
 */
export class keysBox extends FullBox {
  static override readonly fourcc = 'keys' as const;
  box_name = 'KeysBox' as const;

  count: number;
  keys: Record<number, string>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.count = stream.readUint32();
    // count (4 bytes) consumed; each key starts with a 4-byte length field
    if (this.validateEntryCount(this.count, 4, 4) === ErrorCode.ERR_INVALID_DATA) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    this.keys = {};
    for (let i = 0; i < this.count; i++) {
      const len = stream.readUint32();
      this.keys[i + 1] = stream.readString(len - 4);
    }
  }
}
