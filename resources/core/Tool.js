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
                            s.config.position.x *= -1;
                        }
                    });
                });
                break;
        }
        return copy;
    }
}