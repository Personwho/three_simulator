import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class SquareSkill extends BaseSkill {
    createTelegraphMesh(skillData) {
        const width = skillData.config?.width || 1;
        const height = skillData.config?.height || 1;
        const opacity = (skillData.opacity !== undefined) ? skillData.opacity : 0.5;
        const positions = skillData.config?.position;

        const createPlane = () => {
            const geometry = new THREE.PlaneGeometry(width, height);
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
            
            return new THREE.Mesh(geometry, material);
        };

        if (Array.isArray(positions) && positions.length > 0) {
            const group = new THREE.Group();
            const base = positions[0]; 
            positions.forEach(pos => {
                const mesh = createPlane();
                
                mesh.position.set(
                    pos.x - base.x,
                    base.z - pos.z,
                    0
                );
                group.add(mesh);
            });
            return group;
        }

        return createPlane();
    }

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const width = skillData.config?.width || 1;
        const height = skillData.config?.height || 1;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const positions = skillData.config?.position;

        if (Array.isArray(positions)) {
            return positions.some(pos => {
                const isInsideX = charPos.x >= (pos.x - halfWidth) && charPos.x <= (pos.x + halfWidth);
                const isInsideZ = charPos.z >= (pos.z - halfHeight) && charPos.z <= (pos.z + halfHeight);
                return isInsideX && isInsideZ;
            });
        }

        const isInsideX = charPos.x >= (attackPos.x - halfWidth) && charPos.x <= (attackPos.x + halfWidth);
        const isInsideZ = charPos.z >= (pos.z - halfHeight) && charPos.z <= (pos.z + halfHeight);
        return isInsideX && isInsideZ;
    }
}