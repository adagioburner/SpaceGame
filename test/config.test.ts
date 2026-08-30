import test from 'node:test';
import assert from 'node:assert/strict';
import { CONVOY, SHIP_TYPES, SHIP_TYPE_LIST, TUNING, scoreForType } from '../src/config.js';

/**
 * These lock down the relationships the game design depends on, so a tuning
 * tweak that quietly breaks a mechanic fails here rather than in play.
 */

const BY_WEIGHT_CLASS = [
  SHIP_TYPES.scout,
  SHIP_TYPES.fighter,
  SHIP_TYPES.cruiser,
  SHIP_TYPES.dreadnought,
];

test('heavier ship classes are tougher, slower, bigger and deadlier', () => {
  for (let i = 1; i < BY_WEIGHT_CLASS.length; i++) {
    const lighter = BY_WEIGHT_CLASS[i - 1]!;
    const heavier = BY_WEIGHT_CLASS[i]!;
    assert.ok(heavier.hull > lighter.hull, `${heavier.id} should have more hull`);
    assert.ok(heavier.baseSpeed < lighter.baseSpeed, `${heavier.id} should be slower`);
    assert.ok(heavier.radius > lighter.radius, `${heavier.id} should be bigger`);
    assert.ok(heavier.blastRadius > lighter.blastRadius, `${heavier.id} should blast further`);
    assert.ok(heavier.blastPower > lighter.blastPower, `${heavier.id} should blast harder`);
    assert.ok(
      heavier.unlockLevel >= lighter.unlockLevel,
      `${heavier.id} should not unlock before ${lighter.id}`,
    );
  }
});

test('every blast reaches beyond the hull that made it', () => {
  for (const type of SHIP_TYPE_LIST) {
    assert.ok(type.blastRadius > type.radius, `${type.id} blast should clear its own hull`);
  }
});

test('kills are worth more the tougher the hull', () => {
  for (let i = 1; i < BY_WEIGHT_CLASS.length; i++) {
    assert.ok(scoreForType(BY_WEIGHT_CLASS[i]!) > scoreForType(BY_WEIGHT_CLASS[i - 1]!));
  }
});

test('a scout blast reaches the next ship in a convoy cloud', () => {
  // Without this, clouds could not chain scout-to-scout and the convoy set
  // piece would fizzle after the anchor's own blast.
  assert.ok(
    SHIP_TYPES.scout.blastRadius > CONVOY.minSpacing,
    'scout blast radius must exceed the minimum spacing used when laying out a cloud',
  );
});

test('convoys only start once an anchor class is available', () => {
  assert.ok(
    CONVOY.fromLevel >= SHIP_TYPES.cruiser.unlockLevel,
    'convoys must not be scheduled before their lightest anchor unlocks',
  );
});

test('the cloud fits inside the anchor blast it is meant to be caught by', () => {
  assert.ok(CONVOY.laneSpread < 1, 'lane spread is a fraction of the blast radius');
  assert.ok(CONVOY.baseSwarmSize <= CONVOY.maxSwarmSize);
  assert.ok(CONVOY.minInterval <= CONVOY.interval);
  assert.ok(CONVOY.launchFraction > 0 && CONVOY.launchFraction < 1);
});

test('difficulty tuning escalates within sane bounds', () => {
  assert.ok(TUNING.minSpawnInterval < TUNING.baseSpawnInterval);
  assert.ok(TUNING.spawnIntervalDecay > 0 && TUNING.spawnIntervalDecay < 1);
  assert.ok(TUNING.maxSpeedMultiplier > 1);
  assert.ok(TUNING.speedGrowthPerSecond > 0);
  assert.ok(TUNING.minSpeedFactor > 0 && TUNING.minSpeedFactor < 1);
  assert.ok(TUNING.spawnJitter >= 0 && TUNING.spawnJitter < 1);
  assert.ok(TUNING.secondsPerLevel > 0);
});
