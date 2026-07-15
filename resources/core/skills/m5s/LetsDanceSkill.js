import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';
import { gameLog } from '../../GameLog.js';

export class LetsDanceSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }

    // 攻擊區：從 Boss 位置往指定角度施放的矩形範圍（形狀/判定邏輯參考 SnapTwistDropTheNeedleSkill）
    _buildMesh(shape, defaultColor) {
        const width = shape.width || 1;
        const height = shape.height || 1;
        const opacity = (shape.opacity !== undefined) ? shape.opacity : 0.5;
        const color = (shape.color !== undefined) ? shape.color : defaultColor;
        const rotationY = (shape.angle_start !== undefined) ? (shape.angle_start * Math.PI / 180) : 0;

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

        const mesh = new THREE.Mesh(geometry, material);
        mesh.geometry.translate(0, height / 2, 0);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -rotationY;

        return mesh;
    }

    createPreAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.preShape(skillData), 0xff0000);
    }

    createAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.attackShape(skillData), 0xff0000);
    }

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const shape = BaseSkill.attackShape(skillData);
        const width = shape.width || 1;
        const height = shape.height || 1;

        const dx = charPos.x - attackPos.x;
        const dz = charPos.z - attackPos.z;

        const localX = dx * Math.cos(attackRotationY) - dz * Math.sin(attackRotationY);
        const localZ = dx * Math.sin(attackRotationY) + dz * Math.cos(attackRotationY);

        return Math.abs(localX) <= width / 2 && localZ >= 0 && localZ <= height;
    }

    // 直立（不貼地）的 \ 或 / 斜線標誌，有厚度，大小比照 Boss 模型
    _buildMarkerMesh(isBackslash) {
        const length = 1;
        const thickness = 0.4;
        const depth = 0.15;
        const geometry = new THREE.BoxGeometry(thickness, length, depth);
        const material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.9
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.z = isBackslash ? Math.PI / 4 : -Math.PI / 4;
        return mesh;
    }

    runSequence(monster, telegraphManager, onAttack) {
        const other = this.other;
        const castTime = (other.cast_time || 5.8) * 1000;
        const postCastDelay = (other.post_cast_delay !== undefined ? other.post_cast_delay : 0.9) * 1000;
        const interval = (other.interval || 2.5) * 1000;
        const hitDur = other.duration || 0.5;
        const positions = other.position || [];

        if (!other.no_log) gameLog.add(`${monster.config.name} 開始詠唱: ${this.data.name}`, "text-yellow-400 font-bold", monster.clock.now());

        monster.activeCast = {
            name: this.data.name,
            startTime: monster.clock.now(),
            duration: other.cast_time || 5.8
        };

        // 詠唱開始當下，在北側 8 個位置隨機生成 \ 或 / 標誌，直到全部攻擊結束前都不會消失（純視覺，不參與命中判定）
        const lastAttackIndex = positions.length - 1;
        const sequenceEndDelay = castTime + postCastDelay + lastAttackIndex * interval + hitDur * 1000;

        const markerTypes = positions.map(pos => {
            const isBackslash = monster.rng() < 0.5;
            telegraphManager.registerEffect({
                build: () => {
                    const mesh = this._buildMarkerMesh(isBackslash);
                    mesh.position.set(pos.x, pos.y + 0.5, pos.z);
                    return mesh;
                },
                durationMs: sequenceEndDelay
            });
            return isBackslash;
        });

        // 詠唱結束後等待 postCastDelay 施放第一次攻擊，之後每 interval 施放下一次；
        // \ 標誌往 270 度、/ 標誌往 90 度，攻擊區不顯示詠唱預警（cast_time: 0，直接建立攻擊區）
        markerTypes.forEach((isBackslash, i) => {
            const angleStart = isBackslash ? 270 : 90;
            const delay = castTime + postCastDelay + i * interval;

            monster.setTimeout(() => {
                if (!monster.spawned) return;

                const tempSkill = {
                    data: {
                        name: `${this.data.name} (第 ${i + 1} 段)`,
                        type: "LetsDanceSkill",
                        other: { cast_time: 0, duration: hitDur },
                        pre_attack: { width: 15, height: 15, angle_start: angleStart },
                        attack: { width: 15, height: 15, angle_start: angleStart, color: 0xff0000 }
                    },
                    logic: this
                };

                const targetAngle = angleStart * (Math.PI / 180);

                telegraphManager.createTelegraph(tempSkill, monster.model.position, (_, pos, __, id) => {
                    onAttack(tempSkill, pos, targetAngle, id);
                }, []);
            }, delay);
        });
    }
}
