import * as THREE from 'three';
import { BaseSkill } from './BaseSkill.js';
import { gameLog } from '../GameLog.js';

export class ConcentricDonutSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }

    _buildMesh(shape, defaultColor) {
        const innerR = shape.inner_radius ?? 3;
        const outerR = shape.outer_radius ?? 10;
        const isInner = shape.is_inner_part;
        const opacity = (shape.opacity !== undefined) ? shape.opacity : 0.5;

        const geometry = isInner
            ? new THREE.CircleGeometry(innerR, 64)
            : new THREE.RingGeometry(innerR, outerR, 64);

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
        const shape = BaseSkill.attackShape(skillData);
        const innerR = shape.inner_radius ?? 3;
        const outerR = shape.outer_radius ?? 10;
        const isInner = shape.is_inner_part;

        const dx = charPos.x - attackPos.x;
        const dz = charPos.z - attackPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        return isInner
            ? dist <= innerR
            : dist >= innerR && dist <= outerR;
    }

    runSequence(monster, telegraphManager, onAttack, allCharacters) {
        const other = this.other;
        const castTime = (other.cast_time || 3) * 1000;
        const interval = (other.interval || 1.5) * 1000;
        const repeat = other.repeat || 1;     // 重複次數
        const random = other.random !== false; // 預設 true，false 則照 order 指定
        const hitDuration = other.duration || 0.5;
        const preOpacity = (this.preAttack.opacity !== undefined) ? this.preAttack.opacity : 0.5;

        // ── 半徑設定 (鋼鐵/月環可各自設定) ──────────────────────
        const steelInner = other.steel_inner_radius ?? Math.SQRT2;
        const steelOuter = other.steel_outer_radius ?? 15;
        const donutInner = other.donut_inner_radius ?? 1;
        const donutOuter = other.donut_outer_radius ?? 15;

        // ── 名稱設定 ──────────────────────────────────────────────
        const innerFirstName = other.inner_first_name || "鋼鐵優先";
        const outerFirstName = other.outer_first_name || "月環優先";

        // ── 建立每輪的順序清單 ────────────────────────────────────
        // order 陣列：true = 鋼鐵先、false = 月環先
        // 若 other.order 有指定 (如 [true, false, true])，則直接使用；否則每輪隨機
        const orderList = other.order
            ? other.order.slice(0, repeat)
            : Array.from({ length: repeat }, () => random ? monster.rng() > 0.5 : true);

        // 第一輪決定名稱用於讀條顯示
        const seqName = orderList[0] ? innerFirstName : outerFirstName;
        if (!other.no_log) gameLog.add(`${monster.config.name} 開始施放 ${seqName}`, "text-yellow-400", monster.clock.now());

        monster.activeCast = {
            name: seqName,
            startTime: monster.clock.now(),
            duration: other.cast_time || 3
        };

        // ── 依重複次數逐輪排程 ────────────────────────────────────
        for (let round = 0; round < repeat; round++) {
            const isInnerFirst = orderList[round];
            const roundOffset = round * (interval * 2);

            const parts = [
                { isInner: isInnerFirst, delay: castTime + roundOffset },
                { isInner: !isInnerFirst, delay: castTime + roundOffset + interval }
            ];

            parts.forEach((part, partIndex) => {
                // 修正：第一輪第一個 subSkill 在讀條開始時就顯示預警
                const isFirstSkill = round === 0 && partIndex === 0;

                const scheduleDelay = isFirstSkill ? 0 : part.delay;

                monster.setTimeout(() => {
                    const innerR = part.isInner ? steelInner : donutInner;
                    const outerR = part.isInner ? steelOuter : donutOuter;

                    const subSkill = {
                        data: {
                            name: `${seqName} - ` + (part.isInner ? "鋼鐵" : "月環"),
                            type: "DonutSkill",
                            other: {
                                cast_time: isFirstSkill ? (other.cast_time || 3) : 0,
                                duration: hitDuration
                            },
                            pre_attack: {
                                inner_radius: innerR,
                                outer_radius: outerR,
                                is_inner_part: part.isInner,
                                color: 0xffa500,
                                opacity: preOpacity
                            },
                            attack: {
                                inner_radius: innerR,
                                outer_radius: outerR,
                                is_inner_part: part.isInner,
                                color: 0xff0000
                            }
                        },
                        logic: this
                    };

                    telegraphManager.createTelegraph(
                        subSkill,
                        monster.model.position,
                        (data, pos, rot, id) => onAttack(subSkill, pos, rot, id)
                    );
                }, scheduleDelay);
            });
        }
    }
}
