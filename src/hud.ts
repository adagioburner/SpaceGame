import { formatTime } from './utils.js';

export interface HudState {
  destroyed: number;
  points: number;
  level: number;
  elapsed: number;
  best: number;
}

export interface GameOverSummary {
  destroyed: number;
  points: number;
  level: number;
  elapsed: number;
  best: number;
  isNewBest: boolean;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

/** Thin wrapper around the DOM chrome around the play field. */
export class Hud {
  private readonly destroyed = element<HTMLElement>('stat-destroyed');
  private readonly points = element<HTMLElement>('stat-points');
  private readonly level = element<HTMLElement>('stat-level');
  private readonly time = element<HTMLElement>('stat-time');
  private readonly best = element<HTMLElement>('stat-best');
  private readonly overlay = element<HTMLElement>('overlay');
  private readonly overlayTitle = element<HTMLElement>('overlay-title');
  private readonly overlayBody = element<HTMLElement>('overlay-body');
  private readonly overlayButton = element<HTMLButtonElement>('overlay-button');
  private readonly levelBanner = element<HTMLElement>('level-banner');

  private lastRenderedLevel = 0;

  constructor(onAction: () => void) {
    this.overlayButton.addEventListener('click', (event) => {
      event.stopPropagation();
      onAction();
    });
  }

  update(state: HudState): void {
    this.destroyed.textContent = String(state.destroyed);
    this.points.textContent = state.points.toLocaleString();
    this.level.textContent = String(state.level);
    this.time.textContent = formatTime(state.elapsed);
    this.best.textContent = String(state.best);

    if (state.level !== this.lastRenderedLevel) {
      this.lastRenderedLevel = state.level;
      this.level.classList.remove('bump');
      // Restart the CSS animation.
      void this.level.offsetWidth;
      this.level.classList.add('bump');
    }
  }

  flashLevel(level: number): void {
    this.flashBanner(`THREAT LEVEL ${level}`, 'info');
  }

  /** Momentary announcement across the play field. */
  flashBanner(text: string, tone: 'info' | 'alert'): void {
    this.levelBanner.textContent = text;
    this.levelBanner.classList.remove('show', 'alert');
    // Restart the CSS animation.
    void this.levelBanner.offsetWidth;
    this.levelBanner.classList.add('show');
    if (tone === 'alert') this.levelBanner.classList.add('alert');
  }

  showStart(): void {
    this.overlayTitle.textContent = 'SECTOR DEFENCE';
    this.overlayBody.innerHTML = `
      <p>Hostile ships enter from the left. <strong>Click them</strong> to open fire.</p>
      <p>Bigger hulls soak up several hits and slow as they burn. When one
         finally goes, it takes whatever is alongside it.</p>
      <p>Let a single ship reach the right-hand line and the sector falls.</p>
    `;
    this.overlayButton.textContent = 'Launch defence';
    this.overlay.classList.add('visible');
    this.overlay.classList.remove('over');
  }

  showGameOver(summary: GameOverSummary): void {
    this.overlayTitle.textContent = 'SECTOR BREACHED';
    this.overlayBody.innerHTML = `
      <p class="result">${summary.destroyed} ship${summary.destroyed === 1 ? '' : 's'} destroyed</p>
      <p>${summary.points.toLocaleString()} points &middot; threat level ${summary.level} &middot; survived ${formatTime(summary.elapsed)}</p>
      ${summary.isNewBest ? '<p class="new-best">New personal best!</p>' : `<p>Best: ${summary.best}</p>`}
    `;
    this.overlayButton.textContent = 'Fly again';
    this.overlay.classList.add('visible', 'over');
  }

  hideOverlay(): void {
    this.overlay.classList.remove('visible', 'over');
  }

  focusButton(): void {
    this.overlayButton.focus();
  }
}
