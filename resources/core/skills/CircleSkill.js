import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class CircleSkill extends BaseSkill {
    createTelegraphMesh() {
        // 從 data.config 中讀取參數
        const radius = this.config.config?.radius || 0;
        const opacity = (this.config.opacity !== undefined) ? this.config.opacity : 0.5;

        const geometry = new THREE.CircleGeometry(radius, 64); // 增加分段讓圓形更平滑
        const material = new THREE.MeshBasicMaterial({
            color: 0xffa500,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false,      // ✅ 關閉深度寫入，防止平面間閃爍
            polygonOffset: true,    // ✅ 啟用多邊形偏移
            polygonOffsetFactor: -1, // ✅ 讓預警區域略微「浮起」
            polygonOffsetUnits: -1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }
    checkHit(charPos, attackPos, attackRotationY) {
        // 從 data.config 中讀取半徑進行判定
        const radius = this.config.config?.radius || 0;
        const dist = new THREE.Vector2(charPos.x, charPos.z).distanceTo(new THREE.Vector2(attackPos.x, attackPos.z));
        return dist <= radius;
    }
}