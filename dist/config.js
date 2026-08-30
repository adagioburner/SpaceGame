export const SHIP_TYPES = {
    scout: {
        id: 'scout',
        label: 'Scout',
        radius: 19,
        hull: 1,
        baseSpeed: 92,
        blastRadius: 74,
        blastPower: 1.2,
        hullColor: '#7ee3c7',
        accentColor: '#1d6f5e',
        weight: 10,
        weightGrowth: -0.55,
        unlockLevel: 1,
    },
    fighter: {
        id: 'fighter',
        label: 'Fighter',
        radius: 27,
        hull: 2,
        baseSpeed: 70,
        blastRadius: 104,
        blastPower: 1.8,
        hullColor: '#8fb8ff',
        accentColor: '#28497f',
        weight: 2.5,
        weightGrowth: 0.9,
        unlockLevel: 1,
    },
    cruiser: {
        id: 'cruiser',
        label: 'Cruiser',
        radius: 38,
        hull: 4,
        baseSpeed: 52,
        blastRadius: 150,
        blastPower: 2.8,
        hullColor: '#f0b46b',
        accentColor: '#7a4415',
        weight: 1,
        weightGrowth: 0.85,
        unlockLevel: 3,
    },
    dreadnought: {
        id: 'dreadnought',
        label: 'Dreadnought',
        radius: 52,
        hull: 7,
        baseSpeed: 36,
        blastRadius: 208,
        blastPower: 4.2,
        hullColor: '#ef7d8e',
        accentColor: '#7c1d2f',
        weight: 0.3,
        weightGrowth: 0.5,
        unlockLevel: 6,
    },
};
export const SHIP_TYPE_LIST = Object.values(SHIP_TYPES);
/** Points awarded for a kill; a heavier hull is worth more. */
export function scoreForType(type) {
    return 50 * type.hull + 50;
}
export const TUNING = {
    /** Seconds of survival per difficulty level. */
    secondsPerLevel: 16,
    /** Speed multiplier growth per second of play, and its ceiling. */
    speedGrowthPerSecond: 0.013,
    maxSpeedMultiplier: 2.8,
    /** Seconds between spawns at level 1, the per-level decay, and the floor. */
    baseSpawnInterval: 1.35,
    spawnIntervalDecay: 0.89,
    minSpawnInterval: 0.3,
    /** Random jitter applied to each spawn interval (fraction of the interval). */
    spawnJitter: 0.35,
    /** From this level on, spawns sometimes arrive as a small squadron. */
    squadronFromLevel: 5,
    maxSquadron: 3,
    /** A damaged ship keeps this fraction of its speed at zero remaining hull. */
    minSpeedFactor: 0.42,
    /** Seconds a kill stays "recent" for chain-bonus purposes. */
    chainWindow: 0.85,
};
/**
 * A convoy is a scripted set piece: one heavy ship, then a swarm of light ones
 * released behind it. The swarm is faster, so it closes on the heavy — and the
 * more the player has damaged (and slowed) the heavy, the sooner they meet.
 * Detonating the heavy inside the swarm is the big chain-reaction payoff.
 */
export const CONVOY = {
    /** Threat level at which convoys start showing up. */
    fromLevel: 3,
    /** Seconds between convoys at that level, shortening as levels rise. */
    interval: 26,
    intervalDecay: 0.92,
    minInterval: 15,
    /**
     * How far across the field the anchor would travel, at full speed, before its
     * swarm is released. Bigger = a longer gap for the swarm to close.
     */
    launchFraction: 0.34,
    /** Swarm size at `fromLevel`, its growth per level, and the ceiling. */
    baseSwarmSize: 5,
    swarmGrowth: 0.9,
    maxSwarmSize: 12,
    /** How deep the cloud is front-to-back, in px. */
    depth: 200,
    /** Vertical half-spread of the cloud, as a fraction of the anchor's blast. */
    laneSpread: 0.52,
    /** Minimum gap between cloud members so they stay individually clickable. */
    minSpacing: 54,
    /** Chance a cloud member is a fighter rather than a scout, per level above fromLevel. */
    fighterChancePerLevel: 0.07,
    maxFighterChance: 0.4,
};
/**
 * What the gun crew shouts as a detonation runs through a formation, indexed
 * by how many links deep the kill is. The escalation carries the scale, so the
 * player reads magnitude without the game narrating its own mechanics. The
 * last entry covers everything deeper.
 */
export const CASCADE_CALLOUTS = [
    'SECONDARY',
    'COOKING OFF',
    'BREAKING UP',
    "FLIGHT'S GONE",
    'SECTOR SWEPT',
];
/** The callout for a kill `depth` links into a cascade (depth 1 or more). */
export function calloutForDepth(depth) {
    const index = Math.min(Math.max(depth, 1), CASCADE_CALLOUTS.length) - 1;
    return CASCADE_CALLOUTS[index];
}
//# sourceMappingURL=config.js.map