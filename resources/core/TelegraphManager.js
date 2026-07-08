import * as THREE from 'three';

export class TelegraphManager {
    constructor(scene) {
        this.scene = scene;
        this.activeTelegraphs = [];
    }

    // 建立預警區
    createTelegraph(skillInstance, position, onComplete, targets = []) {
        const instanceId = `tg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`; // 生成唯一 ID
        const mesh = skillInstance.logic.createTelegraphMesh(skillInstance.data);
        const isArrayPos = Array.isArray(position);
        const actualPos = isArrayPos ? position[0] : position;
        
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
        const targetOpacity = skillInstance.data.config?.target_opacity !== undefined 
            ? skillInstance.data.config.target_opacity 
            : 1.0;
        targets.forEach(target => {
            const arrow = this._createTargetArrow(targetOpacity);
            arrow.position.y = 2.0; // 角色頭頂高度
            target.model.add(arrow);
            indicators.push({ target, arrow });
        });

        const castTime = (skillInstance.data.cast_time || 0) * 1000;
        const duration = (skillInstance.data.duration || 0.5) * 1000;

        this.activeTelegraphs.push({
            mesh, skillInstance, position, indicators, instanceId, // 存入 ID
            startTime: Date.now(),
            castTime, duration,
            state: castTime > 0 ? 'casting' : 'active',
            onComplete
        });
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

    _setMeshProperties(obj, properties) {
        if (properties.visible !== undefined) {
            obj.visible = properties.visible;
        }
        
        if (obj.material) {
            if (properties.opacity !== undefined) {
                obj.material.opacity = properties.opacity;
                obj.material.transparent = true;
            }
            // 如果有指定單一顏色，則套用
            if (properties.color !== undefined) {
                obj.material.color.setHex(properties.color);
            }
        }
        
        // 核心修正：如果提供的是顏色陣列，則對應到子物件
        if (obj.children && obj.children.length > 0) {
            obj.children.forEach((child, index) => {
                const childProps = { ...properties };
                if (Array.isArray(properties.colors) && properties.colors[index] !== undefined) {
                    childProps.color = properties.colors[index];
                }
                this._setMeshProperties(child, childProps);
            });
        }
    }

    update() {
        const now = Date.now();
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
                    const waitTime = (t.skillInstance.data.config?.wait_time || 0) * 1000;
                    if (waitTime > 0 && t.state !== 'waiting') {
                        t.state = 'waiting';
                        t.startTime = now; 
                        t.mesh.visible = false; 
                        return true;
                    }
                    t.state = 'active';
                    t.startTime = now;
                    // 施放時變更透明度
                    const config = t.skillInstance.data.config;
                    this._setMeshProperties(t.mesh, { 
                        color: config?.active_color || 0xff0000, // 預設色
                        colors: config?.active_colors,           // 傳遞顏色陣列
                        opacity: 0.5 
                    });
                    this._clearIndicators(t);
                }
                return true; // 繼續保留在陣列中
            }

            if (t.state === 'waiting') {
                const waitTime = (t.skillInstance.data.config?.wait_time || 0) * 1000;
                if (now - t.startTime >= waitTime) {
                    // --- 修正：更新為角色當前座標 ---
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
                    t.state = 'active';
                    t.startTime = now;
                    const attackColor = t.skillInstance.data.config?.active_color || 0xff0000;
                    this._setMeshProperties(t.mesh, { 
                        visible: true, 
                        color: attackColor, 
                        opacity: 0.5 
                    });
                }
                return true;
            }

            if (t.state === 'active') {
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
    }

    _removeTelegraph(t) {
        if (t.mesh) this.scene.remove(t.mesh);
        this._clearIndicators(t);
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
    }
}