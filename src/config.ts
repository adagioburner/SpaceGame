import type { ShipType, ShipTypeId } from './types.js';

export const SHIP_TYPES: Record<ShipTypeId, ShipType> = {
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

export const SHIP_TYPE_LIST: readonly ShipType[] = Object.values(SHIP_TYPES);

/** Points awarded for a kill; a heavier hull is worth more. */
export function scoreForType(type: ShipType): number {
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
} as const;
