# Sector Defence — a browser space combat game

A small arcade game written in TypeScript and rendered on a 2D canvas. Enemy
ships stream in from the left; you shoot them by clicking. Anything that reaches
the red line on the right ends the run.

![gameplay](docs/screenshot.png)

## Play

```bash
npm install     # only needed to rebuild; the compiled game is committed
npm start       # builds and serves on http://localhost:8080
```

`npm start` builds `src/` into `dist/` and serves the folder over HTTP. A plain
static server works just as well — the page loads ES modules, so opening
`index.html` straight from the filesystem (`file://`) will not work.

## How it plays

- **Click a ship to hit it.** Scouts pop in one hit; bigger hulls need several.
- **Damage is visible and it hurts.** Each hit burns a hole in the hull, leaves
  cracks and trailing smoke, and slows the ship down — a nearly dead hull limps
  along at roughly 40% of its cruising speed.
- **Everything explodes outwards.** A destroyed ship throws out an expanding
  shockwave. Ships caught in it take damage that falls off with distance, and
  anything that dies to a shockwave sets off its own — so a well-placed hit on a
  cruiser in a tight formation can clear half the screen.
- **Chains pay.** Every link in a chain reaction raises the point multiplier.
  The crew calls each link as it goes &mdash; *secondary*, *cooking off*,
  *breaking up* &mdash; so the escalation reads without the game narrating its
  own mechanics.
- **Convoys are the set piece.** From threat level 3, a banner warns you that a
  heavy ship is coming in alone. Seconds later a swarm of light ships is
  released behind it. The swarm is faster, so it closes the gap — and because
  damage slows the heavy down, *how hard you hit it decides where they meet*.
  Leave it untouched and they only meet on top of the defence line, far too late
  to be worth anything; soften it and the cloud piles into your bomb mid-field.
  Judge the reach by eye and hold the last hit until they are packed around it,
  then take the whole formation with one click.

![a burning cruiser leading a convoy, with the scout swarm closing in behind it](docs/convoy.png)

- **Pressure ramps up.** Ships spawn faster, fly faster, and heavier classes
  join the fight as the threat level rises (one level every 16 seconds).
- **One breach and it's over.** If any ship crosses the line on the right, the
  run ends.

| Class | Hits | Speed | Blast |
| --- | --- | --- | --- |
| Scout | 1 | fastest | small |
| Fighter | 2 | fast | medium |
| Cruiser | 4 | slow | large |
| Dreadnought | 7 | slowest | huge |

Controls: **click** to fire, **Space/Enter** to start or restart, **P** or
**Esc** to pause. The best "ships destroyed" count is kept in `localStorage`.

## Layout

| Path | What it holds |
| --- | --- |
| `src/main.ts` | Entry point; wires the canvas and HUD to the game |
| `src/game.ts` | Loop, spawning, difficulty ramp, chain reactions, drawing |
| `src/ship.ts` | Ship state, hull shapes, damage decals, rendering |
| `src/convoy.ts` | Convoy set pieces: cloud layout and release timing |
| `src/effects.ts` | Explosions, particles, floating text, screen shake |
| `src/starfield.ts` | Parallax background |
| `src/hud.ts` | Score readouts and overlays (DOM) |
| `src/config.ts` | Ship classes and all difficulty tuning constants |
| `test/` | The test suite, plus the fake browser it runs the game inside |
| `dist/` | Compiled output, committed so the game runs without a build |

Tuning lives in one place: `TUNING`, `SHIP_TYPES` and `CONVOY` in
`src/config.ts`. Convoy feel is mostly `CONVOY.launchFraction` (how big a gap
the swarm has to close) and `CONVOY.depth` / `laneSpread` (how tightly the
cloud packs, and so how much of it one blast can reach).

## Development

```bash
npm run build   # one-off compile
npm run watch   # recompile on change
npm test        # build, then run the suite
```

No runtime dependencies. TypeScript and `@types/node` are the only
devDependencies, and the tests use Node's own runner — there is no test
framework to install.

## Tests

The game is a canvas game, but almost none of it needs a browser to test. It
only ever *writes* to the canvas, so `test/harness/` stands up a fake DOM with a
recording no-op 2D context, in-memory `localStorage`, and — the important part —
a clock that owns `performance.now()` and `requestAnimationFrame`. Tests advance
time themselves, so the real animation loop runs frame by frame, deterministically
and about as fast as the CPU allows. `Math.random` is swapped for a seeded
generator, so spawn lanes, ship classes and convoy layouts repeat exactly.

```bash
npm test              # build and run everything (~1s)
npm run test:only     # skip the dist rebuild
node --test "build-test/test/**/*.test.js" --test-name-pattern="cascade"
```

Node 22 or newer. GitHub Actions runs the same steps on every pull request and
on pushes to `main` (`.github/workflows/ci.yml`), with one extra check: it
rebuilds `dist/` and fails if the committed output has drifted from `src/`,
since the game is served straight from `dist/` and a stale build would ship
something other than the source.

| File | What it covers |
| --- | --- |
| `copy.test.ts` | The player-facing voice: the callout ladder escalates, stays short enough to read, and nothing on screen names a mechanic |
| `config.test.ts` | The design relationships the mechanics rest on: heavier means tougher, slower and deadlier; a scout blast reaches the next ship in a cloud; convoys cannot be scheduled before an anchor class exists |
| `utils.test.ts` | Maths and colour helpers, including that `weightedIndex` follows its proportions |
| `ship.test.ts` | Hull damage, the speed falloff, hit areas, smoke, staying inside the field |
| `spawning.test.ts` | Ships entering off-screen and in bounds, class unlocks, the mix shifting heavier, spawn intervals shortening, squadrons, the threat-level ramp and speed cap |
| `input.test.ts` | Clicking and destruction: one click per scout and four per cruiser, misses, overlapping targets, scoring, and the states where the guns are cold |
| `cascade.test.ts` | The chain reaction: distance falloff, one hit per blast per ship, a formation going up together, spread-out ships not chaining, the shockwave travelling rather than detonating everything at once, and chains paying more |
| `convoy.test.ts` | Cloud layout, release timing, the swarm still coming if the anchor dies early, and the catch-up gradient that makes the set piece work |
| `lifecycle.test.ts` | Game over on a breach, the field freezing, best-score persistence (including unavailable storage), restart, pause, and resizing |
| `rendering.test.ts` | Every drawing path runs without throwing, in each state and at extreme canvas sizes — a throw in `draw()` would otherwise silently freeze the game |

The suite is checked by mutation: breaking the once-per-blast guard, making the
shockwave instant, testing the breach against the hull centre instead of the
nose, removing the damage-slows-ships rule, never releasing a convoy swarm, or
ignoring class unlock levels each makes the matching tests fail.
