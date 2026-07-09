import { BaseStatus } from './BaseStatus.js';
import { SlowStatus } from './SlowStatus.js';
import { SpeedStatus } from './SpeedStatus.js';

// m5s
import { DiscoStatus } from './m5s/DiscoStatus.js';

export class StatusFactory {
    static create(owner, data) {
        switch (data.name) {
            case '衝刺':
                return new SpeedStatus(owner, data);
            case '加重': 
                return new SlowStatus(owner, data);
            // m5s
            case '蹦迪': 
                return new DiscoStatus(owner, data);
            case '高光時刻': 
            case '至暗時刻': 
                return new SlowStatus(owner, data);
            default: return new BaseStatus(owner, data);
        }
    }
}