import {
  createFile,
  DataStream,
  Endianness,
  MP4BoxBuffer,
  MultiBufferStream,
} from '../entries/all';
import { stz2Box } from '../src/boxes/stz2';

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0);
  return bytes;
}
function u24(value: number) {
  return new Uint8Array([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}
function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value);
  return bytes;
}
function u8(value: number) {
  return new Uint8Array([value]);
}
function ascii(value: string) {
  return new Uint8Array(Array.from(value, char => char.charCodeAt(0)));
}
function box(type: string, ...payload: Array<Uint8Array>) {
  const size = 8 + payload.reduce((total, part) => total + part.length, 0);
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, size);
  bytes.set(ascii(type), 4);
  let offset = 8;
  for (const part of payload) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
// FullBox payload: version (1 byte) + flags (3 big-endian bytes) + body
function fullBox(type: string, body: Uint8Array, version = 0, flags = 0) {
  const header = new Uint8Array(4);
  header[0] = version;
  header[1] = (flags >> 16) & 0xff;
  header[2] = (flags >> 8) & 0xff;
  header[3] = flags & 0xff;
  return box(type, header, body);
}
function concat(...parts: Array<Uint8Array>) {
  const bytes = new Uint8Array(parts.reduce((total, b) => total + b.length, 0));
  let offset = 0;
  for (const b of parts) {
    bytes.set(b, offset);
    offset += b.length;
  }
  return bytes;
}

function ftyp() {
  return box('ftyp', ascii('mp42'), u32(0), ascii('mp42'));
}

// Wraps a sample-table box in moov/trak/mdia/minf/stbl so it is parsed in its real location
function movieWithStbl(...stblChildren: Array<Uint8Array>) {
  const stbl = box('stbl', ...stblChildren);
  const minf = box('minf', stbl);
  const mdia = box('mdia', minf);
  const trak = box('trak', mdia);
  return box('moov', trak);
}

interface ParseResult {
  mp4: ReturnType<typeof createFile>;
  onError: ReturnType<typeof vi.fn>;
}

function parseBytes(...boxes: Array<Uint8Array>): ParseResult {
  const bytes = concat(...boxes);
  const mp4 = createFile(false);
  const onError = vi.fn();
  mp4.onError = onError;
  mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(bytes.buffer, 0));
  mp4.flush();
  return { mp4, onError };
}

interface TestBox {
  type: string;
  boxes?: Array<TestBox>;
  sample_sizes?: Array<number>;
  parse(stream: MultiBufferStream): number | undefined;
  write(stream: DataStream): void;
}

type BoxFactory = new (size: number) => TestBox;

function findBox(root: TestBox, type: string): TestBox | undefined {
  if (root.type === type) return root;
  for (const child of root.boxes ?? []) {
    const found = findBox(child, type);
    if (found) return found;
  }
  return undefined;
}

// Drives a single FullBox's parse() directly on its raw bytes (the 8-byte box header
// included), mirroring the size/start/hdr_size state parseOneBox would normally set.
function parseSingleBox(boxBytes: Uint8Array, factory: BoxFactory) {
  const size = new DataView(boxBytes.buffer, boxBytes.byteOffset).getUint32(0);
  const ab = boxBytes.buffer.slice(boxBytes.byteOffset, boxBytes.byteOffset + boxBytes.byteLength);
  const stream = new MultiBufferStream(MP4BoxBuffer.fromArrayBuffer(ab, 0));
  // parseOneBox has already consumed the 8-byte box header when box.parse() runs
  stream.seek(8);
  const instance = new factory(size);
  instance.start = 0;
  instance.hdr_size = 8;
  const result = instance.parse(stream);
  return { instance, result };
}

describe('sample table entry count validation', () => {
  // Boxes whose declared entry count exceeds the bytes the box actually carries.
  // Each malformed box keeps a well-formed neighbor right after it: without the
  // check, the inflated count makes the parser read into that neighbor's bytes.
  describe('inflated entry counts are rejected through the error callback', () => {
    const cases: Array<{ name: string; malformed: Uint8Array; neighbor: Uint8Array }> = [
      {
        name: 'stts',
        // declares 3 entries (24 bytes) but only carries one (8 bytes)
        malformed: fullBox('stts', concat(u32(3), u32(1), u32(1000))),
        neighbor: fullBox('stsc', concat(u32(1), u32(1), u32(1), u32(1))),
      },
      {
        name: 'ctts',
        malformed: fullBox('ctts', concat(u32(2), u32(1), u32(0))),
        neighbor: fullBox('stss', concat(u32(1), u32(1))),
      },
      {
        name: 'stsc',
        malformed: fullBox('stsc', concat(u32(2), u32(1), u32(1), u32(1))),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'stco',
        // declares 3 offsets (12 bytes) but only carries one (4 bytes)
        malformed: fullBox('stco', concat(u32(3), u32(8))),
        neighbor: fullBox('stts', concat(u32(1), u32(1), u32(1000))),
      },
      {
        name: 'co64',
        malformed: fullBox('co64', concat(u32(2), u32(0), u32(8))),
        neighbor: fullBox('stss', concat(u32(1), u32(1))),
      },
      {
        name: 'stss',
        malformed: fullBox('stss', concat(u32(4), u32(1))),
        neighbor: fullBox('stsh', concat(u32(1), u32(1), u32(1))),
      },
      {
        name: 'stsh',
        malformed: fullBox('stsh', concat(u32(2), u32(1), u32(1))),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'stsz',
        // variable sample size (sample_size=0): declares 3 sizes, carries one
        malformed: fullBox('stsz', concat(u32(0), u32(3), u32(100))),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'stz2',
        // 8-bit field size, declares 4 samples, payload holds 2 sample bytes
        malformed: fullBox('stz2', concat(u24(0), u8(8), u32(4), u8(1), u8(2))),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'padb',
        // declares 4 samples (2 padding bytes) but carries one padding byte
        malformed: fullBox('padb', concat(u32(4), u8(0))),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'sbgp',
        malformed: fullBox('sbgp', concat(ascii('roll'), u32(2), u32(1), u32(1))),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'saiz',
        // default size 0 means one byte per sample; declares 3, carries one
        malformed: fullBox('saiz', concat(u8(0), u32(3), u8(7)), 0, 0),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'saio',
        malformed: fullBox('saio', concat(u32(2), u32(16))),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'sgpd',
        // version 1, default_length 0: each entry needs at least a 4-byte length field;
        // declares 2 entries but carries no entry data
        malformed: fullBox('sgpd', concat(ascii('roll'), u32(0), u32(2)), 1),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'elst',
        malformed: fullBox('elst', concat(u32(2), u32(100), u32(0), u16(1), u16(0))),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'sidx',
        // reference_ID + timescale + two v0 time/offset + reserved + count + one reference body
        malformed: fullBox(
          'sidx',
          concat(u32(1), u32(1000), u32(0), u32(0), u16(0), u16(2), u32(0), u32(100), u32(0)),
        ),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
      {
        name: 'trun',
        // duration+size flags (0x300), sample_count 2 but room for one sample
        malformed: fullBox('trun', concat(u32(2), u32(100), u32(50)), 0, 0x300),
        neighbor: fullBox('stco', concat(u32(1), u32(8))),
      },
    ];

    it.each(cases)(
      '$name rejects an inflated entry count and surfaces it via onError',
      ({ malformed, neighbor }) => {
        const { mp4, onError } = parseBytes(
          ftyp(),
          movieWithStbl(malformed, neighbor),
          box('free'),
        );

        expect(onError).toHaveBeenCalledTimes(1);
        const [module, message] = onError.mock.calls[0];
        expect(module).toBe('ISOFile');
        expect(message).toMatch(/Invalid data found while parsing box of type 'moov'/);

        // The malformed movie is discarded wholesale; parsing never swallowed the neighbor.
        expect(mp4.boxes.map(b => b.type)).toEqual(['ftyp']);
        expect(findBox(mp4 as unknown as TestBox, 'moov')).toBeUndefined();
      },
    );
  });

  it('does not throw a raw DataView out-of-bounds error on an inflated count', () => {
    // stz2 with a sample count far beyond its payload previously threw a raw
    // "Offset is outside the bounds of the DataView" that onError could not catch.
    const stz2 = fullBox('stz2', concat(u24(0), u8(8), u32(100)));
    let captured: ParseResult | undefined;
    expect(() => {
      captured = parseBytes(ftyp(), movieWithStbl(stz2));
    }).not.toThrow();
    expect(captured?.onError).toHaveBeenCalledTimes(1);
  });

  it('keeps memory independent of a declared count with no backing data', () => {
    // A 0xffffffff count with an empty payload must fail before any count-driven allocation.
    const stco = fullBox('stco', u32(0xffffffff));
    const before = process.memoryUsage().heapUsed;
    const { onError } = parseBytes(ftyp(), movieWithStbl(stco));
    const heapGrowthMB = (process.memoryUsage().heapUsed - before) / 1048576;

    expect(onError).toHaveBeenCalledTimes(1);
    // A count-driven allocation would need multiple GB; the real growth stays negligible.
    expect(heapGrowthMB).toBeLessThan(50);
  });

  it('rejects a stz2 box with an unsupported field size', () => {
    const stz2 = fullBox('stz2', concat(u24(0), u8(12), u32(0)));
    const { result } = parseSingleBox(stz2, stz2Box);
    expect(result).toBe(-1); // ErrorCode.ERR_INVALID_DATA
  });
});

describe('sample table round-trip behavior for well-formed boxes', () => {
  // Valid boxes (including a zero entry count and a box with trailing padding bytes)
  // must keep parsing, then survive a write -> re-parse round trip unchanged.
  // These boxes do not provide stsz, so buildSampleLists returns before touching the
  // synthetic trak, keeping the fixture focused on the box under test.
  const validCases: Array<{ name: string; box: Uint8Array; type: string }> = [
    {
      name: 'stts with entries',
      box: fullBox('stts', concat(u32(2), u32(1), u32(1000), u32(2), u32(500))),
      type: 'stts',
    },
    {
      name: 'stts with zero entries',
      box: fullBox('stts', u32(0)),
      type: 'stts',
    },
    {
      name: 'stco with entries',
      box: fullBox('stco', concat(u32(2), u32(8), u32(24))),
      type: 'stco',
    },
    {
      name: 'sidx with references',
      // reference_ID + timescale + two v0 time/offset fields + reserved + two references
      box: fullBox(
        'sidx',
        concat(
          u32(1),
          u32(1000),
          u32(0),
          u32(0),
          u16(0),
          u16(2),
          u32(0),
          u32(100),
          u32(0),
          u32(0),
          u32(200),
          u32(0),
        ),
      ),
      type: 'sidx',
    },
  ];

  it.each(validCases)(
    '$name parses and round-trips through write()',
    ({ box: sampleBox, type }) => {
      const first = parseBytes(ftyp(), movieWithStbl(sampleBox), box('free'));
      expect(first.onError).not.toHaveBeenCalled();

      const parsed = findBox(first.mp4 as unknown as TestBox, type);
      expect(parsed).toBeDefined();

      const ds = new DataStream();
      ds.endianness = Endianness.BIG_ENDIAN;
      parsed?.write(ds);

      const reparsed = parseBytes(ftyp(), movieWithStbl(new Uint8Array(ds.buffer)), box('free'));
      expect(reparsed.onError).not.toHaveBeenCalled();
      const roundTripped = findBox(reparsed.mp4 as unknown as TestBox, type);
      expect(roundTripped).toBeDefined();
    },
  );

  it('tolerates trailing bytes beyond the declared entries within a box', () => {
    // One declared stts entry (8 bytes of data) plus 4 trailing padding bytes in the box.
    const stts = fullBox('stts', concat(u32(1), u32(1), u32(1000), u32(0xdeadbeef)));
    const { onError } = parseBytes(ftyp(), movieWithStbl(stts));
    expect(onError).not.toHaveBeenCalled();
  });

  it('parses a well-formed 4-bit packed stz2 without error and preserves samples', () => {
    // 4 samples packed into 2 bytes; the count matches the carried data exactly.
    const stz2Bytes = fullBox('stz2', concat(u24(0), u8(4), u32(4), u8(0x12), u8(0x34)));
    const { instance, result } = parseSingleBox(stz2Bytes, stz2Box);
    expect(result).toBeUndefined(); // a successful parse returns undefined
    expect(instance.sample_sizes.slice(0, 4)).toEqual([1, 2, 3, 4]);
  });
});
