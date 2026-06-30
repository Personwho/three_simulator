import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character } from '../core/Character';
import { Floor } from '../core/Floor';
const loader = new GLTFLoader();
let scene, renderer, camera, controls, groundObjects = [], characters = [];
let animationId;

export async function createScene(containerId, data = null, selectedPlayerName = null) {
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

    // 1. 建立地基 (Floor)
    for (const f of data.floor) {
        const tiles = await Floor.create(f, loader);
        tiles.forEach(tile => {
            scene.add(tile);
            groundObjects.push(tile);
        });
    }

    // 2. 建立角色 (Player & NPCs)
    let controlledCharacter = null;
    for (const p of data.player) {
        const gltf = await loader.loadAsync(p.model);
        gltf.scene.scale.set(p.scale, p.scale, p.scale);

        const isSelected = (p.name === selectedPlayerName);
        const char = new Character(gltf.scene, camera, isSelected);

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

        scene.add(char.model);
        characters.push(char);
        if (isSelected) controlledCharacter = char;
    }

    // 修正：如果沒有匹配到選擇的玩家名稱，則預設控制第一個角色
    if (!controlledCharacter && characters.length > 0) {
        controlledCharacter = characters[0];
        controlledCharacter.isPlayer = true;
    }

    // 3. 控制器繫結在被選中的玩家身上
    if (controlledCharacter) {
        // --- 設定相機初始相對位置 ---
        const playerPos = controlledCharacter.model.position;
        // 將相機放在玩家身後 (例如 Z 軸 +2, Y 軸 +1)
        camera.position.set(playerPos.x, playerPos.y + 0.5, playerPos.z + 1);

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
    let previousTime = 0;
    function animate(currentTime) {
        animationId = requestAnimationFrame(animate);
        const deltaTime = previousTime === 0 ? 0 : (currentTime * 0.001 - previousTime);
        previousTime = currentTime * 0.001;

        characters.forEach(char => {
            if (char.isPlayer) {
                const oldPos = char.model.position.clone();
                char.moveByPlayer(controls, groundObjects, deltaTime);

                // 計算位移差
                const delta = char.model.position.clone().sub(oldPos);

                // --- 同步移動相機與目標點 ---
                char.camera.position.add(delta);
                controls.target.add(delta);
            } else {
                char.moveByPath(char.pathData, groundObjects, deltaTime);
            }
        });

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