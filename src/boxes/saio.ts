import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';

export class saioBox extends FullBox {
  static override readonly fourcc = 'saio' as const;
  box_name = 'SampleAuxiliaryInformationOffsetsBox' as const;

  aux_info_type: string;
  aux_info_type_parameter: number;
  entry_count: number;
  offset: Array<number>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    let fixedBytes = 0;
    if (this.flags & 0x1) {
      this.aux_info_type = stream.readString(4);
      this.aux_info_type_parameter = stream.readUint32();
      fixedBytes += 8;
    }
    this.entry_count = stream.readUint32();
    fixedBytes += 4;
    const entrySize = this.version === 0 ? 4 : 8;
    if (
      this.validateEntryCount(this.entry_count, entrySize, fixedBytes) ===
      ErrorCode.ERR_INVALID_DATA
    ) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    this.offset = [];
    for (let i = 0; i < this.entry_count; i++) {
      if (this.version === 0) {
        this.offset[i] = stream.readUint32();
      } else {
        this.offset[i] = stream.readUint64();
      }
    }
  }
}
