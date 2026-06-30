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
            const mesh = new THREE.Mesh(geometry, material.clone());
            mesh.userData = {
                id: config.id,
                mechanics: config.mechanics,
                originalColor: parseInt(config.color),
                standingTimer: 0,
                activePlayers: new Set(),
                isDisappeared: false
            };
            mesh.position.set(
                pos.x,
                pos.y + config.size.height / 2,
                pos.z
            );
            return mesh;
        });
    }

    static updateMechanics(floor, deltaTime) {
        // 如果地板已消失，檢查是否已過 3 秒需要復原
        if (floor.userData.isDisappeared) {
            const now = Date.now();
            const elapsed = (now - floor.userData.disappearStartTime) / 1000;
            if (elapsed >= 3) {
                floor.visible = true;
                floor.userData.isDisappeared = false;
                floor.userData.standingTimer = 0;
                floor.material.color.setHex(floor.userData.originalColor);
                console.log(`地基已復原`);
            }
            return;
        }

        const mech = floor.userData.mechanics;
        if (!mech) return;

        const playerCount = floor.userData.activePlayers.size;

        // 必須先確定 max_players 存在且大於 0
        if (typeof mech.max_players === 'number' && mech.max_players > 0) {
            if (playerCount >= mech.max_players) {
                floor.visible = false;
                floor.userData.isDisappeared = true;
                floor.userData.disappearStartTime = Date.now(); // 記錄消失時間
                console.log(`地基因人數過多消失`);
                return;
            }
        }

        // 規則 2: 只有 1 人站立計時
        if (playerCount === 1 && mech.time_limit > 0) {
            floor.userData.standingTimer += deltaTime;
            if (mech.time_limit && floor.userData.standingTimer > mech.time_limit - 2) {
                floor.material.color.setHex(parseInt(mech.warning_color));
            }
            if (mech.time_limit && floor.userData.standingTimer > mech.time_limit) {
                floor.visible = false;
                floor.userData.isDisappeared = true;
                floor.userData.disappearStartTime = Date.now(); // 記錄消失時間
                console.log(`地基因站立超時消失`);
            }
        } else {
            floor.userData.standingTimer = 0;
            floor.material.color.setHex(floor.userData.originalColor);
        }
    }
}