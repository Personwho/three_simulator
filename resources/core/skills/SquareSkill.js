import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class SquareSkill extends BaseSkill {
    _buildMesh(shape, positions, defaultColor) {
        const width = shape.width || 1;
        const height = shape.height || 1;
        const opacity = (shape.opacity !== undefined) ? shape.opacity : 0.5;
        const colors = shape.colors;

        const createPlane = (color) => {
            const geometry = new THREE.PlaneGeometry(width, height);
            const material = new THREE.MeshBasicMaterial({
                color: color,
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
            positions.forEach((pos, index) => {
                const color = Array.isArray(colors) && colors[index] !== undefined ? colors[index] : defaultColor;
                const mesh = createPlane(color);

                mesh.position.set(
                    pos.x - base.x,
                    base.z - pos.z,
                    0
                );
                group.add(mesh);
            });
            return group;
        }

        return createPlane((shape.color !== undefined) ? shape.color : defaultColor);
    }

    createPreAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.preShape(skillData), BaseSkill.other(skillData).position, 0xff0000);
    }

    createAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.attackShape(skillData), BaseSkill.other(skillData).position, 0xff0000);
    }

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const shape = BaseSkill.attackShape(skillData);
        const width = shape.width || 1;
        const height = shape.height || 1;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const positions = BaseSkill.other(skillData).position;

        if (Array.isArray(positions)) {
            return positions.some(pos => {
                const isInsideX = charPos.x >= (pos.x - halfWidth) && charPos.x <= (pos.x + halfWidth);
                const isInsideZ = charPos.z >= (pos.z - halfHeight) && charPos.z <= (pos.z + halfHeight);
                return isInsideX && isInsideZ;
            });
        }

        const isInsideX = charPos.x >= (attackPos.x - halfWidth) && charPos.x <= (attackPos.x + halfWidth);
        const isInsideZ = charPos.z >= (attackPos.z - halfHeight) && charPos.z <= (attackPos.z + halfHeight);
        return isInsideX && isInsideZ;
    }
}
