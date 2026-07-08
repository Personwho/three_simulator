import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class DonutSkill extends BaseSkill {
    createTelegraphMesh(skillData) {
        const innerRadius = skillData.config?.inner_radius == 0 ? 0 : (skillData.config?.inner_radius ?? 2);
        const outerRadius = skillData.config?.outer_radius || 5;
        const opacity = (skillData.opacity !== undefined) ? skillData.opacity : 0.5;

        // 使用 RingGeometry 建立圓環
        const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        const mesh = new THREE.Mesh(geometry, material);
        // 使其平躺在地面
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const innerRadius = skillData.config?.inner_radius == 0 ? 0 : (skillData.config?.inner_radius ?? 2);
        const outerRadius = skillData.config?.outer_radius || 5;

        // 計算角色與攻擊中心的歐幾里得距離 (忽略 Y 軸)
        const dx = charPos.x - attackPos.x;
        const dz = charPos.z - attackPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // 判定：在內外圓半徑之間則命中
        return distance >= innerRadius && distance <= outerRadius;
    }
}