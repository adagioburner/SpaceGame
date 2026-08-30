/**
 * Minimal browser stand-ins so the game can be driven in Node.
 *
 * The game only ever writes to the canvas — it never reads pixels back — so a
 * recording no-op context is enough to exercise every drawing path. Time and
 * animation frames are controlled by the test rather than the runtime, which is
 * what makes the simulation deterministic.
 */

/** Ids the HUD looks up; all must exist or the Hud constructor throws. */
const HUD_IDS = [
  'stat-destroyed',
  'stat-points',
  'stat-level',
  'stat-time',
  'stat-best',
  'overlay',
  'overlay-title',
  'overlay-body',
  'overlay-button',
  'level-banner',
  'field',
] as const;

export class FakeClassList {
  private readonly names = new Set<string>();

  add(...names: string[]): void {
    for (const name of names) this.names.add(name);
  }

  remove(...names: string[]): void {
    for (const name of names) this.names.delete(name);
  }

  contains(name: string): boolean {
    return this.names.has(name);
  }

  get value(): string {
    return [...this.names].join(' ');
  }
}

export class FakeElement {
  readonly classList = new FakeClassList();
  textContent = '';
  innerHTML = '';
  /** Read by the HUD purely to restart CSS animations. */
  readonly offsetWidth = 0;
  focused = false;
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(readonly id: string) {}

  addEventListener(type: string, handler: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(handler);
    this.listeners.set(type, existing);
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  focus(): void {
    this.focused = true;
  }
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class FakeCanvas extends FakeElement {
  width = 0;
  height = 0;
  readonly style: Record<string, string> = {};

  constructor(
    id: string,
    private rect: Rect,
    private readonly context: FakeContext,
  ) {
    super(id);
  }

  getContext(kind: string): FakeContext | null {
    return kind === '2d' ? this.context : null;
  }

  getBoundingClientRect(): Rect {
    return this.rect;
  }

  /** Simulates the element being laid out at a new size. */
  setRect(rect: Rect): void {
    this.rect = rect;
  }
}

/** Records how often each drawing call was made, and swallows the rest. */
export class FakeContext {
  readonly calls = new Map<string, number>();
  /** Every string the game has drawn, so tests can read its player-facing copy. */
  readonly texts: string[] = [];

  // Settable state the game assigns to.
  fillStyle: unknown = '';
  strokeStyle: unknown = '';
  lineWidth = 1;
  lineDashOffset = 0;
  font = '';
  textAlign = '';
  textBaseline = '';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  shadowBlur = 0;
  shadowColor = '';

  private record(name: string): void {
    this.calls.set(name, (this.calls.get(name) ?? 0) + 1);
  }

  countOf(name: string): number {
    return this.calls.get(name) ?? 0;
  }

  reset(): void {
    this.calls.clear();
    this.texts.length = 0;
  }

  save(): void {
    this.record('save');
  }
  restore(): void {
    this.record('restore');
  }
  translate(): void {
    this.record('translate');
  }
  scale(): void {
    this.record('scale');
  }
  rotate(): void {
    this.record('rotate');
  }
  setTransform(): void {
    this.record('setTransform');
  }
  beginPath(): void {
    this.record('beginPath');
  }
  closePath(): void {
    this.record('closePath');
  }
  moveTo(): void {
    this.record('moveTo');
  }
  lineTo(): void {
    this.record('lineTo');
  }
  arc(): void {
    this.record('arc');
  }
  ellipse(): void {
    this.record('ellipse');
  }
  fill(): void {
    this.record('fill');
  }
  stroke(): void {
    this.record('stroke');
  }
  clip(): void {
    this.record('clip');
  }
  fillRect(): void {
    this.record('fillRect');
  }
  clearRect(): void {
    this.record('clearRect');
  }
  fillText(text?: unknown): void {
    this.record('fillText');
    if (typeof text === 'string') this.texts.push(text);
  }
  setLineDash(): void {
    this.record('setLineDash');
  }

  createLinearGradient(): { addColorStop(): void } {
    this.record('createLinearGradient');
    return { addColorStop: () => {} };
  }

  createRadialGradient(): { addColorStop(): void } {
    this.record('createRadialGradient');
    return { addColorStop: () => {} };
  }
}

export class FakeStorage {
  private readonly entries = new Map<string, string>();
  /** When set, every access throws — as in a browser with site data blocked. */
  sealed = false;

  getItem(key: string): string | null {
    if (this.sealed) throw new Error('storage is not available');
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.sealed) throw new Error('storage is not available');
    this.entries.set(key, value);
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Drives `performance.now()` and `requestAnimationFrame` so tests decide when
 * time passes. Frames are delivered at a fixed step, keeping `dt` stable and
 * well under the loop's own 50ms clamp.
 */
export class FakeClock {
  private millis = 0;
  private pending: ((time: number) => void)[] = [];

  now(): number {
    return this.millis;
  }

  requestFrame(callback: (time: number) => void): number {
    this.pending.push(callback);
    return this.pending.length;
  }

  /** Runs frames covering `seconds` of simulated time. */
  advance(seconds: number, stepMillis = 1000 / 60): void {
    const frames = Math.max(1, Math.round((seconds * 1000) / stepMillis));
    for (let i = 0; i < frames; i++) {
      this.millis += stepMillis;
      const due = this.pending;
      this.pending = [];
      for (const callback of due) callback(this.millis);
    }
  }

  /** Number of frame callbacks waiting — zero means the loop has stopped. */
  get pendingFrames(): number {
    return this.pending.length;
  }
}

export interface FakeDom {
  canvas: FakeCanvas;
  context: FakeContext;
  storage: FakeStorage;
  clock: FakeClock;
  elements: Map<string, FakeElement>;
  /** Fires a listener registered on `window`, e.g. 'resize' or 'keydown'. */
  dispatchWindow(type: string, event?: unknown): void;
  uninstall(): void;
}

interface DomOptions {
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  /** Values already in storage before the game boots, e.g. a saved best. */
  storage?: Record<string, string>;
}

const GLOBAL_KEYS = [
  'window',
  'document',
  'performance',
  'requestAnimationFrame',
] as const;

/**
 * Installs the fake browser globals. Always pair with `uninstall()` so one
 * test's globals cannot leak into the next.
 */
export function installDom(options: DomOptions = {}): FakeDom {
  const width = options.width ?? 1200;
  const height = options.height ?? 800;

  const context = new FakeContext();
  const storage = new FakeStorage();
  for (const [key, value] of Object.entries(options.storage ?? {})) {
    storage.setItem(key, value);
  }
  const clock = new FakeClock();
  const elements = new Map<string, FakeElement>();

  const canvas = new FakeCanvas('field', { left: 0, top: 0, width, height }, context);
  elements.set('field', canvas);
  for (const id of HUD_IDS) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
  }

  const windowListeners = new Map<string, ((event: unknown) => void)[]>();
  const fakeWindow = {
    devicePixelRatio: options.devicePixelRatio ?? 1,
    localStorage: storage,
    addEventListener(type: string, handler: (event: unknown) => void): void {
      const existing = windowListeners.get(type) ?? [];
      existing.push(handler);
      windowListeners.set(type, existing);
    },
    removeEventListener(): void {},
  };

  const fakeDocument = {
    readyState: 'complete',
    getElementById: (id: string) => elements.get(id) ?? null,
    addEventListener(): void {},
  };

  const saved = new Map<string, PropertyDescriptor | undefined>();
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const key of GLOBAL_KEYS) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }

  globals['window'] = fakeWindow;
  globals['document'] = fakeDocument;
  globals['performance'] = { now: () => clock.now() };
  globals['requestAnimationFrame'] = (callback: (time: number) => void) =>
    clock.requestFrame(callback);

  return {
    canvas,
    context,
    storage,
    clock,
    elements,
    dispatchWindow(type, event) {
      for (const handler of windowListeners.get(type) ?? []) handler(event ?? {});
    },
    uninstall() {
      for (const key of GLOBAL_KEYS) {
        const descriptor = saved.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globals[key];
      }
    },
  };
}

/**
 * Replaces `Math.random` with a seeded generator (mulberry32) so tests that
 * exercise spawning, ship classes or convoy layout are reproducible.
 * Returns a function that puts the real one back.
 */
export function seedRandom(seed: number): () => void {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    Math.random = original;
  };
}
