import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';

export class DiscoInfernalSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }

    createTelegraphMesh(skillData) {
        // 從配置中讀取半徑，預設 15 (全場)
        const radius = skillData.config?.radius || 15;
        const opacity = (skillData.opacity !== undefined) ? skillData.opacity : 0.5;

        // 建立圓形預警區域網格
        const geometry = new THREE.CircleGeometry(radius, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffa500, // 橘色預警
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

    checkHit(charPos, attackPos, attackRotationY, skillData) {
        const radius = skillData.config?.radius || 15;
        const dist = new THREE.Vector2(charPos.x, charPos.z).distanceTo(new THREE.Vector2(attackPos.x, attackPos.z));
        return dist <= radius;
    }

    runSequence(monster, telegraphManager, onAttack, allCharacters, addLog) {
        const config = this.data.config;
        const castTime = (this.data.cast_time || 0) * 1000;
        const debuffName = "蹦迪";
        const debuffIcon = "assets/icons/蹦迪.webp";

        // 隨機決定哪一組獲得短時長 (24s)
        const isGroupAFirst = Math.random() > 0.5;
        const durationA = isGroupAFirst ? 24 : 32;
        const durationB = isGroupAFirst ? 32 : 24;

        // 分組定義：[T, H] vs [rD, mD]
        const groupConfigs = [
            { roles: ["T", "H"], duration: durationA },
            { roles: ["rD", "mD"], duration: durationB }
        ];

        const skillWrapper = { data: this.data, logic: this };

        // 1. 處理純傷害預警 (4秒後判定傷害)
        telegraphManager.createTelegraph(skillWrapper, monster.model.position, (data, pos, rot, id) => {
            onAttack(skillWrapper, pos, rot, id);
        });

        // 2. 直接分派 Debuff (讀條結束時執行)
        monster.setTimeout(() => {
            if (addLog) addLog(`${monster.config.name} 分派 Debuff 狀態`, "text-pink-300");

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
                        isBuff: false,
                        startTime: Date.now()
                    });
                }
            });
        }, castTime);
    }
}