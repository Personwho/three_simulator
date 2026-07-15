import * as THREE from 'three';
import { SkillFactory } from './skills/SkillFactory.js';
import { gameLog } from './GameLog.js';

export class Monster {
    constructor(model, config, clock, rng) {
        this.model = model;
        this.config = config;
        this.clock = clock;
        this.rng = rng;
        // 虛擬排程佇列，取代真實 setTimeout，讓技能時間軸可以被快轉同步重演
        this.scheduledTasks = [];
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

        // 新增：初始化腳下目標圈
        this._setupTargetRing(config.hitbox_radius || 1);

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
        this.model.name = this.config.name || "monster";
    }

    // 虛擬排程：以模擬時鐘（而非真實時間）決定何時觸發，讓快轉重演時序完全一致
    setTimeout(fn, delayMs) {
        this.scheduledTasks.push({ fireAt: this.clock.now() + delayMs, fn });
    }

    _processScheduledTasks() {
        const now = this.clock.now();
        const due = this.scheduledTasks.filter(t => t.fireAt <= now);
        if (due.length === 0) return;
        this.scheduledTasks = this.scheduledTasks.filter(t => t.fireAt > now);
        due.sort((a, b) => a.fireAt - b.fireAt);
        due.forEach(t => t.fn());
    }

    _setupTargetRing(outerRadius) {
        const innerRadius = outerRadius - 0.1;
        const ringGroup = new THREE.Group();
        ringGroup.position.y = 0.01;

        const createRing = (radius, thetaStart, thetaLength) => {
            const geometry = new THREE.RingGeometry(
                radius - 0.01,
                radius + 0.01,
                64, 1,
                thetaStart,
                thetaLength
            );
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = Math.PI / 2;
            return mesh;
        };

        const outerRing = createRing(outerRadius, (Math.PI * 3) / 4, Math.PI * 1.5);
        const innerRing = createRing(innerRadius, (Math.PI * 145) / 180, (Math.PI * 250) / 180);

        // 建立小三角形箭頭
        const arrowSize = 0.2;
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, arrowSize);
        arrowShape.lineTo(-arrowSize / 1.5, -arrowSize);
        arrowShape.lineTo(arrowSize / 1.5, -arrowSize);
        arrowShape.lineTo(0, arrowSize);

        const arrowGeom = new THREE.ShapeGeometry(arrowShape);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const arrowHead = new THREE.Mesh(arrowGeom, arrowMat);

        // 修正：將箭頭位置移動到 -Z 方向，並旋轉指向 -Z
        arrowHead.rotation.x = -Math.PI / 2;
        arrowHead.position.z = -outerRadius; // 從 +outerRadius 改為 -outerRadius
        arrowHead.rotation.z = Math.PI * 2;      // 旋轉 180 度讓尖端指向前方 (-Z)

        ringGroup.add(outerRing);
        ringGroup.add(innerRing);
        ringGroup.add(arrowHead);

        this.model.add(ringGroup);
    }

    update(elapsedTime, isGameRunning, telegraphManager, onAttack, allCharacters) {
        if (!this.spawned && isGameRunning && elapsedTime >= (this.config.spawn_time || 0)) {
            this.spawned = true;
            this.model.visible = true;
        }

        if (isGameRunning && this.spawned) {
            this._processScheduledTasks();

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
                const other = skill.data.other || {};
                if (!skill.triggered && elapsedTime >= (other.time || 0)) {
                    skill.triggered = true;
                    this._executeSingleSkill(skill, telegraphManager, onAttack, allCharacters);
                }
            });
        }
    }

    reset() {
        this.scheduledTasks = [];

        this.spawned = (this.config.spawn_time || 0) <= 0;
        this.model.visible = this.spawned;
        this.model.position.set(this.config.position.x, this.config.position.y, this.config.position.z);

        // 新增：重置旋轉面向
        if (this.config.rotation) {
            this.model.rotation.set(
                (this.config.rotation.x || 0) * (Math.PI / 180),
                (this.config.rotation.y || 0) * (Math.PI / 180),
                (this.config.rotation.z || 0) * (Math.PI / 180)
            );
        } else {
            this.model.rotation.set(0, 0, 0);
        }

        // 修正：重置正確的移動狀態變數名稱
        this.currentPathIndex = -1;
        this.isMoving = false;
        this.moveStartTime = 0;

        // 修正：必須重置技能的觸發狀態，否則第二次開始技能不會放
        this.skills.forEach(skill => {
            skill.triggered = false;
        });
    }

    /**
     * 處理隨機不重複的技能序列 (例如 A->B 或 B->A)
     */
    _handleShuffledSequence(skillData, telegraphManager, onAttack, allCharacters) {
        const other = skillData.other || {};
        const subSkills = [...other.skills];
        const times = other.times;

        // 隨機打亂技能順序
        for (let i = subSkills.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng() * (i + 1));
            [subSkills[i], subSkills[j]] = [subSkills[j], subSkills[i]];
        }

        // 依照打亂後的順序分配到指定時間點
        subSkills.forEach((subData, i) => {
            const triggerTime = times[i];
            const delaySec = triggerTime - (other.time || 0);

            this.setTimeout(() => {
                const skillInstance = {
                    data: subData,
                    logic: SkillFactory.create(subData)
                };
                this._executeSingleSkill(skillInstance, telegraphManager, onAttack, allCharacters);
            }, delaySec * 1000);
        });
    }

    /**
     * 內部輔助：執行單個技能的邏輯 (抽離出來以便複用)
     */
    _executeSingleSkill(skill, telegraphManager, onAttack, allCharacters) {
        const data = skill.data;
        const other = data.other || {};

        // 1. 處理特殊模式 (Dispatching)
        if (data.pattern === "shuffled_sequence") {
            this._handleShuffledSequence(data, telegraphManager, onAttack, allCharacters);
            return;
        }
        if (data.pattern === "random_single") {
            this._handleRandomSingle(data, telegraphManager, onAttack, allCharacters);
            return;
        }

        // 2. 處理序列型/複雜邏輯技能
        if (skill.logic.runSequence) {
            skill.logic.runSequence(this, telegraphManager, onAttack, allCharacters);
            return;
        }

        // 3. 標準施放程序 (日誌與讀條)
        if (!other.no_log) {
            gameLog.add(`${this.config.name} ${other.cast_time > 0 ? '開始讀條' : '施放'}: ${data.name}`, "text-yellow-100 opacity-80", this.clock.now());
        }

        if (other.cast_time > 0) {
            this.activeCast = {
                name: data.name,
                startTime: this.clock.now(),
                duration: other.cast_time
            };
        }

        // 4. 目標選取
        let targets = [];
        if (other.targets && Array.isArray(other.targets)) {
            other.targets.forEach(group => {
                const candidates = allCharacters.filter(c =>
                    Array.isArray(group.role) ? group.role.includes(c.role) : c.role === group.role
                );
                const count = parseInt(group.count) || 1;
                const selected = candidates.sort(() => 0.5 - this.rng()).slice(0, count);
                targets.push(...selected);
            });
        }

        // 5. 決定位置並產生預警
        const targetPos = other.position || {
            x: this.model.position.x,
            y: this.model.position.y,
            z: this.model.position.z
        };

        if (targets.length > 0) {
            targets.forEach(t => telegraphManager.createTelegraph(skill, targetPos, onAttack, [t]));
        } else {
            telegraphManager.createTelegraph(skill, targetPos, onAttack, []);
        }
    }

    /**
     * 處理隨機抽一個技能施放
     */
    _handleRandomSingle(skillData, telegraphManager, onAttack, allCharacters) {
        const other = skillData.other || {};
        if (!other.skills || other.skills.length === 0) return;

        // 從清單中隨機挑選一個索引
        const randomIndex = Math.floor(this.rng() * other.skills.length);
        const subData = other.skills[randomIndex];

        const skillInstance = {
            data: subData,
            logic: SkillFactory.create(subData)
        };

        // 立即執行選中的技能
        this._executeSingleSkill(skillInstance, telegraphManager, onAttack, allCharacters);
    }
}
