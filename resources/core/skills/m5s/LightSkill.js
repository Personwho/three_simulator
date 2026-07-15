import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';

export class LightSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }

    _buildMesh(shape) {
        const radius = shape.radius || 1;
        const geometry = new THREE.CircleGeometry(radius, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff, // 改回純白以利於混合
            transparent: true,
            opacity: 0.8,    // 稍微降低透明度，配合加法混合
            side: THREE.DoubleSide,
            depthWrite: false, // 不寫入深度快取，防止遮擋其他透明物
            depthTest: true,
            blending: THREE.AdditiveBlending, // 改用加法混合，使其有發光感且顏色疊加
            polygonOffset: true,
            polygonOffsetFactor: -10, // 增加偏移量，確保在所有預警預設層之上
            polygonOffsetUnits: -10
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;

        // 關鍵修正：提高渲染順序，數字愈大愈晚渲染（畫在最前面）
        mesh.renderOrder = 999;

        return mesh;
    }

    createPreAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.preShape(skillData));
    }

    createAttackMesh(skillData) {
        return this._buildMesh(BaseSkill.attackShape(skillData));
    }

    // 關鍵：此技能不造成傷害
    checkHit() {
        return false;
    }

    runSequence(monster, telegraphManager, onAttack) {
        const other = this.other;
        const path = other.position || []; // 移動路徑點位
        if (path.length < 1) return;

        const skillWrapper = { data: this.data, logic: this };

        // 使用 TelegraphManager 建立視覺效果，位置動畫改由 updateTelegraphPosition 於每個 tick 驅動
        telegraphManager.createTelegraph(skillWrapper, path[0], null, []);
    }

    // 由 TelegraphManager 每個 tick 呼叫：依「建立以來經過的模擬時間」決定光圈當前巡邏位置，
    // 取代原本自行用 requestAnimationFrame + Date.now() 驅動的動畫，確保快轉重演時位置正確
    // （DiscoStatus 會拿這顆 mesh 目前的位置去判定玩家是否站在光圈內）。
    updateTelegraphPosition(mesh, elapsedMs, skillData) {
        const other = BaseSkill.other(skillData);
        const path = other.position || [];
        if (path.length < 1) return;

        const initialStayTime = 2000; // 初始停留 2 秒
        const moveTime = 4000; // 移動 4 秒
        const stayTime = 4000; // 停留 4 秒
        const stepTime = moveTime + stayTime;

        if (elapsedMs < initialStayTime) {
            mesh.position.x = path[0].x;
            mesh.position.z = path[0].z;
            return;
        }

        const adjustedElapsed = elapsedMs - initialStayTime;
        const cycleIndex = Math.floor(adjustedElapsed / stepTime);
        const timeInCycle = adjustedElapsed % stepTime;

        const fromIdx = cycleIndex % path.length;
        const toIdx = (cycleIndex + 1) % path.length;
        const fromPos = path[fromIdx];
        const toPos = path[toIdx];

        if (timeInCycle < moveTime) {
            const t = timeInCycle / moveTime;
            mesh.position.x = fromPos.x + (toPos.x - fromPos.x) * t;
            mesh.position.z = fromPos.z + (toPos.z - fromPos.z) * t;
        } else {
            mesh.position.x = toPos.x;
            mesh.position.z = toPos.z;
        }
    }
}
