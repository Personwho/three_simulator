import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// import { loadModel } from '../models/loader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character } from '../core/Character';
const loader = new GLTFLoader();

export async function createScene(containerId) {
    const container = document.getElementById(containerId);

    // 1. 建立場景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // 2. 建立攝影機
    const camera = new THREE.PerspectiveCamera(
        // 視野角度
        75,
        // 畫面比例
        container.clientWidth / container.clientHeight,
        // 最近可見距離
        0.01,
        // 最遠可見距離
        1000
    );

    // 3. 建立玩家
    const gltf = await loader.loadAsync('./models/Lalafell.glb');
    gltf.scene.scale.set(0.3, 0.3, 0.3);
    const lalafell = new Character(gltf.scene, camera, true);
    scene.add(lalafell.model);

    // 3b. 建立 NPC (複製一個模型實例)
    const npcModel = gltf.scene.clone();
    const npc = new Character(npcModel, camera, false);

    // 定義 NPC 移動路徑
    const npcPath = [
        { x: 0, y: 10, z: 3, stay: 1, rotation: 270 },
        { x: 3, y: 10, z: 3, stay: 3, rotation: 180 },
        { x: 3, y: 10, z: 0, stay: 5, rotation: 90 },
        { x: 0, y: 10, z: 0, stay: 7, rotation: 0 }
    ];

    npc.model.position.set(npcPath[0].x, 12, npcPath[0].z);
    scene.add(npc.model);

    // 4. 建立渲染器
    const renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    renderer.setSize(
        container.clientWidth,
        container.clientHeight
    );
    container.appendChild(renderer.domElement);

    // 5. 建立軌道控制器
    const controls = new OrbitControls(lalafell.camera, renderer.domElement);
    controls.enableDamping = true;
    // 限制滾輪縮放距離：最小中心點(1)，最大距離 3
    controls.minDistance = 0.5;
    controls.maxDistance = 2;

    // 限制滑鼠按鍵：右鍵旋轉，停用左鍵動作
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
    };

    // 禁用右鍵選單
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    // 地基陣列
    const groundObjects = createfloor(scene);

    // 建立文字標籤函式
    function createDirectionLabel(text, x, y, z) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 256;
        ctx.font = 'Bold 120px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 128);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false // 關閉深度寫入可防止閃爍
        });
        const geometry = new THREE.PlaneGeometry(1, 1); // 縮小尺寸從 15 改為 1
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(x, y + 0.05, z); // 加上微小高度偏移
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
    }

    // 在四個方向放置標籤 (假設 Z 為北)
    createDirectionLabel('北', 0, 10.1, 5);
    createDirectionLabel('南', 0, 10.1, -5);
    createDirectionLabel('東', 5, 10.1, 0);
    createDirectionLabel('西', -5, 10.1, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 100, 10); // 提高光源位置
    scene.add(light);


    lalafell.model.position.set(0, 10, 0);
    // 初始攝影機位置：高度也稍微調高一些
    lalafell.camera.position.set(0, 12, 2);
    scene.add(lalafell.model);

    // 將 target 設定在模型位置加上偏移量
    controls.target.copy(lalafell.model.position).add(new THREE.Vector3(0, 0.3, 0));

    // 使用原生時間戳記取代 THREE.Clock
    let previousTime = 0;
    function animate(currentTime) {
        requestAnimationFrame(animate);

        // 將毫秒轉換為秒 (首次執行時 deltaTime 為 0)
        const timeInSeconds = currentTime * 0.001;
        const deltaTime = previousTime === 0 ? 0 : timeInSeconds - previousTime;
        previousTime = timeInSeconds;

        const oldPlayerPos = lalafell.model.position.clone();

        // 玩家移動傳入 deltaTime
        lalafell.moveByPlayer(controls, groundObjects, deltaTime);

        const delta = lalafell.model.position.clone().sub(oldPlayerPos);
        lalafell.camera.position.add(delta);
        controls.target.add(delta);

        // NPC 移動傳入 deltaTime
        npc.moveByPath(npcPath, groundObjects, deltaTime);

        controls.update();
        renderer.render(scene, lalafell.camera);
    }

    requestAnimationFrame(animate);

    let count = 0;
    // timer每秒輸出console顯示經過幾秒鐘
    setInterval(() => {
        count++;
        console.log(`經過 ${count} 秒`);
    }, 1000);

    window.addEventListener('resize', () => {

        camera.aspect =
            container.clientWidth / container.clientHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            container.clientWidth,
            container.clientHeight
        );

    });
}

function createfloor(scene, gridWidth = 20, gridDepth = 20) {
    // 地基陣列
    const groundObjects = [];

    // 建立 顏色 相間的地基
    const tileSize = 1;
    const tileHeight = 10;
    const colors = [0xff00ff, 0x222222];

    const tileGeometry = new THREE.BoxGeometry(tileSize, tileHeight, tileSize);

    for (let i = 0; i < gridWidth; i++) {
        for (let j = 0; j < gridDepth; j++) {
            // 決定顏色索引 (RGB相間)
            const colorIndex = (i + j) % colors.length;
            const tileMaterial = new THREE.MeshStandardMaterial({ color: colors[colorIndex] });
            const tile = new THREE.Mesh(tileGeometry, tileMaterial);

            // 計算位置 (將中心點放在 0,0)
            const posX = (i - gridWidth / 2) * tileSize + tileSize / 2;
            const posZ = (j - gridDepth / 2) * tileSize + tileSize / 2;

            tile.position.set(posX, tileHeight / 2, posZ);
            scene.add(tile);
            groundObjects.push(tile); // 加入碰撞檢測陣列
        }
    }

    return groundObjects;
}