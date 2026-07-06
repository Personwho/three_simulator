import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class ConeSkill extends BaseSkill {
    createTelegraphMesh() {
        const radius = this.config.config?.radius || 5;
        const angle = (this.config.config?.angle || 90) * (Math.PI / 180);

        // 核心修正：將 thetaStart 設為 (Math.PI/2 - angle/2)，使扇形中軸對準幾何座標的 Y 軸
        const geometry = new THREE.CircleGeometry(radius, 32, Math.PI / 2 * 3 - angle / 2, angle);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffa500,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        const mesh = new THREE.Mesh(geometry, material);

        return mesh;
    }

    // 更新：扇形判定需要知道攻擊者的朝向 (rotation)
    checkHit(charPos, attackPos, attackRotationY) {
        const radius = this.config.config?.radius || 5;
        const angleLimit = (this.config.config?.angle || 90) * (Math.PI / 180) / 2;

        const dx = charPos.x - attackPos.x;
        const dz = charPos.z - attackPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > radius) return false;

        // 修正：計算目標相對於攻擊者的角度，與 lookAt 的 Z 軸方向一致
        const targetAngle = Math.atan2(dx, dz);

        // 修正：夾角計算邏輯
        let diff = targetAngle - attackRotationY;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        return Math.abs(diff) <= angleLimit;
    }
}