import * as THREE from 'three';

export class TelegraphManager {
    constructor(scene) {
        this.scene = scene;
        this.activeTelegraphs = [];
    }

    // 建立預警區
    createTelegraph(skillInstance, position, onComplete, targets = []) {
        const mesh = skillInstance.logic.createTelegraphMesh();
        mesh.position.set(position.x, position.y + 0.01, position.z);

        if (targets.length > 0 && skillInstance.data.type === 'ConeSkill') {
            const targetPos = targets[0].model.position;
            mesh.lookAt(targetPos.x, mesh.position.y, targetPos.z);
            mesh.rotateX(-Math.PI / 2); // 修正 PlaneGeometry 預設垂直的問題
        } else {
            // 一般正方形/圓形只需直接放倒
            mesh.rotation.x = -Math.PI / 2;
        }

        this.scene.add(mesh);

        // 建立頭頂箭頭
        const indicators = [];
        targets.forEach(target => {
            const arrow = this._createTargetArrow();
            arrow.position.y = 2.0; // 角色頭頂高度
            target.model.add(arrow);
            indicators.push({ target, arrow });
        });

        const castTime = (skillInstance.data.cast_time || 0) * 1000;
        const duration = (skillInstance.data.duration || 0.1) * 1000;

        this.activeTelegraphs.push({
            mesh, skillInstance, position, indicators,
            startTime: Date.now(),
            castTime, duration,
            state: castTime > 0 ? 'casting' : 'active',
            onComplete
        });
    }

    _createTargetArrow() {
        // 建立一個紅色向下的小三角錐
        const geometry = new THREE.ConeGeometry(0.2, 0.4, 4);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const arrow = new THREE.Mesh(geometry, material);
        arrow.rotation.x = Math.PI; // 尖端向下
        return arrow;
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
                        // 讓 Mesh 面向目標，並保持水平偏移校準
                        t.mesh.lookAt(targetPos.x, t.mesh.position.y, targetPos.z);
                        t.mesh.rotateX(-Math.PI / 2); // 這是 XZ 平面的翻轉關鍵
                    }
                }

                // 2. 檢測讀條是否結束
                if (elapsed >= t.castTime) {
                    t.state = 'active';
                    t.startTime = now; // 進入活躍階段，重置計時器給 duration 使用
                    this._clearIndicators(t); // 讀條結束，立即清理頭頂箭頭標誌
                }
                return true; // 繼續保留在陣列中
            }

            if (t.state === 'active') {
                // 3. 活躍期間：持續回報命中判定
                // 使用 t.mesh.rotation.y (經過 lookAt 處理後的 Y 軸弧度)
                const rotationY = t.mesh.rotation.y;
                if (t.onComplete) {
                    t.onComplete(t.skillInstance.data, t.position, rotationY);
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