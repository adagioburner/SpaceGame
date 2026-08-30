import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_TYPES, scoreForType } from '../src/config.js';
import { Explosion } from '../src/effects.js';
import type { Ship } from '../src/ship.js';
import type { TestGame } from './harness/game.js';
import { withGame } from './harness/game.js';

/** Clicks a ship until it is destroyed, the way a player would. */
function shootDown(harness: TestGame, ship: Ship): void {
  while (ship.alive) harness.clickShip(ship);
}

/** A game with an empty field and nothing else arriving. */
function emptyField(harness: TestGame): void {
  harness.quiet();
  harness.inner.ships.length = 0;
}

test('destroying a ship leaves a blast behind', () => {
  withGame({ seed: 61 }, (harness) => {
    const { inner, place } = harness;
    emptyField(harness);
    shootDown(harness, place(SHIP_TYPES.scout, 400, 400));

    assert.equal(inner.explosions.length, 1, 'the kill should set off an explosion');
  });
});

test('a blast damages ships within reach and spares the rest', () => {
  withGame({ seed: 62 }, (harness) => {
    const { place, advance } = harness;
    emptyField(harness);

    const cruiser = place(SHIP_TYPES.cruiser, 400, 400);
    const nearby = place(SHIP_TYPES.dreadnought, 400, 340);
    const distant = place(SHIP_TYPES.dreadnought, 900, 400);

    shootDown(harness, cruiser);
    advance(1);

    assert.ok(
      nearby.hull < SHIP_TYPES.dreadnought.hull,
      'a ship beside the blast should be damaged',
    );
    assert.equal(
      distant.hull,
      SHIP_TYPES.dreadnought.hull,
      'a ship across the field should be untouched',
    );
  });
});

test('blast damage falls off with distance', () => {
  withGame({ seed: 63 }, (harness) => {
    const { place, advance } = harness;
    emptyField(harness);

    const bomb = place(SHIP_TYPES.dreadnought, 400, 400);
    const close = place(SHIP_TYPES.dreadnought, 400, 370);
    const far = place(SHIP_TYPES.dreadnought, 400, 590);

    shootDown(harness, bomb);
    advance(1.2);

    const closeLost = SHIP_TYPES.dreadnought.hull - close.hull;
    const farLost = SHIP_TYPES.dreadnought.hull - far.hull;
    assert.ok(closeLost > 0, 'the near ship should be hurt');
    assert.ok(farLost > 0, 'the far ship should be hurt too');
    assert.ok(
      closeLost > farLost,
      `near ship lost ${closeLost} hull, far ship lost ${farLost} — expected more damage up close`,
    );
  });
});

test('one blast can only hit a given ship once', () => {
  withGame({ seed: 64 }, (harness) => {
    const { place, advance } = harness;
    emptyField(harness);

    const cruiser = place(SHIP_TYPES.cruiser, 400, 400);
    const victim = place(SHIP_TYPES.dreadnought, 400, 450);

    shootDown(harness, cruiser);
    advance(0.05);
    const afterFirstContact = victim.hull;
    advance(2);

    assert.ok(afterFirstContact < SHIP_TYPES.dreadnought.hull, 'the wave should have hit it');
    assert.equal(
      victim.hull,
      afterFirstContact,
      'the same blast should not keep grinding the ship down',
    );
    assert.equal(victim.alive, true, 'a single cruiser blast should not finish a dreadnought');
  });
});

test('a tight formation goes up in a chain reaction', () => {
  withGame({ seed: 65 }, (harness) => {
    const { inner, place, advance } = harness;
    emptyField(harness);

    const formation = [250, 300, 350, 400].map((y) => place(SHIP_TYPES.scout, 400, y));

    shootDown(harness, formation[1]!);
    advance(2);

    for (const ship of formation) {
      assert.equal(ship.alive, false, `the ship at y=${ship.y} should have been caught`);
    }
    assert.equal(inner.destroyed, formation.length, 'every ship in the formation should be scored');
  });
});

test('chained kills are worth more than the same ships picked off singly', () => {
  let chainedPoints = 0;
  let singlePoints = 0;

  withGame({ seed: 66 }, (harness) => {
    const { inner, place, advance } = harness;
    emptyField(harness);
    const formation = [250, 300, 350, 400].map((y) => place(SHIP_TYPES.scout, 400, y));
    shootDown(harness, formation[1]!);
    advance(2);
    chainedPoints = inner.points;
  });

  withGame({ seed: 67 }, (harness) => {
    const { inner, place, advance } = harness;
    emptyField(harness);
    // Far enough apart that nothing sets anything else off.
    for (const y of [100, 300, 500, 700]) {
      shootDown(harness, place(SHIP_TYPES.scout, 200 + y, y));
      advance(1.2);
    }
    singlePoints = inner.points;
  });

  assert.equal(singlePoints, 4 * scoreForType(SHIP_TYPES.scout), 'four plain kills');
  assert.ok(
    chainedPoints > singlePoints,
    `chain paid ${chainedPoints}, singles paid ${singlePoints} — chains should pay more`,
  );
});

test('ships spread out do not set each other off', () => {
  withGame({ seed: 68 }, (harness) => {
    const { inner, place, advance } = harness;
    emptyField(harness);

    const target = place(SHIP_TYPES.scout, 400, 150);
    const bystanders = [400, 650].map((y) => place(SHIP_TYPES.scout, 400, y));

    shootDown(harness, target);
    advance(2);

    for (const ship of bystanders) {
      assert.equal(ship.alive, true, `the ship at y=${ship.y} was far enough to survive`);
    }
    assert.equal(inner.destroyed, 1, 'only the ship that was shot should be scored');
  });
});

test('the shockwave travels outwards rather than detonating everything at once', () => {
  withGame({ seed: 69 }, (harness) => {
    const { place, advance } = harness;
    emptyField(harness);

    const cruiser = place(SHIP_TYPES.cruiser, 600, 400);
    const close = place(SHIP_TYPES.scout, 620, 400);
    const far = place(SHIP_TYPES.scout, 500, 400);

    shootDown(harness, cruiser);
    advance(1 / 60);

    assert.equal(close.alive, false, 'the ship at the centre should go immediately');
    assert.equal(far.alive, true, 'the wave should not have reached the far ship yet');

    advance(1);
    assert.equal(far.alive, false, 'the wave should reach it a moment later');
  });
});

test('the lingering fireball does not keep killing after the wave has passed', () => {
  withGame({ seed: 70 }, (harness) => {
    const { inner, place, advance } = harness;
    emptyField(harness);

    const cruiser = place(SHIP_TYPES.cruiser, 400, 400);
    shootDown(harness, cruiser);

    // Past the sweep, but while the fireball is still on screen.
    advance(0.55);
    assert.ok(inner.explosions.length > 0, 'the explosion should still be animating');

    const latecomer = place(SHIP_TYPES.scout, 400, 400);
    advance(0.15);

    assert.equal(latecomer.alive, true, 'a ship arriving after the sweep should be safe');
  });
});

test('explosions clear themselves up', () => {
  withGame({ seed: 71 }, (harness) => {
    const { inner, place, advance } = harness;
    emptyField(harness);

    shootDown(harness, place(SHIP_TYPES.dreadnought, 400, 400));
    assert.ok(inner.explosions.length > 0);

    advance(3);
    assert.equal(inner.explosions.length, 0, 'finished explosions should be discarded');
  });
});

test('a shockwave expands from nothing to its full radius, then finishes', () => {
  const blast = new Explosion(0, 0, 200, 3);

  assert.equal(blast.radius, 0, 'it starts as a point');
  assert.equal(blast.done, false);

  let previous = blast.radius;
  for (let i = 0; i < 20; i++) {
    blast.update(1 / 60);
    assert.ok(blast.radius >= previous, 'the wave should never shrink');
    previous = blast.radius;
  }

  assert.ok(blast.radius > 0);
  assert.ok(blast.radius <= 200, 'it should not overshoot its radius');

  while (!blast.finishedExpanding) blast.update(1 / 60);
  assert.ok(Math.abs(blast.radius - 200) < 1e-6, `stopped at ${blast.radius}`);
  assert.equal(blast.done, false, 'the fireball outlives the sweep');

  while (!blast.done) blast.update(1 / 60);
  assert.equal(blast.done, true);
});

test('each blast tracks the ships it has already caught', () => {
  const blast = new Explosion(0, 0, 100, 2, 3);
  assert.equal(blast.chainDepth, 3, 'chain depth is carried so scoring can multiply it');
  assert.equal(blast.hitShips.size, 0);
  blast.hitShips.add(7);
  assert.equal(blast.hitShips.has(7), true);

  const other = new Explosion(0, 0, 100, 2);
  assert.equal(other.chainDepth, 0);
  assert.equal(other.hitShips.has(7), false, 'each blast keeps its own record');
});
