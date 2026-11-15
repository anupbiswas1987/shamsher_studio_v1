import test from 'node:test';
import assert from 'node:assert/strict';
import { screenAspect } from '../src/screen-aspect.js';
import { evaluateClip, transitionState, createAnimation } from '../src/cinematic.js';
import { draftSnapshot } from '../src/screen-draft.js';

test('fit, centering, and slide distances follow every canvas ratio', () => {
  for (const ratio of ['9:16', '16:9', '4:5']) {
    const stage = screenAspect(ratio);
    const clip = { start: 0, end: 3, fit: 'contain', animation: createAnimation('static'), entry: 'Slide right', transition: 1 };
    const geometry = evaluateClip({ ...clip, entry: 'None' }, { width: 800, height: 800 }, 1, stage);
    assert.equal(geometry.x, stage.width / 2);
    assert.equal(geometry.y, stage.height / 2);
    assert.equal(geometry.bw, Math.min(stage.width, stage.height));
    assert.equal(geometry.bh, geometry.bw);
    assert.equal(transitionState(clip, 0, stage).x, -stage.width);
    assert.equal(stage.exportWidth / stage.width, stage.exportHeight / stage.height);
    assert.equal(draftSnapshot({ screens: [], aspectRatio: ratio }).aspectRatio, ratio);
  }
  assert.equal(screenAspect('unknown'), screenAspect('9:16'));
});
