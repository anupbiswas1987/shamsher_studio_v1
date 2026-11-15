import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('long renders encode frames without Blob storage or FileReader', async () => {
  const source = (await readFile(new URL('../server/render-page.js', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '');
  let written = 0;
  const context = {
    window: { writeRenderedFrame: async encoded => { assert.equal(encoded, 'anBlZw=='); written++; } },
    document: { createElement: () => ({
      getContext: () => ({ save() {}, scale() {}, restore() {} }),
      toDataURL: (format, quality) => {
        assert.equal(format, 'image/jpeg'); assert.equal(quality, 0.97);
        return 'data:image/jpeg;base64,anBlZw==';
      },
      toBlob: () => { throw Error('Blob capture must not be used'); },
    }) },
    screenAspect: () => ({ width: 360, height: 640, exportWidth: 1080, exportHeight: 1920 }),
    renderReelFrame() {}, performance,
  };
  vm.runInNewContext(source, context);
  const result = await context.window.renderProject({ screens: [], duration: 60 }, '/test');
  assert.equal(result.frames, 1800);
  assert.equal(written, 1800);
});
