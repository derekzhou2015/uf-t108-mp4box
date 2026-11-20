import type { MultiBufferStream } from '#/buffer';
import type { Box } from '#/box';
import { ErrorCode } from '#/constants';
import { Log } from '#/log';

/**
 * Reconciles an entry count read from a box with the bytes the box actually
 * carries. A malformed file can declare an arbitrarily large entry count even
 * inside a small box; trusting it drives unbounded array growth (memory
 * exhaustion) before any read ever fails. Validating the declaration against
 * the declared box size makes the failure deterministic and routes it through
 * the library's existing ERR_INVALID_DATA channel instead of the host process
 * being killed by an out-of-memory condition.
 *
 * The check is a pure size computation: it never allocates the entries and
 * never reads beyond the box header, so a bad declaration fails fast.
 *
 * @param box        the box being parsed (provides start, size, hdr_size)
 * @param stream     the stream being parsed, positioned after the count field
 * @param entryCount the entry count declared inside the box
 * @param entrySize  number of bytes each declared entry occupies
 * @param fieldName  name of the count field, for diagnostics
 * @returns ErrorCode.ERR_INVALID_DATA when the declaration does not fit, otherwise undefined
 */
export function checkEntryCountFits(
  box: Box,
  stream: MultiBufferStream,
  entryCount: number,
  entrySize: number,
  fieldName: string,
): ErrorCode | undefined {
  const bytesRequired = entryCount * entrySize;
  const bytesAvailable = box.start + box.size - stream.getPosition();
  if (bytesRequired > bytesAvailable) {
    Log.error(
      'BoxParser',
      "Box of type '" +
        box.type +
        "' declares " +
        entryCount +
        ' ' +
        fieldName +
        ' (' +
        bytesRequired +
        ' bytes) but only ' +
        bytesAvailable +
        ' bytes remain in the box',
      stream.isofile,
    );
    return ErrorCode.ERR_INVALID_DATA;
  }
  return undefined;
}

/**
 * Guards a fixed-size field (or a run of trailing fields) that must still be
 * readable after a count has been consumed. Returns ERR_INVALID_DATA when the
 * declared box size cannot hold the required bytes, keeping every subsequent
 * scalar read inside the box instead of throwing a DataView RangeError.
 */
export function checkBytesRemaining(
  box: Box,
  stream: MultiBufferStream,
  requiredBytes: number,
  fieldName: string,
): ErrorCode | undefined {
  const bytesAvailable = box.start + box.size - stream.getPosition();
  if (requiredBytes > bytesAvailable) {
    Log.error(
      'BoxParser',
      "Box of type '" +
        box.type +
        "' needs " +
        requiredBytes +
        ' bytes for ' +
        fieldName +
        ' but only ' +
        bytesAvailable +
        ' bytes remain in the box',
      stream.isofile,
    );
    return ErrorCode.ERR_INVALID_DATA;
  }
  return undefined;
}
