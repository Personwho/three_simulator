// 模擬時間鐘：所有遊戲邏輯（技能排程、預警倒數、Buff/Debuff 到期）都應讀這裡的時間，
// 而不是直接呼叫 Date.now()，這樣才能被快轉功能同步重演。
export class GameClock {
    constructor() {
        this._now = 0;
    }

    now() {
        return this._now;
    }

    advance(ms) {
        this._now += ms;
    }

    set(ms) {
        this._now = ms;
    }
}
