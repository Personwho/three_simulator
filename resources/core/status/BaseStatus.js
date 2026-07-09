export class BaseStatus {
    constructor(owner, data) {
        this.owner = owner; // 宿主 Character 實例
        this.name = data.name;
        this.type = data.type || 'none';
        this.duration = data.duration; // 秒
        this.value = data.value ?? 1;
        this.icon = data.icon;
        this.isBuff = !!data.isBuff;
        this.startTime = data.startTime || Date.now();
        this.isExpired = false;
    }

    // 每一幀更新邏輯
    update(deltaTime) {
        if (Date.now() - this.startTime >= this.duration * 1000) {
            this.isExpired = true;
        }
    }

    applyEffect(stats) {
        // 預設不執行任何修改
    }

    // 當狀態結束時觸發
    onExpire(telegraphManager, addLog) {}
}