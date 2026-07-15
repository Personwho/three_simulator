import * as THREE from 'three';

export class TelegraphManager {
    constructor(scene, clock) {
        this.scene = scene;
        this.clock = clock;
        this.activeTelegraphs = [];
        // 純裝飾、tick 驅動的動畫效果（不參與命中判定），例如連擊技能的波浪方塊
        this.activeEffects = [];
    }

    // 建立預警區（詠唱中）或直接建立攻擊區（無詠唱時間的技能）
    createTelegraph(skillInstance, position, onComplete, targets = []) {
        const instanceId = `tg_${this.clock.now()}_${Math.random().toString(36).slice(2, 7)}`; // 生成唯一 ID
        const data = skillInstance.data;
        const other = data.other || {};
        const castTime = (other.cast_time || 0) * 1000;
        const duration = (other.duration || 0.5) * 1000;

        const isArrayPos = Array.isArray(position);
        const actualPos = isArrayPos ? position[0] : position;

        // 有詠唱時間：先顯示預警區；無詠唱時間：直接顯示攻擊區，不建多餘的預警 mesh
        const mesh = castTime > 0
            ? skillInstance.logic.createPreAttackMesh(data)
            : skillInstance.logic.createAttackMesh(data);

        mesh.position.set(actualPos.x, actualPos.y + 0.01, actualPos.z);
        if (!isArrayPos && targets.length > 0) {
            targets.forEach(target => {
                const targetPos = target.model.position;
                mesh.lookAt(targetPos.x, mesh.position.y, targetPos.z);
            })
        }
        mesh.rotation.x = -Math.PI / 2;

        this.scene.add(mesh);

        // 建立頭頂箭頭
        const indicators = [];
        const targetOpacity = other.target_opacity !== undefined ? other.target_opacity : 1.0;
        targets.forEach(target => {
            const arrow = this._createTargetArrow(targetOpacity);
            arrow.position.y = 2.0; // 角色頭頂高度
            target.model.add(arrow);
            indicators.push({ target, arrow });
        });

        const now = this.clock.now();
        this.activeTelegraphs.push({
            mesh, skillInstance, position, actualPos, indicators, instanceId, // 存入 ID
            startTime: now,
            entryStartTime: now, // 從建立當下起算，狀態轉換時不會被重置，供 updateTelegraphPosition 使用
            castTime, duration,
            state: castTime > 0 ? 'casting' : 'active',
            onComplete
        });
    }

    // 註冊一段純裝飾的 tick 驅動動畫效果（不參與 activeTelegraphs 的命中判定流程）
    registerEffect({ build, durationMs, onTick, onDispose }) {
        const obj = build();
        this.scene.add(obj);
        this.activeEffects.push({ obj, startTime: this.clock.now(), durationMs, onTick, onDispose });
    }

    _createTargetArrow(opacity = 1.0) {
        // 建立一個紅色向下的小三角錐
        const geometry = new THREE.ConeGeometry(0.2, 0.4, 4);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: opacity < 1.0,
            opacity: opacity
        });
        const arrow = new THREE.Mesh(geometry, material);
        arrow.rotation.x = Math.PI; // 尖端向下
        return arrow;
    }

    // 將預警區換成攻擊區，延續目前追蹤到的朝向，避免命中瞬間朝向跳掉
    _swapToAttackMesh(t) {
        const data = t.skillInstance.data;
        const oldMesh = t.mesh;
        const attackMesh = t.skillInstance.logic.createAttackMesh(data);

        attackMesh.position.copy(oldMesh.position);
        attackMesh.rotation.copy(oldMesh.rotation);

        this.scene.remove(oldMesh);
        this._disposeMesh(oldMesh);
        this.scene.add(attackMesh);
        t.mesh = attackMesh;
    }

    update() {
        const now = this.clock.now();
        this.activeTelegraphs = this.activeTelegraphs.filter(t => {
            const elapsed = now - t.startTime;

            if (t.state === 'casting') {
                // 1. 讀條期間：如果是扇形攻擊，讓預警 Mesh 持續看向目標
                if (t.indicators && t.indicators.length > 0) {
                    const target = t.indicators[0].target;
                    if (target && target.model) {
                        const targetPos = target.model.position;
                        // 1. 先計算朝向目標的水平弧度
                        const angle = Math.atan2(
                            targetPos.x - t.mesh.position.x,
                            targetPos.z - t.mesh.position.z
                        );
                        // 2. 將此角度存儲在自定義屬性中，避開 Euler 角讀取問題
                        t.targetRotationY = angle;

                        // 3. 視覺旋轉處理
                        t.mesh.lookAt(targetPos.x, t.mesh.position.y, targetPos.z);
                        t.mesh.rotateX(-Math.PI / 2);
                    }
                }

                // 2. 檢測讀條是否結束
                if (elapsed >= t.castTime) {
                    const other = t.skillInstance.data.other || {};
                    const waitTime = (other.wait_time || 0) * 1000;
                    if (waitTime > 0 && t.state !== 'waiting') {
                        t.state = 'waiting';
                        t.startTime = now;
                        t.mesh.visible = false;
                        return true;
                    }
                    this._swapToAttackMesh(t);
                    t.state = 'active';
                    t.startTime = now;
                    this._clearIndicators(t);
                }
                return true; // 繼續保留在陣列中
            }

            if (t.state === 'waiting') {
                const other = t.skillInstance.data.other || {};
                const waitTime = (other.wait_time || 0) * 1000;
                if (now - t.startTime >= waitTime) {
                    // --- 更新為角色當前座標 ---
                    if (t.indicators && t.indicators.length > 0) {
                        const target = t.indicators[0].target;
                        if (target && target.model) {
                            const targetPos = target.model.position;
                            const angle = Math.atan2(
                                targetPos.x - t.mesh.position.x,
                                targetPos.z - t.mesh.position.z
                            );
                            t.targetRotationY = angle;

                            t.mesh.lookAt(targetPos.x, t.mesh.position.y, targetPos.z);
                            t.mesh.rotateX(-Math.PI / 2);
                        }
                    }
                    this._swapToAttackMesh(t);
                    t.mesh.visible = true;
                    t.state = 'active';
                    t.startTime = now;
                }
                return true;
            }

            if (t.state === 'active') {
                // 由技能自行決定攻擊區是否需要每個 tick 更新位置（例如巡邏中的聚光燈）
                if (t.skillInstance.logic.updateTelegraphPosition) {
                    t.skillInstance.logic.updateTelegraphPosition(t.mesh, now - t.entryStartTime, t.skillInstance.data);
                }

                // 3. 活躍期間：持續回報命中判定
                // 使用 t.mesh.rotation.y (經過 lookAt 處理後的 Y 軸弧度)
                const rotationY = (t.targetRotationY !== undefined) ? t.targetRotationY : t.mesh.rotation.y;
                if (t.onComplete) {
                    t.onComplete(t.skillInstance.data, t.position, rotationY, t.instanceId);
                }

                // 4. 持續時間判定：超過 duration 則移除並從陣列中清理
                if (elapsed >= t.duration) {
                    this._removeTelegraph(t);
                    return false; // 返回 false 表示從 activeTelegraphs 中移除
                }
                return true;
            }
            return false;
        });

        this.activeEffects = this.activeEffects.filter(e => {
            const elapsed = now - e.startTime;
            if (e.onTick) e.onTick(e.obj, elapsed);
            if (elapsed >= e.durationMs || !e.obj.parent) {
                this.scene.remove(e.obj);
                if (e.onDispose) e.onDispose();
                return false;
            }
            return true;
        });
    }

    _removeTelegraph(t) {
        if (t.mesh) {
            this.scene.remove(t.mesh);
            this._disposeMesh(t.mesh);
        }
        this._clearIndicators(t);
    }

    _disposeMesh(obj) {
        obj.traverse?.(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }

    _clearIndicators(t) {
        if (t.indicators) {
            t.indicators.forEach(ind => {
                if (ind.target && ind.target.model) ind.target.model.remove(ind.arrow);
            });
            t.indicators = [];
        }
    }

    clearAll() {
        this.activeTelegraphs.forEach(t => this._removeTelegraph(t));
        this.activeTelegraphs = [];

        this.activeEffects.forEach(e => {
            this.scene.remove(e.obj);
            if (e.onDispose) e.onDispose();
        });
        this.activeEffects = [];
    }
}
