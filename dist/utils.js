export function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function randomRange(min, max) {
    return min + Math.random() * (max - min);
}
export function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}
/** Picks an index from a list of non-negative weights. */
export function weightedIndex(weights) {
    let total = 0;
    for (const w of weights)
        total += Math.max(0, w);
    if (total <= 0)
        return 0;
    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= Math.max(0, weights[i]);
        if (roll <= 0)
            return i;
    }
    return weights.length - 1;
}
export function hexToRgb(hex) {
    const value = hex.replace('#', '');
    const full = value.length === 3
        ? value
            .split('')
            .map((c) => c + c)
            .join('')
        : value;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
}
export function mixColors(a, b, t) {
    return {
        r: Math.round(lerp(a.r, b.r, t)),
        g: Math.round(lerp(a.g, b.g, t)),
        b: Math.round(lerp(a.b, b.b, t)),
    };
}
export function rgba({ r, g, b }, alpha) {
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}
export function formatTime(seconds) {
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
//# sourceMappingURL=utils.js.map