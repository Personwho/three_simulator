import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';

export class ConcentricDonutSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }

    // 雖然 runSequence 會處理主要的 Mesh，但為了相容性仍保留此方法
    createTelegraphMesh(skillData) {
        const inner = skillData.config?.inner_radius || 3;
        const outer = skillData.config?.outer_radius || 10;
        const isInnerPart = skillData.config?.is_inner_part;

        // 根據目前是哪一部分產生對應的幾何體
        const geometry = isInnerPart 
            ? new THREE.CircleGeometry(inner, 64) 
            : new THREE.RingGeometry(inner, outer, 64);

        const material = new THREE.MeshBasicMaterial({
            color: skillData.config?.color || 0xff0000,
            transparent: true,
            opacity: 0.5,
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
        const inner = skillData.config?.inner_radius || 3;
        const outer = skillData.config?.outer_radius || 10;
        const isInnerPart = skillData.config?.is_inner_part;

        const dx = charPos.x - attackPos.x;
        const dz = charPos.z - attackPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // 內圓判定：距離小於內半徑
        if (isInnerPart) return dist <= inner;
        // 外圓判定：距離在內外半徑之間
        return dist >= inner && dist <= outer;
    }

    runSequence(monster, telegraphManager, onAttack, allCharacters, addLog) {
        const config = this.data.config;
        const innerRadius = config.inner_radius || 3;
        const outerRadius = config.outer_radius || 10;
        const interval = (config.interval || 1.5) * 1000;
        const castTime = (this.data.cast_time || 3) * 1000;

        // 核心修正：從 config 讀取自定義名稱，若無則使用預設值
        const innerFirstName = config.inner_first_name || "爆炸：由內而外";
        const outerFirstName = config.outer_first_name || "爆炸：由外而內";

        // 隨機決定順序
        const isInnerFirst = Math.random() > 0.5;
        const seqName = isInnerFirst ? innerFirstName : outerFirstName;

        if (addLog) addLog(`${monster.config.name} 開始施放 ${seqName}`, "text-yellow-400");
        
        monster.activeCast = {
            name: seqName,
            startTime: Date.now(),
            duration: this.data.cast_time
        };

        const parts = [
            { isInner: isInnerFirst, delay: castTime },
            { isInner: !isInnerFirst, delay: castTime + interval }
        ];

        parts.forEach(part => {
            monster.setTimeout(() => {
                const subSkill = {
                    data: {
                        name: part.isInner ? "內圓爆發" : "月環爆發",
                        type: "DonutSkill", // 使用 DonutSkill 邏輯
                        cast_time: 0,
                        duration: 0.5,
                        config: {
                            inner_radius: innerRadius,
                            outer_radius: outerRadius,
                            is_inner_part: part.isInner,
                            active_color: 0x8b0000
                        }
                    },
                    logic: this
                };

                telegraphManager.createTelegraph(subSkill, monster.model.position, (data, pos, rot, id) => {
                    onAttack(subSkill, pos, rot, id);
                });
            }, part.delay);
        });
    }
}