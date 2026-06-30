import * as THREE from 'three';

export class TelegraphManager {
    constructor(scene) {
        this.scene = scene;
        this.activeTelegraphs = [];
    }

    // 建立預警區
    createTelegraph(skill, position, onComplete) {
        let geometry;
        if (skill.telegraph.type === 'circle') {
            geometry = new THREE.CircleGeometry(skill.telegraph.radius, 32);
        }

        const material = new THREE.MeshBasicMaterial({
            color: 0xffa500, // 橘黃色
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2; // 水平放置
        mesh.position.set(position.x, position.y + 0.05, position.z);
        this.scene.add(mesh);

        const startTime = Date.now();
        this.activeTelegraphs.push({
            mesh,
            skill,
            position,
            startTime,
            duration: skill.cast_time * 1000,
            onComplete
        });
    }

    update() {
        const now = Date.now();
        this.activeTelegraphs = this.activeTelegraphs.filter(t => {
            if (now - t.startTime >= t.duration) {
                this.scene.remove(t.mesh);
                if (t.onComplete) t.onComplete(t.skill, t.position); // 觸發攻擊判定
                return false;
            }
            return true;
        });
    }
}