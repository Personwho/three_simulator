import * as THREE from 'three';

export class Character {
    pathIndex = 0; // 當前路徑索引
    isWaiting = false; // 是否正在停留
    waitTimeStart = 0; // 開始停留的時間

    // 建立重複使用的運算物件，避免每一幀都 new
    static _tempVec = new THREE.Vector3();
    static _tempVec2 = new THREE.Vector3();
    static _tempRay = new THREE.Raycaster();
    static _upVec = new THREE.Vector3(0, 1, 0);

    constructor(model, camera, isPlayer = false, config = {}) {
        this.model = model;
        this.camera = camera;
        this.gravity = -9.8;
        this.velocityY = 0;
        this.isPlayer = isPlayer; // 標記是否為玩家
        this.lastLandTime = 0; // 新增：記錄上一次落地的時間
        this.isInAir = false;  // 新增：追蹤是否在空中
        this.onFall = null; // 掉落時的回呼函式

        this.keys = {};
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        this.horizontalRay = new THREE.Raycaster();

        window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
        window.addEventListener('blur', () => { this.keys = {}; });

        this.role = config.role; // T, H, D
        this.team = config.team; // A, B, C
        this.statusEffects = []; // { name, type, duration, value, isBuff, icon }
        this.baseMoveSpeed = config.moveSpeed || 1;
        this.currentMoveSpeed = this.baseMoveSpeed;

        if (config.rotation) {
            this.model.rotation.set(
                (config.rotation.x || 0) * (Math.PI / 180),
                (config.rotation.y || 0) * (Math.PI / 180),
                (config.rotation.z || 0) * (Math.PI / 180)
            );
        }
    }

    addStatusEffect(effect) {
        // 尋找是否已有同名狀態
        const existing = this.statusEffects.find(e => e.name === effect.name);

        if (existing) {
            // 如果已存在，僅更新開始時間（重新計時），不新增物件
            existing.startTime = Date.now();
            existing.duration = effect.duration; // 確保持續時間同步
            return;
        }

        // 不存在才新增
        this.statusEffects.push({ ...effect, startTime: Date.now() });
    }

    updateStatusEffects() {
        const now = Date.now();
        // 過濾掉時間已到的狀態
        this.statusEffects = this.statusEffects.filter(e => (now - e.startTime) < e.duration * 1000);

        let buffMultiplier = 1.0;
        this.statusEffects.filter(e => e.isBuff && e.type === 'speed').forEach(e => {
            buffMultiplier += (e.value - 1);
        });

        let debuffMultiplier = 1.0;
        const slowEffects = this.statusEffects.filter(e => !e.isBuff && e.type === 'slow');
        if (slowEffects.length > 0) {
            debuffMultiplier = Math.min(...slowEffects.map(e => e.value));
        }

        this.currentMoveSpeed = this.baseMoveSpeed * buffMultiplier * debuffMultiplier;
    }

    // 玩家移動
    moveByPlayer(controls, groundObjects, deltaTime) {
        if (!this.isPlayer || this.isRespawning) return;
        this._applyPhysicsAndInput(controls, groundObjects, deltaTime);
    }

    // 徹底解決：具備法線回傳的碰撞偵測
    _getCollisionData(direction, distance, groundObjects) {
        if (!groundObjects || groundObjects.length === 0) return null;

        const radius = 0.08; // 縮小半徑，使其更貼合模型紅框 (原本 0.25)
        const checkHeights = this.isInAir ? [0, 0.1, 0.8, 1.4] : [0.1, 0.8, 1.4];

        // 計算與移動方向垂直的向量，用於偏移射線起點
        const sideOffset = Character._tempVec2.crossVectors(Character._upVec, direction).normalize().multiplyScalar(radius * 0.7);

        // 定義三條平行射線：左、中、右
        const raystartOffsets = [
            new THREE.Vector3(0, 0, 0),
            sideOffset.clone(),
            sideOffset.clone().negate()
        ];

        for (const height of checkHeights) {
            for (const offset of raystartOffsets) {
                Character._tempVec.copy(this.model.position).add(offset);
                Character._tempVec.y += height;

                this.horizontalRay.set(Character._tempVec, direction);

                // 修正：射線長度微調。原本 radius + distance 太敏感。
                // 改為 radius + (distance * 0.5)，讓角色能更貼近牆面。
                this.horizontalRay.far = radius + (distance * 0.5);

                const hits = this.horizontalRay.intersectObjects(groundObjects, true);
                if (hits.length > 0) return hits[0];
            }
        }
        return null;
    }

    // NPC 路徑移動
    moveByPath(pathArray, groundObjects, deltaTime) {
        if (this.isPlayer || this.isRespawning || !pathArray || pathArray.length === 0) return;

        // 如果已經抵達最後一個點且結束停留，則只處理物理並返回
        if (this.isPathFinished) {
            this._handlePhysics(null, groundObjects, deltaTime);
            return;
        }

        const target = pathArray[this.pathIndex];

        // 從路徑節點讀取 rotation (0~359)，若未定義則為 null
        let customRotationY = null;
        if (target.rotation !== undefined && target.rotation !== null) {
            // 換算邏輯：0->+Z(PI), 90->+X(1.5PI), 180->-Z(0), 270->-X(0.5PI)
            customRotationY = ((180 + (target.rotation % 360 + 360) % 360) % 360) * (Math.PI / 180);
        }

        // 如果正在停留中
        if (this.isWaiting) {
            const elapsed = (Date.now() - this.waitTimeStart) / 1000;
            if (elapsed >= (target.stay || 0)) {
                this.isWaiting = false;
                if (this.pathIndex < pathArray.length - 1) {
                    this.pathIndex++;
                } else {
                    this.isPathFinished = true;
                }
            }

            // 停留時套用該節點指定的「最終絕對面向」
            if (target.rotation) {
                this.model.rotation.set(
                    (target.rotation.x || 0) * (Math.PI / 180),
                    (target.rotation.y || 0) * (Math.PI / 180),
                    (target.rotation.z || 0) * (Math.PI / 180)
                );
            }

            this._handlePhysics(null, groundObjects, deltaTime);
            return;
        }

        // 使用新的 target.position 結構
        const targetPos = target.position || { x: 0, y: 0, z: 0 };
        const targetVec = new THREE.Vector3(targetPos.x, this.model.position.y, targetPos.z);
        const direction = new THREE.Vector3().subVectors(targetVec, this.model.position);
        const distance = direction.length();

        if (distance > 0.1) {
            direction.normalize();
            const moveStep = Math.min(this.currentMoveSpeed * deltaTime, distance);

            this.model.position.add(direction.clone().multiplyScalar(moveStep));

            // 更新轉向
            const moveRotationY = Math.atan2(direction.x, direction.z) + Math.PI;
            this.model.rotation.y = moveRotationY;
        } else {
            // 抵達節點
            if (target.stay > 0) {
                this.isWaiting = true;
                this.waitTimeStart = Date.now();
            } else {
                if (this.pathIndex < pathArray.length - 1) {
                    this.pathIndex++;
                } else {
                    this.isPathFinished = true;
                }
            }

            // 抵達瞬間：強制校準為 JSON 指定的「最終絕對面向」 (X, Y, Z)
            if (target.rotation) {
                this.model.rotation.set(
                    (target.rotation.x || 0) * (Math.PI / 180),
                    (target.rotation.y || 0) * (Math.PI / 180),
                    (target.rotation.z || 0) * (Math.PI / 180)
                );
            }
        }

        this._handlePhysics(null, groundObjects, deltaTime);
    }

    // 內部的物理與鍵盤處理 (僅限玩家)
    _applyPhysicsAndInput(controls, groundObjects, deltaTime) {
        // 使用本地變數複用，減少分配
        const pos = this.model.position;

        // 1. 偵測地面高度 (優化射線點)
        Character._tempVec.copy(pos).y += 0.1; // 從角色中心點往下射
        this.raycaster.set(Character._tempVec, this.downVector);
        this.raycaster.far = 2.0;
        const intersects = this.raycaster.intersectObjects(groundObjects, true);

        let currentGroundY = -Infinity;
        let isOnAnyGround = false;

        if (intersects.length > 0) {
            currentGroundY = intersects[0].point.y;
            // 只要落差不超過 0.5 (可跨越高度)，就視為地板
            if (currentGroundY <= pos.y + 0.5) isOnAnyGround = true;
        }

        const now = Date.now();
        const canJump = !this.isInAir && isOnAnyGround && (now - this.lastLandTime) > 100;

        // 處理相機旋轉 (方向鍵功能同滑鼠右鍵) ---
        if (controls) {
            const rotSpeed = 2.5 * deltaTime; // 旋轉速度
            let needsUpdate = false;

            if (this.keys['arrowleft']) {
                // 向左旋轉 (內部減少 theta)
                controls.rotateLeft(-rotSpeed);
                needsUpdate = true;
            }
            if (this.keys['arrowright']) {
                // 向右旋轉 (內部增加 theta)
                controls.rotateLeft(rotSpeed);
                needsUpdate = true;
            }
            if (this.keys['arrowup']) {
                // 向上仰視 (內部減少 phi)
                controls.rotateUp(-rotSpeed);
                needsUpdate = true;
            }
            if (this.keys['arrowdown']) {
                // 向下俯視 (內部增加 phi)
                controls.rotateUp(rotSpeed);
                needsUpdate = true;
            }

            if (needsUpdate) {
                controls.update(); // 立即更新控制器狀態
            }
        }

        // 處理平面移動 (WASD)
        const forward = Character._tempVec; // 複用
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = Character._tempVec2.crossVectors(this.camera.up, forward).normalize();
        const moveDir = new THREE.Vector3(0, 0, 0);

        if (this.keys['w']) moveDir.add(forward);
        if (this.keys['s']) moveDir.sub(forward);
        if (this.keys['a']) moveDir.add(right);
        if (this.keys['d']) moveDir.sub(right);

        // 如果有按移動鍵，處理水平位移與旋轉
        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();
            let moveStep = this.currentMoveSpeed * deltaTime;
            let hit = this._getCollisionData(moveDir, moveStep, groundObjects);

            if (hit) {
                // 優化滑動邏輯 (Sliding)
                const normal = hit.face.normal.clone().applyQuaternion(hit.object.quaternion);
                normal.y = 0;
                normal.normalize();

                // 計算投影並扣除，得到平行於牆面的分量
                const dot = moveDir.dot(normal);
                moveDir.sub(normal.multiplyScalar(dot));

                // 再次檢查滑動方向是否可行
                if (moveDir.lengthSq() > 0.0001) {
                    moveDir.normalize();
                    const secondHit = this._getCollisionData(moveDir, moveStep, groundObjects);
                    if (!secondHit) pos.add(moveDir.multiplyScalar(moveStep));
                }
            } else {
                pos.add(moveDir.multiplyScalar(moveStep));
            }

            // 更新轉向 (避免頻繁運算 Math.atan2)
            if (moveDir.lengthSq() > 0.0001) {
                this.model.rotation.y = Math.atan2(moveDir.x, moveDir.z) + Math.PI;
            }
        }

        // 處理跳躍
        if (this.keys[' '] && canJump) {
            this.velocityY = 3.3; // 稍微增加一點跳躍力，避免跳不起來
            this.isInAir = true; // 立即標記進入空中
            this.lastLandTime = 0; // 重置落地時間，防止在空中連跳
        }

        // 2. 套用重力與碰撞修正 (原本的 _handlePhysics 會處理上升與下降)
        this._handlePhysics(controls, groundObjects, deltaTime);
    }

    // 核心物理引擎：處理重力與重生
    _handlePhysics(controls, groundObjects, deltaTime) {
        let currentGroundY = -Infinity;
        let isOnAnyGround = false;

        // 模擬圓柱體底面：中心點 + 圓周上 8 個偵測點
        const footRadius = 0.08; // 圓柱半徑
        const downCheckPoints = [new THREE.Vector3(0, 0.3, 0)]; // 中心點

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            downCheckPoints.push(new THREE.Vector3(
                Math.cos(angle) * footRadius,
                0.5,
                Math.sin(angle) * footRadius
            ));
        }

        for (const pt of downCheckPoints) {
            // 使用靜態變數優化，避免頻繁建立 Vector3
            const rayOrigin = Character._tempVec.copy(this.model.position).add(pt);
            this.raycaster.set(rayOrigin, this.downVector);
            this.raycaster.far = 0.8;
            const intersects = this.raycaster.intersectObjects(groundObjects, true);

            if (intersects.length > 0) {
                const hitY = intersects[0].point.y;
                // 只要偵測點高度在合理範圍內 (階梯高度 0.3)
                if (hitY <= this.model.position.y + 0.3) {
                    currentGroundY = Math.max(currentGroundY, hitY);
                    isOnAnyGround = true;
                }
            }
        }

        // 重力也改為基於時間 (gravity 原本是 -0.2/frame，若要每秒 9.8 則設為 -9.8)
        this.velocityY += this.gravity * deltaTime;
        this.model.position.y += this.velocityY * deltaTime;

        // 3. 落地判定優化
        if (isOnAnyGround && this.velocityY <= 0) {
            // 只有落差在合理範圍內才落地
            if (this.model.position.y <= currentGroundY + 0.01 && this.model.position.y >= currentGroundY - 0.05) {
                // 只有從空中落下的那一瞬間才更新時間戳
                if (this.isInAir) {
                    this.lastLandTime = Date.now();
                    this.isInAir = false;
                }
                this.model.position.y = currentGroundY;
                this.velocityY = 0;
            }
        }

        // 掉落判定：當高度低於 0 (掉出場外) 且定義了回呼
        if (this.model.position.y <= 0) {
            if (typeof this.onFall === 'function') {
                this.onFall();
            }
        }

        // // 掉落重生
        // if (this.model.position.y <= 0 && !this.isRespawning) {
        //     this.isRespawning = true;
        //     setTimeout(() => {
        //         this.model.position.set(0, 50, 0);
        //         this.model.rotation.set(0, 0, 0);
        //         this.velocityY = 0;

        //         if (this.isPlayer && controls) {
        //             this.camera.position.set(0, 53, 4);
        //             controls.target.copy(this.model.position);
        //             controls.update();
        //         }
        //         this.isRespawning = false;
        //     }, 3000);
        // }
    }
}