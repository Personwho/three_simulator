import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class SnapTwistDropTheNeedleSkill extends BaseSkill {
    createTelegraphMesh(skillData) {
        const config = skillData.config || {};
        const width = config.width || 1;
        const height = config.height || 1;
        const opacity = (skillData.opacity !== undefined) ? skillData.opacity : 0.5;
        // 1. 讀取顏色，若無則預設為紅色
        const color = config.color || 0xff0000;
        // 新增：從 config 讀取初始旋轉角度 (degrees to radians)
        const rotationY = (config.angle_start !== undefined) ? (config.angle_start * Math.PI / 180) : 0;

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

        const mesh = new THREE.Mesh(geometry, material);
        mesh.geometry.translate(0, height / 2, 0); 
        
        // 修正：旋轉順序。先繞 X 軸平躺，再根據 JSON 設定繞 Y 軸旋轉
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -rotationY; // 在 PlaneGeometry 平躺後，原本的 Y 旋轉會變成繞 Z 軸
        
        return mesh;
    }

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const config = skillData.config || {};
        const width = config.width || 1;
        const height = config.height || 1;

        // 將玩家座標轉為相對於攻擊起點的本地座標
        const dx = charPos.x - attackPos.x;
        const dz = charPos.z - attackPos.z;

        // 考慮旋轉（attackRotationY）
        // 因為模型面向 -Z 方向，我們需要旋轉座標系來進行 AABB 判定
        const localX = dx * Math.cos(attackRotationY) - dz * Math.sin(attackRotationY);
        const localZ = dx * Math.sin(attackRotationY) + dz * Math.cos(attackRotationY);

        // 判定範圍：X 在 -width/2 到 width/2，Z 在 0 到 -height (向前延伸)
        // 注意：根據專案看向 -Z 的邏輯，這裡 Z 的判定範圍為 0 到 height
        return Math.abs(localX) <= width / 2 && localZ >= 0 && localZ <= height;
    }

    /**
     * 執行連擊邏輯
     * @param {Monster} monster 施放技能的怪物實體
     * @param {TelegraphManager} telegraphManager 預警管理器
     * @param {Function} onAttack 命中回調
     * @param {Function} addLog 日誌回調
     */
    runSequence(monster, telegraphManager, onAttack, addLog) {
        const config = this.config.config;
        const groups = config.groups;
        if (!groups || groups.length < 2) return;

        // 1. 決定連擊參數
        const repeatCount = Math.floor(Math.random() * (config.repeat_max - config.repeat_min + 1)) + config.repeat_min;
        const mainIdx = Math.random() > 0.5 ? 0 : 1;
        const finalIdx = 1 - mainIdx;

        // 2. 構建動作序列
        const sequence = [];
        const colors = [0x00aaff, 0xaa00ff, 0xffaa00, 0x00ffaa]; // 為不同次數準備顏色
        for (let i = 0; i < repeatCount; i++) {
            sequence.push({ ...groups[mainIdx], color: colors[i % colors.length] });
        }
        // 最後一發追加沒被選中的類型
        sequence.push({ ...groups[finalIdx], color: 0xff0055 });

        // --- 核心修正：讀條與日誌僅在序列開始前執行一次 ---
        const totalDuration = this.config.cast_time || 5; 

        monster.activeCast = {
            name: `${repeatCount}${this.config.name}`,
            startTime: Date.now(),
            duration: totalDuration
        };

        if (addLog) addLog(`${monster.config.name} 開始施放 ${repeatCount}${this.config.name}`, "text-yellow-400");

        // 2. 呼叫動畫函式 (傳入 mainIdx 的方向)
        this._createWaveAnimation(monster, telegraphManager, totalDuration, groups[mainIdx].angle_start);

        // 3. 依序施放預警
        sequence.forEach((attackCfg, i) => {
            const interval = config.interval || 0.5;
            // 這裡的 delay 應從總讀條結束後開始計算，或根據您的需求與讀條同步
            // 假設 delay 是相對於技能開始的時間
            let delay = totalDuration + (i * interval);
            if (i === sequence.length - 1) {
                delay += 1.0;
            }

            setTimeout(() => {
                const targetAngle = (attackCfg.angle_start || 0) * (Math.PI / 180);

                const tempSkill = {
                    data: {
                        name: `${repeatCount}${this.config.name} (第 ${i + 1} 段)`,
                        type: "RectangleSkill",
                        cast_time: 0.1,
                        duration: this.config.duration || 0.5,
                        config: { 
                            width: attackCfg.width, 
                            height: attackCfg.height,
                            angle_start: attackCfg.angle_start,
                            color: attackCfg.color 
                        }
                    },
                    logic: this
                };

                telegraphManager.createTelegraph(tempSkill, monster.model.position, (_, pos, __, id) => {
                    onAttack(tempSkill, pos, targetAngle, id);
                }, []);
                
            }, delay * 1000);
        });
    }

    /**
     * 建立波浪方塊動畫
     */
    _createWaveAnimation(monster, telegraphManager, duration, angleDegrees) {
        const rad = (angleDegrees || 0) * (Math.PI / 180);
        const angle = rad * -1;
        const animGroup = new THREE.Group();
        const cols = 8;        // 增加列數以保持總長度
        const stackMax = 8;     
        const boxGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1); // 方塊大小改為 0.1
        const blocks = [];

        for (let c = 0; c < cols; c++) {
            for (let h = 0; h < stackMax; h++) {
                const boxMat = new THREE.MeshBasicMaterial({ 
                    color: new THREE.Color().setHSL(0.55, 0.8, 0.2 + (h / stackMax) * 0.5) 
                });
                const box = new THREE.Mesh(boxGeo, boxMat);
                
                // 間隔縮小：垂直 0.12, 水平 0.15
                box.position.set(0, h * 0.12, c * 0.15);
                
                animGroup.add(box);
                blocks.push({ mesh: box, col: c, heightIdx: h });
            }
        }

        // 計算起始位置偏移 (往 angle 方向移動 0.5)
        const offsetX = Math.sin(rad) * 0.5;
        const offsetZ = Math.cos(rad) * 0.5;

        animGroup.position.set(
            monster.model.position.x + offsetX,
            monster.model.position.y + 0.2,
            monster.model.position.z + offsetZ
        );
        
        animGroup.rotation.y = -angle;
        telegraphManager.scene.add(animGroup);

        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > duration) {
                telegraphManager.scene.remove(animGroup);
                blocks.forEach(b => b.mesh.material.dispose());
                boxGeo.dispose();
                return;
            }

            blocks.forEach(b => {
                const waveFactor = (Math.sin(elapsed * 12 - b.col * 0.6) + 1) / 2;
                const targetVisibleHeight = waveFactor * stackMax;

                b.mesh.visible = b.heightIdx < targetVisibleHeight;

                if (b.mesh.visible) {
                    const isTop = (b.heightIdx >= Math.floor(targetVisibleHeight));
                    b.mesh.scale.setScalar(isTop ? 0.7 + (targetVisibleHeight % 1) * 0.3 : 1);
                }
            });

            requestAnimationFrame(animate);
        };
        animate();
    }
}