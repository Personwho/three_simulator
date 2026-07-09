import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';

export class FunkyFloorSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        // 核心修正：儲存技能資料以便 runSequence 使用
        this.data = skillData;
    }
    
    createTelegraphMesh(skillData) {
        const width = skillData.config?.width || 1;
        const height = skillData.config?.height || 1;
        const opacity = (skillData.opacity !== undefined) ? skillData.opacity : 0.5;
        const positions = skillData.config?.position;

        const createPlane = () => {
            const geometry = new THREE.PlaneGeometry(width, height);
            const material = new THREE.MeshBasicMaterial({
                color: 0xff0000,
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
            positions.forEach(pos => {
                const mesh = createPlane();
                mesh.position.set(pos.x - base.x, base.z - pos.z, 0);
                group.add(mesh);
            });
            return group;
        }
        return createPlane();
    }

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const width = skillData.config?.width || 1;
        const height = skillData.config?.height || 1;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const positions = skillData.config?.position;

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

    runSequence(monster, telegraphManager, onAttack, allCharacters, addLog) {
        const config = this.data.config;
        const repeatCount = config.repeat_count || 1;
        
        // 預警時間設為 3 秒
        const preWarning = (config.pre_warning_time || 3) * 1000;
        // 攻擊時間 0.5 秒
        const activeDuration = (this.data.duration || 0.5) * 1000;
        // 間隔時間 3.5 秒
        const intervalTime = (config.interval_time || 3.5) * 1000; 
        
        // 每一波的總步進時間仍為 7 秒 (3 + 0.5 + 3.5)
        const totalStepTime = preWarning + activeDuration + intervalTime;
        
        // 畫面上顯示的 Boss 讀條時間 (總時間 4 秒 - 1 秒 = 3 秒)
        const displayCastTime = Math.max(0, (this.data.cast_time || 0) - 1);
        // 邏輯正式啟動時間 (總時間 4 秒)
        const initialCastTime = (this.data.cast_time || 0) * 1000;
        // 新增：1 秒靜止等待時間
        const staticWaitTime = 1000; 

        // 攻擊時的隨機深色池
        const deepColors = [0x00008B, 0x4B0082, 0x8B8B00, 0x006400];

        // 支援 Boss 讀條 UI
        if (addLog) {
            addLog(`${monster.config.name} 開始施放: ${this.data.name}`, "text-yellow-100 opacity-80");
            monster.activeCast = {
                name: this.data.name,
                startTime: Date.now(),
                duration: displayCastTime 
            };
        }

        for (let i = 0; i < repeatCount; i++) {
            /** 
             * 延遲計算說明：
             * initialCastTime (4s) + staticWaitTime (1s) = 5s
             * 第一波預警會在玩家看到 Boss 讀條結束後的 1 秒才出現。
             */
            monster.setTimeout(() => {
                const randomColors = config.position.map(() => 
                    deepColors[Math.floor(Math.random() * deepColors.length)]
                );

                const stepSkill = {
                    data: {
                        ...this.data,
                        cast_time: 3, // 固定 3 秒預警
                        duration: 0.5, // 固定 0.5 秒攻擊
                        config: {
                            ...this.data.config,
                            active_colors: randomColors
                        }
                    },
                    logic: this
                };

                telegraphManager.createTelegraph(
                    stepSkill, 
                    config.position, 
                    onAttack, 
                    []
                );

            }, initialCastTime + staticWaitTime + (i * totalStepTime));
        }
    }
}