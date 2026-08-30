export type ShipTypeId = 'scout' | 'fighter' | 'cruiser' | 'dreadnought';

/** Static description of a class of enemy ship. */
export interface ShipType {
  readonly id: ShipTypeId;
  readonly label: string;
  /** Collision and drawing radius, in CSS pixels. */
  readonly radius: number;
  /** Clicks needed to destroy an undamaged ship of this class. */
  readonly hull: number;
  /** Horizontal speed in px/s before the difficulty multiplier is applied. */
  readonly baseSpeed: number;
  /** How far the death explosion reaches, in px. */
  readonly blastRadius: number;
  /** Hull damage dealt at the very centre of the death explosion. */
  readonly blastPower: number;
  readonly hullColor: string;
  readonly accentColor: string;
  /** Spawn weight at level 1, and how much that weight grows per level. */
  readonly weight: number;
  readonly weightGrowth: number;
  /** Level at which this class starts showing up. */
  readonly unlockLevel: number;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
