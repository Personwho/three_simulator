import { BaseStatus } from './BaseStatus.js';

export class SlowStatus extends BaseStatus {
    applyEffect(stats) {
        stats.debuffMultiplier = Math.min(stats.debuffMultiplier, this.value);
    }
}
