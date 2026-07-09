import { BaseStatus } from './BaseStatus.js';

export class SpeedStatus extends BaseStatus {
    applyEffect(stats) {
        stats.buffMultiplier += (this.value - 1);
    }
}
