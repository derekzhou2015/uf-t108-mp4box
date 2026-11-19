import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';
import { Pixel } from './displays/pixel';

export class sbpmBox extends FullBox {
  static override readonly fourcc = 'sbpm' as const;
  box_name = 'SensorBadPixelsMapBox' as const;

  component_count: number;
  component_index: Array<number>;
  correction_applied: boolean;
  num_bad_rows: number;
  num_bad_cols: number;
  num_bad_pixels: number;
  bad_rows: Array<number>;
  bad_columns: Array<number>;
  bad_pixels: Array<Pixel>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    this.component_count = stream.readUint16();
    // component_index: uint16 per component; component_count (2 bytes) already consumed
    if (this.validateEntryCount(this.component_count, 2, 2) === ErrorCode.ERR_INVALID_DATA) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    this.component_index = [];
    for (let i = 0; i < this.component_count; i++) {
      this.component_index.push(stream.readUint16());
    }
    const flags = stream.readUint8();
    this.correction_applied = 0x80 === (flags & 0x80);
    this.num_bad_rows = stream.readUint32();
    this.num_bad_cols = stream.readUint32();
    this.num_bad_pixels = stream.readUint32();
    // fixed fields consumed here: component_count (2) + flags (1) + three uint32 counts (12) = 15
    // bad rows/cols are one uint32 each, bad pixels are two uint32 each: use the largest stride (8)
    const largestCount = Math.max(this.num_bad_rows, this.num_bad_cols, this.num_bad_pixels);
    if (this.validateEntryCount(largestCount, 8, 15) === ErrorCode.ERR_INVALID_DATA) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    this.bad_rows = [];
    this.bad_columns = [];
    this.bad_pixels = [];
    for (let i = 0; i < this.num_bad_rows; i++) {
      this.bad_rows.push(stream.readUint32());
    }
    for (let i = 0; i < this.num_bad_cols; i++) {
      this.bad_columns.push(stream.readUint32());
    }
    for (let i = 0; i < this.num_bad_pixels; i++) {
      const row = stream.readUint32();
      const col = stream.readUint32();
      this.bad_pixels.push(new Pixel(row, col));
    }
  }
}
