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
        this.gameStartTime = 0;
        this.previousTime = 0;
        this.sceneData = null;
        this.lastStatusUIUpdate = 0; // 新增：上次 UI 更新時間
        this.lastStatusFingerprint = ""; // 新增：狀態清單指紋
        this.actionBar = new ActionBar();
        this.interactionRaycaster = new THREE.Raycaster(); // 提升到成員變數複用
    }

    async init(containerId, { floor, players, monsters }, selectedPlayerName, isDebug = false) {
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

        this.telegraphManager = new TelegraphManager(this.scene);

        await this._setupObjects(selectedPlayerName);
        this._setupLights();
        if (isDebug) {
            this._setupHelpers();
        }
        this._setupControls();
        this._setupEventListeners(container);

        this.animate(0);
    }

    async _setupObjects(selectedPlayerName) {
        // 1. 建立資源池容器 (如果不存在)
        let pool = document.getElementById('status-icon-pool');
        if (!pool) {
            pool = document.createElement('div');
            pool.id = 'status-icon-pool';
            pool.style.display = 'none'; // 隱藏但不移除 DOM
            document.body.appendChild(pool);
        }
        pool.innerHTML = ''; // 清空舊的

        // 2. 收集所有可能的狀態定義 (衝刺 + 怪物技能)
        const statusConfigs = [{ name: '衝刺', icon: 'assets/icons/衝刺.png' }];
        this.sceneData.monsters.forEach(m => {
            if (m.skills) {
                m.skills.forEach(s => {
                    // 注意這裡的路徑：s 是原始 JSON 定義，debuff 在 config 裡面
                    const debuff = s.config?.debuff;
                    if (debuff && debuff.name && debuff.icon) {
                        statusConfigs.push({ name: debuff.name, icon: debuff.icon });
                    }
                });
            }
        });

        // 3. 預先建立 img 標籤並放入池中，強制瀏覽器載入並解碼
        statusConfigs.forEach(cfg => {
            const img = new Image();
            img.dataset.statusName = cfg.name;
            img.src = cfg.icon;
            pool.appendChild(img);
        });

        this.groundObjects = [];
        this.characters = [];
        this.monsterInstances = [];

        for (const f of this.sceneData.floor) {
            const tiles = await Floor.create(f, this.loader);
            tiles.forEach(tile => { this.scene.add(tile); this.groundObjects.push(tile); });
        }

        if (this.sceneData.teams) {
            for (const teamName in this.sceneData.teams) {
                for (const p of this.sceneData.teams[teamName].players) {
                    const gltf = await this.loader.loadAsync(p.model);
                    gltf.scene.scale.set(p.scale, p.scale, p.scale);
                    const isSelected = (p.name === selectedPlayerName);
                    const char = new Character(gltf.scene, this.camera, isSelected, { ...p, team: teamName });
                    char.config = p;
                    char.onFall = () => this.reset();
                    char.model.position.set(p.default_position.x, p.default_position.y, p.default_position.z);
                    char.pathData = p.path;
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
            const monster = new Monster(gltf.scene, mData);
            this.scene.add(monster.model);
            this.monsterInstances.push(monster);
        }
    }

    _setupLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 2));
        this.characters.forEach(char => {
            const offsets = [[0, 1.2, 1.5], [0, 1.2, -1.5], [1.5, 1.2, 0], [-1.5, 1.2, 0]];
            offsets.forEach(off => {
                const light = new THREE.PointLight(0xffffff, 4, 0);
                light.position.set(...off);
                char.model.add(light);
            });
        });
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
                this.actionBar.trigger(e.key, this.controlledCharacter);
            }
        });
    }

    _handleAttack = (skillData, pos) => {
        // 1. 取得技能定義資料
        const data = skillData.data || skillData;

        // 2. 優先使用現有的 logic 實例，若無則建立 (相容 Player 技能)
        const logic = skillData.logic || SkillFactory.create(data);

        if (!logic || !data.type) {
            console.warn('Invalid skill or logic:', skillData);
            return;
        }

        this.characters.forEach(char => {
            const charPos = char.model.position;

            // 3. 執行命中判定
            if (logic.checkHit(charPos, pos)) {
                // 4. 取得 debuff 配置 (路徑：data.config.debuff)
                const config = data.config;
                if (config && config.debuff) {
                    char.addStatusEffect({
                        ...config.debuff,
                        startTime: Date.now()
                    });
                    console.log(`命中！玩家 ${char.name} 獲得狀態: ${config.debuff.name}`);
                }
            }
        });
    }

    start() {
        if (this.isGameRunning) return;

        // 開始前再次確保所有狀態與技能重置
        this.characters.forEach(char => char.statusEffects = []);
        this.actionBar.reset();
        this.lastStatusFingerprint = ""; // 重置指紋，強制 UI 刷新

        this.isGameRunning = true;
        this.gameStartTime = Date.now();
    }

    reset(selectedPlayerName = null) {
        this.isGameRunning = false;
        this.lastStatusFingerprint = ""; // 確保 UI 指紋在重置時被清空

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
            char.isPathFinished = false;
            char.statusEffects = [];
            char.velocityY = 0; // 重置重力速度
            char.statusEffects = []; // 清空 Buff/Debuff 陣列
            char.velocityY = 0;
        });

        // 重置技能組冷卻
        this.actionBar.reset();

        // 立即清空狀態 UI 容器
        const lists = document.querySelectorAll('#status-effects-container .status-list');
        lists.forEach(list => list.innerHTML = '');

        if (this.controlledCharacter && this.controls) {
            const p = this.controlledCharacter.model.position;
            const offset = this.controlledCharacter.config.camera_offset || { x: 0, y: 0.5, z: -1 };
            this.camera.position.set(p.x + offset.x, p.y + offset.y, p.z + offset.z);
            this.controls.target.set(p.x, p.y + 0.3, p.z);
            this.controls.update();
        }
        this.monsterInstances.forEach(m => m.reset());
        const monsterList = document.getElementById('monster-list-container');
        if (monsterList) monsterList.innerHTML = ''; // 清空怪物列表 UI
        this.groundObjects.forEach(f => {
            f.visible = true;
            f.userData.isDisappeared = false;
            f.userData.standingTimer = 0;
            if (f.material && f.userData.originalColor) f.material.color.setHex(f.userData.originalColor);
        });
        this.telegraphManager.activeTelegraphs.forEach(t => this.scene.remove(t.mesh));
        this.telegraphManager.activeTelegraphs = [];
    }

    animate = (currentTime) => {
        this.animationId = requestAnimationFrame(this.animate);
        const dt = this.previousTime === 0 ? 0 : (currentTime * 0.001 - this.previousTime);
        this.previousTime = currentTime * 0.001;

        const activeGround = this.groundObjects.filter(f => !f.userData.isDisappeared);

        this.characters.forEach(char => char.updateStatusEffects());

        if (this.isGameRunning) {
            const elapsed = (Date.now() - this.gameStartTime) / 1000;
            this._checkInteractions(dt, activeGround);
            this.telegraphManager.update();
            this.monsterInstances.forEach(m => m.update(elapsed, true, this.telegraphManager, this._handleAttack));
            this.characters.forEach(char => {
                if (!char.isPlayer) char.moveByPath(char.pathData, this.groundObjects, dt);
            });
            this._updateMonsterUI();
        } else {
            this.monsterInstances.forEach(m => m.update(0, false, null, null));
        }

        if (this.controlledCharacter) {
            const oldPos = this.controlledCharacter.model.position.clone();
            this.controlledCharacter.moveByPlayer(this.controls, activeGround, dt);
            this._updateUI(this.controlledCharacter.model.position);
            this.actionBar.update(); // 更新 CD 顯示
            this._updateStatusUI(this.controlledCharacter.statusEffects);
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

    _updateStatusUI(effects) {
        const now = Date.now();

        if (now - this.lastStatusUIUpdate < 100) return;
        this.lastStatusUIUpdate = now;

        const container = document.getElementById('status-effects-container');
        if (!container) return;

        const currentFingerprint = (effects || []).map(e => {
            const remain = Math.max(0, Math.ceil(e.duration - (now - e.startTime) / 1000));
            return `${e.name}_${remain}`;
        }).join('|');

        if (this.lastStatusFingerprint === currentFingerprint) return;
        this.lastStatusFingerprint = currentFingerprint;

        // 修改：直接傳入 Element 而非 Selector 字符串
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
                const remain = Math.max(0, Math.ceil(e.duration - (Date.now() - e.startTime) / 1000));

                let el = document.getElementById(id);
                if (!el) {
                    const poolImg = document.querySelector(`#status-icon-pool img[data-status-name="${e.name}"]`);
                    const imgHtml = poolImg ? `<img src="${poolImg.src}" class="w-6 h-6 object-contain">` : '';

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

    _checkInteractions(dt, activeGround) {
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
        this.groundObjects.forEach(f => Floor.updateMechanics(f, dt));
    }

    _updateUI(pos) {
        const el = document.getElementById('coord-display');
        if (el) el.textContent = `X: ${(pos.x * -1).toFixed(2)}, Z: ${pos.z.toFixed(2)}`;
    }

    _disposeScene() {
        this.scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }

    _updateMonsterUI() {
        const container = document.getElementById('monster-list-container');
        if (!container) return;

        const now = Date.now();
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
                        <span class="text-white text-xs font-bold">${monster.config.name}</span>
                        <span class="cast-name text-yellow-400 text-[10px] italic"></span>
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
                const progress = (now - monster.activeCast.startTime) / (monster.activeCast.duration * 1000);

                if (progress >= 1) {
                    monster.activeCast = null; // 施法結束
                    castBarBg.classList.add('opacity-0');
                    castName.textContent = '';
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