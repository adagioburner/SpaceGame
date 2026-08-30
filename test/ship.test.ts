import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_TYPES, TUNING } from '../src/config.js';
import { Effects } from '../src/effects.js';
import { Ship, shipSpawnY } from '../src/ship.js';
import { seedRandom } from './harness/dom.js';

const FIELD_HEIGHT = 800;

function makeShip(type = SHIP_TYPES.cruiser, x = 400, y = 400): Ship {
  return new Ship(type, x, y, FIELD_HEIGHT);
}

test('a fresh ship starts intact and at full speed', () => {
  const ship = makeShip(SHIP_TYPES.scout);
  assert.equal(ship.alive, true);
  assert.equal(ship.hull, SHIP_TYPES.scout.hull);
  assert.equal(ship.maxHull, SHIP_TYPES.scout.hull);
  assert.equal(ship.integrity, 1);
  assert.equal(ship.speed, SHIP_TYPES.scout.baseSpeed);
});

test('a scout dies to a single hit', () => {
  const ship = makeShip(SHIP_TYPES.scout);
  assert.equal(ship.applyDamage(1), true, 'the hit should be fatal');
  assert.equal(ship.alive, false);
  assert.equal(ship.hull, 0);
});

test('a cruiser survives until its last point of hull is gone', () => {
  const ship = makeShip(SHIP_TYPES.cruiser);
  for (let i = 1; i < SHIP_TYPES.cruiser.hull; i++) {
    assert.equal(ship.applyDamage(1), false, `hit ${i} should not be fatal`);
    assert.equal(ship.alive, true);
  }
  assert.equal(ship.hull, 1);
  assert.equal(ship.applyDamage(1), true, 'the final hit should destroy it');
  assert.equal(ship.alive, false);
});

test('damage slows a ship down, bottoming out just before it dies', () => {
  const ship = makeShip(SHIP_TYPES.dreadnought);
  const full = ship.speed;
  let previous = full;
  while (ship.hull > 1) {
    ship.applyDamage(1);
    assert.ok(ship.speed < previous, 'each hit should cost speed');
    previous = ship.speed;
  }
  assert.equal(ship.integrity, 0);
  const expected = SHIP_TYPES.dreadnought.baseSpeed * TUNING.minSpeedFactor;
  assert.ok(Math.abs(ship.speed - expected) < 1e-9, `crippled speed was ${ship.speed}`);
  assert.ok(ship.speed < full);
});

test('a single-hull ship has no damaged state to slow it down', () => {
  const ship = makeShip(SHIP_TYPES.scout);
  assert.equal(ship.integrity, 1);
  assert.equal(ship.speed, SHIP_TYPES.scout.baseSpeed);
});

test('overkill damage is clamped and does not drive hull negative', () => {
  const ship = makeShip(SHIP_TYPES.cruiser);
  assert.equal(ship.applyDamage(99), true);
  assert.equal(ship.hull, 0);
  assert.equal(ship.alive, false);
});

test('damage is ignored once a ship is already dead or the amount is zero', () => {
  const ship = makeShip(SHIP_TYPES.cruiser);
  assert.equal(ship.applyDamage(0), false);
  assert.equal(ship.hull, SHIP_TYPES.cruiser.hull, 'a zero hit should change nothing');

  ship.applyDamage(ship.hull);
  assert.equal(ship.applyDamage(1), false, 'a dead ship cannot be destroyed again');
  assert.equal(ship.hull, 0);
});

test('ships advance to the right at speed times the difficulty multiplier', () => {
  const effects = new Effects();
  const ship = makeShip(SHIP_TYPES.fighter, 100, 400);
  const multiplier = 1.5;
  const dt = 0.5;
  ship.update(dt, multiplier, effects);
  const expected = 100 + SHIP_TYPES.fighter.baseSpeed * multiplier * dt;
  assert.ok(Math.abs(ship.x - expected) < 1e-9, `ship reached ${ship.x}, expected ${expected}`);
});

test('a damaged ship trails smoke', () => {
  const effects = new Effects();
  const ship = makeShip(SHIP_TYPES.cruiser);

  ship.applyDamage(1);
  for (let i = 0; i < 60; i++) ship.update(1 / 60, 1, effects);
  // Smoke is the only thing a damaged ship emits, so any particle proves it.
  assert.ok(countParticles(effects) > 0, 'a burning ship should emit smoke');
});

test('an undamaged ship emits nothing', () => {
  const effects = new Effects();
  const ship = makeShip(SHIP_TYPES.cruiser);
  for (let i = 0; i < 60; i++) ship.update(1 / 60, 1, effects);
  assert.equal(countParticles(effects), 0, 'an intact ship should not smoke');
});

test('the nose leads the hull, and is what crosses the line first', () => {
  const ship = makeShip(SHIP_TYPES.cruiser, 500, 400);
  assert.ok(ship.noseX > ship.x);
  assert.ok(ship.noseX <= ship.x + ship.radius);
});

test('the hit area covers the hull and is wider than it is tall', () => {
  const ship = makeShip(SHIP_TYPES.cruiser, 400, 400);
  const r = ship.radius;

  assert.equal(ship.containsPoint(400, 400), true, 'the centre should be clickable');
  assert.equal(ship.containsPoint(400 + r, 400), true, 'the nose should be clickable');
  assert.equal(ship.containsPoint(400 - r, 400), true, 'the tail should be clickable');
  assert.equal(ship.containsPoint(400 + r * 1.5, 400), false, 'well ahead should miss');
  assert.equal(ship.containsPoint(400, 400 + r), false, 'ships are not that tall');
  assert.equal(ship.containsPoint(400, 400 + r * 0.5), true, 'just above should still hit');
});

test('ships are pulled back inside the field when it shrinks', () => {
  const ship = new Ship(SHIP_TYPES.cruiser, 100, 780, FIELD_HEIGHT);
  const effects = new Effects();

  ship.clampToField(300);
  ship.update(0, 1, effects);
  assert.ok(ship.y <= 300, `ship stayed at ${ship.y}, outside a 300px field`);
  assert.ok(ship.y >= 0);
});

test('spawn lanes keep the whole hull on screen', () => {
  const restore = seedRandom(5);
  try {
    for (const type of [SHIP_TYPES.scout, SHIP_TYPES.dreadnought]) {
      for (let i = 0; i < 200; i++) {
        const y = shipSpawnY(FIELD_HEIGHT, type.radius);
        assert.ok(y >= type.radius, `${type.id} spawned at ${y}, clipping the top`);
        assert.ok(y <= FIELD_HEIGHT - type.radius, `${type.id} spawned at ${y}, clipping the bottom`);
      }
    }
  } finally {
    restore();
  }
});

test('spawn lanes survive a field shorter than the ship', () => {
  const y = shipSpawnY(40, SHIP_TYPES.dreadnought.radius);
  assert.ok(Number.isFinite(y), 'a cramped field should still produce a lane');
});

/** Particles are private; drawing into a counting context reveals how many. */
function countParticles(effects: Effects): number {
  let arcs = 0;
  const probe = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    arc() {
      arcs += 1;
    },
    fill() {},
    fillRect() {},
    fillText() {},
    globalAlpha: 1,
    globalCompositeOperation: '',
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  effects.drawSmoke(probe as unknown as CanvasRenderingContext2D);
  return arcs;
}
