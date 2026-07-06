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

                    // 設定讀條資訊供 UI 顯示
                    if (skill.data.cast_time > 0) {
                        this.activeCast = {
                            name: skill.data.name,
                            startTime: Date.now(),
                            duration: skill.data.cast_time
                        };
                    }

                    // 1. 角色篩選與選取邏輯
                    let targets = [];
                    const cfg = skill.data.config;
                    if (cfg && cfg.target_role) {
                        const candidates = allCharacters.filter(c => c.role === cfg.target_role);
                        const count = cfg.target_count || 1;
                        // 隨機洗牌抽籤
                        targets = candidates.sort(() => 0.5 - Math.random()).slice(0, count);
                    }

                    // 修正點：優先讀取 JSON 中定義的 position，若無才使用怪物目前的座標
                    const targetPos = (cfg && cfg.position) ?
                        { x: cfg.position.x, y: cfg.position.y, z: cfg.position.z } :
                        { x: this.model.position.x, y: this.model.position.y, z: this.model.position.z };

                    // --- 核心修正：如果有多個目標，為每個目標獨立產生一個預警區 ---
                    if (targets.length > 0) {
                        targets.forEach(t => {
                            // 每個預警區只追蹤一個特定目標 [t]
                            telegraphManager.createTelegraph(skill, targetPos, onAttack, [t]);
                        });
                    } else {
                        // 若無目標（例如圓形 AOE），則產生一個不帶目標的預警區
                        telegraphManager.createTelegraph(skill, targetPos, onAttack, []);
                    }
                }
            });
        }
    }

    reset() {
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
}