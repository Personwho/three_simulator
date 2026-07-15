import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';
import { gameLog } from '../../GameLog.js';

export class DiscoInfernalSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }

    _buildMesh(shape, defaultColor) {
        // 從配置中讀取半徑，預設 15 (全場)
        const radius = shape.radius || 15;
        const opacity = (shape.opacity !== undefined) ? shape.opacity : 0.5;

        // 建立圓形預警區域網格
        const geometry = new THREE.CircleGeometry(radius, 64);
        const material = new THREE.MeshBasicMaterial({
            color: (shape.color !== undefined) ? shape.color : defaultColor,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    createPreAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.preShape(skillData), 0xffa500);
    }

    createAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.attackShape(skillData), 0xff0000);
    }

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const radius = BaseSkill.attackShape(skillData).radius || 15;
        const dist = new THREE.Vector2(charPos.x, charPos.z).distanceTo(new THREE.Vector2(attackPos.x, attackPos.z));
        return dist <= radius;
    }

    runSequence(monster, telegraphManager, onAttack, allCharacters) {
        const other = this.other;
        const castTime = (other.cast_time || 0) * 1000;
        const debuffName = "蹦迪";
        const debuffIcon = "assets/icons/蹦迪.webp";

        // 隨機決定哪一組獲得短時長 (24s)
        const isGroupAFirst = monster.rng() > 0.5;
        const durationA = isGroupAFirst ? 24 : 32;
        const durationB = isGroupAFirst ? 32 : 24;

        // 分組定義：[T, H] vs [rD, mD]
        const groupConfigs = [
            { roles: ["T", "H"], duration: durationA },
            { roles: ["rD", "mD"], duration: durationB }
        ];

        const skillWrapper = { data: this.data, logic: this };

        // 1. 處理純傷害預警 (讀條結束後判定傷害)
        telegraphManager.createTelegraph(skillWrapper, monster.model.position, (data, pos, rot, id) => {
            onAttack(skillWrapper, pos, rot, id);
        });

        // 2. 直接分派 Debuff (讀條結束時執行)
        monster.setTimeout(() => {
            gameLog.add(`${monster.config.name} 分派 Debuff 狀態`, "text-pink-300", monster.clock.now());

            if (!allCharacters) return;

            allCharacters.forEach(char => {
                // 尋找該角色所屬的分組
                const group = groupConfigs.find(g => g.roles.includes(char.role));

                if (group) {
                    char.addStatusEffect({
                        name: debuffName,
                        icon: debuffIcon,
                        duration: group.duration,
                        value: 0,
                        isBuff: false
                    }, monster.clock.now());
                }
            });
        }, castTime);
    }
}
