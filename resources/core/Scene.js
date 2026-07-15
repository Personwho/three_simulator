import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character } from './Character.js';
import { Floor } from './Floor.js';
import { TelegraphManager } from './TelegraphManager.js';
import { Monster } from './Monster.js';
import { Tool } from './Tool.js';
import { ActionBar } from './ActionBar.js';
import { SkillFactory } from './skills/SkillFactory.js';
import { GameClock } from './GameClock.js';
import { createRng, createSeed } from './SeededRandom.js';
import { gameLog } from './GameLog.js';

// 快轉時每步模擬的固定時間片（毫秒），以及安全上限，避免誤觸超大秒數卡死畫面
// 注意：必須貼近真實影格間隔（約 60fps）。角色重力/落地判定的容許誤差很小（見
// Character.js 的落地容許區間），步距一旦拉大（例如 100ms），重力會讓角色一步就
// 掉出判定區間，導致每個角色都被判定「掉出場外」而觸發重置，快轉因此卡在 0 秒。
const FAST_FORWARD_STEP_MS = 1000 / 60;
const FAST_FORWARD_MAX_STEPS = 90000; // 90000 * 1/60s = 1500 秒（25 分鐘），足夠涵蓋單場戰鬥
// 真實 rAF 影格 dt 的安全上限（秒）：同樣是為了不讓角色重力/落地判定被過大的 dt 沖出容許範圍
const MAX_FRAME_DT = 1 / 30;
// 快轉時每模擬這麼多個 tick 就實際畫一幀給使用者看，數字愈大播放感覺愈快
const FAST_FORWARD_TICKS_PER_FRAME = 10;

class SceneManager {
    constructor() {
        this.loader = new GLTFLoader();
        this.scene = null;
        this.renderer = null;
        this.camera = null;
        this.controls = null;
        this.groundObjects = [];
        this.characters = [];
        this.monsterInstances = [];
        this.telegraphManager = null;
        this.controlledCharacter = null;
        this.animationId = null;
        this.isGameRunning = false;
        this.previousTime = 0;
        this.sceneData = null;
        this.lastStatusUIUpdate = 0; // 上次 UI 更新時間（模擬時間 ms）
        this.lastStatusFingerprint = ""; // 狀態清單指紋
        this.actionBar = new ActionBar();
        this.interactionRaycaster = new THREE.Raycaster(); // 提升到成員變數複用
        this._isFastForwarding = false; // 快轉中：animate() 的 rAF 迴圈要讓出，避免和快轉自己的 tick 重複模擬
        this._loadGeneration = 0; // 場景載入世代編號，防止重疊的 init() 呼叫互相污染彼此的角色/怪物清單

        // 模擬時鐘：所有戰鬥邏輯（技能排程、Buff/Debuff 到期、預警倒數）都以此為準，
        // 讓「快轉到指定秒數」可以用同一套邏輯同步重演，而不是依賴真實時間。
        this.clock = new GameClock();
        this.seed = 0;
        this.rng = createRng(0);
    }

    async init(containerId, { floor, players, monsters }, selectedPlayerName, isDebug = false) {
        // 這次載入的世代編號：若載入途中（等待 GLTF 等 async 資源時）又觸發了新的 init()，
        // 舊的這次會在每個await 點之後發現世代已經被超越，安全中止，避免兩批角色/怪物混在一起同時跑。
        const generation = ++this._loadGeneration;

        // 使用 Tool 處理資料
        this.sceneData = {
            floor: Tool.processData('floor', floor),
            teams: Tool.processData('players', players),
            monsters: Tool.processData('monsters', monsters)
        };
        const container = document.getElementById(containerId);

        this.lastStatusFingerprint = "";
        this.actionBar.reset();

        const lists = document.querySelectorAll('#status-effects-container .status-list');
        lists.forEach(list => list.innerHTML = '');

        if (this.renderer) {
            cancelAnimationFrame(this.animationId);
            container.removeChild(this.renderer.domElement);
            this._disposeScene();
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);

        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.01, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);

        this.clock.set(0);
        this._rollNewSeed();
        this.telegraphManager = new TelegraphManager(this.scene, this.clock);

        gameLog.clear();
        gameLog.add("場景載入完成", "text-blue-400", this.clock.now());

        await this._setupObjects(selectedPlayerName, generation);
        if (generation !== this._loadGeneration) return; // 已被更新的 init() 呼叫取代，這次到此為止

        this._setupLights();
        if (isDebug) {
            this._setupHelpers();
        }
        this._setupControls();
        this._setupEventListeners(container);

        this.animate(0);
    }

    // 產生新的一次性種子，讓下一次開始/重置/快轉都以同一顆種子重演
    _rollNewSeed() {
        this.seed = createSeed();
        this.rng = createRng(this.seed);
    }

    async _setupObjects(selectedPlayerName, generation) {
        this.groundObjects = [];
        this.characters = [];
        this.monsterInstances = [];

        for (const f of this.sceneData.floor) {
            const tiles = await Floor.create(f, this.loader);
            if (generation !== this._loadGeneration) return; // 已被更新的載入取代，停止繼續添加物件
            tiles.forEach(tile => {
                tile.name = "floor_default";
                this.scene.add(tile);
                this.groundObjects.push(tile);
            });
        }

        if (this.sceneData.teams) {
            for (const teamName in this.sceneData.teams) {
                for (const p of this.sceneData.teams[teamName].players) {
                    const gltf = await this.loader.loadAsync(p.model);
                    if (generation !== this._loadGeneration) return;

                    // --- 強化角色顯色邏輯 ---
                    gltf.scene.traverse(node => {
                        if (node.isMesh) {
                            node.material.roughness = 0.5;
                            node.material.metalness = 0.2;
                            // 關鍵修正：將自發光設為淡灰色，避免顏色過曝，但強度提高到 0.2~0.3
                            node.material.emissive = new THREE.Color(0xffffff);
                            node.material.emissiveIntensity = 0.3;
                        }
                    });
                    // -----------------------

                    gltf.scene.scale.set(p.scale, p.scale, p.scale);
                    const isSelected = (p.name === selectedPlayerName);
                    const char = new Character(gltf.scene, this.camera, isSelected, { ...p, team: teamName });
                    char.config = p;
                    char.onFall = () => this.reset();
                    char.model.position.set(p.default_position.x, p.default_position.y, p.default_position.z);
                    char.pathData = p.path;
                    char.scheduledMoves = p.scheduled_moves || [];
                    char.name = p.name;
                    this.scene.add(char.model);
                    this.characters.push(char);
                    if (isSelected) this.controlledCharacter = char;
                }
            }
        }
        if (!this.controlledCharacter && this.characters.length > 0) this.controlledCharacter = this.characters[0];

        for (const mData of this.sceneData.monsters) {
            const gltf = await this.loader.loadAsync(mData.model);
            if (generation !== this._loadGeneration) return;
            // 用一個間接函式傳入 rng，這樣重置/快轉重新產生種子後，Monster 仍會拿到最新的亂數來源
            const monster = new Monster(gltf.scene, mData, this.clock, () => this.rng());
            this.scene.add(monster.model);
            this.monsterInstances.push(monster);
        }
    }

    _setupLights() {
        // 1. 強大的基礎環境光：這是解決「角色太暗」最直接的方法
        // 調高至 3.0 以上，強制拉高所有物件的最低亮度
        const ambient = new THREE.AmbientLight(0xffffff, 10);
        ambient.name = "default";
        this.scene.add(ambient);

        // 2. 半球光：提供自然的冷暖色調過渡 (天空白色，地面淺灰色)
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 3);
        hemiLight.name = "default";
        this.scene.add(hemiLight);

        // 3. 主平行光：從上方垂直照射，建立頂部的亮面
        const mainLight = new THREE.DirectionalLight(0xffffff, 3.0);
        mainLight.name = "default";
        mainLight.position.set(0, 20, 0);
        this.scene.add(mainLight);

        // 4. 正面填補光：確保臉部永遠是亮的
        const frontLight = new THREE.DirectionalLight(0xffffff, 4.0);
        frontLight.name = "default";
        frontLight.position.set(0, 10, 20); // 從相機方向往回照
        this.scene.add(frontLight);
    }

    _setupHelpers() {
        const grid = new THREE.GridHelper(50, 50, 0x444444, 0x888888);
        grid.position.y = 10;
        this.scene.add(grid);
        const axes = new THREE.AxesHelper(10);
        axes.position.set(0, 10.01, 0);
        this.scene.add(axes);

        // 新增：顯示地基物件的碰撞區域 (綠色)
        this.groundObjects.forEach(obj => {
            const helper = new THREE.BoxHelper(obj, 0x00ff00);
            this.scene.add(helper);
        });

        // 新增：顯示角色的碰撞區域 (紅色)
        this.characters.forEach(char => {
            const radius = 0.08;
            const height = 1;

            const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
            const collisionMesh = new THREE.Mesh(geometry, material);

            // 將中心點移至模型正上方，使其底部剛好與腳底對齊
            collisionMesh.position.y = height / 2;

            // 將輔助網格直接加入到角色模型中，它會自動隨模型移動
            char.model.add(collisionMesh);

            // 標記為 debugHelper 方便後續管理
            char.debugHelper = collisionMesh;
        });
    }

    _setupControls() {
        if (!this.controlledCharacter) return;
        const p = this.controlledCharacter.model.position;
        const offset = this.controlledCharacter.config.camera_offset || { x: 0, y: 0.5, z: -1 };
        this.camera.position.set(p.x + offset.x, p.y + offset.y, p.z + offset.z);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(p.x, p.y + 0.3, p.z);
        this.controls.enableDamping = true;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 1.5;
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    }

    _setupEventListeners(container) {
        container.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('resize', () => {
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        });
        window.addEventListener('keydown', (e) => {
            if (this.controlledCharacter) {
                this.actionBar.trigger(e.key, this.controlledCharacter, this.clock.now());
            }
        });
    }

    _handleAttack = (skillData, pos, rotationY, instanceId) => {
        // 1. 取得技能定義資料
        const data = skillData.data || skillData;

        // 2. 優先使用現有的 logic 實例，若無則建立 (相容 Player 技能)
        const logic = skillData.logic || SkillFactory.create(data);

        if (!logic || !data.type) {
            console.warn('Invalid skill or logic:', skillData);
            return;
        }

        const other = data.other || {};
        const now = this.clock.now();

        // 1. 施放紀錄
        if (!other.no_log) {
            gameLog.addThrottled(`${data.name}_c`, `Boss 施放 ${data.name}`, "text-yellow-400", 1000, now);
        }

        this.characters.forEach(char => {
            if (!logic.checkHit(char.model.position, pos, rotationY, data)) return;

            const isPlayer = char === this.controlledCharacter;
            const hitKey = `${instanceId}_h`;
            // 2. 命中紀錄
            if (isPlayer) {
                gameLog.addThrottled(hitKey, `[命中] ${char.name} 被 ${data.name} 擊中了！`, "text-red-500 font-bold", 500, now);
            }

            // 3. Debuff 紀錄
            const debuff = other.debuff;
            if (debuff) {
                char.addStatusEffect({ ...debuff }, now);
                const debuffKey = `${instanceId}_d`;
                if (isPlayer) {
                    gameLog.addThrottled(debuffKey, `[狀態] ${char.name} 獲得了 ${debuff.name}`, "text-purple-400", 500, now);
                }
            }
        });
    }

    start() {
        if (this.isGameRunning) return;

        gameLog.clear();
        gameLog.add("戰鬥開始！", "text-green-400 font-bold", 0);

        // 開始前再次確保所有狀態與技能重置
        this.characters.forEach(char => char.statusEffects = []);
        this.actionBar.reset();
        this.lastStatusFingerprint = ""; // 重置指紋，強制 UI 刷新

        this.isGameRunning = true;
        this.clock.set(0);
    }

    reset(selectedPlayerName = null) {
        this.isGameRunning = false;
        this.clock.set(0);
        this.lastStatusFingerprint = ""; // 確保 UI 指紋在重置時被清空
        this._rollNewSeed(); // 換一次新的隨機戰鬥
        gameLog.add("遊戲重置", "text-gray-400", 0);

        if (!this.scene) return;

        this._resetSimulationState(selectedPlayerName);
        this._snapCameraToControlled();
    }

    // 快轉：從頭（種子不變）以固定步長同步重演到指定秒數，讓怪物/角色/預警/Buff 狀態
    // 都和「真的玩到那一秒」完全一致。過程中每模擬幾個 tick 就實際畫一幀，讓使用者看得到播放過程。
    async fastForwardTo(targetSeconds) {
        if (!this.scene || !this.telegraphManager) return;
        if (this._isFastForwarding) return; // 避免重複點擊造成兩個快轉同時跑、互相干擾狀態

        const targetMs = Math.max(0, targetSeconds || 0) * 1000;

        this._isFastForwarding = true; // 期間讓 animate() 的 rAF 迴圈讓出，避免重複模擬同一段時間
        try {
            this.isGameRunning = false;
            this.clock.set(0);
            this.rng = createRng(this.seed); // 同一顆種子從頭重演
            this.lastStatusFingerprint = "";
            gameLog.clear();

            this._resetSimulationState();

            this.isGameRunning = true;

            let steps = 0;
            let ticksSinceRender = 0;
            while (this.clock.now() < targetMs && steps < FAST_FORWARD_MAX_STEPS) {
                const step = Math.min(FAST_FORWARD_STEP_MS, targetMs - this.clock.now());
                this._simulateTick(step / 1000);
                steps++;
                ticksSinceRender++;

                if (ticksSinceRender >= FAST_FORWARD_TICKS_PER_FRAME) {
                    ticksSinceRender = 0;
                    this._snapCameraToControlled();
                    this.lastStatusUIUpdate = -Infinity; // 繞過節流，讓每個顯示的畫面都刷新狀態列
                    this._refreshUI();
                    this.renderer.render(this.scene, this.camera);
                    await new Promise(resolve => requestAnimationFrame(resolve)); // 讓瀏覽器真正畫出這一幀
                }
            }
            if (steps >= FAST_FORWARD_MAX_STEPS) {
                console.warn(`fastForwardTo: 已達最大模擬步數 (${FAST_FORWARD_MAX_STEPS})，提前停在 ${(this.clock.now() / 1000).toFixed(1)}s`);
            }

            gameLog.add(`已快轉至 ${this._formatTime(this.clock.now() / 1000)}`, "text-blue-400", this.clock.now());

            this._snapCameraToControlled();
            this.lastStatusUIUpdate = -Infinity;
            this._refreshUI();
            if (this.renderer && this.camera) this.renderer.render(this.scene, this.camera);
        } finally {
            this._isFastForwarding = false;
            // 關鍵：快轉期間（含每次 await 讓出的空檔）都會佔用真實時間，但 animate() 全程被暫停未消化。
            // 若不歸零 previousTime，下一個真實 animate() frame 會把整段累積的真實時間差當成 dt，
            // 一次套用巨大的重力位移，把角色瞬間甩出地板以下觸發掉落重置。
            // 歸零後 animate() 會把下一幀視為「第一幀」，dt 強制為 0，從快轉結束的狀態接續正常播放。
            this.previousTime = 0;
        }
    }

    // 怪物讀條/Boss 名單 UI + 受控角色座標/CD/Buff 狀態列，animate() 與快轉的定期畫面刷新共用
    _refreshUI() {
        this._updateMonsterUI();
        if (this.controlledCharacter) {
            this._updateUI(this.controlledCharacter.model.position, this.clock.now() / 1000);
            this.actionBar.update(this.clock.now());
            this._updateStatusUI(this.controlledCharacter.statusEffects, this.clock.now());
        }
    }

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // 重置 monster/character/telegraph/floor 的模擬狀態，供 reset() 與 fastForwardTo() 共用
    _resetSimulationState(selectedPlayerName = null) {
        this.characters.forEach(char => {
            // 清除該角色的按鍵緩存，防止切換時角色自動亂跑
            char.keys = {};

            // 如果有傳入新玩家名稱，則更新控制權
            if (selectedPlayerName) {
                char.isPlayer = (char.name === selectedPlayerName);
                if (char.isPlayer) this.controlledCharacter = char;
            }

            const p = char.config;
            // 重置位置
            char.model.position.set(p.default_position.x, p.default_position.y, p.default_position.z);
            // 重置旋轉角度
            if (p.rotation) {
                char.model.rotation.set(
                    (p.rotation.x || 0) * (Math.PI / 180),
                    (p.rotation.y || 0) * (Math.PI / 180),
                    (p.rotation.z || 0) * (Math.PI / 180)
                );
            } else {
                char.model.rotation.set(0, 0, 0);
            }

            char.pathIndex = 0;
            char.isWaiting = false;
            char.waitElapsed = 0;
            char.isPathFinished = false;
            char.scheduledMoveIndex = 0;
            char.commandTarget = null;
            char.velocityY = 0; // 重置重力速度
            char.statusEffects = []; // 清空 Buff/Debuff 陣列
        });

        // 重置技能組冷卻
        this.actionBar.reset();

        // 立即清空狀態 UI 容器
        const lists = document.querySelectorAll('#status-effects-container .status-list');
        lists.forEach(list => list.innerHTML = '');

        if (this.telegraphManager) {
            this.telegraphManager.clearAll();
        }

        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const child = this.scene.children[i];
            if (child.name === "") {
                this.scene.remove(child);
            }
        }

        this.monsterInstances.forEach(m => {
            m.activeCast = null; // 強制清除讀條狀態
            m.reset();
        });

        const monsterList = document.getElementById('monster-list-container');
        if (monsterList) monsterList.innerHTML = ''; // 清空怪物列表 UI
        this.groundObjects.forEach(f => {
            f.visible = true;
            f.userData.isDisappeared = false;
            f.userData.standingTimer = 0;
            if (f.material && f.userData.originalColor) f.material.color.setHex(f.userData.originalColor);
        });
    }

    _snapCameraToControlled() {
        if (this.controlledCharacter && this.controls) {
            const p = this.controlledCharacter.model.position;
            const offset = this.controlledCharacter.config.camera_offset || { x: 0, y: 0.5, z: -1 };
            this.camera.position.set(p.x + offset.x, p.y + offset.y, p.z + offset.z);
            this.controls.target.set(p.x, p.y + 0.3, p.z);
            this.controls.update();
        }
    }

    // 單一 tick 的模擬邏輯，animate()（真實 rAF）與 fastForwardTo()（同步重演）共用，
    // 確保兩條路徑跑出來的狀態完全一致。
    _simulateTick(dt) {
        const activeGround = this.groundObjects.filter(f => !f.userData.isDisappeared);

        if (this.isGameRunning) {
            this.clock.advance(dt * 1000);
            const nowMs = this.clock.now();
            const elapsed = nowMs / 1000;

            this._checkInteractions(dt, activeGround, nowMs);
            this.telegraphManager.update();
            this.monsterInstances.forEach(monster => {
                monster.update(elapsed, true, this.telegraphManager, this._handleAttack, this.characters);
            });

            this.characters.forEach(char => {
                char.updateStatusEffects(dt, this.telegraphManager, nowMs);
                if (!char.isPlayer) {
                    // 絕對時間觸發的一次性移動指令（例如特定技能施放前的站位）
                    while (char.scheduledMoveIndex < char.scheduledMoves.length
                        && elapsed >= char.scheduledMoves[char.scheduledMoveIndex].time) {
                        const mv = char.scheduledMoves[char.scheduledMoveIndex];
                        char.setMoveTarget(mv.position, mv.rotation);
                        char.scheduledMoveIndex++;
                    }
                    char.moveByPath(char.pathData, this.groundObjects, dt);
                }
            });
        } else {
            this.monsterInstances.forEach(monster => {
                monster.update(0, false, null, null, this.characters);
            });

            this.characters.forEach(char => {
                char.updateStatusEffects(dt, null, this.clock.now());
            });
        }

        if (this.controlledCharacter) {
            this.controlledCharacter.moveByPlayer(this.controls, activeGround, dt);
        }
    }

    animate = (currentTime) => {
        this.animationId = requestAnimationFrame(this.animate);
        // 快轉自己會驅動 _simulateTick 並视需要畫幀；這裡讓出，避免同一段模擬時間被重複跑兩次
        if (this._isFastForwarding) return;

        const rawDt = this.previousTime === 0 ? 0 : (currentTime * 0.001 - this.previousTime);
        // 夾住單一影格的 dt 上限：分頁被切到背景、掉幀、或快轉剛結束時，真實時間差可能
        // 一次暴衝到數百毫秒甚至數秒。角色重力/落地判定的容許誤差很小（見 Character.js），
        // 沒有夾住的話一大步重力就會讓角色瞬間掉出地板判定區間，誤觸「掉出場外」重置。
        const dt = Math.min(rawDt, MAX_FRAME_DT);
        this.previousTime = currentTime * 0.001;

        const oldPos = this.controlledCharacter ? this.controlledCharacter.model.position.clone() : null;

        this._simulateTick(dt);
        this._refreshUI();

        if (this.controlledCharacter) {
            const delta = this.controlledCharacter.model.position.clone().sub(oldPos);
            if (delta.length() > 10) {
                const p = this.controlledCharacter.config.default_position;
                const offset = this.controlledCharacter.config.camera_offset || { x: 0, y: 0.5, z: -1 };
                this.camera.position.set(p.x + offset.x, p.y + offset.y, p.z + offset.z);
                this.controls.target.set(p.x, p.y + 0.3, p.z);
            } else {
                this.camera.position.add(delta);
                this.controls.target.add(delta);
            }
        }
        if (this.controls) this.controls.update();

        this.renderer.render(this.scene, this.camera);
    }

    _updateStatusUI(effects, nowMs) {
        if (nowMs - this.lastStatusUIUpdate < 100) return;
        this.lastStatusUIUpdate = nowMs;

        const container = document.getElementById('status-effects-container');
        if (!container) return;

        const currentFingerprint = (effects || []).map(e => {
            const remain = Math.max(0, Math.ceil(e.duration - (nowMs - e.startTime) / 1000));
            return `${e.name}_${remain}`;
        }).join('|');

        if (this.lastStatusFingerprint === currentFingerprint) return;
        this.lastStatusFingerprint = currentFingerprint;

        // 直接傳入 Element 而非 Selector 字符串
        const updateGroup = (selector, list) => {
            const listContainer = container.querySelector(`${selector} .status-list`);
            if (!listContainer) return;

            if (list.length === 0) {
                listContainer.innerHTML = '';
                return;
            }

            const currentIds = new Set();
            list.forEach(e => {
                const id = `status-${e.name.replace(/\s+/g, '')}-${e.startTime}`;
                currentIds.add(id);
                const remain = Math.max(0, Math.ceil(e.duration - (nowMs - e.startTime) / 1000));

                let el = document.getElementById(id);
                if (!el) {
                    const imgHtml = e.icon ? `<img src="${e.icon}" class="w-6 h-6 object-contain">` : '';

                    const statusItem = document.createElement('div');
                    statusItem.id = id;
                    statusItem.className = "flex items-center bg-black/60 text-white rounded p-1 border border-white/20";
                    statusItem.innerHTML = `
                        ${imgHtml}
                        <span class="timer text-[10px] ml-1 text-yellow-400">${remain}s</span>
                    `;
                    listContainer.appendChild(statusItem);
                } else {
                    const timer = el.querySelector('.timer');
                    if (timer && timer.textContent !== `${remain}s`) {
                        timer.textContent = `${remain}s`;
                    }
                }
            });

            Array.from(listContainer.children).forEach(child => {
                if (!currentIds.has(child.id)) child.remove();
            });
        };

        updateGroup('.buff-group', effects.filter(e => e.isBuff));
        updateGroup('.debuff-group', effects.filter(e => !e.isBuff));
    }

    _checkInteractions(dt, activeGround, nowMs) {
        this.groundObjects.forEach(f => f.userData.activePlayers.clear());
        this.characters.forEach(char => {
            // 修正：使用成員變數而非 new
            this.interactionRaycaster.set(
                char.model.position.clone().add(new THREE.Vector3(0, 1, 0)),
                new THREE.Vector3(0, -1, 0)
            );
            const hit = this.interactionRaycaster.intersectObjects(activeGround);
            if (hit.length > 0) hit[0].object.userData.activePlayers.add(char.name);
        });
        this.groundObjects.forEach(f => Floor.updateMechanics(f, dt, nowMs));
    }

    _updateUI(pos, elapsed = 0) {
        const el = document.getElementById('coord-display');
        if (el) {
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = Math.floor(elapsed % 60).toString().padStart(2, '0');
            el.textContent = `X: ${(pos.x * -1).toFixed(2)}, Z: ${pos.z.toFixed(2)}, Time: ${minutes}:${seconds}`;
        }
    }

    _disposeScene() {
        if (!this.scene) return;
        this.scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }

    _updateMonsterUI() {
        const container = document.getElementById('monster-list-container');
        if (!container) return;

        const now = this.clock.now();
        this.monsterInstances.forEach((monster, index) => {
            if (!monster.spawned) return;

            const id = `monster-ui-${index}`;
            let el = document.getElementById(id);

            if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.className = "bg-black/60 p-2 rounded border border-white/10 flex flex-col gap-1 transition-opacity duration-300";
                el.innerHTML = `
                    <div class="flex justify-between items-center">
                        <span class="text-white font-bold">${monster.config.name}</span>
                        <span class="cast-name text-yellow-400 "></span>
                    </div>
                    <div class="cast-bar-bg w-full h-1 bg-gray-800 rounded overflow-hidden opacity-0">
                        <div class="cast-bar-fill h-full bg-yellow-500 w-0"></div>
                    </div>
                `;
                container.appendChild(el);
            }

            const castName = el.querySelector('.cast-name');
            const castBarBg = el.querySelector('.cast-bar-bg');
            const castBarFill = el.querySelector('.cast-bar-fill');

            if (monster.activeCast) {
                const elapsedMs = now - monster.activeCast.startTime;
                const totalMs = monster.activeCast.duration * 1000;
                let progress = elapsedMs / totalMs;

                if (progress >= 1.0) {
                    // 核心修正：進度滿了之後，將 activeCast 設為空，下次更新就會隱藏 UI
                    monster.activeCast = null;
                    castBarBg.classList.add('opacity-0');
                } else {
                    castName.textContent = monster.activeCast.name;
                    castBarBg.classList.remove('opacity-0');
                    castBarFill.style.width = `${progress * 100}%`;
                }
            } else {
                castBarBg.classList.add('opacity-0');
                castName.textContent = '';
            }
        });
    }
}

const manager = new SceneManager();
export const createScene = (id, data, name, isDebug) => manager.init(id, data, name, isDebug);
export const startGame = () => manager.start();
export const resetGame = (name) => manager.reset(name);
export const fastForwardTo = (seconds) => manager.fastForwardTo(seconds);
