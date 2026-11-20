import {
  createFile,
  Log,
  MP4BoxBuffer,
  MultiBufferStream,
  Endianness,
  BoxParser,
  type Box,
  type ISOFileParseOptions,
} from '../entries/all';
import { ErrorCode } from '../src/constants';

/* ------------------------------------------------------------------ */
/* Byte-level builders: deterministic, self-contained malformed files */
/* ------------------------------------------------------------------ */

const ascii = (value: string) => new Uint8Array(Array.from(value, char => char.charCodeAt(0)));

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value);
  return bytes;
}

function u8(value: number) {
  return new Uint8Array([value]);
}

/** Concatenates payload parts into a plain box (8-byte header). */
function box(type: string, ...payload: Array<Uint8Array>): Uint8Array {
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

/** Concatenates payload parts into a full box (12-byte header: 8 + version/flags). */
function fullBox(type: string, versionAndFlags: number, ...payload: Array<Uint8Array>): Uint8Array {
  return box(type, u32(versionAndFlags), ...payload);
}

function wrap(type: string, ...children: Array<Uint8Array>): Uint8Array {
  return box(type, ...children);
}

const ftyp = () => box('ftyp', ascii('mp42'), u32(0), ascii('mp42'));

/** A count so large that count * entrySize cannot possibly fit in any real box. */
const HUGE_COUNT = 0xffffffff;

/**
 * Drives a single box's parse() with a stream positioned at byte 8, mirroring
 * how parseOneBox sets a box up (hdr_size = 8 after the box header). Full boxes
 * then read their own version/flags; plain boxes read payload directly.
 */
function expectRejected(type: string, bytes: Uint8Array) {
  const mp4Buffer = MP4BoxBuffer.fromArrayBuffer(bytes.buffer, 0);
  const stream = new MultiBufferStream(mp4Buffer);
  stream.endianness = Endianness.BIG_ENDIAN;
  const instance = new BoxParser.box[type](bytes.length);
  instance.size = bytes.length;
  instance.hdr_size = 8;
  instance.start = 0;
  stream.seek(8);

  const result = instance.parse(stream);
  expect(result).toBe(ErrorCode.ERR_INVALID_DATA);
  // the stream must not have run away reading entries; position stays within the box
  expect(stream.getPosition()).toBeLessThanOrEqual(bytes.length);
  return instance;
}

function parseWholeFile(...boxes: Array<Uint8Array>) {
  const bytes = new Uint8Array(boxes.reduce((total, b) => total + b.length, 0));
  let offset = 0;
  for (const b of boxes) {
    bytes.set(b, offset);
    offset += b.length;
  }
  const mp4 = createFile(false, undefined, {} as ISOFileParseOptions);
  const onError = vi.fn();
  mp4.onError = onError;
  mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(bytes.buffer, 0));
  mp4.flush();
  return { mp4, onError };
}

/* ------------------------------------------------------------------ */
/* Malformed payloads per box family. Each declares an entry count that */
/* cannot fit inside the box's own declared size.                       */
/* ------------------------------------------------------------------ */

function malformed() {
  return {
    stts: fullBox('stts', 0, u32(HUGE_COUNT)),
    ctts: fullBox('ctts', 0, u32(HUGE_COUNT)),
    stsc: fullBox('stsc', 0, u32(HUGE_COUNT)),
    stco: fullBox('stco', 0, u32(HUGE_COUNT)),
    co64: fullBox('co64', 0, u32(HUGE_COUNT)),
    stss: fullBox('stss', 0, u32(HUGE_COUNT)),
    stsh: fullBox('stsh', 0, u32(HUGE_COUNT)),
    sbgp: fullBox('sbgp', 0, ascii('roll'), u32(HUGE_COUNT)),
    saio: fullBox('saio', 0, u32(HUGE_COUNT)),
    elst: fullBox('elst', 0, u32(HUGE_COUNT)),
    sidx: (() => {
      // reference_ID, timescale, earliest_presentation_time, first_offset, reserved
      return fullBox(
        'sidx',
        0,
        u32(1),
        u32(1000),
        u32(0),
        u32(0),
        u16(0),
        u16(HUGE_COUNT & 0xffff),
      );
    })(),
    stsg: fullBox('stsg', 0, u32(0), u16(HUGE_COUNT & 0xffff)),
  };
}

describe('Entry-count reconciliation: malformed declarations fail fast', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects every fixed-width sample-table box whose count exceeds its box size', () => {
    const cases = malformed();
    expectRejected('stts', cases.stts);
    expectRejected('ctts', cases.ctts);
    expectRejected('stsc', cases.stsc);
    expectRejected('stco', cases.stco);
    expectRejected('co64', cases.co64);
    expectRejected('stss', cases.stss);
    expectRejected('stsh', cases.stsh);
    expectRejected('sbgp', cases.sbgp);
    expectRejected('saio', cases.saio);
    expectRejected('elst', cases.elst);
    expectRejected('sidx', cases.sidx);
    expectRejected('stsg', cases.stsg);
    // pssh v1: system_id (16) + huge KID count, with a trailing zero protection-data length
    expectRejected(
      'pssh',
      fullBox('pssh', 0x01000000, new Uint8Array(16), u32(HUGE_COUNT), u32(0), new Uint8Array(4)),
    );
  });

  it('rejects version-1 sbgp and saio variants', () => {
    // version 1 is encoded in the top byte: 0x01000000.
    // v1 sbgp: grouping_type (4) + grouping_type_parameter (4) precede the count.
    const sbgpV1 = fullBox(
      'sbgp',
      0x01000000,
      ascii('roll'),
      u32(0),
      u32(HUGE_COUNT),
      new Uint8Array(4),
    );
    expectRejected('sbgp', sbgpV1);

    // v1 saio offsets are 8 bytes each
    const saioV1 = fullBox('saio', 0x01000000, u32(HUGE_COUNT), new Uint8Array(4));
    expectRejected('saio', saioV1);
  });

  it('rejects stsz variable-size tables but leaves constant mode free', () => {
    // sample_size = 0 -> a 4-byte entry per sample; huge count cannot fit
    expectRejected('stsz', fullBox('stsz', 0, u32(0), u32(HUGE_COUNT)));
  });

  it('accepts a constant-size stsz whose count is not bounded by box size', () => {
    // constant-size mode stores no per-sample bytes, so a large count relative to the
    // small box is legal (real AMR/protected files look like this)
    const constant = fullBox('stsz', 0, u32(1024), u32(3));
    const mp4Buffer = MP4BoxBuffer.fromArrayBuffer(constant.buffer, 0);
    const stream = new MultiBufferStream(mp4Buffer);
    stream.endianness = Endianness.BIG_ENDIAN;
    const instance = new BoxParser.box.stsz(constant.length);
    instance.size = constant.length;
    instance.hdr_size = 8;
    instance.start = 0;
    stream.seek(8);
    expect(instance.parse(stream)).toBeUndefined();
    expect(instance.sample_count).toBe(3);
    expect(instance.sample_sizes).toEqual([1024, 1024, 1024]);
  });

  it('rejects stz2 across all field sizes and on an invalid field size', () => {
    const build = (fieldSize: number, count: number) =>
      fullBox('stz2', 0, new Uint8Array([0, 0, 0, fieldSize]), u32(count));
    expectRejected('stz2', build(4, HUGE_COUNT));
    expectRejected('stz2', build(8, HUGE_COUNT));
    expectRejected('stz2', build(16, HUGE_COUNT));
    expectRejected('stz2', build(7, 1)); // invalid field size, no entries declared
  });

  it('rejects padb with a sample count larger than its bytes can hold', () => {
    const bad = fullBox('padb', 0, u32(HUGE_COUNT));
    expectRejected('padb', bad);
  });

  it('rejects saiz only when per-sample sizes are stored', () => {
    const bad = fullBox('saiz', 0, u8(0), u32(HUGE_COUNT));
    expectRejected('saiz', bad);
  });

  it('rejects trun sample counts that exceed the declared box size', () => {
    // flags 0x000300 -> duration + size present => 8 bytes per sample.
    // Give the box enough payload (16 bytes) to enter the sample loop, then declare
    // far more samples than those bytes can hold.
    const bad = fullBox('trun', 0x000300, u32(HUGE_COUNT), new Uint8Array(16));
    expectRejected('trun', bad);
  });

  it('rejects tfra declarations whose encoded entries cannot fit', () => {
    // length sizes all 0 -> each entry is 8 bytes (v0 time+offset) + 3 one-byte fields
    const bad = fullBox(
      'tfra',
      0,
      u32(1), // track_ID
      new Uint8Array([0, 0, 0, 0]), // reserved + length size bytes
      u32(HUGE_COUNT),
    );
    expectRejected('tfra', bad);
  });

  it('rejects ssix subsegment and range counts that cannot fit', () => {
    const badSubsegment = fullBox('ssix', 0, u32(HUGE_COUNT));
    expectRejected('ssix', badSubsegment);

    // one subsegment claiming more ranges than the (empty) remainder can hold
    const badRanges = fullBox('ssix', 0, u32(1), u32(HUGE_COUNT));
    expectRejected('ssix', badRanges);
  });

  it('rejects subs top-level and nested subsample counts', () => {
    const badTop = fullBox('subs', 0, u32(HUGE_COUNT));
    expectRejected('subs', badTop);

    const badNested = fullBox('subs', 0, u32(1), u32(1), u16(HUGE_COUNT & 0xffff));
    expectRejected('subs', badNested);
  });

  it('rejects container-entry boxes declaring more entries than bytes allow', () => {
    expectRejected('dref', fullBox('dref', 0, u32(HUGE_COUNT)));
    expectRejected('iinf', fullBox('iinf', 0, u16(HUGE_COUNT & 0xffff)));
    expectRejected('stsd', fullBox('stsd', 0, u32(HUGE_COUNT)));
  });

  it('rejects ipma entry and nested association counts', () => {
    const badEntries = fullBox('ipma', 0, u32(HUGE_COUNT));
    expectRejected('ipma', badEntries);

    // one item claiming more associations than the remainder holds
    const badAssoc = fullBox('ipma', 0, u32(1), u16(1), u8(HUGE_COUNT & 0xff));
    expectRejected('ipma', badAssoc);
  });

  it('rejects iloc item and nested extent counts', () => {
    // offset_size=0, length_size=0, base_offset_size=0 -> minimal item, v0 count is 16-bit.
    // The two size-spec bytes precede the item count.
    const badItems = fullBox(
      'iloc',
      0,
      new Uint8Array([0, 0]),
      u16(HUGE_COUNT & 0xffff),
      new Uint8Array(8),
    );
    expectRejected('iloc', badItems);

    // one item (v0: item_ID u16, data_reference_index u16, extent_count u16) with huge extents.
    // length_size=4 so each extent consumes at least 4 bytes; a huge extent count cannot fit.
    const badExtents = fullBox(
      'iloc',
      0,
      new Uint8Array([0x04, 0]), // high nibble: offset_size=0; low nibble: length_size=4
      u16(1),
      u16(1),
      u16(0),
      u16(HUGE_COUNT & 0xffff),
      new Uint8Array(8),
    );
    expectRejected('iloc', badExtents);
  });

  it('rejects sgpd group-description counts that cannot fit', () => {
    // version 1 (0x01000000), default_length 0 -> each description needs a 4-byte length field.
    // grouping_type (4) + default_length (4) precede the count.
    const bad = fullBox(
      'sgpd',
      0x01000000,
      ascii('roll'),
      u32(0),
      u32(HUGE_COUNT),
      new Uint8Array(4),
    );
    expectRejected('sgpd', bad);
  });

  it('rejects remaining count-driven boxes', () => {
    expectRejected('cdef', box('cdef', u16(HUGE_COUNT & 0xffff)));
    expectRejected('cmpd', box('cmpd', u32(HUGE_COUNT)));
    expectRejected('leva', fullBox('leva', 0, u8(HUGE_COUNT & 0xff)));
    expectRejected('prdi', fullBox('prdi', 0x00000002, u16(HUGE_COUNT & 0xffff)));
    expectRejected('uncC', fullBox('uncC', 0, ascii('unc0'), u32(HUGE_COUNT)));
    expectRejected('keys', fullBox('keys', 0, u32(HUGE_COUNT)));
  });
});

describe('Entry-count reconciliation: end-to-end error channel', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Wrap a stbl child in the full moov/trak/mdia/minf/stbl hierarchy.
  const inStbl = (child: Uint8Array) =>
    wrap('moov', wrap('trak', wrap('mdia', wrap('minf', wrap('stbl', child)))));

  it('surfaces a bad stsz declaration through onError and aborts parsing', () => {
    const badStsz = fullBox('stsz', 0, u32(0), u32(HUGE_COUNT));
    const { mp4, onError } = parseWholeFile(ftyp(), inStbl(badStsz));

    // one diagnostic from the reconciliation and one from ISOFile aborting the box parse
    expect(onError.mock.calls.length).toBeGreaterThanOrEqual(2);
    const messages = onError.mock.calls.map(call => call[1]).join(' ');
    expect(messages).toContain('stsz');
    // the malformed moov must not be retained as a parsed box
    expect(mp4.boxes.map(b => b.type)).not.toContain('moov');
  });

  it('surfaces a bad stco declaration through onError (second affected family)', () => {
    const badStco = fullBox('stco', 0, u32(HUGE_COUNT));
    const { mp4, onError } = parseWholeFile(ftyp(), inStbl(badStco));

    expect(onError.mock.calls.length).toBeGreaterThanOrEqual(2);
    const messages = onError.mock.calls.map(call => call[1]).join(' ');
    expect(messages).toContain('stco');
    expect(mp4.boxes.map(b => b.type)).not.toContain('moov');
  });

  it('surfaces a bad trun declaration inside a fragmented moof', () => {
    const badTrun = fullBox('trun', 0x000300, u32(HUGE_COUNT), new Uint8Array(16));
    const moof = wrap('moof', wrap('traf', badTrun));
    const { onError } = parseWholeFile(ftyp(), moof);

    expect(onError.mock.calls.length).toBeGreaterThanOrEqual(1);
    const messages = onError.mock.calls.map(call => call[1]).join(' ');
    expect(messages).toContain('trun');
  });
});

describe('Entry-count reconciliation: conforming boxes keep working', () => {
  beforeEach(() => {
    vi.spyOn(Log, 'error');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function parseValid(type: string, bytes: Uint8Array): Box {
    const mp4Buffer = MP4BoxBuffer.fromArrayBuffer(bytes.buffer, 0);
    const stream = new MultiBufferStream(mp4Buffer);
    stream.endianness = Endianness.BIG_ENDIAN;
    const instance = new BoxParser.box[type](bytes.length);
    instance.size = bytes.length;
    instance.hdr_size = 8;
    instance.start = 0;
    stream.seek(8);
    const result = instance.parse(stream);
    expect(result).toBeUndefined();
    expect(Log.error).not.toHaveBeenCalled();
    return instance;
  }

  it('accepts an exactly-fitting stts table (boundary equality)', () => {
    // 2 entries * 8 bytes = 16 payload bytes after the count field
    const bytes = fullBox('stts', 0, u32(2), u32(1), u32(10), u32(1), u32(10));
    const parsed = parseValid('stts', bytes) as InstanceType<(typeof BoxParser.box)['stts']>;
    expect(parsed.sample_counts).toEqual([1, 1]);
    expect(parsed.sample_deltas).toEqual([10, 10]);
  });

  it('accepts an exactly-fitting co64 table', () => {
    // one 8-byte large offset (high 32 bits zero, low 32 bits 123)
    const bytes = fullBox('co64', 0, u32(1), u32(0), u32(123));
    const parsed = parseValid('co64', bytes) as InstanceType<(typeof BoxParser.box)['co64']>;
    expect(parsed.chunk_offsets).toEqual([123]);
  });

  it('accepts a zero-entry table', () => {
    const bytes = fullBox('stss', 0, u32(0));
    const parsed = parseValid('stss', bytes) as InstanceType<(typeof BoxParser.box)['stss']>;
    expect(parsed.sample_numbers).toEqual([]);
  });

  it('accepts stz2 field size 4 with an odd sample count', () => {
    // 3 samples packed into 2 bytes
    const bytes = fullBox(
      'stz2',
      0,
      new Uint8Array([0, 0, 0, 4]),
      u32(3),
      new Uint8Array([0xab, 0xcd]),
    );
    const parsed = parseValid('stz2', bytes) as InstanceType<(typeof BoxParser.box)['stz2']>;
    expect(parsed.sample_sizes.slice(0, 3)).toEqual([0xa, 0xb, 0xc]);
  });
});
