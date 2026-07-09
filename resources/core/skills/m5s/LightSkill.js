import * as THREE from 'three';
import { BaseSkill } from '../BaseSkill.js';

export class LightSkill extends BaseSkill {
    constructor(skillData) {
        super(skillData);
        this.data = skillData;
    }
    // 0xe1e1df
    createTelegraphMesh(skillData) {
        const radius = skillData.config?.radius || 1;
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

    // 關鍵：此技能不造成傷害
    checkHit() {
        return false;
    }

    runSequence(monster, telegraphManager, onAttack, allCharacters, addLog) {
        const config = this.data.config;
        const path = config.position || []; // 移動路徑點位
        const duration = (this.data.duration || 35) * 1000;
        const initialStayTime = 2000; // 新增：初始停留 2 秒
        const moveTime = 4000; // 移動 4 秒
        const stayTime = 4000; // 停留 4 秒
        const stepTime = moveTime + stayTime;

        if (path.length < 1) return;

        // 建立預警物件
        const skillWrapper = { data: this.data, logic: this };
        const startTime = Date.now();
        
        // 取得初始位置
        const initialPos = path[0];
        
        // 使用 TelegraphManager 建立視覺效果
        telegraphManager.createTelegraph(skillWrapper, initialPos, null, []);

        // 取得剛建立的 Mesh 引用進行動畫 (假設它是最後一個加入的)
        const telegraphEntry = telegraphManager.activeTelegraphs[telegraphManager.activeTelegraphs.length - 1];
        const mesh = telegraphEntry.mesh;

        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTime;

            if (elapsed > duration || !mesh.parent) return;

            // 1. 處理初始停留 2 秒的邏輯
            if (elapsed < initialStayTime) {
                mesh.position.x = path[0].x;
                mesh.position.z = path[0].z;
            } else {
                // 2. 扣除初始停留時間，計算後續的循環移動
                const adjustedElapsed = elapsed - initialStayTime;
                
                const cycleIndex = Math.floor(adjustedElapsed / stepTime);
                const timeInCycle = adjustedElapsed % stepTime;

                const fromIdx = cycleIndex % path.length;
                const toIdx = (cycleIndex + 1) % path.length;
                const fromPos = path[fromIdx];
                const toPos = path[toIdx];

                if (timeInCycle < moveTime) {
                    // 移動階段
                    const t = timeInCycle / moveTime;
                    mesh.position.x = fromPos.x + (toPos.x - fromPos.x) * t;
                    mesh.position.z = fromPos.z + (toPos.z - fromPos.z) * t;
                } else {
                    // 停留階段
                    mesh.position.x = toPos.x;
                    mesh.position.z = toPos.z;
                }
            }

            requestAnimationFrame(animate);
        };

        animate();
    }
}