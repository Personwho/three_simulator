import { ConeSkill } from './ConeSkill.js';
import { CircleSkill } from './CircleSkill.js';
import { SquareSkill } from './SquareSkill.js';
import { LineSkill } from './LineSkill.js';

export class SkillFactory {
    static create(skillData) {
        switch (skillData.type) {
            case 'ConeSkill': return new ConeSkill(skillData);
            case 'CircleSkill': return new CircleSkill(skillData);
            case 'SquareSkill': return new SquareSkill(skillData);
            case 'LineSkill': return new LineSkill(skillData);
            default:
                console.warn(`未知的技能類型: ${skillData.type}`);
                return null;
        }
    }
}