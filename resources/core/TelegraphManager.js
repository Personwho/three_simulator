import * as THREE from 'three';

export class TelegraphManager {
    constructor(scene) {
        this.scene = scene;
        this.activeTelegraphs = [];
    }

    // 建立預警區
    createTelegraph(skillInstance, position, onComplete) {
        const mesh = skillInstance.logic.createTelegraphMesh();
        mesh.position.set(position.x, position.y + 0.05, position.z);
        this.scene.add(mesh);

        this.activeTelegraphs.push({
            mesh,
            skillInstance, // 存入實例
            position,
            startTime: Date.now(),
            duration: skillInstance.data.cast_time * 1000,
            onComplete
        });
    }

    update() {
        const now = Date.now();
        this.activeTelegraphs = this.activeTelegraphs.filter(t => {
            if (now - t.startTime >= t.duration) {
                this.scene.remove(t.mesh);
                if (t.onComplete) t.onComplete(t.skillInstance.data, t.position);
                return false;
            }
            return true;
        });
    }
}