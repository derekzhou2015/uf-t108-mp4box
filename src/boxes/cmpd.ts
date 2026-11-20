import { Box } from '#/box';
import type { MultiBufferStream } from '#/buffer';
import { checkEntryCountFits } from '#/boxes/entry-count';

export class cmpdBox extends Box {
  static override readonly fourcc = 'cmpd' as const;
  box_name = 'ComponentDefinitionBox' as const;

  component_count: number;
  component_types: Array<number>;
  component_type_urls: Array<string>;

  parse(stream: MultiBufferStream) {
    this.component_count = stream.readUint32();
    this.component_types = [];
    this.component_type_urls = [];
    // every component carries at least its 2-byte component type
    const invalid = checkEntryCountFits(this, stream, this.component_count, 2, 'component entries');
    if (invalid) return invalid;
    for (let i = 0; i < this.component_count; i++) {
      const component_type = stream.readUint16();
      this.component_types.push(component_type);
      if (component_type >= 0x8000) {
        this.component_type_urls.push(stream.readCString());
      }
    }
  }
}
