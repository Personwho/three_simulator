import { CircleSkill } from './CircleSkill.js';

export class SkillFactory {
    static create(skillData) {
        switch (skillData.type) {
            case 'CircleSkill': return new CircleSkill(skillData);
            default:
                console.warn(`未知的技能類型: ${skillData.type}`);
                return null;
        }
    }
}