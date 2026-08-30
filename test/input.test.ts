import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_TYPES, scoreForType } from '../src/config.js';
import { livingShips, withGame } from './harness/game.js';

test('clicking a scout destroys it and scores the kill', () => {
  withGame({ seed: 41 }, ({ inner, quiet, place, clickShip }) => {
    quiet();
    inner.ships.length = 0;
    const scout = place(SHIP_TYPES.scout, 400, 400);

    clickShip(scout);

    assert.equal(scout.alive, false, 'one click should finish a scout');
    assert.equal(inner.destroyed, 1);
    assert.equal(inner.points, scoreForType(SHIP_TYPES.scout));
  });
});

test('a cruiser takes four clicks, weakening with each one', () => {
  withGame({ seed: 42 }, ({ inner, quiet, place, clickShip }) => {
    quiet();
    inner.ships.length = 0;
    const cruiser = place(SHIP_TYPES.cruiser, 400, 400);
    const fullSpeed = cruiser.speed;

    clickShip(cruiser);
    assert.equal(cruiser.alive, true, 'one click should not be enough');
    assert.equal(cruiser.hull, SHIP_TYPES.cruiser.hull - 1);
    assert.ok(cruiser.speed < fullSpeed, 'a hit ship should slow down');
    assert.equal(inner.destroyed, 0, 'no kill has been scored yet');

    clickShip(cruiser);
    clickShip(cruiser);
    assert.equal(cruiser.alive, true);
    clickShip(cruiser);

    assert.equal(cruiser.alive, false, 'the fourth click should destroy it');
    assert.equal(inner.destroyed, 1);
    assert.equal(inner.points, scoreForType(SHIP_TYPES.cruiser));
  });
});

test('clicking empty space costs nothing', () => {
  withGame({ seed: 43 }, ({ inner, quiet, place, clickAt }) => {
    quiet();
    inner.ships.length = 0;
    const scout = place(SHIP_TYPES.scout, 400, 400);

    clickAt(400, 700);
    clickAt(900, 200);

    assert.equal(scout.alive, true);
    assert.equal(inner.destroyed, 0);
    assert.equal(inner.points, 0);
  });
});

test('a click just outside the hull misses', () => {
  withGame({ seed: 44 }, ({ inner, quiet, place, clickAt }) => {
    quiet();
    inner.ships.length = 0;
    const scout = place(SHIP_TYPES.scout, 400, 400);

    clickAt(400 + scout.radius * 2, 400);
    assert.equal(scout.alive, true, 'the shot should have missed');

    clickAt(400, 400);
    assert.equal(scout.alive, false, 'a centred shot should connect');
  });
});

test('overlapping ships hand the hit to the one actually clicked', () => {
  withGame({ seed: 45 }, ({ inner, quiet, place, clickAt }) => {
    quiet();
    inner.ships.length = 0;
    const dreadnought = place(SHIP_TYPES.dreadnought, 400, 400);
    const scout = place(SHIP_TYPES.scout, 430, 400);

    clickAt(scout.x, scout.y);

    assert.equal(scout.alive, false, 'the ship under the cursor should take the hit');
    assert.equal(
      dreadnought.hull,
      SHIP_TYPES.dreadnought.hull,
      'the ship behind should be untouched',
    );
  });
});

test('a kill removes the wreck from the field', () => {
  withGame({ seed: 46 }, ({ inner, quiet, place, clickShip, advance }) => {
    quiet();
    inner.ships.length = 0;
    const scout = place(SHIP_TYPES.scout, 400, 400);
    clickShip(scout);
    advance(0.2);

    assert.equal(livingShips(inner).length, 0);
    assert.ok(!inner.ships.includes(scout), 'destroyed ships should be cleared out');
  });
});

test('the score readout tracks kills', () => {
  withGame({ seed: 47 }, ({ inner, quiet, place, clickShip, advance, dom }) => {
    quiet();
    inner.ships.length = 0;
    clickShip(place(SHIP_TYPES.scout, 300, 300));
    clickShip(place(SHIP_TYPES.scout, 500, 500));
    advance(0.1);

    assert.equal(dom.elements.get('stat-destroyed')!.textContent, '2');
    assert.equal(inner.destroyed, 2);
  });
});

test('firing does nothing before the run starts', () => {
  withGame({ seed: 48, start: false }, ({ inner, quiet, place, clickShip }) => {
    quiet();
    const scout = place(SHIP_TYPES.scout, 400, 400);

    assert.equal(inner.state, 'ready');
    clickShip(scout);
    assert.equal(scout.alive, true, 'the guns are cold until the run starts');
    assert.equal(inner.destroyed, 0);
  });
});

test('firing does nothing once the sector has fallen', () => {
  withGame({ seed: 49 }, ({ inner, quiet, place, clickShip, advance }) => {
    quiet();
    inner.ships.length = 0;
    place(SHIP_TYPES.scout, inner.width - 12, 400);
    advance(0.2);
    assert.equal(inner.state, 'over');

    const straggler = place(SHIP_TYPES.scout, 300, 300);
    const scored = inner.destroyed;
    clickShip(straggler);

    assert.equal(straggler.alive, true);
    assert.equal(inner.destroyed, scored, 'no scoring after the run ends');
  });
});

test('a click resumes a paused run instead of firing', () => {
  withGame({ seed: 50 }, ({ inner, quiet, place, clickShip }) => {
    quiet();
    inner.ships.length = 0;
    const scout = place(SHIP_TYPES.scout, 400, 400);

    inner.state = 'paused';
    clickShip(scout);

    assert.equal(inner.state, 'running', 'the click should unpause');
    assert.equal(scout.alive, true, 'and should not also fire');
  });
});

test('space starts the run and P toggles the pause', () => {
  withGame({ seed: 51, start: false }, ({ inner, press, quiet }) => {
    quiet();
    assert.equal(inner.state, 'ready');

    press('Space');
    assert.equal(inner.state, 'running');

    press('KeyP');
    assert.equal(inner.state, 'paused');

    press('KeyP');
    assert.equal(inner.state, 'running');

    press('Escape');
    assert.equal(inner.state, 'paused', 'escape should pause too');
  });
});

test('a paused field is frozen', () => {
  withGame({ seed: 52 }, ({ inner, quiet, place, press, advance }) => {
    quiet();
    inner.ships.length = 0;
    const scout = place(SHIP_TYPES.scout, 400, 400);

    press('KeyP');
    const parked = scout.x;
    advance(1);

    assert.equal(inner.state, 'paused');
    assert.equal(scout.x, parked, 'ships should not advance while paused');
  });
});

test('losing window focus pauses the run', () => {
  withGame({ seed: 53 }, ({ inner, dom }) => {
    assert.equal(inner.state, 'running');
    dom.dispatchWindow('blur');
    assert.equal(inner.state, 'paused');
  });
});

test('clicks land on the ship under the cursor after the canvas is offset', () => {
  withGame({ seed: 54 }, ({ inner, quiet, place, dom }) => {
    quiet();
    inner.ships.length = 0;
    // The canvas is not always at the top-left of the page.
    dom.canvas.setRect({ left: 40, top: 90, width: inner.width, height: inner.height });
    const scout = place(SHIP_TYPES.scout, 400, 400);

    dom.canvas.dispatch('pointerdown', { clientX: 400 + 40, clientY: 400 + 90 });

    assert.equal(scout.alive, false, 'the click should be mapped into canvas space');
  });
});
