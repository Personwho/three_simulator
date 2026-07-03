import * as THREE from 'three';

export class Character {
    pathIndex = 0; // 當前路徑索引
    isWaiting = false; // 是否正在停留
    waitTimeStart = 0; // 開始停留的時間

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

        const radius = 0.01; // 增加半徑，讓體積感更扎實
        const checkHeights = [0.1, 0.4, 0.8, 1.2, 1.6]; // 從腳底到頭頂多層偵測
        const horizontalRay = new THREE.Raycaster();
        const angles = [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3]; // 擴大偵測扇形

        for (const height of checkHeights) {
            for (const angle of angles) {
                const rayDir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).normalize();
                const origin = this.model.position.clone().add(new THREE.Vector3(0, height, 0));

                horizontalRay.set(origin, rayDir);
                horizontalRay.far = radius + distance + 0.05; // 偵測半徑加上位移量

                const hits = horizontalRay.intersectObjects(groundObjects, true);
                if (hits.length > 0) {
                    return hits[0];
                }
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
        // 1. 偵測地面狀態
        const rayOrigin = this.model.position.clone().add(new THREE.Vector3(0, 10, 0));
        this.raycaster.set(rayOrigin, this.downVector);
        this.raycaster.far = 15;
        const intersects = this.raycaster.intersectObjects(groundObjects, true); // 加上 true

        let currentGroundY = -Infinity;
        let isOnAnyGround = false;

        if (intersects.length > 0) {
            currentGroundY = intersects[0].point.y;
            isOnAnyGround = true;
        }

        const now = Date.now();
        // 判斷是否在地面上且已過跳躍冷卻時間 (300ms)
        const canJump = !this.isInAir &&
            isOnAnyGround &&
            Math.abs(this.model.position.y - currentGroundY) < 0.1 &&
            (now - this.lastLandTime) > 100;

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
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3().crossVectors(this.camera.up, forward).normalize();
        const moveDir = new THREE.Vector3(0, 0, 0);

        if (this.keys['w']) moveDir.add(forward);
        if (this.keys['s']) moveDir.sub(forward);
        if (this.keys['a']) moveDir.add(right);
        if (this.keys['d']) moveDir.sub(right);

        // 如果有按移動鍵，處理水平位移與旋轉
        if (moveDir.length() > 0) {
            moveDir.normalize();
            let moveStep = this.currentMoveSpeed * deltaTime;
            let finalVelocity = moveDir.clone().multiplyScalar(moveStep);

            // 第一次碰撞檢測
            let hit = this._getCollisionData(moveDir, moveStep, groundObjects);

            if (hit) {
                // --- 核心：滑動向量計算 ---
                // 取得撞擊面的法線 (世界座標)
                const normal = hit.face.normal.clone().applyQuaternion(hit.object.quaternion);
                normal.y = 0; // 穿牆檢測只處理水平分量
                normal.normalize();

                // 計算滑動方向：原方向減去在法線上的投影
                const dot = finalVelocity.dot(normal);
                finalVelocity.sub(normal.multiplyScalar(dot));

                // 第二次檢查：確保滑動後的方向不會撞進另一面牆（例如角落）
                if (finalVelocity.length() > 0.001) {
                    const secondHit = this._getCollisionData(finalVelocity.clone().normalize(), finalVelocity.length(), groundObjects);
                    if (secondHit) finalVelocity.set(0, 0, 0); // 在死角則停止
                }
            }

            this.model.position.add(finalVelocity);

            // 只有當真的有位移時才轉向
            if (finalVelocity.length() > 0.0001) {
                const targetRotation = Math.atan2(finalVelocity.x, finalVelocity.z) + Math.PI;
                this.model.rotation.y = targetRotation;
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
        // 宣告本地變量以修復 ReferenceError
        let currentGroundY = -Infinity;
        let isOnAnyGround = false;

        // 1. 處理跳躍上升時的頭部碰撞偵測 (天花板)
        // 如果正在向上跳，發射向上射線，防止直接穿過上方地基
        if (this.velocityY > 0) {
            const headRayOrigin = this.model.position.clone().add(new THREE.Vector3(0, 1.6, 0));
            this.raycaster.set(headRayOrigin, new THREE.Vector3(0, 1, 0));
            this.raycaster.far = 0.5;
            if (this.raycaster.intersectObjects(groundObjects, true).length > 0) {
                this.velocityY = 0;
            }
        }

        // 2. 修正向下偵測：將起點從 0.5 改為更接近腳底 (0.1)，減少「隔空吸附」
        const rayOrigin = this.model.position.clone().add(new THREE.Vector3(0, 0.5, 0)); // 從腰部往下射
        this.raycaster.set(rayOrigin, this.downVector);
        this.raycaster.far = 0.5;
        const intersects = this.raycaster.intersectObjects(groundObjects, true);

        if (intersects.length > 0) {
            currentGroundY = intersects[0].point.y;
            // 關鍵修改：只有當「地面高度」不超過「當前腳底高度 + 階梯寬度(0.3)」時，才判定為地板
            // 否則該物體被視為牆壁，不可站立
            if (currentGroundY <= this.model.position.y + 0.3) {
                isOnAnyGround = true;
            }
        }

        // 重力也改為基於時間 (gravity 原本是 -0.2/frame，若要每秒 9.8 則設為 -9.8)
        this.velocityY += this.gravity * deltaTime;
        this.model.position.y += this.velocityY * deltaTime;

        // 3. 落地判定優化
        if (isOnAnyGround && this.velocityY <= 0) {
            // 只有落差在合理範圍內才落地
            if (this.model.position.y <= currentGroundY + 0.1 && this.model.position.y >= currentGroundY - 0.5) {
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