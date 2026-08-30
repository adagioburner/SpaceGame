import { CONVOY, SHIP_TYPES } from './config.js';
import { clamp, randomRange } from './utils.js';
/** Heavies worth building a convoy around, cheapest first. */
const ANCHOR_TYPES = [SHIP_TYPES.cruiser, SHIP_TYPES.dreadnought];
function pickAnchorType(level) {
    const unlocked = ANCHOR_TYPES.filter((type) => level >= type.unlockLevel);
    if (unlocked.length === 0)
        return SHIP_TYPES.cruiser;
    // Once dreadnoughts are available they anchor roughly half the convoys.
    const heaviest = unlocked[unlocked.length - 1];
    return unlocked.length > 1 && Math.random() < 0.5 ? heaviest : unlocked[0];
}
function swarmSize(level) {
    const grown = CONVOY.baseSwarmSize + (level - CONVOY.fromLevel) * CONVOY.swarmGrowth;
    return Math.round(clamp(grown, CONVOY.baseSwarmSize, CONVOY.maxSwarmSize));
}
function pickMemberType(level) {
    const chance = Math.min(CONVOY.maxFighterChance, (level - CONVOY.fromLevel) * CONVOY.fighterChancePerLevel);
    return Math.random() < chance ? SHIP_TYPES.fighter : SHIP_TYPES.scout;
}
/**
 * Lays out a convoy: an anchor lane plus a loose cloud behind it. Members are
 * kept `minSpacing` apart so they stay clickable, and within the anchor's blast
 * reach so a well-timed detonation can take the whole cloud.
 */
export function planConvoy(level, fieldHeight) {
    const anchorType = pickAnchorType(level);
    const spread = anchorType.blastRadius * CONVOY.laneSpread;
    // Keep the whole cloud on screen: the lane needs `spread` of room either side.
    const margin = Math.min(anchorType.radius + 12 + spread, fieldHeight / 2);
    const anchorY = clamp(randomRange(margin, fieldHeight - margin), margin, Math.max(margin, fieldHeight - margin));
    const count = swarmSize(level);
    const members = [];
    for (let i = 0; i < count; i++) {
        const type = pickMemberType(level);
        let best = null;
        let bestGap = -Infinity;
        // Rejection sampling: keep the candidate that sits furthest from its
        // neighbours, so the cloud spreads out instead of stacking up.
        for (let attempt = 0; attempt < 12; attempt++) {
            const dx = randomRange(-CONVOY.depth, 0);
            const dy = clamp(randomRange(-spread, spread), margin - anchorY, fieldHeight - margin - anchorY);
            let gap = Infinity;
            for (const placed of members) {
                gap = Math.min(gap, Math.hypot(placed.dx - dx, placed.dy - dy));
            }
            if (gap > bestGap) {
                bestGap = gap;
                best = { dx, dy };
            }
            if (gap >= CONVOY.minSpacing)
                break;
        }
        if (best)
            members.push({ type, dx: best.dx, dy: best.dy });
    }
    return { anchorType, anchorY, members };
}
/**
 * Seconds between the anchor spawning and its swarm being released, derived
 * from the distance the anchor would cover at full speed. Damaging the anchor
 * slows it, so it is still near the left when the swarm arrives — which is
 * exactly what makes the chain reaction easy to set up.
 */
export function convoyLaunchDelay(anchorType, fieldWidth, speedMultiplier) {
    const distance = fieldWidth * CONVOY.launchFraction;
    return distance / (anchorType.baseSpeed * speedMultiplier);
}
/** Seconds until the next convoy attempt at this level. */
export function convoyInterval(level) {
    const scaled = CONVOY.interval * Math.pow(CONVOY.intervalDecay, level - CONVOY.fromLevel);
    return Math.max(CONVOY.minInterval, scaled) * randomRange(0.85, 1.15);
}
//# sourceMappingURL=convoy.js.map