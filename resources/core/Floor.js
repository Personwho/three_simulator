import * as THREE from 'three';
import { MechanicFactory } from './mechanics/MechanicFactory.js';

export class Floor {
    /**
     * 根據配置建立地基物件陣列
     * @param {Object} config JSON 中的地基配置項目
     * @param {GLTFLoader} loader 用於加載 glb 的加載器
     * @returns {Promise<THREE.Object3D[]>}
     */
    static async create(config, loader) {
        if (config.type === 'glb') {
            const gltf = await loader.loadAsync(config.model);
            const baseModel = gltf.scene;

            // 強制遍歷模型，將內部所有材質改為霧面並關閉環境反射
            baseModel.traverse(child => {
                if (child.isMesh) {
                    child.material.roughness = 1;
                    child.material.metalness = 0;
                }
            });

            if (config.scale) {
                baseModel.scale.set(config.scale, config.scale, config.scale);
            }

            return config.instances.map(inst => {
                const instance = baseModel.clone();
                const pos = inst.position;
                instance.position.set(pos.x, pos.y, pos.z);

                if (inst.rotation) {
                    instance.rotation.set(
                        (inst.rotation.x || 0) * (Math.PI / 180),
                        (inst.rotation.y || 0) * (Math.PI / 180),
                        (inst.rotation.z || 0) * (Math.PI / 180)
                    );
                }
                return instance;
            });
        }

        // --- 以下為原本的 Box 邏輯 ---
        let geometry;
        switch (config.type) {
            case 'Box':
            default:
                geometry = new THREE.BoxGeometry(
                    config.size.width,
                    config.size.height,
                    config.size.depth
                );
                break;
        }

        // 定義材質
        const material = new THREE.MeshStandardMaterial({
            color: parseInt(config.color),
            roughness: 1,
            metalness: 0
        });

        const mechanic = MechanicFactory.create(config.mechanics);

        return config.instances.map(inst => {
            // 如果 color 回歸在實例內，優先讀取 inst.color，否則用 config.color
            const targetColor = inst.color ? parseInt(inst.color) : parseInt(config.color);

            const material = new THREE.MeshStandardMaterial({
                color: targetColor,
                roughness: 1,
                metalness: 0
            });

            const mesh = new THREE.Mesh(geometry, material);
            const pos = inst.position;

            mesh.userData = {
                id: config.id,
                mechanics: config.mechanics,
                originalColor: targetColor,
                standingTimer: 0,
                activePlayers: new Set(),
                isDisappeared: false,
                mechanicInstance: mechanic
            };

            mesh.position.set(
                pos.x,
                pos.y + config.size.height / 2,
                pos.z
            );

            if (inst.rotation) {
                mesh.rotation.set(
                    (inst.rotation.x || 0) * (Math.PI / 180),
                    (inst.rotation.y || 0) * (Math.PI / 180),
                    (inst.rotation.z || 0) * (Math.PI / 180)
                );
            }
            return mesh;
        });
    }

    static updateMechanics(floor, deltaTime) {
        if (floor.userData.mechanicInstance) {
            floor.userData.mechanicInstance.update(floor, deltaTime);
        }
    }
}