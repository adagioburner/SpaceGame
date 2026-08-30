import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_TYPES } from '../src/config.js';
import type { TestGame } from './harness/game.js';
import { withGame } from './harness/game.js';

/**
 * Nothing here checks what the game looks like — that is a job for eyes. What
 * these do check is that every drawing path survives being run: a throw inside
 * `draw()` kills the animation loop and freezes the game, and it would
 * otherwise only show up in a browser.
 */

/** Puts one of everything on the field: ship classes, damage, blasts, debris. */
function busyField(harness: TestGame): void {
  const { inner, place, clickShip } = harness;
  harness.quiet();
  inner.ships.length = 0;

  place(SHIP_TYPES.scout, 200, 150);
  place(SHIP_TYPES.fighter, 320, 300);

  const hurtCruiser = place(SHIP_TYPES.cruiser, 480, 450);
  hurtCruiser.applyDamage(2);

  const hurtDreadnought = place(SHIP_TYPES.dreadnought, 640, 600);
  hurtDreadnought.applyDamage(6);

  // A kill in flight gives us an explosion, particles and floating text.
  clickShip(place(SHIP_TYPES.scout, 800, 250));
}

test('a busy field draws without throwing', () => {
  withGame({ seed: 131 }, (harness) => {
    busyField(harness);
    harness.dom.context.reset();
    harness.advance(0.2);

    const { context } = harness.dom;
    assert.ok(context.countOf('fill') > 0, 'something should have been filled');
    assert.ok(context.countOf('save') > 0);
    assert.ok(context.countOf('clearRect') > 0, 'the frame should be cleared each pass');
    assert.ok(context.countOf('createLinearGradient') > 0, 'hulls are drawn with gradients');
  });
});

test('the whole life of an explosion draws cleanly', () => {
  withGame({ seed: 132 }, (harness) => {
    const { inner, place, clickShip, advance } = harness;
    harness.quiet();
    inner.ships.length = 0;
    clickShip(place(SHIP_TYPES.dreadnought, 500, 400));

    // Step through the blast a frame at a time: the fireball, the shockwave,
    // the debris and the fade all render on different frames.
    for (let i = 0; i < 120; i++) advance(1 / 60);

    assert.equal(inner.explosions.length, 0, 'the blast should have finished');
    assert.ok(harness.dom.context.countOf('arc') > 0, 'round things should have been drawn');
  });
});

test('every game state renders', () => {
  withGame({ seed: 133, start: false }, (harness) => {
    const { inner, dom, advance, press } = harness;
    harness.quiet();

    advance(0.1);
    assert.ok(dom.context.countOf('fillRect') > 0, 'the ready screen should draw');

    harness.game.start();
    harness.quiet();
    busyField(harness);
    advance(0.1);

    press('KeyP');
    dom.context.reset();
    advance(0.2);
    assert.equal(inner.state, 'paused');
    assert.ok(dom.context.countOf('fillText') > 0, 'the paused overlay prints text');

    press('KeyP');
    harness.place(SHIP_TYPES.scout, inner.width - 20, 400);
    advance(0.3);
    assert.equal(inner.state, 'over');

    dom.context.reset();
    advance(0.5);
    assert.ok(dom.context.countOf('fill') > 0, 'the game-over screen keeps drawing');
  });
});

test('the animation loop keeps running in every state', () => {
  withGame({ seed: 134 }, ({ dom, advance, press, inner, place }) => {
    advance(0.1);
    assert.ok(dom.clock.pendingFrames > 0, 'a running game should be asking for frames');

    press('KeyP');
    advance(0.1);
    assert.ok(dom.clock.pendingFrames > 0, 'a paused game still repaints');

    press('KeyP');
    inner.ships.length = 0;
    place(SHIP_TYPES.scout, inner.width - 20, 400);
    advance(0.3);
    assert.equal(inner.state, 'over');
    advance(0.1);
    assert.ok(dom.clock.pendingFrames > 0, 'the loop survives the end of the run');
  });
});

test('rendering survives extreme canvas sizes', () => {
  for (const rect of [
    { left: 0, top: 0, width: 1, height: 1 },
    { left: 0, top: 0, width: 320, height: 240 },
    { left: 0, top: 0, width: 4000, height: 2400 },
  ]) {
    withGame({ seed: 135, width: rect.width, height: rect.height }, (harness) => {
      busyField(harness);
      harness.dom.context.reset();
      harness.advance(0.2);
      assert.ok(
        harness.dom.context.countOf('fill') > 0,
        `nothing drew at ${rect.width}x${rect.height}`,
      );
    });
  }
});

test('the backing store follows the device pixel ratio', () => {
  for (const ratio of [1, 2, 3]) {
    withGame({ seed: 136, devicePixelRatio: ratio, width: 800, height: 600 }, ({ dom, advance }) => {
      advance(0.1);
      assert.equal(dom.canvas.width, 800 * ratio);
      assert.equal(dom.canvas.height, 600 * ratio);
    });
  }
});

test('a screen full of chained explosions still draws', () => {
  withGame({ seed: 137 }, (harness) => {
    const { inner, place, advance } = harness;
    harness.quiet();
    inner.ships.length = 0;

    // A dense block, so one detonation sets off a long cascade.
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 4; column++) {
        place(SHIP_TYPES.scout, 300 + column * 55, 200 + row * 55);
      }
    }
    const trigger = inner.ships[0]!;
    harness.clickShip(trigger);

    advance(3);

    assert.ok(inner.destroyed > 4, `only ${inner.destroyed} ships went up in the block`);
    assert.ok(harness.dom.context.countOf('fill') > 0);
  });
});
