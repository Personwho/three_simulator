export class Tool {
    static processData(type, data) {
        if (!data) return null;
        const copy = JSON.parse(JSON.stringify(data));

        switch (type) {
            case 'floor':
                copy.forEach(f => f.positions.forEach(p => p.x *= -1));
                break;
            case 'players':
                Object.values(copy).forEach(team => {
                    team.players.forEach(p => {
                        p.default_position.x *= -1;
                        if (p.path) p.path.forEach(s => { if (s.position) s.position.x *= -1; });
                    });
                });
                break;
            case 'monsters':
                copy.forEach(m => {
                    m.position.x *= -1;
                    m.skills.forEach(s => { if (s.position) s.position.x *= -1; });
                });
                break;
        }
        return copy;
    }
}