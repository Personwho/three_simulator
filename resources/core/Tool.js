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

                    m.skills.forEach(s => {
                        if (s.config && s.config.position) {
                            if (Array.isArray(s.config.position)) {
                                // 如果是陣列，遍歷每一筆資料轉換 x 座標
                                s.config.position.forEach(pos => {
                                    if (pos && typeof pos.x === 'number') {
                                        pos.x *= -1;
                                    }
                                });
                            } else {
                                // 如果是單一物件
                                s.config.position.x *= -1;
                            }
                        }

                        if(s.config && s.config.skills) {
                            s.config.skills.forEach(subSkill => {
                                if (subSkill.config && subSkill.config.position) {
                                    if (Array.isArray(subSkill.config.position)) {
                                        subSkill.config.position.forEach(pos => {
                                            if (pos && typeof pos.x === 'number') {
                                                pos.x *= -1;
                                            }
                                        });
                                    } else {
                                        subSkill.config.position.x *= -1;
                                    }
                                }
                            });
                        }
                    });
                });
                break;
        }
        return copy;
    }
}