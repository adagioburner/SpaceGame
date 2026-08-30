import { Game } from './game.js';
import { Hud } from './hud.js';
function boot() {
    const canvas = document.getElementById('field');
    if (!canvas)
        throw new Error('Missing #field canvas');
    let game;
    const hud = new Hud(() => game?.primaryAction());
    game = new Game(canvas, hud);
    // Handy for poking at the running game from the devtools console.
    window.spaceGame = game;
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
}
else {
    boot();
}
//# sourceMappingURL=main.js.map