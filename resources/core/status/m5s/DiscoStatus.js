import { BaseStatus } from '../BaseStatus.js';
import { gameLog } from '../../GameLog.js';
import { BaseSkill } from '../../skills/BaseSkill.js';

export class DiscoStatus extends BaseStatus {
    onExpire(telegraphManager, nowMs) {
        let isInLight = false;

        // 判定邏輯
        if (telegraphManager) {
            for (const t of telegraphManager.activeTelegraphs) {
                // 必須是 LightSkill 產生的 Mesh
                if (t.skillInstance.data.type === 'LightSkill') {
                    const radius = BaseSkill.attackShape(t.skillInstance.data).radius || 1;
                    const dx = this.owner.model.position.x - t.mesh.position.x;
                    const dz = this.owner.model.position.z - t.mesh.position.z;
                    if (Math.sqrt(dx * dx + dz * dz) <= radius) {
                        isInLight = true;
                        break;
                    }
                }
            }
        }

        const nextName = isInLight ? "高光時刻" : "至暗時刻";
        const nextIcon = isInLight ? "assets/icons/高光時刻.webp" : "assets/icons/至暗時刻.webp";

        // 施加下一階段狀態 (定身)
        this.owner.addStatusEffect({
            name: nextName,
            icon: nextIcon,
            value: 0,
            duration: 3,
            isBuff: false
        }, nowMs);


        if (this.owner.isPlayer) {
            gameLog.add(`${this.owner.model.name} 結束蹦迪，獲得：${nextName}`, "text-yellow-300", nowMs);
        }
    }
}
