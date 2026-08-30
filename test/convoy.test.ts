import test from 'node:test';
import assert from 'node:assert/strict';
import { CONVOY, SHIP_TYPES } from '../src/config.js';
import { convoyInterval, convoyLaunchDelay, planConvoy } from '../src/convoy.js';
import type { Ship } from '../src/ship.js';
import type { TestGame } from './harness/game.js';
import { createTestGame, withGame } from './harness/game.js';
import { seedRandom } from './harness/dom.js';

const FIELD_HEIGHT = 800;

test('the anchor is always a heavy that has already unlocked', () => {
  const restore = seedRandom(81);
  try {
    for (let i = 0; i < 200; i++) {
      const plan = planConvoy(CONVOY.fromLevel, FIELD_HEIGHT);
      assert.equal(plan.anchorType.id, 'cruiser', 'only cruisers anchor early convoys');
    }
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      seen.add(planConvoy(SHIP_TYPES.dreadnought.unlockLevel + 1, FIELD_HEIGHT).anchorType.id);
    }
    assert.ok(seen.has('dreadnought'), 'dreadnoughts should anchor convoys once unlocked');
    assert.deepEqual([...seen].sort(), ['cruiser', 'dreadnought']);
  } finally {
    restore();
  }
});

test('the cloud is made of light ships that a blast can chain through', () => {
  const restore = seedRandom(82);
  try {
    for (let i = 0; i < 100; i++) {
      for (const member of planConvoy(CONVOY.fromLevel + 4, FIELD_HEIGHT).members) {
        assert.ok(
          member.type.hull <= SHIP_TYPES.fighter.hull,
          `${member.type.id} is too tough to belong in a cloud`,
        );
      }
    }
  } finally {
    restore();
  }
});

test('the first convoys are pure scouts, with fighters mixed in later', () => {
  const restore = seedRandom(83);
  try {
    for (let i = 0; i < 100; i++) {
      for (const member of planConvoy(CONVOY.fromLevel, FIELD_HEIGHT).members) {
        assert.equal(member.type.id, 'scout', 'the first convoy should be easy to chain');
      }
    }
    const later = new Set<string>();
    for (let i = 0; i < 200; i++) {
      for (const member of planConvoy(CONVOY.fromLevel + 8, FIELD_HEIGHT).members) {
        later.add(member.type.id);
      }
    }
    assert.ok(later.has('fighter'), 'tougher cloud members should appear at high levels');
  } finally {
    restore();
  }
});

test('swarms grow with the threat level and stop at the cap', () => {
  const restore = seedRandom(84);
  try {
    const size = (level: number): number => planConvoy(level, FIELD_HEIGHT).members.length;
    assert.ok(size(CONVOY.fromLevel + 6) > size(CONVOY.fromLevel), 'swarms should grow');
    assert.equal(size(CONVOY.fromLevel + 200), CONVOY.maxSwarmSize, 'and then stop growing');
  } finally {
    restore();
  }
});

test('the cloud sits behind the anchor, inside its blast reach and on screen', () => {
  const restore = seedRandom(85);
  try {
    for (let i = 0; i < 200; i++) {
      const plan = planConvoy(CONVOY.fromLevel + 5, FIELD_HEIGHT);
      const spread = plan.anchorType.blastRadius * CONVOY.laneSpread;
      for (const member of plan.members) {
        assert.ok(member.dx <= 0, 'members trail the anchor, they do not lead it');
        assert.ok(member.dx >= -CONVOY.depth, `member started ${member.dx} back, beyond the depth`);
        assert.ok(
          Math.abs(member.dy) <= spread + 1e-9,
          `member sat ${member.dy} off the lane, outside the anchor's reach`,
        );
        const y = plan.anchorY + member.dy;
        assert.ok(y >= 0 && y <= FIELD_HEIGHT, `member would spawn off screen at ${y}`);
      }
    }
  } finally {
    restore();
  }
});

test('the lane leaves room for the whole cloud', () => {
  const restore = seedRandom(86);
  try {
    for (let i = 0; i < 200; i++) {
      const plan = planConvoy(CONVOY.fromLevel + 5, FIELD_HEIGHT);
      assert.ok(plan.anchorY > 0 && plan.anchorY < FIELD_HEIGHT);
    }
  } finally {
    restore();
  }
});

test('cloud layout copes with a cramped field', () => {
  const restore = seedRandom(87);
  try {
    const plan = planConvoy(CONVOY.fromLevel + 5, 200);
    assert.ok(Number.isFinite(plan.anchorY));
    for (const member of plan.members) {
      const y = plan.anchorY + member.dy;
      assert.ok(Number.isFinite(y), 'a short field should still produce usable lanes');
    }
  } finally {
    restore();
  }
});

test('the release delay is the time the anchor needs to open the gap', () => {
  const width = 1200;
  const delay = convoyLaunchDelay(SHIP_TYPES.cruiser, width, 1);
  const expected = (width * CONVOY.launchFraction) / SHIP_TYPES.cruiser.baseSpeed;
  assert.ok(Math.abs(delay - expected) < 1e-9, `delay was ${delay}, expected ${expected}`);

  const faster = convoyLaunchDelay(SHIP_TYPES.cruiser, width, 2);
  assert.ok(faster < delay, 'a faster field should reach the release point sooner');
});

test('convoys come round more often at higher levels, down to a floor', () => {
  const restore = seedRandom(88);
  try {
    const mean = (level: number): number => {
      let total = 0;
      for (let i = 0; i < 400; i++) total += convoyInterval(level);
      return total / 400;
    };
    assert.ok(mean(CONVOY.fromLevel) > mean(CONVOY.fromLevel + 8), 'convoys should speed up');
    assert.ok(mean(CONVOY.fromLevel + 100) >= CONVOY.minInterval * 0.85, 'but not run away');
  } finally {
    restore();
  }
});

test('no convoy arrives before its level, however long the clock runs', () => {
  withGame({ seed: 89 }, ({ inner, advanceDefended }) => {
    inner.convoyTimer = 0;
    inner.level = CONVOY.fromLevel - 1;
    inner.elapsed = 0;

    for (let i = 0; i < 120; i++) {
      inner.level = CONVOY.fromLevel - 1;
      inner.elapsed = 0;
      advanceDefended(0.1);
      assert.equal(inner.pendingConvoy, null, 'a convoy was scheduled too early');
    }
  });
});

test('a convoy sends the heavy in first, alone', () => {
  withGame({ seed: 90 }, ({ inner, quiet }) => {
    quiet();
    inner.ships.length = 0;
    inner.level = CONVOY.fromLevel;
    inner.startConvoy();

    assert.equal(inner.ships.length, 1, 'the anchor should arrive by itself');
    assert.ok(inner.ships[0]!.type.hull >= SHIP_TYPES.cruiser.hull, 'and it should be a heavy');
    assert.ok(inner.pendingConvoy, 'its swarm should be waiting in the wings');
    assert.ok(inner.pendingConvoy!.members.length > 0);
  });
});

test('the swarm is released once the gap has opened', () => {
  withGame({ seed: 91 }, (harness) => {
    const { inner, quiet, advance } = harness;
    quiet();
    inner.ships.length = 0;
    inner.level = CONVOY.fromLevel;
    inner.startConvoy();
    quiet();

    const expected = inner.pendingConvoy!.members.length;
    const wait = inner.pendingConvoy!.launchAt - inner.elapsed;

    advance(wait * 0.5);
    quiet();
    assert.equal(inner.ships.length, 1, 'the swarm should still be holding');

    advance(wait);
    assert.equal(inner.pendingConvoy, null, 'the convoy should have been released');
    assert.equal(inner.ships.length, 1 + expected, 'the whole swarm should be on the field');
  });
});

test('the swarm still comes even if the heavy is killed early', () => {
  withGame({ seed: 92 }, (harness) => {
    const { inner, quiet, advance } = harness;
    quiet();
    inner.ships.length = 0;
    inner.level = CONVOY.fromLevel;
    inner.startConvoy();
    quiet();

    const anchor = inner.ships[0]!;
    const expected = inner.pendingConvoy!.members.length;
    const wait = inner.pendingConvoy!.launchAt - inner.elapsed;

    anchor.applyDamage(anchor.hull);
    inner.destroyShip(anchor, 0);
    advance(wait + 0.5);

    const survivors = inner.ships.filter((ship) => ship.alive);
    assert.equal(inner.pendingConvoy, null);
    assert.ok(
      survivors.length >= expected - 1,
      `killing the anchor called off the attack (${survivors.length} of ${expected} arrived)`,
    );
  });
});

interface ConvoyOutcome {
  anchorType: string;
  swarmSize: number;
  /** Where across the field the swarm drew level, or null if it never did. */
  caughtAt: number | null;
  anchor: Ship;
  swarm: Ship[];
  harness: TestGame;
}

/**
 * Runs a convoy with `hits` already landed on the anchor and reports where the
 * swarm caught it. The caller disposes the harness.
 */
function runConvoy(hits: number, seed: number): ConvoyOutcome {
  const harness = createTestGame({ seed });
  const { inner } = harness;

  const hush = (): void => {
    inner.spawnTimer = Number.MAX_SAFE_INTEGER;
    inner.convoyTimer = Number.MAX_SAFE_INTEGER;
  };

  hush();
  inner.ships.length = 0;
  inner.level = CONVOY.fromLevel;
  inner.elapsed = 0;
  inner.startConvoy();
  hush();

  const anchor = inner.ships[0]!;
  for (let i = 0; i < Math.min(hits, anchor.maxHull - 1); i++) anchor.applyDamage(1);

  const swarmSize = inner.pendingConvoy!.members.length;
  let swarm: Ship[] = [];
  let caughtAt: number | null = null;

  for (let frame = 0; frame < 60 * 120; frame++) {
    harness.advance(1 / 60);
    hush();
    if (inner.state !== 'running') break;
    if (swarm.length === 0 && inner.pendingConvoy === null) {
      swarm = inner.ships.filter((ship) => ship !== anchor);
    }
    if (!anchor.alive) break;
    if (swarm.length > 0 && swarm.some((ship) => ship.alive && ship.x >= anchor.x)) {
      caughtAt = anchor.x / inner.width;
      break;
    }
  }

  return { anchorType: anchor.type.id, swarmSize, caughtAt, anchor, swarm, harness };
}

test('an untouched heavy is only caught on top of the defence line', () => {
  const run = runConvoy(0, 93);
  try {
    assert.equal(run.anchorType, 'cruiser');
    // It does get caught eventually, but so late that detonating it there is no
    // use: the payoff is in dragging that meeting point back up the field.
    assert.ok(
      run.caughtAt === null || run.caughtAt > 0.65,
      `an untouched heavy was caught at ${run.caughtAt} of the field, far too early to reward hitting it`,
    );
  } finally {
    run.harness.dispose();
  }
});

test('a single hit drags the meeting point back to safe ground', () => {
  const untouched = runConvoy(0, 94);
  const lightlyHit = runConvoy(1, 94);
  try {
    assert.ok(lightlyHit.caughtAt !== null, 'a hit heavy should be caught');
    assert.ok(
      lightlyHit.caughtAt! < 0.6,
      `one hit should bring the meeting inside the field, got ${lightlyHit.caughtAt}`,
    );
    const before = untouched.caughtAt ?? 1;
    assert.ok(
      lightlyHit.caughtAt! < before,
      `one hit should move the meeting earlier than ${before}`,
    );
  } finally {
    untouched.harness.dispose();
    lightlyHit.harness.dispose();
  }
});

test('the harder the heavy is hit, the sooner the swarm piles into it', () => {
  const runs = [1, 2, 3].map((hits) => runConvoy(hits, 95));
  try {
    const positions = runs.map((run) => run.caughtAt);
    for (const [index, position] of positions.entries()) {
      assert.ok(position !== null, `run with ${index + 1} hit(s) was never caught`);
    }
    assert.ok(
      positions[0]! > positions[1]! && positions[1]! > positions[2]!,
      `meeting points should move earlier with damage, got ${positions.join(', ')}`,
    );
  } finally {
    for (const run of runs) run.harness.dispose();
  }
});

test('detonating the heavy inside the cloud takes the formation with it', () => {
  const run = runConvoy(3, 96);
  try {
    const { harness, anchor } = run;
    const { inner } = harness;
    assert.ok(run.caughtAt !== null, 'the swarm should have caught up');

    const before = inner.destroyed;
    harness.clickShip(anchor);
    assert.equal(anchor.alive, false, 'a primed heavy should go up on one click');
    harness.advance(2.5);

    const killed = inner.destroyed - before;
    assert.ok(
      killed > 1,
      `only ${killed} ship went up — the cloud should have gone with the anchor`,
    );
  } finally {
    run.harness.dispose();
  }
});
