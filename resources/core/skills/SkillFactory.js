import { CircleSkill } from './CircleSkill.js';
import { ConcentricDonutSkill } from './ConcentricDonutSkill.js';
import { ConeSkill } from './ConeSkill.js';
import { DonutSkill } from './DonutSkill.js';
import { LineSkill } from './LineSkill.js';
import { SquareSkill } from './SquareSkill.js';
// M5S
import { ArcadyNightFeverSkill } from './m5s/ArcadyNightFeverSkill.js';
import { DiscoInfernalSkill } from './m5s/DiscoInfernalSkill.js';
import { FunkyFloorSkill } from './m5s/FunkyFloorSkill.js';
import { LetsDanceSkill } from './m5s/LetsDanceSkill.js';
import { LightSkill } from './m5s/LightSkill.js';
import { SnapTwistDropTheNeedleSkill } from './m5s/SnapTwistDropTheNeedleSkill.js';

export class SkillFactory {
    static create(skillData) {
        if (!skillData || !skillData.type) {
            return null;
        }
        
        switch (skillData.type) {
            case 'CircleSkill': return new CircleSkill(skillData);
            case 'ConcentricDonutSkill': return new ConcentricDonutSkill(skillData);
            case 'ConeSkill': return new ConeSkill(skillData);
            case 'DonutSkill': return new DonutSkill(skillData);
            case 'LineSkill': return new LineSkill(skillData);
            case 'SquareSkill': return new SquareSkill(skillData);
            // M5S
            case 'ArcadyNightFeverSkill': return new ArcadyNightFeverSkill(skillData);
            case 'DiscoInfernalSkill': return new DiscoInfernalSkill(skillData);
            case 'FunkyFloorSkill': return new FunkyFloorSkill(skillData);
            case 'LetsDanceSkill': return new LetsDanceSkill(skillData);
            case 'LightSkill': return new LightSkill(skillData);
            case 'SnapTwistDropTheNeedleSkill': return new SnapTwistDropTheNeedleSkill(skillData);
            default:
                console.warn(`未知的技能類型: ${skillData.type}`);
                return null;
        }
    }
}