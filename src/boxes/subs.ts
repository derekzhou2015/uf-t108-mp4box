import { FullBox } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { ErrorCode } from '#/constants';
import type { SubSample } from '@types';

interface SampleInfo {
  size: number;
  sample_delta: number;
  subsamples: Array<SubSample>;
}

export class subsBox extends FullBox {
  static override readonly fourcc = 'subs' as const;
  box_name = 'SubSampleInformationBox' as const;

  entries: Array<SampleInfo>;

  parse(stream: MultiBufferStream) {
    this.parseFullHeader(stream);
    const entry_count = stream.readUint32();
    // Each outer entry starts with sample_delta (4) + subsample_count (2) = 6 fixed bytes
    // before its variable-length subsamples; validate against that minimum footprint.
    if (this.validateEntryCount(entry_count, 6, 4) === ErrorCode.ERR_INVALID_DATA) {
      return ErrorCode.ERR_INVALID_DATA;
    }
    this.entries = [];
    let subsample_count;
    for (let i = 0; i < entry_count; i++) {
      const sampleInfo = {} as SampleInfo;
      this.entries[i] = sampleInfo;
      sampleInfo.sample_delta = stream.readUint32();
      sampleInfo.subsamples = [];
      subsample_count = stream.readUint16();
      if (subsample_count > 0) {
        for (let j = 0; j < subsample_count; j++) {
          const subsample = {} as SubSample;
          sampleInfo.subsamples.push(subsample);
          if (this.version === 1) {
            subsample.size = stream.readUint32();
          } else {
            subsample.size = stream.readUint16();
          }
          subsample.priority = stream.readUint8();
          subsample.discardable = stream.readUint8();
          subsample.codec_specific_parameters = stream.readUint32();
        }
      }
    }
  }
}
