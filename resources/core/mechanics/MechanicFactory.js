import { StandardMechanic } from './StandardMechanic.js';
import { NormalMechanic } from './NormalMechanic.js';

export class MechanicFactory {
    static create(config) {
        if (!config) return null;
        // 根據 JSON 中的 type 決定建立哪個機制
        switch (config.type) {
            case 'StandardMechanic': return new StandardMechanic(config);
            case 'NormalMechanic': return new NormalMechanic(config);
            // 未來可以擴展: case 'teleport': return new TeleportMechanic(config);
            default: return new NormalMechanic(config);
        }
    }
}