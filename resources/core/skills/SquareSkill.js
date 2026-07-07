import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class SquareSkill extends BaseSkill {
    createTelegraphMesh() {
        // 從 config.config 中讀取 size (正方形邊長)
        const size = this.config.config?.size || 1;
        const opacity = (this.config.opacity !== undefined) ? this.config.opacity : 0.5;

        // 使用平面幾何體
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: opacity, // 讀條時較淡
            side: THREE.DoubleSide,
            depthWrite: false,      // ✅ 關閉深度寫入
            polygonOffset: true,    // ✅ 啟用多邊形偏移
            polygonOffsetFactor: -1, // ✅ 讓預警區域略微「浮起」
            polygonOffsetUnits: -1
        });

        const mesh = new THREE.Mesh(geometry, material);
        // 旋轉使平面貼在地上
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    checkHit(charPos, attackPos, attackRotationY) {
        const size = this.config.config?.size || 1;
        const halfSize = size / 2;

        // AABB 碰撞偵測 (XZ 平面)
        const isInsideX = charPos.x >= (attackPos.x - halfSize) && charPos.x <= (attackPos.x + halfSize);
        const isInsideZ = charPos.z >= (attackPos.z - halfSize) && charPos.z <= (attackPos.z + halfSize);

        return isInsideX && isInsideZ;
    }
}