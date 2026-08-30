import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  formatTime,
  hexToRgb,
  lerp,
  mixColors,
  randomInt,
  randomRange,
  rgba,
  weightedIndex,
} from '../src/utils.js';
import { seedRandom } from './harness/dom.js';

test('clamp and lerp behave at and beyond their bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.25), 2.5);
});

test('random helpers stay inside their range', () => {
  const restore = seedRandom(7);
  try {
    for (let i = 0; i < 500; i++) {
      const value = randomRange(-3, 8);
      assert.ok(value >= -3 && value < 8, `randomRange produced ${value}`);
      const whole = randomInt(2, 5);
      assert.ok(Number.isInteger(whole), 'randomInt should produce integers');
      assert.ok(whole >= 2 && whole <= 5, `randomInt produced ${whole}`);
    }
  } finally {
    restore();
  }
});

test('randomInt can reach both ends of its range', () => {
  const restore = seedRandom(11);
  try {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) seen.add(randomInt(2, 4));
    assert.deepEqual([...seen].sort(), [2, 3, 4]);
  } finally {
    restore();
  }
});

test('weightedIndex only picks entries that carry weight', () => {
  const restore = seedRandom(3);
  try {
    for (let i = 0; i < 200; i++) {
      assert.equal(weightedIndex([0, 5, 0]), 1);
      // Negative weights are treated as zero, not as a reversed preference.
      assert.equal(weightedIndex([-4, 0, 9]), 2);
    }
  } finally {
    restore();
  }
});

test('weightedIndex falls back to the first entry when nothing has weight', () => {
  assert.equal(weightedIndex([0, 0, 0]), 0);
  assert.equal(weightedIndex([]), 0);
});

test('weightedIndex roughly follows the given proportions', () => {
  const restore = seedRandom(99);
  try {
    const counts = [0, 0, 0];
    const samples = 6000;
    for (let i = 0; i < samples; i++) counts[weightedIndex([1, 3, 6])]! += 1;
    const share = counts.map((count) => count / samples);
    assert.ok(Math.abs(share[0]! - 0.1) < 0.03, `first share was ${share[0]}`);
    assert.ok(Math.abs(share[1]! - 0.3) < 0.03, `second share was ${share[1]}`);
    assert.ok(Math.abs(share[2]! - 0.6) < 0.03, `third share was ${share[2]}`);
  } finally {
    restore();
  }
});

test('colour helpers parse, mix and format', () => {
  assert.deepEqual(hexToRgb('#7ee3c7'), { r: 126, g: 227, b: 199 });
  assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb('000000'), { r: 0, g: 0, b: 0 });

  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  assert.deepEqual(mixColors(black, white, 0), black);
  assert.deepEqual(mixColors(black, white, 1), white);
  assert.deepEqual(mixColors(black, white, 0.5), { r: 128, g: 128, b: 128 });

  assert.equal(rgba({ r: 1, g: 2, b: 3 }, 0.5), 'rgba(1, 2, 3, 0.500)');
});

test('elapsed time is formatted as minutes and padded seconds', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(9.9), '0:09');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(600), '10:00');
});
