import { TUNING } from './config.js';
import type { Effects } from './effects.js';
import type { Rgb, ShipType } from './types.js';
import { clamp, hexToRgb, lerp, mixColors, randomRange, rgba } from './utils.js';

interface Scorch {
  x: number;
  y: number;
  r: number;
  rot: number;
}

const CHAR: Rgb = { r: 26, g: 22, b: 26 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

let nextShipId = 1;

export class Ship {
  readonly id = nextShipId++;
  readonly type: ShipType;
  readonly maxHull: number;

  x: number;
  y: number;
  hull: number;
  alive = true;
  /** Set on the heavy ship a convoy is built around; draws the blast marker. */
  isConvoyAnchor = false;

  private baseY: number;
  private readonly driftAmplitude: number;
  private readonly driftSpeed: number;
  private readonly driftPhase: number;
  private readonly hullRgb: Rgb;
  private readonly accentRgb: Rgb;
  private readonly scorches: Scorch[] = [];

  /** 1 right after a hit, decaying to 0 — drives the white impact flash. */
  private hitFlash = 0;
  private smokeTimer = 0;
  private age = 0;

  constructor(type: ShipType, x: number, y: number, fieldHeight: number) {
    this.type = type;
    this.maxHull = type.hull;
    this.hull = type.hull;
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.driftAmplitude = Math.min(
      randomRange(4, 16),
      Math.max(0, (fieldHeight - 2 * type.radius) / 2 - 4),
    );
    this.driftSpeed = randomRange(0.4, 1.1);
    this.driftPhase = randomRange(0, Math.PI * 2);
    this.hullRgb = hexToRgb(type.hullColor);
    this.accentRgb = hexToRgb(type.accentColor);
  }

  get radius(): number {
    return this.type.radius;
  }

  /** 1 when pristine, 0 when one hit away from destruction. */
  get integrity(): number {
    return this.maxHull <= 1 ? 1 : (this.hull - 1) / (this.maxHull - 1);
  }

  /** Damaged ships limp: speed falls off with lost hull. */
  get speed(): number {
    const factor = lerp(TUNING.minSpeedFactor, 1, this.integrity);
    return this.type.baseSpeed * factor;
  }

  /** Leading edge of the ship — what the right-hand border is tested against. */
  get noseX(): number {
    return this.x + this.radius * 0.95;
  }

  update(dt: number, speedMultiplier: number, effects: Effects): void {
    this.age += dt;
    this.x += this.speed * speedMultiplier * dt;
    this.y = this.baseY + Math.sin(this.driftPhase + this.age * this.driftSpeed) * this.driftAmplitude;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);

    if (this.hull < this.maxHull) {
      const severity = 1 - this.integrity;
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = lerp(0.16, 0.06, severity);
        effects.spawnSmoke(
          this.x - this.radius * 0.35 + randomRange(-4, 4),
          this.y + randomRange(-this.radius * 0.3, this.radius * 0.3),
          this.radius * lerp(0.12, 0.24, severity),
        );
      }
    }
  }

  /** Keeps the ship inside the play field after the window is resized. */
  clampToField(fieldHeight: number): void {
    const margin = Math.min(this.radius + 6, fieldHeight / 2);
    this.baseY = clamp(this.baseY, margin, Math.max(margin, fieldHeight - margin));
  }

  containsPoint(px: number, py: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    // Ships are wider than they are tall, so the hit area matches that shape.
    const rx = this.radius * 1.05;
    const ry = this.radius * 0.8;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  /**
   * Applies hull damage. Returns true when this hit destroys the ship.
   */
  applyDamage(amount: number): boolean {
    if (!this.alive || amount <= 0) return false;
    const applied = Math.min(this.hull, Math.max(1, Math.round(amount)));
    for (let i = 0; i < applied; i++) this.addScorch();
    this.hull -= applied;
    this.hitFlash = 1;
    if (this.hull <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  private addScorch(): void {
    const angle = randomRange(0, Math.PI * 2);
    const dist = randomRange(0, 0.55);
    this.scorches.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * 0.6,
      r: randomRange(0.16, 0.3),
      rot: randomRange(0, Math.PI * 2),
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const s = this.radius;
    const severity = 1 - this.integrity;

    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.isConvoyAnchor) this.drawAnchorMarker(ctx, s);
    this.drawThrust(ctx, s, severity);

    // Everything below is drawn in unit space and scaled up to the hull size.
    ctx.save();
    ctx.scale(s, s);

    this.tracePath(ctx);
    const body = mixColors(this.hullRgb, CHAR, severity * 0.55);
    const gradient = ctx.createLinearGradient(0, -1, 0, 1);
    gradient.addColorStop(0, rgba(mixColors(body, WHITE, 0.35), 1));
    gradient.addColorStop(0.5, rgba(body, 1));
    gradient.addColorStop(1, rgba(mixColors(body, CHAR, 0.5), 1));
    ctx.fillStyle = gradient;
    // Shadow blur is in device pixels, so it is unaffected by the unit scaling.
    ctx.shadowColor = rgba(this.hullRgb, 0.55 * (1 - severity * 0.6));
    ctx.shadowBlur = s * 0.55;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = 0.05;
    ctx.strokeStyle = rgba(mixColors(this.hullRgb, WHITE, 0.5), 0.85);
    ctx.stroke();

    // Details and damage live inside the hull silhouette.
    ctx.save();
    this.tracePath(ctx);
    ctx.clip();
    this.drawDetails(ctx);
    this.drawDamage(ctx, severity);
    ctx.restore();

    if (this.hitFlash > 0) {
      ctx.save();
      this.tracePath(ctx);
      ctx.clip();
      ctx.fillStyle = rgba(WHITE, this.hitFlash * 0.75);
      ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
      ctx.restore();
    }

    ctx.restore();

    if (this.maxHull > 1) this.drawHullBar(ctx, s);
    ctx.restore();
  }

  /**
   * Convoy anchors are the player's bomb, so they advertise themselves: a
   * dashed ring on the hull, and a faint circle showing how far the death
   * blast reaches. Both brighten as the hull burns down — a ship one hit from
   * death is "primed" and pulses.
   */
  private drawAnchorMarker(ctx: CanvasRenderingContext2D, s: number): void {
    const charge = 1 - this.integrity;
    const primed = this.hull === 1;
    const pulse = 0.5 + Math.sin(this.age * (primed ? 7 : 2.2)) * 0.5;

    ctx.save();

    // Blast reach.
    const reachAlpha = 0.05 + charge * 0.12 + (primed ? pulse * 0.13 : 0);
    ctx.strokeStyle = `rgba(255, 176, 90, ${reachAlpha.toFixed(3)})`;
    ctx.lineWidth = primed ? 2 : 1.25;
    ctx.setLineDash([10, 13]);
    ctx.lineDashOffset = -this.age * 20;
    ctx.beginPath();
    ctx.arc(0, 0, this.type.blastRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Target ring hugging the hull.
    ctx.strokeStyle = `rgba(255, 212, 136, ${(0.45 + charge * 0.45).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = this.age * 26;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.35, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private drawThrust(ctx: CanvasRenderingContext2D, s: number, severity: number): void {
    const flicker = 0.75 + Math.sin(this.age * 26 + this.driftPhase) * 0.25;
    const length = s * lerp(1.05, 0.5, severity) * flicker;
    const height = s * 0.3;
    const gradient = ctx.createLinearGradient(-s, 0, -s - length, 0);
    gradient.addColorStop(0, rgba(mixColors(this.hullRgb, WHITE, 0.55), 0.85));
    gradient.addColorStop(0.4, rgba(this.hullRgb, 0.4));
    gradient.addColorStop(1, rgba(this.hullRgb, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-s * 0.85, -height);
    ctx.lineTo(-s - length, 0);
    ctx.lineTo(-s * 0.85, height);
    ctx.closePath();
    ctx.fill();
  }

  /** Hull outline in unit space: nose at +1, engines at -1. */
  private tracePath(ctx: CanvasRenderingContext2D): void {
    const points = HULL_SHAPES[this.type.id];
    ctx.beginPath();
    ctx.moveTo(points[0]![0], points[0]![1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
    ctx.closePath();
  }

  private drawDetails(ctx: CanvasRenderingContext2D): void {
    // Cockpit.
    const canopy = ctx.createRadialGradient(0.3, -0.04, 0.02, 0.34, 0, 0.22);
    canopy.addColorStop(0, 'rgba(236, 250, 255, 0.98)');
    canopy.addColorStop(0.55, rgba(mixColors(this.accentRgb, WHITE, 0.45), 0.95));
    canopy.addColorStop(1, rgba(this.accentRgb, 0.95));
    ctx.beginPath();
    ctx.ellipse(0.34, 0, 0.2, 0.13, 0, 0, Math.PI * 2);
    ctx.fillStyle = canopy;
    ctx.fill();

    // Plating seams.
    ctx.strokeStyle = rgba(this.accentRgb, 0.55);
    ctx.lineWidth = 0.045;
    for (const x of [-0.1, -0.45]) {
      ctx.beginPath();
      ctx.moveTo(x, -1);
      ctx.lineTo(x - 0.12, 1);
      ctx.stroke();
    }
  }

  private drawDamage(ctx: CanvasRenderingContext2D, severity: number): void {
    if (this.scorches.length === 0) return;
    for (const scorch of this.scorches) {
      ctx.save();
      ctx.translate(scorch.x, scorch.y);
      ctx.rotate(scorch.rot);

      // Charred blast mark.
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, scorch.r * 1.7);
      halo.addColorStop(0, rgba(CHAR, 0.95));
      halo.addColorStop(0.6, rgba(CHAR, 0.55));
      halo.addColorStop(1, rgba(CHAR, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, scorch.r * 1.7, 0, Math.PI * 2);
      ctx.fill();

      // Torn hole with glowing edge.
      ctx.beginPath();
      const spikes = 7;
      for (let i = 0; i <= spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const rr = scorch.r * (i % 2 === 0 ? 0.85 : 0.55);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(12, 8, 12, 0.95)';
      ctx.fill();
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = `rgba(255, ${Math.round(lerp(160, 90, severity))}, 60, ${0.55 + severity * 0.4})`;
      ctx.stroke();

      // Cracks radiating from the hole.
      ctx.lineWidth = 0.022;
      ctx.strokeStyle = rgba(CHAR, 0.8);
      for (let i = 0; i < 3; i++) {
        const a = scorch.rot + (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * scorch.r * 0.7, Math.sin(a) * scorch.r * 0.7);
        ctx.lineTo(Math.cos(a) * scorch.r * 2.1, Math.sin(a) * scorch.r * 2.1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Segmented hull pips above multi-hit ships so the state is readable. */
  private drawHullBar(ctx: CanvasRenderingContext2D, s: number): void {
    const width = s * 1.5;
    const segment = width / this.maxHull;
    const y = -s * 0.95 - 7;
    const height = 3.5;
    for (let i = 0; i < this.maxHull; i++) {
      const x = -width / 2 + i * segment;
      const filled = i < this.hull;
      ctx.fillStyle = filled
        ? rgba(mixColors(this.hullRgb, WHITE, 0.2), 0.95)
        : 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(x + 1, y, Math.max(1, segment - 2), height);
    }
  }
}

type Point = readonly [number, number];

const HULL_SHAPES: Record<string, readonly Point[]> = {
  scout: [
    [1, 0],
    [0.3, 0.14],
    [-0.15, 0.18],
    [-0.5, 0.66],
    [-0.72, 0.62],
    [-0.62, 0.2],
    [-0.95, 0.15],
    [-0.95, -0.15],
    [-0.62, -0.2],
    [-0.72, -0.62],
    [-0.5, -0.66],
    [-0.15, -0.18],
    [0.3, -0.14],
  ],
  fighter: [
    [1, 0],
    [0.2, 0.3],
    [-0.28, 0.3],
    [-0.42, 0.82],
    [-0.78, 0.78],
    [-0.66, 0.26],
    [-1, 0.2],
    [-1, -0.2],
    [-0.66, -0.26],
    [-0.78, -0.78],
    [-0.42, -0.82],
    [-0.28, -0.3],
    [0.2, -0.3],
  ],
  cruiser: [
    [1, 0],
    [0.62, 0.2],
    [0.05, 0.28],
    [-0.06, 0.6],
    [-0.44, 0.62],
    [-0.5, 0.3],
    [-0.82, 0.34],
    [-0.9, 0.62],
    [-1, 0.6],
    [-1, -0.6],
    [-0.9, -0.62],
    [-0.82, -0.34],
    [-0.5, -0.3],
    [-0.44, -0.62],
    [-0.06, -0.6],
    [0.05, -0.28],
    [0.62, -0.2],
  ],
  dreadnought: [
    [1, 0],
    [0.78, 0.18],
    [0.4, 0.26],
    [0.32, 0.52],
    [0.02, 0.55],
    [-0.06, 0.3],
    [-0.34, 0.32],
    [-0.42, 0.72],
    [-0.72, 0.74],
    [-0.78, 0.34],
    [-1, 0.38],
    [-1, -0.38],
    [-0.78, -0.34],
    [-0.72, -0.74],
    [-0.42, -0.72],
    [-0.34, -0.32],
    [-0.06, -0.3],
    [0.02, -0.55],
    [0.32, -0.52],
    [0.4, -0.26],
    [0.78, -0.18],
  ],
};

export function shipSpawnY(fieldHeight: number, radius: number): number {
  const margin = radius + 12;
  return clamp(randomRange(margin, fieldHeight - margin), margin, Math.max(margin, fieldHeight - margin));
}
