import * as THREE from 'three';
import { MechanicFactory } from './mechanics/MechanicFactory.js';

export class Floor {
    static async create(config, loader) {
        let geometry;
        let baseMaterial;
        let isGLB = false;
        let baseModel = null;
        let finalHeight = 1;

        // 1. 判定視覺建立方式
        const modelData = (typeof config.model === 'object') ? config.model : null;
        const modelType = modelData ? modelData.type : config.type;
        const size = (modelData ? modelData.size : config.size) || {};

        if (config.model && typeof config.model === 'string') {
            // A. GLB 模式
            isGLB = true;
            const gltf = await loader.loadAsync(config.model);
            baseModel = gltf.scene;
            baseModel.traverse(child => {
                if (child.isMesh) {
                    child.material.roughness = 1;
                    child.material.metalness = 0;
                }
            });
            if (config.scale) baseModel.scale.set(config.scale, config.scale, config.scale);
        } else {
            // B. 內部幾何體模式
            switch (modelType) {
                case 'Cylinder':
                    // radiusTop, radiusBottom, height, radialSegments
                    geometry = new THREE.CylinderGeometry(
                        size.radius || 0.5,
                        size.radius || 0.5,
                        size.height || 1,
                        32
                    );
                    finalHeight = size.height || 1;
                    break;
                case 'Sphere':
                    // radius, widthSegments, heightSegments
                    geometry = new THREE.SphereGeometry(size.radius || 0.5, 32, 32);
                    finalHeight = (size.radius || 0.5) * 2;
                    break;
                case 'Box':
                default:
                    // width, height, depth
                    geometry = new THREE.BoxGeometry(
                        size.width || 1,
                        size.height || 1,
                        size.depth || 1
                    );
                    finalHeight = size.height || 1;
                    break;
            }

            baseMaterial = new THREE.MeshStandardMaterial({
                color: parseInt(modelData ? (modelData.color || "0xffffff") : (config.color || "0xffffff")),
                roughness: 1,
                metalness: 0
            });
        }

        // 2. 準備機制 (Mechanic)
        const mechanicConfig = {
            ...config.mechanics,
            type: config.type // 傳入外層 type
        };
        const mechanic = MechanicFactory.create(mechanicConfig);

        // 3. 建立執行個體
        return config.instances.map(inst => {
            let instance;
            const targetColor = inst.color ? parseInt(inst.color) : (baseMaterial ? baseMaterial.color.getHex() : 0xffffff);

            if (isGLB) {
                instance = baseModel.clone();
            } else {
                const mat = baseMaterial.clone();
                mat.color.setHex(targetColor);
                instance = new THREE.Mesh(geometry, mat);
            }

            const pos = inst.position;
            // 底部對齊 Y 軸
            const yOffset = isGLB ? 0 : (finalHeight / 2);
            instance.position.set(pos.x, pos.y + yOffset, pos.z);

            if (inst.rotation) {
                instance.rotation.set(
                    (inst.rotation.x || 0) * (Math.PI / 180),
                    (inst.rotation.y || 0) * (Math.PI / 180),
                    (inst.rotation.z || 0) * (Math.PI / 180)
                );
            }

            instance.userData = {
                id: config.id,
                mechanics: config.mechanics,
                originalColor: targetColor,
                standingTimer: 0,
                activePlayers: new Set(),
                isDisappeared: false,
                mechanicInstance: mechanic
            };

            // 初始化邏輯外觀 (如邊線)
            if (mechanic && typeof mechanic._setMatteColor === 'function') {
                mechanic._setMatteColor(instance, targetColor);
            }

            return instance;
        });
    }

    static updateMechanics(floor, deltaTime, nowMs) {
        if (floor.userData.mechanicInstance) {
            floor.userData.mechanicInstance.update(floor, deltaTime, nowMs);
        }
    }
}