import type { Rgb } from './types.js';
import { clamp, lerp, randomRange, rgba } from './utils.js';

type ParticleKind = 'spark' | 'smoke' | 'debris';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  growth: number;
  drag: number;
  spin: number;
  angle: number;
  color: Rgb;
  kind: ParticleKind;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

const FIRE_CORE: Rgb = { r: 255, g: 244, b: 214 };
const FIRE_MID: Rgb = { r: 255, g: 168, b: 60 };
const FIRE_EDGE: Rgb = { r: 214, g: 62, b: 34 };
const SMOKE: Rgb = { r: 96, g: 92, b: 104 };

/**
 * An expanding blast. The shockwave grows over time, so a chain reaction
 * visibly propagates outwards instead of detonating everything at once.
 */
export class Explosion {
  readonly x: number;
  readonly y: number;
  readonly maxRadius: number;
  readonly power: number;
  /** How many links deep into a chain reaction this blast is. */
  readonly chainDepth: number;
  /** Ships already damaged by this blast, so each is hit at most once. */
  readonly hitShips = new Set<number>();

  private age = 0;
  private readonly duration: number;

  constructor(x: number, y: number, maxRadius: number, power: number, chainDepth = 0) {
    this.x = x;
    this.y = y;
    this.maxRadius = maxRadius;
    this.power = power;
    this.chainDepth = chainDepth;
    this.duration = 0.42 + maxRadius / 420;
  }

  /** Radius of the damaging shockwave right now. */
  get radius(): number {
    const t = clamp(this.age / (this.duration * 0.62), 0, 1);
    return this.maxRadius * (1 - Math.pow(1 - t, 3));
  }

  get done(): boolean {
    return this.age >= this.duration;
  }

  /** True once the shockwave has swept its whole radius. */
  get finishedExpanding(): boolean {
    return this.age >= this.duration * 0.62;
  }

  update(dt: number): void {
    this.age += dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const t = clamp(this.age / this.duration, 0, 1);
    const fade = 1 - t;
    const r = this.radius;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Fireball: a bright core that swells and cools as it fades.
    const coreRadius = Math.max(2, this.maxRadius * lerp(0.18, 0.62, t) * (0.55 + fade * 0.75));
    const core = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, coreRadius);
    core.addColorStop(0, rgba(FIRE_CORE, fade));
    core.addColorStop(0.28, rgba(FIRE_MID, 0.95 * fade));
    core.addColorStop(0.62, rgba(FIRE_EDGE, 0.6 * fade * fade));
    core.addColorStop(1, rgba(FIRE_EDGE, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(this.x, this.y, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // Muzzle-style flash in the first instants of the blast.
    const flash = Math.max(0, 1 - t * 5);
    if (flash > 0) {
      const flashRadius = this.maxRadius * (0.35 + t * 1.2);
      const glare = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, flashRadius);
      glare.addColorStop(0, rgba(FIRE_CORE, 0.85 * flash));
      glare.addColorStop(0.5, rgba(FIRE_MID, 0.35 * flash));
      glare.addColorStop(1, rgba(FIRE_MID, 0));
      ctx.fillStyle = glare;
      ctx.beginPath();
      ctx.arc(this.x, this.y, flashRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shockwave ring.
    if (r > 2) {
      ctx.strokeStyle = rgba(FIRE_MID, 0.62 * fade * fade);
      ctx.lineWidth = Math.max(1.5, this.maxRadius * 0.055 * fade);
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = rgba(FIRE_CORE, 0.45 * fade * fade);
      ctx.lineWidth = Math.max(1, this.maxRadius * 0.02 * fade);
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 0.86, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class Effects {
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private shake = 0;

  get shakeAmount(): number {
    return this.shake;
  }

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
    this.shake = 0;
  }

  addShake(amount: number): void {
    this.shake = Math.min(18, this.shake + amount);
  }

  spawnSmoke(x: number, y: number, size: number): void {
    const life = randomRange(0.4, 0.8);
    this.particles.push({
      x,
      y,
      vx: randomRange(-26, -8),
      vy: randomRange(-14, 14),
      life,
      maxLife: life,
      size,
      growth: size * 1.1,
      drag: 1.2,
      spin: 0,
      angle: 0,
      color: SMOKE,
      kind: 'smoke',
    });
  }

  /** Fire, sparks and hull debris thrown out by a destroyed ship. */
  spawnBlast(x: number, y: number, scale: number, hullColor: Rgb): void {
    const sparkCount = Math.round(14 + scale * 26);
    for (let i = 0; i < sparkCount; i++) {
      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(60, 340) * (0.6 + scale);
      const life = randomRange(0.25, 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomRange(1.2, 3.2) * (0.7 + scale * 0.6),
        growth: -1,
        drag: 2.2,
        spin: 0,
        angle: 0,
        color: Math.random() < 0.5 ? FIRE_CORE : FIRE_MID,
        kind: 'spark',
      });
    }

    const smokeCount = Math.round(6 + scale * 12);
    for (let i = 0; i < smokeCount; i++) {
      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(10, 70) * (0.6 + scale);
      const life = randomRange(0.7, 1.6);
      this.particles.push({
        x: x + Math.cos(angle) * 4,
        y: y + Math.sin(angle) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomRange(5, 11) * (0.6 + scale),
        growth: randomRange(16, 38),
        drag: 1.4,
        spin: 0,
        angle: 0,
        color: SMOKE,
        kind: 'smoke',
      });
    }

    const debrisCount = Math.round(4 + scale * 10);
    for (let i = 0; i < debrisCount; i++) {
      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(70, 260) * (0.6 + scale);
      const life = randomRange(0.5, 1.1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomRange(2, 5) * (0.7 + scale),
        growth: 0,
        drag: 0.9,
        spin: randomRange(-14, 14),
        angle: randomRange(0, Math.PI * 2),
        color: hullColor,
        kind: 'debris',
      });
    }
  }

  /** Small shower of sparks from a hit that did not destroy the ship. */
  spawnHitSparks(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(50, 180);
      const life = randomRange(0.15, 0.4);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomRange(1, 2.4),
        growth: -1,
        drag: 3,
        spin: 0,
        angle: 0,
        color: FIRE_CORE,
        kind: 'spark',
      });
    }
  }

  spawnText(x: number, y: number, text: string, color: string, size = 16): void {
    this.texts.push({ x, y, vy: -34, life: 0.9, maxLife: 0.9, text, color, size });
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 42);

    let write = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) continue;
      const damping = Math.max(0, 1 - p.drag * dt);
      p.vx *= damping;
      p.vy *= damping;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size = Math.max(0.2, p.size + p.growth * dt);
      p.angle += p.spin * dt;
      this.particles[write++] = p;
    }
    this.particles.length = write;

    write = 0;
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i]!;
      t.life -= dt;
      if (t.life <= 0) continue;
      t.y += t.vy * dt;
      t.vy *= Math.max(0, 1 - 1.6 * dt);
      this.texts[write++] = t;
    }
    this.texts.length = write;
  }

  /** Smoke only — drawn under the explosions so fireballs stay bright. */
  drawSmoke(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.particles) {
      if (p.kind !== 'smoke') continue;
      const t = p.life / p.maxLife;
      ctx.fillStyle = rgba(p.color, 0.22 * t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Sparks, debris and floating text — drawn over everything else. */
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.kind === 'smoke') continue;
      const t = p.life / p.maxLife;
      if (p.kind === 'spark') {
        ctx.fillStyle = rgba(p.color, Math.min(1, t * 1.4));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = rgba(p.color, Math.min(1, 1.1 * t));
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const life = t.life / t.maxLife;
      ctx.globalAlpha = Math.min(1, life * 1.6);
      ctx.font = `700 ${t.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
