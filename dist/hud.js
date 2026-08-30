import { formatTime } from './utils.js';
function element(id) {
    const found = document.getElementById(id);
    if (!found)
        throw new Error(`Missing element #${id}`);
    return found;
}
/** Thin wrapper around the DOM chrome around the play field. */
export class Hud {
    constructor(onAction) {
        this.destroyed = element('stat-destroyed');
        this.points = element('stat-points');
        this.level = element('stat-level');
        this.time = element('stat-time');
        this.best = element('stat-best');
        this.overlay = element('overlay');
        this.overlayTitle = element('overlay-title');
        this.overlayBody = element('overlay-body');
        this.overlayButton = element('overlay-button');
        this.levelBanner = element('level-banner');
        this.lastRenderedLevel = 0;
        this.overlayButton.addEventListener('click', (event) => {
            event.stopPropagation();
            onAction();
        });
    }
    update(state) {
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
    flashLevel(level) {
        this.levelBanner.textContent = `THREAT LEVEL ${level}`;
        this.levelBanner.classList.remove('show');
        void this.levelBanner.offsetWidth;
        this.levelBanner.classList.add('show');
    }
    showStart() {
        this.overlayTitle.textContent = 'SECTOR DEFENCE';
        this.overlayBody.innerHTML = `
      <p>Hostile ships enter from the left. <strong>Click them</strong> to open fire.</p>
      <p>Bigger hulls soak up several hits, lose speed as they burn, and their
         death blast can set off everything nearby &mdash; line them up for chains.</p>
      <p>Let a single ship reach the right-hand line and the sector falls.</p>
    `;
        this.overlayButton.textContent = 'Launch defence';
        this.overlay.classList.add('visible');
        this.overlay.classList.remove('over');
    }
    showGameOver(summary) {
        this.overlayTitle.textContent = 'SECTOR BREACHED';
        this.overlayBody.innerHTML = `
      <p class="result">${summary.destroyed} ship${summary.destroyed === 1 ? '' : 's'} destroyed</p>
      <p>${summary.points.toLocaleString()} points &middot; threat level ${summary.level} &middot; survived ${formatTime(summary.elapsed)}</p>
      ${summary.isNewBest ? '<p class="new-best">New personal best!</p>' : `<p>Best: ${summary.best}</p>`}
    `;
        this.overlayButton.textContent = 'Fly again';
        this.overlay.classList.add('visible', 'over');
    }
    hideOverlay() {
        this.overlay.classList.remove('visible', 'over');
    }
    focusButton() {
        this.overlayButton.focus();
    }
}
//# sourceMappingURL=hud.js.map