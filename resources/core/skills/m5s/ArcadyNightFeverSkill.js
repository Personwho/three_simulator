import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';
import { gameLog } from '../../GameLog.js';

export class ArcadyNightFeverSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }

    // ── 建立 3D 預警/攻擊 Mesh（扇形，與 ConeSkill 同形狀）───────────
    _buildMesh(shape, defaultColor) {
        const radius = shape.radius || 5;
        const angle = (shape.angle || 90) * (Math.PI / 180);
        const opacity = (shape.opacity !== undefined) ? shape.opacity : 0.5;

        // 核心修正：將 thetaStart 設為 (Math.PI/2 - angle/2)，使扇形中軸對準幾何座標的 Y 軸
        const geometry = new THREE.CircleGeometry(radius, 32, Math.PI / 2 * 3 - angle / 2, angle);
        const material = new THREE.MeshBasicMaterial({
            color: (shape.color !== undefined) ? shape.color : defaultColor,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        return new THREE.Mesh(geometry, material);
    }

    createPreAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.preShape(skillData), 0xffa500);
    }

    createAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.attackShape(skillData), 0xff0000);
    }

    // 更新：扇形判定需要知道攻擊者的朝向 (rotation)
    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const shape = BaseSkill.attackShape(skillData);
        const radius = shape.radius || 5;
        const angleLimit = (shape.angle || 90) * (Math.PI / 180) / 2;

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
    runSequence(monster, telegraphManager, onAttack, allCharacters) {
        const other = this.other;
        const castTime = (other.cast_time || 4) * 1000;
        const interval = (other.interval || 2.5) * 1000;
        const hitDur = other.duration || 0.5;
        const angle = other.angle || 45;

        // 1. 分組並亂序玩家清單，確保 8 人不重複且職能組交替
        const thGroup = allCharacters.filter(c => ['T', 'H'].includes(c.role));
        const dpsGroup = allCharacters.filter(c => ['rD', 'mD'].includes(c.role));

        const shuffle = arr => {
            const copy = [...arr];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(monster.rng() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        };
        const thShuffled = shuffle(thGroup);
        const dpsShuffled = shuffle(dpsGroup);

        const thFirst = monster.rng() < 0.5;
        const targets = [];
        for (let i = 0; i < 4; i++) {
            if (thFirst) {
                targets.push(thShuffled[i], dpsShuffled[i]);
            } else {
                targets.push(dpsShuffled[i], thShuffled[i]);
            }
        }

        // 2. 音頻炸彈 a 與 b 賦予時間表
        const firstIsA = monster.rng() < 0.5;
        const durations = firstIsA
            ? [40.5, 43, 25.5, 28, 25.5, 18, 30.5, 23]
            : [45.5, 38, 30.5, 23, 20.5, 23, 25.5, 28];

        if (!other.no_log) gameLog.add(`${monster.config.name} 開始引導: ${this.data.name}`, "text-yellow-400 font-bold", monster.clock.now());

        monster.activeCast = {
            name: this.data.name,
            startTime: monster.clock.now(),
            duration: other.cast_time || 4
        };

        // 記錄每一次瞄準目標時，該目標的「當時位置座標」，以便下一次進行「定格重播」
        const targetPositions = [];

        // 音頻炸彈 a/b 各自的站位表：依「獲得該種 debuff 的順序」（第 1、2、3、4 位）對應站位。
        // 移動要等全部扇形攻擊都執行完才進行，因此先記錄下來，最後再統一下達移動指令。
        const bombAPositions = other.bomb_a_positions || [];
        const bombBPositions = other.bomb_b_positions || [];
        let bombACount = 0;
        let bombBCount = 0;
        const pendingMoves = [];

        // 3. 連續施放 9 步，間隔 2.5s
        for (let step = 0; step < 9; step++) {
            const triggerDelay = castTime + step * interval;
            const target = targets[step];
            const debuffName = firstIsA
                ? (step % 2 === 0 ? "音頻炸彈a" : "音頻炸彈b")
                : (step % 2 === 0 ? "音頻炸彈b" : "音頻炸彈a");
            const debuffIcon = firstIsA
                ? (step % 2 === 0 ? "assets/icons/音頻炸彈a.webp" : "assets/icons/音頻炸彈b.webp")
                : (step % 2 === 0 ? "assets/icons/音頻炸彈b.webp" : "assets/icons/音頻炸彈a.webp");

            const debuffTime = durations[step];

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
                    }, monster.clock.now());

                    if (!other.no_log) {
                        gameLog.add(`[點名] ${target.name} 獲得 ${debuffName} (${debuffTime}s)`, "text-purple-300", monster.clock.now());
                    }

                    // 依「拿到該種 debuff 的順序」記錄站位，先不移動，等全部扇形攻擊結束後再一起走位
                    if (debuffName === "音頻炸彈a") {
                        const movePos = bombAPositions[bombACount];
                        bombACount++;
                        if (movePos) pendingMoves.push({ target, position: movePos });
                    } else {
                        const movePos = bombBPositions[bombBCount];
                        bombBCount++;
                        if (movePos) pendingMoves.push({ target, position: movePos });
                    }

                    // B. [鎖定新目標] 的 45度 扇形預警
                    const primaryCone = {
                        data: {
                            name: `扇形 (隨機 - ${target.name})`,
                            type: "ConeSkill",
                            other: { cast_time: 0, duration: hitDur, target_opacity: 0 },
                            pre_attack: { angle: angle, radius: 15, opacity: 0 },
                            attack: { angle: angle, radius: 15, color: 0xff0000 }
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
                                name: `扇形 (重複 - ${targets[step - 1].name})`,
                                type: "ConeSkill",
                                other: { cast_time: 0, duration: hitDur, target_opacity: 0 },
                                pre_attack: { angle: angle, radius: 15, opacity: 0 },
                                attack: { angle: angle, radius: 15, color: 0xff0000 }
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

        // 全部扇形攻擊（含最後一次定格重播）都執行完之後，才統一下達移動指令
        const lastStep = 8;
        const sequenceEndDelay = castTime + lastStep * interval + hitDur * 1000;
        monster.setTimeout(() => {
            pendingMoves.forEach(({ target, position }) => target.setMoveTarget(position));
        }, sequenceEndDelay);
    }
}
