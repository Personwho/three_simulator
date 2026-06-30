import * as THREE from 'three';

export class Monster {
    constructor(model, config) {
        this.model = model;
        this.config = config;
        this.name = config.name;
        this.skills = config.skills.map(s => ({ ...s, triggered: false }));

        // 初始化位置
        this.model.position.set(config.position.x, config.position.y, config.position.z);

        // 設定旋轉 (支援 JSON 中的 rotation 物件，角度轉弧度)
        if (config.rotation) {
            this.model.rotation.set(
                (config.rotation.x || 0) * (Math.PI / 180),
                (config.rotation.y || 0) * (Math.PI / 180),
                (config.rotation.z || 0) * (Math.PI / 180)
            );
        }

        // 預設可見性：如果 spawn_time 為 0 或未定義，則一開始就顯示
        this.spawned = (config.spawn_time || 0) <= 0;
        this.model.visible = this.spawned;
    }

    update(elapsedTime, isGameRunning, telegraphManager, onAttack) {
        // 如果還沒重生，檢查時間
        if (!this.spawned && isGameRunning && elapsedTime >= (this.config.spawn_time || 0)) {
            this.spawned = true;
            this.model.visible = true;
        }

        // 只有遊戲運行且已重生才處理技能
        if (isGameRunning && this.spawned) {
            this.skills.forEach(skill => {
                if (!skill.triggered && elapsedTime >= skill.time) {
                    skill.triggered = true;
                    const targetPos = skill.position || this.config.position;
                    telegraphManager.createTelegraph(skill, targetPos, onAttack);
                }
            });
        }
    }

    reset() {
        this.spawned = (this.config.spawn_time || 0) <= 0;
        this.model.visible = this.spawned;
        this.skills.forEach(s => s.triggered = false);
    }
}