// 可播種的偽隨機數產生器（mulberry32），讓戰鬥流程可以用同一顆種子完整重演。
export function createRng(seed) {
    let state = seed >>> 0;
    return function () {
        state |= 0;
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createSeed() {
    return (Math.random() * 0xFFFFFFFF) >>> 0;
}
