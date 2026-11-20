import { FullBox } from '#/box';
import { parseHex16 } from '#/parser';
import type { MultiBufferStream } from '#/buffer';
import { checkBytesRemaining, checkEntryCountFits } from '#/boxes/entry-count';

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
      const invalid = checkEntryCountFits(this, stream, count, 16, 'key IDs');
      if (invalid) return invalid;
      for (let i = 0; i < count; i++) {
        this.kid[i] = parseHex16(stream);
      }
    }

    const dataSizeGuard = checkBytesRemaining(this, stream, 4, 'protection data length');
    if (dataSizeGuard) return dataSizeGuard;
    const datasize = stream.readUint32();
    if (datasize > 0) {
      const dataGuard = checkBytesRemaining(this, stream, datasize, 'protection data');
      if (dataGuard) return dataGuard;
      this.protection_data = stream.readUint8Array(datasize);
    }
  }
}
