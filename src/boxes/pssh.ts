import { FullBox } from '#/box';
import { parseHex16 } from '#/parser';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';

export class psshBox extends FullBox {
  static override readonly fourcc = 'pssh' as const;
  box_name = 'ProtectionSystemSpecificHeaderBox' as const;

  system_id: string;
  kid: Array<string>;
  protection_data?: Uint8Array;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.system_id = parseHex16(stream);

    this.kid = [];
    if (this.version > 0) {
      const count = stream.readUint32();
      // system_id (16 bytes) + KID count (4 bytes) already consumed; each KID is 16 bytes
      if (this.validateEntryCount(count, 16, 20) === ErrorCode.ERR_INVALID_DATA) {
        return ErrorCode.ERR_INVALID_DATA;
      }
      for (let i = 0; i < count; i++) {
        this.kid[i] = parseHex16(stream);
      }
    }

    const datasize = stream.readUint32();
    if (datasize > 0) {
      this.protection_data = stream.readUint8Array(datasize);
    }
  }
}
