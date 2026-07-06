import * as THREE from 'three';
import { BaseMechanic } from './BaseMechanic.js';

export class NormalMechanic extends BaseMechanic {
    constructor(config) {
        super();
        this.config = config;
    }

    update(floor, dt) {
    }

    _setMatteColor(floor, hexColor) {
        if (!floor.material) return;

        // 核心修正：將地基材質更換為 MeshBasicMaterial，達到完全不受光照影響
        if (floor.material.type !== 'MeshBasicMaterial') {
            const oldOpacity = floor.material.opacity;
            const oldTransparent = floor.material.transparent;

            floor.material.dispose(); // 釋放內存
            floor.material = new THREE.MeshBasicMaterial({
                color: hexColor,
                opacity: oldOpacity,
                transparent: oldTransparent
            });
        } else {
            floor.material.color.setHex(hexColor);
        }

        // --- 核心邏輯：如果尚未建立邊線，則在此新增 ---
        if (!floor.userData.hasEdges && floor.geometry) {
            const edges = new THREE.EdgesGeometry(floor.geometry);
            const line = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.2
                })
            );

            // 新增這行：禁止邊線被射線偵測到
            line.raycast = () => { };

            floor.add(line);
            floor.userData.hasEdges = true;
        }
    }

    _vanish(floor, reason) {
    }

    _respawn(floor) {
        this._setMatteColor(floor, floor.userData.originalColor);
    }
}