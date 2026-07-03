import * as THREE from 'three';
import { SkillFactory } from './skills/SkillFactory.js';

export class Monster {
    constructor(model, config) {
        this.model = model;
        this.config = config;
        this.skills = config.skills.map(s => ({
            data: s,
            logic: SkillFactory.create(s),
            triggered: false
        }));

        this.path = config.path || [];
        this.currentPathIndex = -1;
        this.isMoving = false;
        this.moveStartTime = 0;
        this.moveStartPos = new THREE.Vector3();

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
        if (!this.spawned && isGameRunning && elapsedTime >= (this.config.spawn_time || 0)) {
            this.spawned = true;
            this.model.visible = true;
        }

        if (isGameRunning && this.spawned) {
            // 處理移動路徑
            this.path.forEach((node, index) => {
                if (elapsedTime >= node.time && this.currentPathIndex < index) {
                    this.currentPathIndex = index;
                    if (node.duration === 0) {
                        this.model.position.set(node.position.x, node.position.y, node.position.z);
                        this.isMoving = false;
                    } else {
                        this.isMoving = true;
                        this.moveStartTime = node.time;
                        this.moveStartPos.copy(this.model.position);
                    }
                    // 如果有旋轉設定則套用
                    if (node.rotation) {
                        this.model.rotation.set(
                            (node.rotation.x || 0) * (Math.PI / 180),
                            (node.rotation.y || 0) * (Math.PI / 180),
                            (node.rotation.z || 0) * (Math.PI / 180)
                        );
                    }
                }
            });

            if (this.isMoving) {
                const node = this.path[this.currentPathIndex];
                const progress = (elapsedTime - this.moveStartTime) / node.duration;
                if (progress >= 1) {
                    this.model.position.set(node.position.x, node.position.y, node.position.z);
                    this.isMoving = false;
                } else {
                    const target = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
                    this.model.position.lerpVectors(this.moveStartPos, target, progress);
                }
            }

            // 處理技能觸發
            this.skills.forEach(skill => {
                if (!skill.triggered && elapsedTime >= (skill.data.time || 0)) {
                    skill.triggered = true;
                    // 新增：設定施法資訊
                    if (!this.activeCast) {
                        this.activeCast = {
                            name: skill.data.name,
                            startTime: Date.now(),
                            duration: skill.data.cast_time
                        };
                    }

                    // 修正：如果技能沒指定位置，則使用怪物「當前」位置
                    const targetPos = skill.data.config.position || {
                        x: this.model.position.x, // 補償 Tool.js 的座標轉換
                        y: this.model.position.y,
                        z: this.model.position.z
                    };
                    telegraphManager.createTelegraph(skill, targetPos, onAttack);
                }
            });
        }
    }

    reset() {
        this.spawned = (this.config.spawn_time || 0) <= 0;
        this.model.visible = this.spawned;
        this.skills.forEach(s => s.triggered = false);
        this.currentPathIndex = -1;
        this.isMoving = false;
        this.activeCast = null;
        this.model.position.set(this.config.position.x, this.config.position.y, this.config.position.z);
    }
}