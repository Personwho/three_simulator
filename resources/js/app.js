import '../css/app.css'

// jQuery
import $ from 'jquery';
window.$ = $;
window.jQuery = $;

// Moment.js
import moment from 'moment';
window.moment = moment;

let currentSceneData = null;
const modules = import.meta.glob('../content/*.json');

async function populateSceneSelect() {
    const sceneSelect = document.getElementById('scene-select');
    sceneSelect.innerHTML = '<option value="">請選擇地圖</option>';
    for (const path in modules) {
        const fileName = path.split('/').pop().replace('.json', '');
        const option = document.createElement('option');
        option.value = path;
        option.textContent = fileName;
        sceneSelect.appendChild(option);
    }
}

// 抽取更新玩家選單的邏輯
function updatePlayerSelect(data) {
    const playerSelect = document.getElementById('player-select');
    playerSelect.innerHTML = '';

    // 遍歷 teams (A, B, C) 下的所有玩家
    if (data.teams) {
        Object.keys(data.teams).forEach(teamName => {
            data.teams[teamName].players.forEach(p => {
                const option = document.createElement('option');
                option.value = p.name;
                option.textContent = `[Team ${teamName}] ${p.name} (${p.role})`;
                playerSelect.appendChild(option);
            });
        });
    }
}

// 當場景選單改變時
document.getElementById('scene-select').addEventListener('change', async (e) => {
    const path = e.target.value;
    if (!path) return;
    const module = await modules[path]();
    currentSceneData = module.default;
    updatePlayerSelect(currentSceneData);
});

// 載入場景按鈕
document.getElementById('load-scene').addEventListener('click', () => {
    const selectedPlayer = document.getElementById('player-select').value;
    if (currentSceneData) {
        import('../scenes/default.js').then(m => {
            m.createScene('three-container', currentSceneData, selectedPlayer);
        });
    }
});

// 開始按鈕
document.getElementById('start-game').addEventListener('click', () => {
    import('../scenes/default.js').then(m => m.startGame());
});

// 重置按鈕
document.getElementById('reset-game').addEventListener('click', () => {
    import('../scenes/default.js').then(m => m.resetGame());
});

// 初始化預設場景
async function initDefaultScene() {
    await populateSceneSelect();

    // 預設路徑 (相對於此檔案)
    const defaultPath = '../content/預設地圖.json';

    if (modules[defaultPath]) {
        // 1. 設定選單顯示為預設地圖
        document.getElementById('scene-select').value = defaultPath;

        // 2. 獲取 JSON 內容
        const module = await modules[defaultPath]();
        currentSceneData = module.default;

        // 3. 更新玩家選單並選取第一個玩家
        updatePlayerSelect(currentSceneData);

        // 從 teams 中尋找第一個玩家
        let firstPlayerName = '';
        if (currentSceneData.teams) {
            const firstTeamKey = Object.keys(currentSceneData.teams)[0];
            if (firstTeamKey && currentSceneData.teams[firstTeamKey].players.length > 0) {
                firstPlayerName = currentSceneData.teams[firstTeamKey].players[0].name;
            }
        }

        if (firstPlayerName) {
            document.getElementById('player-select').value = firstPlayerName;
        }

        // 4. 執行載入場景
        const { createScene } = await import('../scenes/default.js');
        createScene('three-container', currentSceneData, firstPlayerName);
    }
}

initDefaultScene();