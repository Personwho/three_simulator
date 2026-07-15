// 獨立於 Scene 的戰鬥紀錄面板，讓 Skill、Status 等遊戲邏輯可以直接匯入呼叫，
// 不必再靠 Scene 把 addLog callback 一路往下傳。
export class GameLog {
    constructor(maxLogCount = 200) {
        this.maxLogCount = maxLogCount;
        this.throttleTimes = new Map();
    }

    _formatElapsed(elapsedMs = 0) {
        const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    add(message, colorClass = "text-white", elapsedMs = 0) {
        const logList = document.getElementById('game-log-list');
        if (!logList) return;

        const logItem = document.createElement('div');
        logItem.className = `leading-tight ${colorClass}`;
        logItem.innerHTML = `<span class="">[${this._formatElapsed(elapsedMs)}]</span> ${message}`;

        logList.appendChild(logItem);

        while (logList.children.length > this.maxLogCount) {
            logList.removeChild(logList.firstChild);
        }

        logList.scrollTop = logList.scrollHeight;
    }

    // 節流版本：同一個 key 在 minIntervalMs 內只會記錄一次，回傳是否真的有寫入紀錄
    addThrottled(key, message, colorClass, minIntervalMs, nowMs) {
        const last = this.throttleTimes.get(key) || 0;
        if (nowMs - last < minIntervalMs) return false;
        this.throttleTimes.set(key, nowMs);
        this.add(message, colorClass, nowMs);
        return true;
    }

    clear() {
        const logList = document.getElementById('game-log-list');
        if (logList) logList.innerHTML = '';
        this.throttleTimes.clear();
    }
}

export const gameLog = new GameLog();
