import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';
import { gameLog } from '../../GameLog.js';

export class FunkyFloorSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        // 核心修正：儲存技能資料以便 runSequence 使用
        this.data = skillData;
    }

    _buildMesh(shape, positions, defaultColor) {
        const width = shape.width || 1;
        const height = shape.height || 1;
        const opacity = (shape.opacity !== undefined) ? shape.opacity : 0.5;
        const colors = shape.colors;

        const createPlane = (color) => {
            const geometry = new THREE.PlaneGeometry(width, height);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });
            return new THREE.Mesh(geometry, material);
        };

        if (Array.isArray(positions) && positions.length > 0) {
            const group = new THREE.Group();
            const base = positions[0];
            positions.forEach((pos, index) => {
                const color = Array.isArray(colors) && colors[index] !== undefined ? colors[index] : defaultColor;
                const mesh = createPlane(color);
                mesh.position.set(pos.x - base.x, base.z - pos.z, 0);
                group.add(mesh);
            });
            return group;
        }
        return createPlane((shape.color !== undefined) ? shape.color : defaultColor);
    }

    createPreAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.preShape(skillData), BaseSkill.other(skillData).position, 0xff0000);
    }

    createAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.attackShape(skillData), BaseSkill.other(skillData).position, 0xff0000);
    }

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const shape = BaseSkill.attackShape(skillData);
        const width = shape.width || 1;
        const height = shape.height || 1;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const positions = BaseSkill.other(skillData).position;

        if (Array.isArray(positions)) {
            return positions.some(pos => {
                const isInsideX = charPos.x >= (pos.x - halfWidth) && charPos.x <= (pos.x + halfWidth);
                const isInsideZ = charPos.z >= (pos.z - halfHeight) && charPos.z <= (pos.z + halfHeight);
                return isInsideX && isInsideZ;
            });
        }

        const isInsideX = charPos.x >= (attackPos.x - halfWidth) && charPos.x <= (attackPos.x + halfWidth);
        const isInsideZ = charPos.z >= (attackPos.z - halfHeight) && charPos.z <= (attackPos.z + halfHeight);
        return isInsideX && isInsideZ;
    }

    runSequence(monster, telegraphManager, onAttack) {
        const other = this.other;
        const repeatCount = other.repeat_count || 1;

        // 預警時間設為 3 秒
        const preWarning = (other.pre_warning_time || 3) * 1000;
        // 攻擊時間 0.5 秒
        const activeDuration = (other.duration || 0.5) * 1000;
        // 間隔時間 3.5 秒
        const intervalTime = (other.interval_time || 3.5) * 1000;

        // 每一波的總步進時間仍為 7 秒 (3 + 0.5 + 3.5)
        const totalStepTime = preWarning + activeDuration + intervalTime;

        // 畫面上顯示的 Boss 讀條時間 (總時間 4 秒 - 1 秒 = 3 秒)
        const displayCastTime = Math.max(0, (other.cast_time || 0) - 1);
        // 邏輯正式啟動時間 (總時間 4 秒)
        const initialCastTime = (other.cast_time || 0) * 1000;
        // 新增：1 秒靜止等待時間
        const staticWaitTime = 1000;

        // 攻擊時的隨機深色池
        const deepColors = [0x00008B, 0x4B0082, 0x8B8B00, 0x006400];

        // 支援 Boss 讀條 UI
        gameLog.add(`${monster.config.name} 開始施放: ${this.data.name}`, "text-yellow-100 opacity-80", monster.clock.now());
        monster.activeCast = {
            name: this.data.name,
            startTime: monster.clock.now(),
            duration: displayCastTime
        };

        const positions = this.other.position || [];

        for (let i = 0; i < repeatCount; i++) {
            /**
             * 延遲計算說明：
             * initialCastTime (4s) + staticWaitTime (1s) = 5s
             * 第一波預警會在玩家看到 Boss 讀條結束後的 1 秒才出現。
             */
            monster.setTimeout(() => {
                const randomColors = positions.map(() =>
                    deepColors[Math.floor(monster.rng() * deepColors.length)]
                );

                const stepSkill = {
                    data: {
                        name: this.data.name,
                        type: this.data.type,
                        other: { cast_time: 3, duration: 0.5, position: positions }, // 固定 3 秒預警 / 0.5 秒攻擊
                        pre_attack: this.preAttack,
                        attack: { ...this.preAttack, colors: randomColors }
                    },
                    logic: this
                };

                telegraphManager.createTelegraph(
                    stepSkill,
                    positions,
                    onAttack,
                    []
                );

            }, initialCastTime + staticWaitTime + (i * totalStepTime));
        }
    }
}
