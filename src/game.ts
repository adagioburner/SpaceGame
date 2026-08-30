import { CONVOY, SHIP_TYPE_LIST, TUNING, scoreForType } from './config.js';
import { convoyInterval, convoyLaunchDelay, planConvoy } from './convoy.js';
import type { ConvoyMember } from './convoy.js';
import { Effects, Explosion } from './effects.js';
import type { Hud } from './hud.js';
import { Ship, shipSpawnY } from './ship.js';
import { Starfield } from './starfield.js';
import type { ShipType } from './types.js';
import { clamp, hexToRgb, randomInt, randomRange, weightedIndex } from './utils.js';

type State = 'ready' | 'running' | 'paused' | 'over';

const BEST_STORAGE_KEY = 'space-combat.best-destroyed';
/** Distance of the defence line from the right-hand edge, in px. */
const DEFENCE_LINE_INSET = 10;

interface Reticle {
  x: number;
  y: number;
  age: number;
  hit: boolean;
}

/** A convoy whose anchor is already flying but whose swarm is still holding. */
interface PendingConvoy {
  readonly anchorY: number;
  readonly members: readonly ConvoyMember[];
  /** Elapsed time at which the swarm is released. */
  readonly launchAt: number;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hud: Hud;
  private readonly effects = new Effects();
  private readonly starfield = new Starfield();

  private ships: Ship[] = [];
  private explosions: Explosion[] = [];
  private reticles: Reticle[] = [];

  private state: State = 'ready';
  private width = 0;
  private height = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private level = 1;
  private destroyed = 0;
  private points = 0;
  private best = 0;
  private breachFlash = 0;
  private convoyTimer = 0;
  private pendingConvoy: PendingConvoy | null = null;

  constructor(canvas: HTMLCanvasElement, hud: Hud) {
    this.canvas = canvas;
    this.hud = hud;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser does not support 2D canvas rendering.');
    this.ctx = context;
    this.best = this.loadBest();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('blur', () => {
      if (this.state === 'running') this.setPaused(true);
    });

    this.hud.showStart();
    this.pushHud();
    this.lastFrame = performance.now();
    requestAnimationFrame((time) => this.frame(time));
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    this.ships = [];
    this.explosions = [];
    this.reticles = [];
    this.effects.clear();
    this.elapsed = 0;
    this.level = 1;
    this.destroyed = 0;
    this.points = 0;
    this.breachFlash = 0;
    this.spawnTimer = 0.6;
    this.pendingConvoy = null;
    // First convoy lands shortly after convoys unlock.
    this.convoyTimer = TUNING.secondsPerLevel * (CONVOY.fromLevel - 1) + 6;
    this.state = 'running';
    this.hud.hideOverlay();
    this.pushHud();
  }

  /** Called by the overlay button and by the keyboard shortcut. */
  primaryAction(): void {
    if (this.state === 'running') return;
    if (this.state === 'paused') {
      this.setPaused(false);
      return;
    }
    this.start();
  }

  setPaused(paused: boolean): void {
    if (paused && this.state === 'running') {
      this.state = 'paused';
    } else if (!paused && this.state === 'paused') {
      this.state = 'running';
      this.lastFrame = performance.now();
    }
  }

  private gameOver(breachY: number): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.breachFlash = 1;
    this.effects.addShake(16);
    this.effects.spawnBlast(this.width - DEFENCE_LINE_INSET, breachY, 1.4, { r: 255, g: 90, b: 90 });

    const isNewBest = this.destroyed > this.best;
    if (isNewBest) {
      this.best = this.destroyed;
      this.saveBest(this.best);
    }
    this.pushHud();
    this.hud.showGameOver({
      destroyed: this.destroyed,
      points: this.points,
      level: this.level,
      elapsed: this.elapsed,
      best: this.best,
      isNewBest,
    });
    this.hud.focusButton();
  }

  // -------------------------------------------------------------------- input

  private onPointerDown(event: PointerEvent): void {
    if (this.state === 'ready' || this.state === 'over') return;
    if (this.state === 'paused') {
      this.setPaused(false);
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const target = this.pickTarget(x, y);
    this.reticles.push({ x, y, age: 0, hit: target !== null });
    if (!target) return;

    const destroyed = target.applyDamage(1);
    if (destroyed) {
      this.destroyShip(target, 0);
    } else {
      this.effects.spawnHitSparks(x, y);
      this.effects.addShake(1.5);
    }
  }

  /** Nearest ship under the cursor; small ships win ties over big ones. */
  private pickTarget(x: number, y: number): Ship | null {
    let best: Ship | null = null;
    let bestScore = Infinity;
    for (const ship of this.ships) {
      if (!ship.alive || !ship.containsPoint(x, y)) continue;
      const dx = x - ship.x;
      const dy = y - ship.y;
      const score = Math.hypot(dx, dy) / ship.radius;
      if (score < bestScore) {
        bestScore = score;
        best = ship;
      }
    }
    return best;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Space' || event.code === 'Enter') {
      if (this.state !== 'running') {
        event.preventDefault();
        this.primaryAction();
      }
      return;
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      event.preventDefault();
      this.setPaused(this.state === 'running');
    }
  }

  // ------------------------------------------------------------------ spawning

  private get speedMultiplier(): number {
    return Math.min(
      TUNING.maxSpeedMultiplier,
      1 + this.elapsed * TUNING.speedGrowthPerSecond,
    );
  }

  private nextSpawnInterval(): number {
    const base = TUNING.baseSpawnInterval * Math.pow(TUNING.spawnIntervalDecay, this.level - 1);
    const interval = Math.max(TUNING.minSpawnInterval, base);
    const jitter = 1 + randomRange(-TUNING.spawnJitter, TUNING.spawnJitter);
    return interval * jitter;
  }

  private pickShipType(): ShipType {
    const weights = SHIP_TYPE_LIST.map((type) => {
      if (this.level < type.unlockLevel) return 0;
      return Math.max(0.05, type.weight + type.weightGrowth * (this.level - type.unlockLevel));
    });
    return SHIP_TYPE_LIST[weightedIndex(weights)]!;
  }

  private spawnWave(): void {
    const squadron =
      this.level >= TUNING.squadronFromLevel && Math.random() < 0.3
        ? randomInt(2, TUNING.maxSquadron)
        : 1;
    for (let i = 0; i < squadron; i++) {
      this.spawnShip(-i * randomRange(30, 70));
    }
  }

  private spawnShip(offsetX: number): void {
    const type = this.pickShipType();
    // Try a few lanes so freshly spawned ships do not overlap each other.
    let y = shipSpawnY(this.height, type.radius);
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = shipSpawnY(this.height, type.radius);
      const clear = this.ships.every((other) => {
        if (other.x > type.radius * 4) return true;
        return Math.abs(other.y - candidate) > other.radius + type.radius + 6;
      });
      if (clear) {
        y = candidate;
        break;
      }
      y = candidate;
    }
    const x = -type.radius - 6 + offsetX;
    this.ships.push(new Ship(type, x, y, this.height));
  }

  // ------------------------------------------------------------------- convoy

  private updateConvoy(dt: number): void {
    if (this.pendingConvoy) {
      // The swarm flies whether or not the anchor survived: killing the heavy
      // early costs the player their bomb, it does not call off the attack.
      if (this.elapsed >= this.pendingConvoy.launchAt) this.releaseConvoySwarm();
      return;
    }

    // The clock runs from the start of the game; only the launch waits for
    // convoys to unlock, so the first one lands soon after that level.
    this.convoyTimer -= dt;
    if (this.convoyTimer <= 0 && this.level >= CONVOY.fromLevel) this.startConvoy();
  }

  /** Sends in the heavy and schedules the swarm that will chase it down. */
  private startConvoy(): void {
    const plan = planConvoy(this.level, this.height);
    const anchor = new Ship(
      plan.anchorType,
      -plan.anchorType.radius - 6,
      plan.anchorY,
      this.height,
    );
    this.ships.push(anchor);

    this.pendingConvoy = {
      anchorY: plan.anchorY,
      members: plan.members,
      launchAt:
        this.elapsed + convoyLaunchDelay(plan.anchorType, this.width, this.speedMultiplier),
    };
    this.convoyTimer = convoyInterval(this.level);
    this.hud.flashBanner(`${plan.anchorType.label.toUpperCase()} CONVOY INBOUND`, 'alert');
  }

  private releaseConvoySwarm(): void {
    const convoy = this.pendingConvoy;
    if (!convoy) return;
    this.pendingConvoy = null;

    for (const member of convoy.members) {
      const margin = member.type.radius + 6;
      const y = clamp(
        convoy.anchorY + member.dy,
        margin,
        Math.max(margin, this.height - margin),
      );
      this.ships.push(new Ship(member.type, -member.type.radius - 6 + member.dx, y, this.height));
    }

    // Give the cloud a moment of clear space so it reads as one formation.
    this.spawnTimer = Math.max(this.spawnTimer, 2.2);
    this.hud.flashBanner('SWARM CLOSING', 'alert');
  }

  // -------------------------------------------------------------------- update

  private frame(time: number): void {
    const dt = Math.min(0.05, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    this.update(dt);
    this.draw();
    requestAnimationFrame((next) => this.frame(next));
  }

  private update(dt: number): void {
    this.starfield.update(dt);
    this.breachFlash = Math.max(0, this.breachFlash - dt * 1.6);

    for (const reticle of this.reticles) reticle.age += dt;
    this.reticles = this.reticles.filter((r) => r.age < 0.45);

    if (this.state === 'paused') return;

    // Effects and explosions keep animating after the run ends.
    this.effects.update(dt);
    this.updateExplosions(dt);
    this.explosions = this.explosions.filter((explosion) => !explosion.done);

    if (this.state !== 'running') {
      this.ships = this.ships.filter((ship) => ship.alive);
      return;
    }

    this.elapsed += dt;
    const level = 1 + Math.floor(this.elapsed / TUNING.secondsPerLevel);
    if (level !== this.level) {
      this.level = level;
      this.hud.flashLevel(level);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      this.spawnTimer = this.nextSpawnInterval();
    }

    this.updateConvoy(dt);

    const multiplier = this.speedMultiplier;
    let breachY: number | null = null;
    for (const ship of this.ships) {
      if (!ship.alive) continue;
      ship.update(dt, multiplier, this.effects);
      if (ship.noseX >= this.width - DEFENCE_LINE_INSET) breachY = ship.y;
    }
    this.ships = this.ships.filter((ship) => ship.alive);

    if (breachY !== null) {
      this.gameOver(breachY);
      return;
    }
    this.pushHud();
  }

  /** Expanding shockwaves damage ships they sweep over, which can chain. */
  private updateExplosions(dt: number): void {
    const count = this.explosions.length;
    for (let i = 0; i < count; i++) {
      const explosion = this.explosions[i]!;
      const alreadySwept = explosion.finishedExpanding;
      explosion.update(dt);
      // Only the travelling shockwave deals damage, not the lingering fireball.
      if (alreadySwept) continue;

      const reach = explosion.radius;
      for (const ship of this.ships) {
        if (!ship.alive || explosion.hitShips.has(ship.id)) continue;
        const distance = Math.hypot(ship.x - explosion.x, ship.y - explosion.y);
        if (distance - ship.radius * 0.7 > reach) continue;

        explosion.hitShips.add(ship.id);
        // A slightly convex falloff keeps mid-range ships in the chain.
        const reachTotal = explosion.maxRadius + ship.radius;
        const falloff = Math.pow(clamp(1 - distance / reachTotal, 0, 1), 0.75);
        const damage = Math.max(1, Math.round(explosion.power * falloff));
        if (ship.applyDamage(damage)) {
          this.destroyShip(ship, explosion.chainDepth + 1);
        } else {
          this.effects.spawnHitSparks(ship.x, ship.y);
        }
      }
    }
  }

  private destroyShip(ship: Ship, chainDepth: number): void {
    this.destroyed += 1;
    const chainMultiplier = 1 + Math.min(chainDepth, 8) * 0.5;
    const gained = Math.round(scoreForType(ship.type) * chainMultiplier);
    this.points += gained;

    const scale = ship.radius / 30;
    this.effects.spawnBlast(ship.x, ship.y, scale, hexToRgb(ship.type.hullColor));
    this.effects.addShake(2 + ship.radius * 0.14);
    this.explosions.push(
      new Explosion(ship.x, ship.y, ship.type.blastRadius, ship.type.blastPower, chainDepth),
    );

    // Keep the label on screen even for kills right at the field edge.
    const labelX = clamp(ship.x, 72, Math.max(72, this.width - 72));
    const labelY = ship.y - ship.radius - 10;
    if (chainDepth > 0) {
      this.effects.spawnText(
        labelX,
        labelY,
        `CHAIN ×${chainDepth + 1}  +${gained}`,
        '#ffd479',
        Math.min(24, 14 + chainDepth * 2),
      );
    } else {
      this.effects.spawnText(labelX, labelY, `+${gained}`, '#bfe9ff', 15);
    }
    this.pushHud();
  }

  private pushHud(): void {
    this.hud.update({
      destroyed: this.destroyed,
      points: this.points,
      level: this.level,
      elapsed: this.elapsed,
      best: Math.max(this.best, this.destroyed),
    });
  }

  // --------------------------------------------------------------------- draw

  private draw(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx);

    const shake = this.effects.shakeAmount;
    if (shake > 0.1) {
      ctx.translate(randomRange(-shake, shake) * 0.5, randomRange(-shake, shake) * 0.5);
    }

    this.starfield.draw(ctx);
    this.drawSpawnGate(ctx);
    this.drawDefenceLine(ctx);

    // Big ships behind small ones so the small, fast targets stay clickable.
    const ordered = [...this.ships].sort((a, b) => b.radius - a.radius);
    for (const ship of ordered) ship.draw(ctx);

    this.effects.drawSmoke(ctx);
    for (const explosion of this.explosions) explosion.draw(ctx);
    this.effects.draw(ctx);
    this.drawReticles(ctx);
    ctx.restore();

    if (this.breachFlash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 70, 70, ${(this.breachFlash * 0.35).toFixed(3)})`;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    if (this.state === 'paused') this.drawPaused(ctx);
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, '#070b1c');
    gradient.addColorStop(0.5, '#0a1030');
    gradient.addColorStop(1, '#12081f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const nebula = ctx.createRadialGradient(
      this.width * 0.25,
      this.height * 0.7,
      0,
      this.width * 0.25,
      this.height * 0.7,
      Math.max(this.width, this.height) * 0.6,
    );
    nebula.addColorStop(0, 'rgba(78, 46, 140, 0.35)');
    nebula.addColorStop(1, 'rgba(78, 46, 140, 0)');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawSpawnGate(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, 46, 0);
    gradient.addColorStop(0, 'rgba(126, 227, 199, 0.16)');
    gradient.addColorStop(1, 'rgba(126, 227, 199, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 46, this.height);
  }

  /** The line the enemy must not cross, glowing brighter as ships close in. */
  private drawDefenceLine(ctx: CanvasRenderingContext2D): void {
    const lineX = this.width - DEFENCE_LINE_INSET;
    let threat = 0;
    for (const ship of this.ships) {
      const proximity = 1 - (lineX - ship.noseX) / (this.width * 0.35);
      threat = Math.max(threat, clamp(proximity, 0, 1));
    }
    const pulse = 0.5 + Math.sin(performance.now() / 220) * 0.5;
    const intensity = 0.22 + threat * (0.4 + pulse * 0.38);

    const glow = ctx.createLinearGradient(lineX - 90, 0, lineX, 0);
    glow.addColorStop(0, 'rgba(255, 76, 92, 0)');
    glow.addColorStop(1, `rgba(255, 76, 92, ${(intensity * 0.5).toFixed(3)})`);
    ctx.fillStyle = glow;
    ctx.fillRect(lineX - 90, 0, 90, this.height);

    ctx.strokeStyle = `rgba(255, 108, 122, ${(0.55 + intensity * 0.45).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 9]);
    ctx.beginPath();
    ctx.moveTo(lineX, 0);
    ctx.lineTo(lineX, this.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawReticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const reticle of this.reticles) {
      const t = reticle.age / 0.45;
      const radius = 6 + t * 20;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = reticle.hit ? 'rgba(255, 214, 130, 0.9)' : 'rgba(150, 190, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(reticle.x, reticle.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPaused(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 8, 20, 0.6)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#e8f0ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 32px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('PAUSED', this.width / 2, this.height / 2 - 12);
    ctx.font = '400 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232, 240, 255, 0.7)';
    ctx.fillText('Click or press P to resume', this.width / 2, this.height / 2 + 20);
    ctx.restore();
  }

  // ------------------------------------------------------------------- layout

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = Math.max(320, Math.round(rect.width));
    this.height = Math.max(240, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.starfield.resize(this.width, this.height);
    for (const ship of this.ships) ship.clampToField(this.height);
  }

  // ------------------------------------------------------------------ storage

  private loadBest(): number {
    try {
      const raw = window.localStorage.getItem(BEST_STORAGE_KEY);
      const value = raw === null ? 0 : Number.parseInt(raw, 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  private saveBest(value: number): void {
    try {
      window.localStorage.setItem(BEST_STORAGE_KEY, String(value));
    } catch {
      // Storage can be unavailable (private mode); the score just is not kept.
    }
  }
}
