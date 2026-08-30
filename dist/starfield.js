import { randomRange } from './utils.js';
/** Slow parallax background so the play field reads as moving space. */
export class Starfield {
    constructor() {
        this.stars = [];
        this.width = 0;
        this.height = 0;
        this.time = 0;
    }
    resize(width, height) {
        this.width = width;
        this.height = height;
        const target = Math.round((width * height) / 5200);
        this.stars = [];
        for (let i = 0; i < target; i++) {
            this.stars.push(this.createStar(randomRange(0, width)));
        }
    }
    createStar(x) {
        const depth = Math.random();
        return {
            x,
            y: randomRange(0, this.height),
            size: 0.4 + depth * 1.6,
            speed: 4 + depth * 22,
            twinkle: randomRange(0.25, 0.85),
            phase: randomRange(0, Math.PI * 2),
        };
    }
    update(dt) {
        this.time += dt;
        for (const star of this.stars) {
            star.x -= star.speed * dt;
            if (star.x < -2) {
                star.x = this.width + 2;
                star.y = randomRange(0, this.height);
            }
        }
    }
    draw(ctx) {
        ctx.save();
        for (const star of this.stars) {
            const flicker = 0.6 + Math.sin(this.time * 2 + star.phase) * 0.4 * star.twinkle;
            ctx.globalAlpha = Math.max(0.05, flicker * 0.85);
            ctx.fillStyle = '#dfe9ff';
            ctx.fillRect(star.x, star.y, star.size, star.size);
        }
        ctx.restore();
    }
}
//# sourceMappingURL=starfield.js.map