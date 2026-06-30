import * as THREE from 'three';

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
                    child.material.envMapIntensity = 0; // 禁用環境貼圖強度
                }
            });

            if (config.scale) {
                baseModel.scale.set(config.scale, config.scale, config.scale);
            }

            return config.positions.map(pos => {
                const instance = baseModel.clone();
                instance.position.set(pos.x, pos.y, pos.z);
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

        const material = new THREE.MeshBasicMaterial({
            color: parseInt(config.color)
        });

        return config.positions.map(pos => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(
                pos.x,
                pos.y + config.size.height / 2,
                pos.z
            );
            return mesh;
        });
    }
}