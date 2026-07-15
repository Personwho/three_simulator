import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';

export class ArcadyNightFeverSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }

    // ── 建立 3D 預警 Mesh ───────────────────────────
    createTelegraphMesh(skillData) {
        const radius = skillData.config?.radius || 5;
        const angle = (skillData.config?.angle || 90) * (Math.PI / 180);
        const opacity = (skillData.opacity !== undefined) ? skillData.opacity : 0.5;

        // 核心修正：將 thetaStart 設為 (Math.PI/2 - angle/2)，使扇形中軸對準幾何座標的 Y 軸
        const geometry = new THREE.CircleGeometry(radius, 32, Math.PI / 2 * 3 - angle / 2, angle);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffa500,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        const mesh = new THREE.Mesh(geometry, material);

        return mesh;
    }

    // 更新：扇形判定需要知道攻擊者的朝向 (rotation)
    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const radius = skillData.config?.radius || 5;
        const angleLimit = (skillData.config?.angle || 90) * (Math.PI / 180) / 2;

        const dx = charPos.x - attackPos.x;
        const dz = charPos.z - attackPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > radius) return false;

        // 修正：計算目標相對於攻擊者的角度，與 lookAt 的 Z 軸方向一致
        const targetAngle = Math.atan2(dx, dz);

        // 修正：夾角計算邏輯
        let diff = targetAngle - attackRotationY;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        return Math.abs(diff) <= angleLimit;
    }

    // ── 主序列邏輯 (移除 DonutSkill，修改重複攻擊為靜態定位) ──────────────────────────────
    runSequence(monster, telegraphManager, onAttack, allCharacters, addLog) {
        const cfg      = this.data.config || {};
        const castTime = (this.data.cast_time || 4) * 1000;
        const interval = (cfg.interval || 2.5) * 1000;
        const hitDur   = cfg.duration || 0.5;
        const angle = cfg.angle || 45

        // 1. 分組並亂序玩家清單，確保 8 人不重複且職能組交替
        const thGroup  = allCharacters.filter(c => ['T', 'H'].includes(c.role));
        const dpsGroup = allCharacters.filter(c => ['rD', 'mD'].includes(c.role));

        const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
        const thShuffled  = shuffle(thGroup);
        const dpsShuffled = shuffle(dpsGroup);

        const thFirst = Math.random() < 0.5;
        const targets = [];
        for (let i = 0; i < 4; i++) {
            if (thFirst) {
                targets.push(thShuffled[i], dpsShuffled[i]);
            } else {
                targets.push(dpsShuffled[i], thShuffled[i]);
            }
        }

        // 2. 音頻炸彈 a 與 b 賦予時間表
        const firstIsA = Math.random() < 0.5;
        const durations = firstIsA
            ? [40.5, 43, 25.5, 28, 25.5, 18, 30.5, 23]
            : [45.5, 38, 30.5, 23, 20.5, 23, 25.5, 28];

        if (!this.data.no_log) addLog(`${monster.config.name} 開始引導: ${this.data.name}`, "text-yellow-400 font-bold");
        
        monster.activeCast = {
            name: this.data.name,
            startTime: Date.now(),
            duration: this.data.cast_time
        };

        // 記錄每一次瞄準目標時，該目標的「當時位置座標」，以便下一次進行「定格重播」
        const targetPositions = [];

        // 3. 連續施放 9 步，間隔 2.5s
        for (let step = 0; step < 9; step++) {
            const triggerDelay = castTime + step * interval;
            const target       = targets[step];
            const debuffName   = firstIsA
                ? (step % 2 === 0 ? "音頻炸彈a" : "音頻炸彈b")
                : (step % 2 === 0 ? "音頻炸彈b" : "音頻炸彈a");
            const debuffIcon   = firstIsA
                ? (step % 2 === 0 ? "assets/icons/音頻炸彈a.webp" : "assets/icons/音頻炸彈b.webp")
                : (step % 2 === 0 ? "assets/icons/音頻炸彈b.webp" : "assets/icons/音頻炸彈a.webp");
            
            const debuffTime   = durations[step];

            monster.setTimeout(() => {
                if (!monster.spawned) return;

                // A. 分配選定目標 Debuff
                if (target) {
                    // 關鍵：在瞄準當下，立刻拷貝目標此時的 3D 座標，用於下一次的定格重播
                    const capturedPos = target.model.position.clone();
                    targetPositions[step] = capturedPos;
                    const dx = capturedPos.x - monster.model.position.x;
                    const dz = capturedPos.z - monster.model.position.z;
                    const targetAngle = Math.atan2(dx, dz);

                    target.addStatusEffect({
                        name: debuffName,
                        icon: debuffIcon,
                        duration: debuffTime,
                        isBuff: false
                    });
                    
                    if (!this.data.no_log) {
                        addLog(`[點名] ${target.name} 獲得 ${debuffName} (${debuffTime}s)`, "text-purple-300");
                    }

                    // B. [鎖定新目標] 的 45度 扇形預警
                    const primaryCone = {
                        data: {
                            name: `節奏扇形 (鎖定 - ${target.name})`,
                            type: "ConeSkill",
                            cast_time: 0,
                            duration: hitDur,
                            opacity: 0,
                            config: {
                                angle: angle,
                                radius: 15,
                                active_color: 0xff0000,
                                target_opacity: 0
                            }
                        },
                        logic: this
                    };
                    telegraphManager.createTelegraph(
                        primaryCone,
                        monster.model.position,
                        (data, pos, rot, id) => {
                            onAttack(primaryCone, pos, rot, id);
                        },
                        [target] // 傳入目標：使其具備頭頂指標且預警區會追隨目標移動
                    );

                    // 取得剛剛生成的最新預警，手動將其轉向並定格至當前目標座標的方向
                    const entries = telegraphManager.activeTelegraphs;
                    const lastEntry = entries[entries.length - 1];
                    if (lastEntry) {
                        lastEntry.targetRotationY = targetAngle;
                        lastEntry.mesh.rotation.set(0, 0, 0);
                        lastEntry.mesh.lookAt(capturedPos.x, lastEntry.mesh.position.y, capturedPos.z);
                        lastEntry.mesh.rotateX(-Math.PI / 2); // 保持貼地
                    }
                }

                // C. [重複上一次扇形] ──── 改為「定格攻擊上一次鎖定位置」 ────
                if (step > 0) {
                    const prevPos = targetPositions[step - 1];
                    if (prevPos) {
                        // 計算從 Boss 指向上一次目標當時座標的鎖定角度
                        const dx = prevPos.x - monster.model.position.x;
                        const dz = prevPos.z - monster.model.position.z;
                        const duplicateAngle = Math.atan2(dx, dz);

                        const duplicateCone = {
                            data: {
                                name: `節奏扇形 (播放 - ${targets[step - 1].name})`,
                                type: "ConeSkill",
                                cast_time: 0,
                                duration: hitDur,
                                opacity: 0,
                                config: {
                                    angle: angle,
                                    radius: 15,
                                    active_color: 0xff0000,
                                    target_opacity: 0
                                }
                            },
                            logic: this
                        };

                        // 關鍵：傳入 targets: [] (不傳prevTarget)，使其不進行動態追蹤
                        telegraphManager.createTelegraph(
                            duplicateCone,
                            monster.model.position,
                            (data, pos, rot, id) => {
                                onAttack(duplicateCone, pos, rot, id);
                            },
                            [] 
                        );

                        // 取得剛剛生成的最新預警，手動將其轉向並定格至上個座標的方向
                        const entries = telegraphManager.activeTelegraphs;
                        const lastEntry = entries[entries.length - 1];
                        if (lastEntry) {
                            lastEntry.targetRotationY = duplicateAngle;
                            lastEntry.mesh.rotation.set(0, 0, 0);
                            lastEntry.mesh.lookAt(prevPos.x, lastEntry.mesh.position.y, prevPos.z);
                            lastEntry.mesh.rotateX(-Math.PI / 2); // 保持貼地
                        }
                    }
                }
            }, triggerDelay);
        }
    }
}