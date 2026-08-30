import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASCADE_CALLOUTS, SHIP_TYPES, calloutForDepth } from '../src/config.js';
import { withGame } from './harness/game.js';

/**
 * The game talks to the player in the voice of the crew fighting the action.
 * Naming its own mechanics — chains, multipliers, hit points — breaks that, so
 * these guard the copy as deliberately as the mechanics are guarded elsewhere.
 */

/** Words that describe the machinery rather than the fiction. */
const MECHANIC_SPEAK = /\b(chain|combo|multiplier|hit ?points|hp|aoe|spawn)\b/i;

test('deeper links in a cascade escalate through the callouts', () => {
  const ladder = [1, 2, 3, 4, 5].map(calloutForDepth);
  assert.deepEqual(ladder, [...CASCADE_CALLOUTS]);
  assert.equal(new Set(ladder).size, ladder.length, 'each step should sound different');
});

test('a very deep cascade keeps the last callout rather than running out', () => {
  const last = CASCADE_CALLOUTS[CASCADE_CALLOUTS.length - 1];
  assert.equal(calloutForDepth(CASCADE_CALLOUTS.length + 1), last);
  assert.equal(calloutForDepth(99), last);
});

test('callouts are short enough to read over a burning ship', () => {
  for (const callout of CASCADE_CALLOUTS) {
    assert.ok(callout.length <= 16, `"${callout}" is too long to float over a ship`);
    assert.equal(callout, callout.toUpperCase(), `"${callout}" should be shouted`);
  }
});

test('no callout describes the mechanic it is reporting', () => {
  for (const callout of CASCADE_CALLOUTS) {
    assert.doesNotMatch(callout, MECHANIC_SPEAK, `"${callout}" breaks character`);
  }
});

test('a cascade shouts a callout and never narrates the mechanic', () => {
  withGame({ seed: 141 }, (harness) => {
    const { inner, place, advance, dom } = harness;
    harness.quiet();
    inner.ships.length = 0;

    const formation = [250, 300, 350, 400].map((y) => place(SHIP_TYPES.scout, 400, y));
    dom.context.reset();
    while (formation[1]!.alive) harness.clickShip(formation[1]!);
    advance(2);

    const drawn = dom.context.texts;
    assert.ok(
      drawn.some((text) => text.startsWith(CASCADE_CALLOUTS[0]!)),
      `expected a callout among the drawn text, got: ${drawn.join(' | ')}`,
    );
    for (const text of drawn) {
      assert.doesNotMatch(text, MECHANIC_SPEAK, `the game drew "${text}"`);
    }
  });
});

test('a callout at the field edge stays on screen', () => {
  withGame({ seed: 142 }, (harness) => {
    const { inner, place, advance, dom } = harness;
    harness.quiet();
    inner.ships.length = 0;

    // A pair right against the left edge, so the label wants to overflow.
    const pair = [300, 350].map((y) => place(SHIP_TYPES.scout, 10, y));
    dom.context.reset();
    while (pair[0]!.alive) harness.clickShip(pair[0]!);
    advance(2);

    assert.ok(
      dom.context.texts.some((text) => text.startsWith(CASCADE_CALLOUTS[0]!)),
      'the cascade should still have been called out',
    );
  });
});

test('the briefing and the summary stay in character', () => {
  withGame({ seed: 143, start: false }, (harness) => {
    const { inner, dom, place, advance } = harness;
    const briefing = dom.elements.get('overlay-body')!.innerHTML;
    assert.doesNotMatch(briefing, MECHANIC_SPEAK, 'the briefing breaks character');

    harness.game.start();
    harness.quiet();
    inner.ships.length = 0;
    place(SHIP_TYPES.scout, inner.width - 20, 300);
    advance(0.3);

    assert.equal(inner.state, 'over');
    const summary = dom.elements.get('overlay-body')!.innerHTML;
    assert.doesNotMatch(summary, MECHANIC_SPEAK, 'the summary breaks character');
  });
});

test('the page around the field stays in character too', () => {
  // Compiled to build-test/test/, so the repo root is two levels up.
  const markup = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const visible = markup
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visible, MECHANIC_SPEAK, 'the page copy breaks character');
});
