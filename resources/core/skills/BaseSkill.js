export class BaseSkill {
    constructor(config) {
        this.config = config;
        this.name = config.name;
        this.other = config.other || {};
        this.castTime = this.other.cast_time;
        this.duration = this.other.duration;
        this.debuff = this.other.debuff;

        // 詠唱預警區形狀/樣式
        this.preAttack = config.pre_attack || {};
        // 施放攻擊區形狀/樣式：獨立讀取 json 的 attack 設定，不繼承 pre_attack
        this.attack = config.attack || {};
    }

    // 詠唱時顯示的預警區 mesh
    createPreAttackMesh(skillData) { throw new Error("Must implement"); }
    // 施放瞬間顯示、實際造成命中判定的攻擊區 mesh
    createAttackMesh(skillData) { throw new Error("Must implement"); }
    checkHit(charPos, attackPos, attackRotationY, skillData) { throw new Error("Must implement"); }

    // ---- 靜態輔助：從任意 skillData（包含 runSequence 動態組出的一次性 wrapper）取出形狀設定 ----
    // 注意：不可用 this.preAttack/this.attack，因為同一個技能實例（logic）常被 runSequence
    // 重複拿去包裝不同的 data 使用（見 ConcentricDonutSkill/ArcadyNightFeverSkill 等）。
    // pre_attack 與 attack 各自獨立，不互相繼承——兩個 mesh 各自完整讀自己的 json 設定。
    static preShape(skillData) {
        return skillData.pre_attack || {};
    }

    static attackShape(skillData) {
        return skillData.attack || {};
    }

    static other(skillData) {
        return skillData.other || {};
    }
}
