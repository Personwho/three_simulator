import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class LineSkill extends BaseSkill {
    createTelegraphMesh() {
        const width = this.config.config?.width || 2;
        const length = this.config.config?.length || 10;
        const opacity = (this.config.opacity !== undefined) ? this.config.opacity : 0.5;

        // 建立長方形幾何體
        const geometry = new THREE.PlaneGeometry(width, length);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000, // 預設紅色
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        const mesh = new THREE.Mesh(geometry, material);
        // 核心修正：將幾何體中心前移半個長度，使其看起來是從起點射出
        mesh.geometry.translate(0, (length / 2) * -1, 0);
        return mesh;
    }

    checkHit(charPos, attackPos, attackRotationY) {
        const width = this.config.config?.width || 2;
        const length = this.config.config?.length || 10;

        // 1. 計算角色相對於攻擊起點的偏移向量
        const dx = charPos.x - attackPos.x;
        const dz = charPos.z - attackPos.z;

        // 2. 將世界座標偏移轉換為局部座標 (以 attackRotationY 為基準)
        // 在 Three.js 中，當 rotation.y 為 0 時，前方是 +Z，右方是 +X
        // 局部 Z (深度方向): dx * sin(θ) + dz * cos(θ)
        // 局部 X (水平方向): dx * cos(θ) - dz * sin(θ)
        const localZ = dx * Math.sin(attackRotationY) + dz * Math.cos(attackRotationY);
        const localX = dz * Math.sin(attackRotationY) - dx * Math.cos(attackRotationY);

        // 3. 判定邏輯：
        // localX: 左右寬度範圍 (width / 2)
        // localZ: 往前延伸的長度範圍 (0 到 length)
        return Math.abs(localX) <= width / 2 && localZ >= 0 && localZ <= length;
    }
}