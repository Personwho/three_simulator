import { BaseMechanic } from './BaseMechanic.js';

export class StandardMechanic extends BaseMechanic {
    constructor(config) {
        super();
        this.config = config;
    }

    update(floor, dt) {
        if (floor.userData.isDisappeared) {
            const elapsed = (Date.now() - floor.userData.disappearStartTime) / 1000;
            if (elapsed >= 3) this._respawn(floor);
            return;
        }
        const playerCount = floor.userData.activePlayers.size;
        if (this.config.max_players && playerCount >= this.config.max_players) {
            this._vanish(floor, "人數過多");
            return;
        }
        if (playerCount === 1 && this.config.time_limit > 0) {
            floor.userData.standingTimer += dt;
            if (floor.userData.standingTimer > this.config.time_limit - 2) {
                this._setMatteColor(floor, parseInt(this.config.warning_color));
            }
            if (floor.userData.standingTimer > this.config.time_limit) {
                this._vanish(floor, "站立超時");
            }
        } else {
            floor.userData.standingTimer = 0;
            if (floor.userData.originalColor) {
                this._setMatteColor(floor, floor.userData.originalColor);
            }
        }
    }

    _setMatteColor(floor, hexColor) {
        if (!floor.material) return;
        floor.material.color.setHex(hexColor);
        // 如果是 MeshStandardMaterial 或 MeshPhysicalMaterial
        if (floor.material.roughness !== undefined) {
            floor.material.roughness = 1;   // 最大粗糙度，不產生鏡面反射
            floor.material.metalness = 0;   // 無金屬感，減少光斑
        }
    }

    _vanish(floor, reason) {
        floor.visible = false;
        floor.userData.isDisappeared = true;
        floor.userData.disappearStartTime = Date.now();
    }

    _respawn(floor) {
        floor.visible = true;
        floor.userData.isDisappeared = false;
        floor.userData.standingTimer = 0;
        this._setMatteColor(floor, floor.userData.originalColor);
    }
}