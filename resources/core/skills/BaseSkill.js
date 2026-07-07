export class BaseSkill {
    constructor(config) {
        this.config = config;
        this.name = config.name;
        this.castTime = config.cast_time;
        this.debuff = config.debuff;
    }
    createTelegraphMesh(skillData) { throw new Error("Must implement"); }
    checkHit(charPos, attackPos, attackRotationY, skillData) { throw new Error("Must implement"); }
}