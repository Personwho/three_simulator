export class ActionBar {
    constructor() {
        this.keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
        this.actions = {
            '1': {
                name: '衝刺',
                icon: 'assets/icons/衝刺.png',
                cd: 20,
                lastUsed: 0,
                // 將技能效果數據化
                effect: { name: "衝刺", type: "speed", value: 1.2, duration: 10, isBuff: true }
            }
        };
        this.slots = {}; // 用於快取 DOM 節點
        this.initDOM();
    }

    initDOM() {
        const container = document.getElementById('action-bar');
        if (!container) return;

        container.innerHTML = '';
        this.keys.forEach(key => {
            const action = this.actions[key];
            const slot = document.createElement('div');
            slot.className = "relative w-12 h-12 bg-gray-800 border border-gray-600 rounded flex items-center justify-center overflow-hidden";
            slot.innerHTML = `
                <span class="absolute top-0 left-1 text-[10px] text-gray-400 z-10">${key}</span>
                ${action ? `<img src="${action.icon}" class="w-full h-full object-contain">` : ''}
                <div class="cd-overlay absolute inset-0 bg-black/70 flex items-center justify-center text-white text-xs font-bold" style="display:none"></div>
            `;
            container.appendChild(slot);

            // 快取節點，避免 update 時反覆查詢
            this.slots[key] = {
                overlay: slot.querySelector('.cd-overlay')
            };
        });
    }

    trigger(key, character) {
        const action = this.actions[key];
        if (!action || !character) return;

        const now = Date.now();
        if (now - action.lastUsed < action.cd * 1000) return;

        // 通用的技能觸發邏輯
        if (action.effect) {
            character.addStatusEffect({
                ...action.effect,
                icon: action.icon,
                startTime: now
            });
            action.lastUsed = now;
        }
    }

    update() {
        const now = Date.now();
        Object.keys(this.actions).forEach(key => {
            const action = this.actions[key];
            const slot = this.slots[key];
            if (!slot || !slot.overlay) return;

            const remain = Math.max(0, (action.cd * 1000 - (now - action.lastUsed)) / 1000);

            if (remain > 0) {
                slot.overlay.style.display = 'flex';
                slot.overlay.textContent = remain.toFixed(1);
            } else if (slot.overlay.style.display !== 'none') {
                slot.overlay.style.display = 'none';
            }
        });
    }

    reset() {
        Object.keys(this.actions).forEach(key => this.actions[key].lastUsed = 0);
        this.update();
    }
}