import { Game } from './game.js';
import { Hud } from './hud.js';

function boot(): void {
  const canvas = document.getElementById('field') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Missing #field canvas');

  let game: Game | undefined;
  const hud = new Hud(() => game?.primaryAction());
  game = new Game(canvas, hud);

  // Handy for poking at the running game from the devtools console.
  (window as unknown as { spaceGame: Game }).spaceGame = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
