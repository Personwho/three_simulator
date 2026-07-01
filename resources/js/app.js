import '../css/app.css'

// jQuery
import $ from 'jquery';
window.$ = $;
window.jQuery = $;

// Moment.js
import moment from 'moment';
window.moment = moment;

let currentSceneData = { floor: null, players: null, monsters: null };

// 抓取 content 下所有子資料夾中的 .json 檔案
const jsonModules = import.meta.glob('../content/**/*.json');

// 從路徑中解析出所有的關卡（資料夾名稱）
async function getScenes() {
    const scenes = new Set();
    for (const path in jsonModules) {
        // 路徑格式範例: ../content/預設地圖/floor.json
        const parts = path.split('/');
        if (parts.length >= 4) {
            scenes.add(parts[2]); // 取得 "預設地圖"
        }
    }
    return Array.from(scenes);
}

// 根據資料夾名稱載入該關卡的所有 JSON
async function loadSceneData(sceneName) {
    const basePath = `../content/${sceneName}`;
    const [floor, player, monster] = await Promise.all([
        jsonModules[`${basePath}/floor.json`](),
        jsonModules[`${basePath}/player.json`](),
        jsonModules[`${basePath}/monster.json`]()
    ]);

    return {
        floor: floor.default,
        players: player.default,
        monsters: monster.default
    };
}

async function populateSceneSelect() {
    const sceneSelect = document.getElementById('scene-select');
    const scenes = await getScenes();

    sceneSelect.innerHTML = '<option value="">請選擇關卡</option>';
    scenes.forEach(scene => {
        const option = document.createElement('option');
        option.value = scene;
        option.textContent = scene;
        sceneSelect.appendChild(option);
    });
}

// 抽取更新玩家選單的邏輯
function updatePlayerSelect(data) {
    const playerSelect = document.getElementById('player-select');
    playerSelect.innerHTML = '';
    if (data.players) {
        Object.keys(data.players).forEach(teamName => {
            data.players[teamName].players.forEach(p => {
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
    const sceneName = e.target.value;
    if (!sceneName) return;
    currentSceneData = await loadSceneData(sceneName);
    updatePlayerSelect(currentSceneData);
});

// 載入場景按鈕
document.getElementById('load-scene').addEventListener('click', async () => {
    const selectedPlayer = document.getElementById('player-select').value;
    if (!currentSceneData.floor) return;
    const { createScene } = await import('../core/Secene.js');
    createScene('three-container', currentSceneData, selectedPlayer);
});

// 開始按鈕
document.getElementById('start-game').addEventListener('click', () => {
    import('../core/Secene.js').then(m => m.startGame());
});

// 重置按鈕
document.getElementById('reset-game').addEventListener('click', () => {
    const selectedPlayer = document.getElementById('player-select').value;
    import('../core/Secene.js').then(m => m.resetGame(selectedPlayer));
});

// 初始化預設場景
async function initDefaultScene() {
    await populateSceneSelect();
    const sceneSelect = document.getElementById('scene-select');

    // 如果有預設關卡則自動選取第一個
    if (sceneSelect.options.length > 1) {
        sceneSelect.selectedIndex = 1;
        const sceneName = sceneSelect.value;
        currentSceneData = await loadSceneData(sceneName);
        updatePlayerSelect(currentSceneData);

        let firstPlayerName = '';
        if (currentSceneData.players) {
            const firstTeamKey = Object.keys(currentSceneData.players)[0];
            firstPlayerName = currentSceneData.players[firstTeamKey].players[0]?.name;
        }

        if (firstPlayerName) {
            document.getElementById('player-select').value = firstPlayerName;
            const { createScene } = await import('../core/Secene.js');
            createScene('three-container', currentSceneData, firstPlayerName);
        }
    }
}

initDefaultScene();

// 禁止全域右鍵選單
window.addEventListener('contextmenu', (e) => e.preventDefault());