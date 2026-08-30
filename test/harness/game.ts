import { Game } from '../../src/game.js';
import { Hud } from '../../src/hud.js';
import { Ship } from '../../src/ship.js';
import type { Explosion } from '../../src/effects.js';
import type { ConvoyMember } from '../../src/convoy.js';
import type { ShipType } from '../../src/types.js';
import { installDom, seedRandom } from './dom.js';
import type { FakeDom } from './dom.js';

/**
 * The private state tests need to observe. Declared once here so the unsafe
 * cast lives in a single place instead of being sprinkled through the suite.
 */
export interface GameInternals {
  ships: Ship[];
  explosions: Explosion[];
  state: 'ready' | 'running' | 'paused' | 'over';
  width: number;
  height: number;
  elapsed: number;
  level: number;
  destroyed: number;
  points: number;
  best: number;
  spawnTimer: number;
  convoyTimer: number;
  pendingConvoy: {
    anchorY: number;
    members: readonly ConvoyMember[];
    launchAt: number;
  } | null;
  readonly speedMultiplier: number;
  spawnWave(): void;
  startConvoy(): void;
  destroyShip(ship: Ship, chainDepth: number): void;
  nextSpawnInterval(): number;
  pickShipType(): ShipType;
}

export function internalsOf(game: Game): GameInternals {
  return game as unknown as GameInternals;
}

export interface TestGame {
  game: Game;
  inner: GameInternals;
  dom: FakeDom;
  /** Runs the real animation loop for `seconds` of simulated time. */
  advance(seconds: number): void;
  /**
   * Advances while quietly clearing ships that near the line, standing in for a
   * player who keeps the sector alive. Without this, an unattended run ends in
   * about fifteen seconds.
   */
  advanceDefended(seconds: number): void;
  /** Clicks a point in canvas coordinates. */
  clickAt(x: number, y: number): void;
  /** Clicks the centre of a ship. */
  clickShip(ship: Ship): void;
  press(code: string): void;
  /** Puts a ship on the field directly, bypassing the spawner. */
  place(type: ShipType, x: number, y: number): Ship;
  /** Suppresses routine spawns and convoys so a test sees only its own ships. */
  quiet(): void;
  dispose(): void;
}

export interface TestGameOptions {
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  seed?: number;
  /** Values already in storage before the game boots, e.g. a saved best. */
  storage?: Record<string, string>;
  /** Start the run immediately (most tests want this). */
  start?: boolean;
}

/**
 * Builds a Game wired to the fake browser, with time under the test's control.
 * Always `dispose()` — it restores globals and `Math.random`.
 */
export function createTestGame(options: TestGameOptions = {}): TestGame {
  const restoreRandom = seedRandom(options.seed ?? 1);
  const dom = installDom(options);
  const hud = new Hud(() => game.primaryAction());
  const game = new Game(dom.canvas as unknown as HTMLCanvasElement, hud);
  const inner = internalsOf(game);

  if (options.start !== false) game.start();

  const harness: TestGame = {
    game,
    inner,
    dom,
    advance(seconds) {
      dom.clock.advance(seconds);
    },
    advanceDefended(seconds) {
      const step = 1 / 60;
      const frames = Math.max(1, Math.round(seconds / step));
      for (let i = 0; i < frames; i++) {
        dom.clock.advance(step, step * 1000);
        for (const ship of inner.ships) {
          if (ship.alive && ship.noseX > inner.width * 0.85) ship.alive = false;
        }
      }
    },
    clickAt(x, y) {
      dom.canvas.dispatch('pointerdown', { clientX: x, clientY: y });
    },
    clickShip(ship) {
      harness.clickAt(ship.x, ship.y);
    },
    press(code) {
      dom.dispatchWindow('keydown', { code, preventDefault: () => {} });
    },
    place(type, x, y) {
      const ship = new Ship(type, x, y, inner.height);
      inner.ships.push(ship);
      return ship;
    },
    quiet() {
      inner.spawnTimer = Number.MAX_SAFE_INTEGER;
      inner.convoyTimer = Number.MAX_SAFE_INTEGER;
    },
    dispose() {
      dom.uninstall();
      restoreRandom();
    },
  };
  return harness;
}

/** Runs `body` against a fresh game and always tears it down. */
export function withGame(options: TestGameOptions, body: (harness: TestGame) => void): void {
  const harness = createTestGame(options);
  try {
    body(harness);
  } finally {
    harness.dispose();
  }
}

/** Ships still alive on the field. */
export function livingShips(inner: GameInternals): Ship[] {
  return inner.ships.filter((ship) => ship.alive);
}
