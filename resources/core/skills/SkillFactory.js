import { ConeSkill } from './ConeSkill.js';
import { CircleSkill } from './CircleSkill.js';
import { SquareSkill } from './SquareSkill.js';
import { LineSkill } from './LineSkill.js';
import { SnapTwistDropTheNeedleSkill } from './SnapTwistDropTheNeedleSkill.js';
import { FunkyFloorSkill } from './FunkyFloorSkill.js';
import { DonutSkill } from './DonutSkill.js';
import { ConcentricDonutSkill } from './ConcentricDonutSkill.js';

export class SkillFactory {
    static create(skillData) {
        if (!skillData || !skillData.type) {
            return null;
        }
        
        switch (skillData.type) {
            case 'ConeSkill': return new ConeSkill(skillData);
            case 'CircleSkill': return new CircleSkill(skillData);
            case 'SquareSkill': return new SquareSkill(skillData);
            case 'LineSkill': return new LineSkill(skillData);
            case 'SnapTwistDropTheNeedleSkill': return new SnapTwistDropTheNeedleSkill(skillData);
            case 'FunkyFloorSkill': return new FunkyFloorSkill(skillData);
            case 'DonutSkill': return new DonutSkill(skillData);
            case 'ConcentricDonutSkill': return new ConcentricDonutSkill(skillData);
            default:
                console.warn(`未知的技能類型: ${skillData.type}`);
                return null;
        }
    }
}