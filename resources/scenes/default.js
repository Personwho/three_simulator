import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character } from '../core/Character';
import { Floor } from '../core/Floor';
import { TelegraphManager } from '../core/TelegraphManager';
import { Monster } from '../core/Monster';

const loader = new GLTFLoader();
let scene, renderer, camera, controls, groundObjects = [], characters = [];
let monsterInstances = [];
let animationId;
let telegraphManager;
let gameStartTime;
let isGameRunning = false; // 控制開關
let sceneData = null;      // 暫存資料用於重置
let controlledCharacter = null;

export function startGame() {
    if (isGameRunning) return;
    isGameRunning = true;
    gameStartTime = Date.now();
    console.log("遊戲開始");
}

export function resetGame() {
    isGameRunning = false;
    // 1. 重置角色位置與狀態
    characters.forEach(char => {
        const p = char.config;
        if (p && p.default_position) {
            char.model.position.set(p.default_position.x, p.default_position.y, p.default_position.z);
        }

        if (p && p.rotation) {
            char.model.rotation.set(
                (p.rotation.x || 0) * (Math.PI / 180),
                (p.rotation.y || 0) * (Math.PI / 180),
                (p.rotation.z || 0) * (Math.PI / 180)
            );
        }
        char.pathIndex = 0;
        char.isWaiting = false;
        char.isPathFinished = false;
        char.statusEffects = [];
    });

    // 2. 重置相機與控制器位置
    if (controlledCharacter && controls) {
        const p = controlledCharacter.config.default_position;
        // 將相機設回初始偏移位置
        camera.position.set(p.x, p.y + 0.5, p.z - 1);
        // 將控制器目標點設回角色位置
        controls.target.set(p.x, p.y + 0.3, p.z);
        controls.update();
    }

    // 3. 重置怪物與技能狀態
    monsterInstances.forEach(m => m.reset());

    // 4. 重置地板
    groundObjects.forEach(f => {
        f.visible = true;
        f.userData.isDisappeared = false;
        f.userData.standingTimer = 0;
        if (f.material && f.userData.originalColor) {
            f.material.color.setHex(f.userData.originalColor);
        }
    });

    // 5. 清除現有的預警圈
    if (telegraphManager) {
        telegraphManager.activeTelegraphs.forEach(t => scene.remove(t.mesh));
        telegraphManager.activeTelegraphs = [];
    }
    console.log("遊戲重置");
}

export async function createScene(containerId, data = null, selectedPlayerName = null) {
    sceneData = data; // 存一份給重置用

    const container = document.getElementById(containerId);

    // 清除舊有的場景與 RequestAnimationFrame
    if (renderer) {
        cancelAnimationFrame(animationId);
        container.removeChild(renderer.domElement);
        scene.traverse(object => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) object.material.dispose();
        });
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    groundObjects = [];
    characters = [];

    // 基本相機與渲染器設定...
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.01, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    if (!data) return;

    telegraphManager = new TelegraphManager(scene);
    gameStartTime = Date.now();

    // 1. 建立地基 (Floor)
    for (const f of data.floor) {
        const tiles = await Floor.create(f, loader);
        tiles.forEach(tile => {
            scene.add(tile);
            groundObjects.push(tile);
        });
    }

    // 新增 XZ 軸輔助網格 (總高度設在 y=10 的基準面)
    const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x888888);
    gridHelper.position.y = 10;
    scene.add(gridHelper);

    // 新增 XZ 軸標誌 (紅色為 X, 藍色為 Z)
    const axesHelper = new THREE.AxesHelper(10);
    axesHelper.position.set(0, 10.01, 0); // 稍微高於網格 0.01 以防止閃爍 (Z-fighting)
    scene.add(axesHelper);

    // 2. 建立角色 (Player & NPCs)
    controlledCharacter = null;
    if (data.teams) {
        for (const teamName in data.teams) {
            for (const p of data.teams[teamName].players) {
                const gltf = await loader.loadAsync(p.model);
                gltf.scene.scale.set(p.scale, p.scale, p.scale);

                const isSelected = (p.name === selectedPlayerName);
                // 傳入 p 作為初始設定
                const char = new Character(gltf.scene, camera, isSelected, { ...p, team: teamName });
                // 將原始 config 存入實體中，resetGame 才能讀到 default_position
                char.config = p;

                // 綁定掉落回呼為全域的 resetGame
                char.onFall = () => {
                    console.log(`${p.name} 掉落了！遊戲重置。`);
                    resetGame();
                };

                // 為每個角色新增一個點光源，確保角色始終清晰
                const frontCharLight = new THREE.PointLight(0xffffff, 4, 0); // 顏色, 強度, 距離
                frontCharLight.position.set(0, 1.2, 1.5);
                const backCharLight = new THREE.PointLight(0xffffff, 4, 0); // 顏色, 強度, 距離
                backCharLight.position.set(0, 1.2, -1.5);
                const rightCharLight = new THREE.PointLight(0xffffff, 4, 0); // 顏色, 強度, 距離
                rightCharLight.position.set(1.5, 1.2, 0);
                const leftCharLight = new THREE.PointLight(0xffffff, 4, 0); // 顏色, 強度, 距離
                leftCharLight.position.set(-1.5, 1.2, 0);
                char.model.add(frontCharLight);
                char.model.add(backCharLight);
                char.model.add(rightCharLight);
                char.model.add(leftCharLight);

                char.model.position.set(p.default_position.x, p.default_position.y, p.default_position.z);
                char.pathData = p.path;
                char.name = p.name; // 確保有名字用於判定

                scene.add(char.model);
                characters.push(char);
                if (isSelected) {
                    controlledCharacter = char;
                    controlledCharacter.isPlayer = true;
                }
            }
        }
    }

    // 如果沒有匹配到選擇的玩家名稱，則預設控制第一個角色
    if (!controlledCharacter && characters.length > 0) {
        controlledCharacter = characters[0];
        controlledCharacter.isPlayer = true;
    }

    // 2.5 建立怪物 (Monsters)
    monsterInstances = [];
    for (const mData of data.monsters) {
        const gltf = await loader.loadAsync(mData.model);
        const monster = new Monster(gltf.scene, mData);
        scene.add(monster.model);
        monsterInstances.push(monster);
    }

    // 3. 控制器繫結在被選中的玩家身上
    if (controlledCharacter) {
        // --- 設定相機初始相對位置 ---
        const playerPos = controlledCharacter.model.position;
        // 將相機放在玩家身後
        camera.position.set(playerPos.x, playerPos.y + 0.5, playerPos.z - 1);

        controls = new OrbitControls(controlledCharacter.camera, renderer.domElement);

        // --- 設定控制器目標點為玩家的中心點 ---
        controls.target.set(playerPos.x, playerPos.y + 0.3, playerPos.z);

        controls.enableDamping = true;

        // 限制滾輪縮放距離：最小中心點(1)，最大距離 3
        controls.minDistance = 0.5;
        controls.maxDistance = 1.5;

        // 限制滑鼠按鍵：右鍵旋轉，停用左鍵動作
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };
    }

    // 禁用右鍵選單
    container.addEventListener('contextmenu', (e) => e.preventDefault());
    scene.add(new THREE.AmbientLight(0xffffff, 2));

    function checkFloorInteractions(deltaTime) {
        // 重置所有地板的玩家記錄
        groundObjects.forEach(f => f.userData.activePlayers.clear());

        // 過濾出尚未消失的地板
        const activeGround = groundObjects.filter(f => !f.userData.isDisappeared);

        characters.forEach(char => {
            const ray = new THREE.Raycaster(char.model.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, -1, 0));
            // 只與活動中的地板進行碰撞偵測
            const hit = ray.intersectObjects(activeGround);
            if (hit.length > 0) {
                const floor = hit[0].object;
                floor.userData.activePlayers.add(char.name);
            }
        });

        groundObjects.forEach(f => Floor.updateMechanics(f, deltaTime));
    }

    function handleAttack(skill, pos) {
        console.log(`技能觸發: ${skill.name}`);
        characters.forEach(char => {
            const dist = char.model.position.distanceTo(new THREE.Vector3(pos.x, char.model.position.y, pos.z));
            if (dist <= skill.attack_range.radius) {
                console.warn(`${char.name} 受到了 ${skill.damage} 點傷害！`);
                if (skill.debuff) {
                    char.addStatusEffect({ ...skill.debuff, type: 'slow', value: 0.5 });
                }
            }
        });
    }

    let previousTime = 0;
    function animate(currentTime) {
        animationId = requestAnimationFrame(animate);
        const currentTimeSec = currentTime * 0.001;
        const deltaTime = previousTime === 0 ? 0 : (currentTimeSec - previousTime);
        previousTime = currentTimeSec;

        // 取得當前有效（未消失）的地板清單
        const activeGround = groundObjects.filter(f => !f.userData.isDisappeared);

        if (isGameRunning) {
            const elapsedTime = (Date.now() - gameStartTime) / 1000;
            checkFloorInteractions(deltaTime);
            telegraphManager.update();

            // 處理怪物更新 (位置與技能觸發)
            monsterInstances.forEach(m => {
                m.update(elapsedTime, isGameRunning, telegraphManager, handleAttack);
            });

            // 處理 NPC 移動 (僅在執行中運作)
            characters.forEach(char => {
                char.updateStatusEffects(deltaTime);
                if (!char.isPlayer) {
                    char.moveByPath(char.pathData, groundObjects, deltaTime);
                }
            });
        } else {
            // 如果遊戲沒開始，怪物可能也需要執行 basic update (例如保持顯示)
            monsterInstances.forEach(m => m.update(0, false, null, null));
        }

        // 玩家控制不論是否 Start 都能動，以便練習位移
        if (controlledCharacter) {
            const oldPos = controlledCharacter.model.position.clone();
            controlledCharacter.moveByPlayer(controls, activeGround, deltaTime);

            // 更新座標顯示
            const pos = controlledCharacter.model.position;
            const coordEl = document.getElementById('coord-display');
            if (coordEl) {
                coordEl.textContent = `X: ${pos.x.toFixed(2)}, Z: ${pos.z.toFixed(2)}`;
            }

            // 計算位移差
            const delta = controlledCharacter.model.position.clone().sub(oldPos);

            // 如果位移過大（例如超過 10 單位），通常是重置跳躍，此時不使用 delta 累加，而是直接同步
            if (delta.length() > 10) {
                const p = controlledCharacter.config.default_position;
                camera.position.set(p.x, p.y + 0.5, p.z - 1);
                controls.target.set(p.x, p.y + 0.3, p.z);
            } else {
                // 一般移動使用相對位移累加，保持攝影機目前的旋轉觀看角度
                camera.position.add(delta);
                controls.target.add(delta);
            }
        }

        // 必須呼叫 update 才能讓相機跟隨目標點更新
        controls.update();
        renderer.render(scene, controlledCharacter.camera);
    }
    requestAnimationFrame(animate);

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            container.clientWidth,
            container.clientHeight
        );
    });
}