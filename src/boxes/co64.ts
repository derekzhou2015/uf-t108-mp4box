import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';

export class co64Box extends FullBox {
  static override readonly fourcc = 'co64' as const;
  box_name = 'ChunkLargeOffsetBox' as const;

  chunk_offsets: Array<number>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    const entry_count = stream.readUint32();
    this.chunk_offsets = [];
    if (this.version === 0) {
      // 4 bytes for entry_count, each entry is a uint64 offset (8 bytes)
      if (this.validateEntryCount(entry_count, 8, 4) === ErrorCode.ERR_INVALID_DATA) {
        return ErrorCode.ERR_INVALID_DATA;
      }
      for (let i = 0; i < entry_count; i++) {
        this.chunk_offsets.push(stream.readUint64());
      }
    }
  }

  /** @bundle writing/co64.js */
  write(stream: MultiBufferStream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 8 * this.chunk_offsets.length;
    this.writeHeader(stream);
    stream.writeUint32(this.chunk_offsets.length);
    for (let i = 0; i < this.chunk_offsets.length; i++) {
      stream.writeUint64(this.chunk_offsets[i]);
    }
  }
}
