export class Tool {
    static processData(type, data) {
        if (!data) return null;
        const copy = JSON.parse(JSON.stringify(data));

        switch (type) {
            case 'floor':
                copy.forEach(f => {
                    if (f.instances) {
                        f.instances.forEach(inst => {
                            if (inst.position) inst.position.x *= -1;
                        });
                    }
                });
                break;
            case 'players':
                Object.values(copy).forEach(team => {
                    team.players.forEach(p => {
                        p.default_position.x *= -1;
                        if (p.camera_offset) p.camera_offset.x *= -1; // 新增：轉換相機偏移 X
                        if (p.path) p.path.forEach(s => { if (s.position) s.position.x *= -1; });
                        if (p.scheduled_moves) p.scheduled_moves.forEach(s => { if (s.position) s.position.x *= -1; });
                    });
                });
                break;
            case 'monsters':
                copy.forEach(m => {
                    if (m.position) m.position.x *= -1;

                    if (m.path) {
                        m.path.forEach(node => {
                            if (node.position) node.position.x *= -1;
                        });
                    }

                    m.skills.forEach(s => Tool._flipSkillPositions(s));
                });
                break;
        }
        return copy;
    }

    // 技能 JSON 的錨點座標一律放在 other.position（單點物件或陣列皆可），
    // 遞迴處理是因為 shuffled_sequence/random_single 包裝技能會在 other.skills[] 巢狀完整子技能。
    static _flipSkillPositions(skill) {
        if (!skill || !skill.other) return;

        Tool._flipPosition(skill.other.position);
        Tool._flipPosition(skill.other.bomb_a_positions);
        Tool._flipPosition(skill.other.bomb_b_positions);

        if (Array.isArray(skill.other.skills)) {
            skill.other.skills.forEach(sub => Tool._flipSkillPositions(sub));
        }
    }

    static _flipPosition(position) {
        if (!position) return;
        if (Array.isArray(position)) {
            position.forEach(pos => {
                if (pos && typeof pos.x === 'number') pos.x *= -1;
            });
        } else if (typeof position.x === 'number') {
            position.x *= -1;
        }
    }
}
