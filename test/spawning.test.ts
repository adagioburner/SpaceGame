import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_TYPES, TUNING } from '../src/config.js';
import { withGame } from './harness/game.js';

test('ships enter fully off the left edge, never popping into view', () => {
  withGame({ seed: 21 }, ({ inner }) => {
    inner.ships.length = 0;
    for (let i = 0; i < 40; i++) inner.spawnWave();

    assert.ok(inner.ships.length >= 40, 'each wave should put at least one ship on the field');
    for (const ship of inner.ships) {
      assert.ok(ship.noseX < 0, `ship appeared at ${ship.noseX}, already on screen`);
    }
  });
});

test('spawned ships keep their whole hull inside the field', () => {
  withGame({ seed: 22, height: 500 }, ({ inner }) => {
    inner.level = 8;
    inner.ships.length = 0;
    for (let i = 0; i < 60; i++) inner.spawnWave();

    for (const ship of inner.ships) {
      assert.ok(ship.y >= ship.radius, `${ship.type.id} at ${ship.y} clips the top`);
      assert.ok(ship.y <= 500 - ship.radius, `${ship.type.id} at ${ship.y} clips the bottom`);
    }
  });
});

test('heavy classes stay locked until their level', () => {
  withGame({ seed: 23 }, ({ inner }) => {
    for (const level of [1, 2]) {
      inner.level = level;
      for (let i = 0; i < 400; i++) {
        const type = inner.pickShipType();
        assert.ok(
          level >= type.unlockLevel,
          `${type.id} (unlocks at ${type.unlockLevel}) appeared at level ${level}`,
        );
      }
    }
  });
});

test('cruisers and dreadnoughts arrive once their levels are reached', () => {
  withGame({ seed: 24 }, ({ inner }) => {
    const sample = (level: number): Set<string> => {
      inner.level = level;
      const seen = new Set<string>();
      for (let i = 0; i < 800; i++) seen.add(inner.pickShipType().id);
      return seen;
    };

    const early = sample(2);
    assert.ok(!early.has('cruiser'), 'cruisers should not appear at level 2');

    const mid = sample(SHIP_TYPES.cruiser.unlockLevel);
    assert.ok(mid.has('cruiser'), 'cruisers should appear once unlocked');
    assert.ok(!mid.has('dreadnought'), 'dreadnoughts should still be locked');

    const late = sample(SHIP_TYPES.dreadnought.unlockLevel + 2);
    assert.ok(late.has('dreadnought'), 'dreadnoughts should appear once unlocked');
  });
});

test('the mix shifts towards heavier ships as levels rise', () => {
  withGame({ seed: 25 }, ({ inner }) => {
    const heavyShare = (level: number): number => {
      inner.level = level;
      let heavy = 0;
      const samples = 2000;
      for (let i = 0; i < samples; i++) {
        if (inner.pickShipType().hull > 1) heavy += 1;
      }
      return heavy / samples;
    };

    const early = heavyShare(3);
    const late = heavyShare(10);
    assert.ok(late > early, `heavy share fell from ${early} to ${late} as levels rose`);
  });
});

test('spawns come faster at higher levels but stay above a floor on average', () => {
  withGame({ seed: 26 }, ({ inner }) => {
    const meanInterval = (level: number): number => {
      inner.level = level;
      let total = 0;
      const samples = 500;
      for (let i = 0; i < samples; i++) total += inner.nextSpawnInterval();
      return total / samples;
    };

    const early = meanInterval(1);
    const mid = meanInterval(5);
    const late = meanInterval(20);

    assert.ok(early > mid, `interval did not shorten from level 1 (${early}) to 5 (${mid})`);
    assert.ok(mid > late, `interval did not shorten from level 5 (${mid}) to 20 (${late})`);
    // Jitter can dip an individual interval below the floor; the average cannot.
    assert.ok(
      late >= TUNING.minSpawnInterval * (1 - TUNING.spawnJitter),
      `mean interval ${late} fell through the floor`,
    );
    assert.ok(early <= TUNING.baseSpawnInterval * (1 + TUNING.spawnJitter));
  });
});

test('squadrons only start arriving at their level', () => {
  withGame({ seed: 27 }, ({ inner }) => {
    const maxWaveSize = (level: number): number => {
      inner.level = level;
      let largest = 0;
      for (let i = 0; i < 300; i++) {
        inner.ships.length = 0;
        inner.spawnWave();
        largest = Math.max(largest, inner.ships.length);
      }
      return largest;
    };

    assert.equal(maxWaveSize(TUNING.squadronFromLevel - 1), 1, 'single arrivals before the level');
    assert.ok(
      maxWaveSize(TUNING.squadronFromLevel + 2) > 1,
      'squadrons should appear once unlocked',
    );
    assert.ok(maxWaveSize(TUNING.squadronFromLevel + 2) <= TUNING.maxSquadron);
  });
});

test('the threat level follows elapsed time', () => {
  withGame({ seed: 28 }, ({ inner, advance, quiet }) => {
    quiet();
    assert.equal(inner.level, 1);
    advance(TUNING.secondsPerLevel + 0.5);
    assert.equal(inner.level, 2, 'a level should have passed');
    advance(TUNING.secondsPerLevel);
    assert.equal(inner.level, 3);
  });
});

test('a new threat level is announced on the banner', () => {
  withGame({ seed: 29 }, ({ inner, advance, dom, quiet }) => {
    quiet();
    const banner = dom.elements.get('level-banner')!;
    advance(TUNING.secondsPerLevel + 0.5);
    assert.match(banner.textContent, /THREAT LEVEL 2/);
    assert.ok(banner.classList.contains('show'));
    assert.equal(inner.level, 2);
  });
});

test('everything speeds up over time, up to a ceiling', () => {
  withGame({ seed: 30 }, ({ inner }) => {
    inner.elapsed = 0;
    assert.equal(inner.speedMultiplier, 1);

    inner.elapsed = 60;
    const later = inner.speedMultiplier;
    assert.ok(later > 1, 'ships should be faster after a minute');

    inner.elapsed = 100_000;
    assert.equal(inner.speedMultiplier, TUNING.maxSpeedMultiplier, 'the ramp should cap');
  });
});

test('ships keep arriving over a sustained run', () => {
  withGame({ seed: 31 }, ({ inner, advance }) => {
    advance(10);
    assert.ok(inner.ships.length > 2, `only ${inner.ships.length} ships arrived in 10 seconds`);
  });
});
