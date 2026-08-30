import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_TYPES } from '../src/config.js';
import { createTestGame, livingShips, withGame } from './harness/game.js';

const BEST_KEY = 'space-combat.best-destroyed';

test('the run starts behind a briefing overlay', () => {
  withGame({ seed: 101, start: false }, ({ inner, dom }) => {
    const overlay = dom.elements.get('overlay')!;
    assert.equal(inner.state, 'ready');
    assert.ok(overlay.classList.contains('visible'), 'the briefing should be up');
    assert.ok(!overlay.classList.contains('over'));
    assert.match(dom.elements.get('overlay-title')!.textContent, /SECTOR DEFENCE/i);
  });
});

test('starting the run clears the overlay and resets the score', () => {
  withGame({ seed: 102, start: false }, ({ game, inner, dom }) => {
    game.start();
    assert.equal(inner.state, 'running');
    assert.equal(inner.destroyed, 0);
    assert.equal(inner.points, 0);
    assert.equal(inner.level, 1);
    assert.ok(!dom.elements.get('overlay')!.classList.contains('visible'));
  });
});

test('a ship reaching the line ends the run', () => {
  withGame({ seed: 103 }, ({ inner, quiet, place, advance, dom }) => {
    quiet();
    inner.ships.length = 0;
    place(SHIP_TYPES.scout, inner.width - 20, 400);

    advance(0.3);

    assert.equal(inner.state, 'over', 'the sector should have fallen');
    const overlay = dom.elements.get('overlay')!;
    assert.ok(overlay.classList.contains('visible'));
    assert.ok(overlay.classList.contains('over'));
    assert.match(dom.elements.get('overlay-title')!.textContent, /BREACH/i);
  });
});

test('a ship short of the line does not end the run', () => {
  withGame({ seed: 104 }, ({ inner, quiet, place, advance }) => {
    quiet();
    inner.ships.length = 0;
    const scout = place(SHIP_TYPES.scout, inner.width - 200, 400);

    advance(0.5);

    assert.equal(inner.state, 'running');
    assert.equal(scout.alive, true);
  });
});

test('it is the nose that crosses the line, not the centre', () => {
  withGame({ seed: 105 }, ({ inner, quiet, place, advance }) => {
    quiet();
    inner.ships.length = 0;
    // Centre still short of the line, but the nose is over it.
    const dreadnought = place(SHIP_TYPES.dreadnought, inner.width - 40, 400);
    assert.ok(dreadnought.x < inner.width - 10, 'the hull centre has not reached the line');

    advance(1 / 60);
    assert.equal(inner.state, 'over', 'the leading edge should have triggered the breach');
  });
});

test('the field freezes once the sector falls', () => {
  withGame({ seed: 106 }, ({ inner, quiet, place, advance }) => {
    quiet();
    inner.ships.length = 0;
    place(SHIP_TYPES.scout, inner.width - 20, 300);
    const bystander = place(SHIP_TYPES.scout, 200, 600);

    advance(0.3);
    assert.equal(inner.state, 'over');
    const parked = bystander.x;

    advance(1);
    assert.equal(bystander.x, parked, 'ships should stop advancing after the run ends');
  });
});

test('nothing new arrives after the sector falls', () => {
  withGame({ seed: 107 }, ({ inner, place, advance }) => {
    inner.ships.length = 0;
    inner.spawnTimer = 0.05;
    place(SHIP_TYPES.scout, inner.width - 20, 300);

    advance(0.3);
    assert.equal(inner.state, 'over');
    const remaining = livingShips(inner).length;

    advance(5);
    assert.equal(livingShips(inner).length, remaining, 'the spawner should be shut down');
  });
});

test('explosions keep playing out after the run ends', () => {
  withGame({ seed: 108 }, ({ inner, quiet, place, clickShip, advance }) => {
    quiet();
    inner.ships.length = 0;
    const doomed = place(SHIP_TYPES.scout, 400, 400);
    place(SHIP_TYPES.scout, inner.width - 20, 300);

    clickShip(doomed);
    advance(0.3);

    assert.equal(inner.state, 'over');
    // The point is that the loop keeps running the animation without throwing.
    advance(3);
    assert.equal(inner.explosions.length, 0, 'explosions should still finish and be cleared');
  });
});

test('the summary reports the run that just ended', () => {
  withGame({ seed: 109 }, ({ inner, quiet, place, clickShip, advance, dom }) => {
    quiet();
    inner.ships.length = 0;
    clickShip(place(SHIP_TYPES.scout, 300, 300));
    clickShip(place(SHIP_TYPES.scout, 500, 500));
    place(SHIP_TYPES.scout, inner.width - 20, 200);
    advance(0.3);

    const body = dom.elements.get('overlay-body')!.innerHTML;
    assert.match(body, /2 ships destroyed/);
    assert.match(body, /New personal best/);
  });
});

test('the summary uses the singular for a lone kill', () => {
  withGame({ seed: 110 }, ({ inner, quiet, place, clickShip, advance, dom }) => {
    quiet();
    inner.ships.length = 0;
    clickShip(place(SHIP_TYPES.scout, 300, 300));
    place(SHIP_TYPES.scout, inner.width - 20, 200);
    advance(0.3);

    assert.match(dom.elements.get('overlay-body')!.innerHTML, /1 ship destroyed/);
  });
});

test('the best score is written out when the run ends', () => {
  withGame({ seed: 111 }, ({ inner, quiet, place, clickShip, advance, dom }) => {
    quiet();
    inner.ships.length = 0;
    clickShip(place(SHIP_TYPES.scout, 300, 300));
    clickShip(place(SHIP_TYPES.scout, 500, 500));
    place(SHIP_TYPES.scout, inner.width - 20, 200);
    advance(0.3);

    assert.equal(dom.storage.getItem(BEST_KEY), '2');
  });
});

test('a best score saved earlier is restored on load', () => {
  withGame({ seed: 112, start: false, storage: { [BEST_KEY]: '17' } }, ({ inner, dom }) => {
    assert.equal(inner.best, 17, 'the previous best should come back');
    assert.equal(dom.elements.get('stat-best')!.textContent, '17');
  });
});

test('a corrupt or missing stored best falls back to zero', () => {
  for (const stored of ['not a number', '-4', '']) {
    withGame({ seed: 113, start: false, storage: { [BEST_KEY]: stored } }, ({ inner }) => {
      assert.equal(inner.best, 0, `"${stored}" should not be trusted as a best score`);
    });
  }
  withGame({ seed: 113, start: false }, ({ inner }) => {
    assert.equal(inner.best, 0);
  });
});

test('a worse run does not overwrite the best', () => {
  withGame({ seed: 113 }, ({ inner, quiet, place, clickShip, advance, dom }) => {
    quiet();
    inner.best = 9;
    inner.ships.length = 0;
    clickShip(place(SHIP_TYPES.scout, 300, 300));
    place(SHIP_TYPES.scout, inner.width - 20, 200);
    advance(0.3);

    assert.equal(inner.best, 9, 'a single kill should not beat a best of nine');
    assert.equal(dom.storage.getItem(BEST_KEY), null, 'and nothing should be written');
    assert.match(dom.elements.get('overlay-body')!.innerHTML, /Best: 9/);
  });
});

test('the game still runs when storage is unavailable', () => {
  const harness = createTestGame({ seed: 114, start: false });
  try {
    harness.dom.storage.sealed = true;
    // Construction already happened; a run that ends must not throw either.
    harness.game.start();
    harness.quiet();
    harness.inner.ships.length = 0;
    harness.clickShip(harness.place(SHIP_TYPES.scout, 300, 300));
    harness.place(SHIP_TYPES.scout, harness.inner.width - 20, 200);
    harness.advance(0.3);

    assert.equal(harness.inner.state, 'over', 'the run should end normally');
    assert.equal(harness.inner.destroyed, 1);
  } finally {
    harness.dispose();
  }
});

test('restarting clears the field and the score but keeps the best', () => {
  withGame({ seed: 115 }, ({ game, inner, quiet, place, clickShip, advance, dom }) => {
    quiet();
    inner.ships.length = 0;
    clickShip(place(SHIP_TYPES.scout, 300, 300));
    place(SHIP_TYPES.scout, inner.width - 20, 200);
    advance(0.3);
    assert.equal(inner.state, 'over');

    game.primaryAction();

    assert.equal(inner.state, 'running');
    assert.equal(inner.destroyed, 0);
    assert.equal(inner.points, 0);
    assert.equal(inner.level, 1);
    assert.equal(inner.elapsed, 0);
    assert.equal(livingShips(inner).length, 0, 'the field should be swept');
    assert.equal(inner.explosions.length, 0);
    assert.equal(inner.best, 1, 'the best from the last run should survive');
    assert.ok(!dom.elements.get('overlay')!.classList.contains('visible'));
  });
});

test('the primary action resumes rather than restarts a paused run', () => {
  withGame({ seed: 116 }, ({ game, inner, quiet, place, press }) => {
    quiet();
    inner.ships.length = 0;
    place(SHIP_TYPES.scout, 400, 400);
    inner.destroyed = 3;

    press('KeyP');
    assert.equal(inner.state, 'paused');

    game.primaryAction();
    assert.equal(inner.state, 'running');
    assert.equal(inner.destroyed, 3, 'resuming should not wipe the score');
  });
});

test('the primary action does nothing mid-run', () => {
  withGame({ seed: 117 }, ({ game, inner, quiet }) => {
    quiet();
    inner.destroyed = 5;
    game.primaryAction();
    assert.equal(inner.destroyed, 5, 'a running game should not restart itself');
    assert.equal(inner.state, 'running');
  });
});

test('the HUD tracks the clock and the best score', () => {
  withGame({ seed: 118 }, ({ inner, quiet, advance, dom }) => {
    quiet();
    inner.best = 12;
    advance(65);

    assert.equal(dom.elements.get('stat-time')!.textContent, '1:05');
    assert.equal(dom.elements.get('stat-best')!.textContent, '12');
    assert.equal(dom.elements.get('stat-level')!.textContent, String(inner.level));
  });
});

test('resizing the window re-measures the field and backing store', () => {
  withGame({ seed: 119, devicePixelRatio: 2 }, ({ inner, dom }) => {
    assert.equal(dom.canvas.width, inner.width * 2, 'backing store follows the pixel ratio');

    dom.canvas.setRect({ left: 0, top: 0, width: 900, height: 500 });
    dom.dispatchWindow('resize');

    assert.equal(inner.width, 900);
    assert.equal(inner.height, 500);
    assert.equal(dom.canvas.width, 1800);
    assert.equal(dom.canvas.height, 1000);
  });
});

test('a shrinking window does not strand ships out of reach', () => {
  withGame({ seed: 120 }, ({ inner, quiet, place, advance, dom }) => {
    quiet();
    inner.ships.length = 0;
    const ship = place(SHIP_TYPES.cruiser, 300, 760);

    dom.canvas.setRect({ left: 0, top: 0, width: 1200, height: 300 });
    dom.dispatchWindow('resize');
    advance(0.1);

    assert.ok(ship.y <= 300, `ship was left at ${ship.y}, below a 300px field`);
  });
});

test('the field never collapses below a playable size', () => {
  withGame({ seed: 121 }, ({ inner, dom }) => {
    dom.canvas.setRect({ left: 0, top: 0, width: 10, height: 10 });
    dom.dispatchWindow('resize');

    assert.ok(inner.width >= 320, `field width collapsed to ${inner.width}`);
    assert.ok(inner.height >= 240, `field height collapsed to ${inner.height}`);
  });
});
