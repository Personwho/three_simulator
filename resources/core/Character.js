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
        this.onFall = null; // 掉落時的回呼函式

        this.keys = {};
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);

        window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
        window.addEventListener('blur', () => { this.keys = {}; });

        this.role = config.role; // T, H, D
        this.team = config.team; // A, B, C
        this.statusEffects = []; // { name, type, duration, value }
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
        this.statusEffects.push({ ...effect, startTime: Date.now() });
    }

    updateStatusEffects(deltaTime) {
        const now = Date.now();
        this.statusEffects = this.statusEffects.filter(e => (now - e.startTime) < e.duration * 1000);

        // 範例：處理減速效果
        const slow = this.statusEffects.find(e => e.type === 'slow');
        this.currentMoveSpeed = slow ? this.baseMoveSpeed * slow.value : this.baseMoveSpeed;
    }

    // 玩家移動
    moveByPlayer(controls, groundObjects, deltaTime) {
        if (!this.isPlayer || this.isRespawning) return;
        this._applyPhysicsAndInput(controls, groundObjects, deltaTime);
        console.log(`Player Position: (${this.model.position.x.toFixed(2)}, ${this.model.position.y.toFixed(2)}, ${this.model.position.z.toFixed(2)})`);
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
        const currentVec = this.model.position.clone();
        const direction = new THREE.Vector3().subVectors(targetVec, currentVec);
        const distance = direction.length();

        if (distance > 0.1) {
            direction.normalize();
            const moveStep = Math.min(this.currentMoveSpeed * deltaTime, distance);
            this.model.position.add(direction.multiplyScalar(moveStep));

            // 移動中時：自動朝向移動方向 (Y軸)
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
        const intersects = this.raycaster.intersectObjects(groundObjects);

        let currentGroundY = -Infinity;
        let isOnAnyGround = false;

        if (intersects.length > 0) {
            currentGroundY = intersects[0].point.y;
            isOnAnyGround = true;
        }

        // 判斷是否在地面上 (容許誤差 0.1)
        const canJump = isOnAnyGround && Math.abs(this.model.position.y - currentGroundY) < 0.1;

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
            moveDir.normalize().multiplyScalar(this.currentMoveSpeed * deltaTime);
            this.model.position.add(moveDir);
            const targetRotation = Math.atan2(moveDir.x, moveDir.z) + Math.PI;
            this.model.rotation.y = targetRotation;
        }

        // 處理跳躍 (Space): 只有在地面上才允許跳躍
        if (this.keys[' '] && canJump) {
            this.velocityY = 3.0; // 給予垂直向上的初速度，數值可依手感調整
        }

        // 2. 套用重力與碰撞修正 (原本的 _handlePhysics 會處理上升與下降)
        this._handlePhysics(controls, groundObjects, deltaTime);
    }

    // 核心物理引擎：處理重力與重生
    _handlePhysics(controls, groundObjects, deltaTime) {
        // 宣告本地變量以修復 ReferenceError
        let currentGroundY = -Infinity;
        let isOnAnyGround = false;

        // 偵測地表資訊
        const rayOrigin = this.model.position.clone().add(new THREE.Vector3(0, 10, 0));
        this.raycaster.set(rayOrigin, this.downVector);
        this.raycaster.far = 15;
        const intersects = this.raycaster.intersectObjects(groundObjects);

        if (intersects.length > 0) {
            currentGroundY = intersects[0].point.y;
            isOnAnyGround = true;
        }

        // 檢查 deltaTime 是否有效，防止 NaN
        const dt = deltaTime || 0;

        // 重力也改為基於時間 (gravity 原本是 -0.2/frame，若要每秒 9.8 則設為 -9.8)
        this.velocityY += this.gravity * deltaTime;
        this.model.position.y += this.velocityY * deltaTime;

        if (isOnAnyGround && this.model.position.y <= currentGroundY) {
            if (this.model.position.y > currentGroundY - 5) {
                this.model.position.y = currentGroundY;
                this.velocityY = 0;
            }
        }

        // 掉落判定：當高度低於 -10 (掉出場外) 且定義了回呼
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