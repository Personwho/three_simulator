import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class CircleSkill extends BaseSkill {
    createTelegraphMesh() {
        // 從 data.config 中讀取參數
        const geometry = new THREE.CircleGeometry(this.config.radius, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }
    checkHit(charPos, attackPos) {
        // 從 data.config 中讀取半徑進行判定
        const dist = new THREE.Vector2(charPos.x, charPos.z).distanceTo(new THREE.Vector2(attackPos.x, attackPos.z));
        return dist <= this.config.radius;
    }
}