import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';

export class prdiBox extends FullBox {
  static override readonly fourcc = 'prdi' as const;
  box_name = 'ProgressiveDerivedImageItemInformationProperty' as const;

  step_count: number;
  item_count: Array<number>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.step_count = stream.readUint16();
    // step_count (2 bytes) consumed; each item count is a uint16 (2 bytes)
    if (this.validateEntryCount(this.step_count, 2, 2) === ErrorCode.ERR_INVALID_DATA) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    this.item_count = [];
    if (this.flags & 0x2) {
      for (let i = 0; i < this.step_count; i++) {
        this.item_count[i] = stream.readUint16();
      }
    }
  }
}
