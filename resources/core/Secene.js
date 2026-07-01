import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character } from './Character';
import { Floor } from './Floor';
import { TelegraphManager } from './TelegraphManager';
import { Monster } from './Monster';
import { Tool } from './Tool';

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
    }

    async init(containerId, { floor, players, monsters }, selectedPlayerName) {
        // 使用 Tool 處理資料
        this.sceneData = {
            floor: Tool.processData('floor', floor),
            teams: Tool.processData('players', players),
            monsters: Tool.processData('monsters', monsters)
        };
        const container = document.getElementById(containerId);

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
        this._setupHelpers();
        this._setupControls();
        this._setupEventListeners(container);

        this.animate(0);
    }

    async _setupObjects(selectedPlayerName) {
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
    }

    _setupControls() {
        if (!this.controlledCharacter) return;
        const p = this.controlledCharacter.model.position;
        this.camera.position.set(p.x, p.y + 0.5, p.z - 1);
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
    }

    _handleAttack = (skill, pos) => {
        this.characters.forEach(char => {
            const dist = char.model.position.distanceTo(new THREE.Vector3(pos.x, char.model.position.y, pos.z));
            if (dist <= skill.attack_range.radius) {
                if (skill.debuff) char.addStatusEffect({ ...skill.debuff, type: 'slow', value: 0.5 });
            }
        });
    }

    start() {
        if (this.isGameRunning) return;
        this.isGameRunning = true;
        this.gameStartTime = Date.now();
    }

    reset(selectedPlayerName = null) {
        this.isGameRunning = false;

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
        });
        if (this.controlledCharacter && this.controls) {
            const p = this.controlledCharacter.model.position;
            this.camera.position.set(p.x, p.y + 0.5, p.z - 1);
            this.controls.target.set(p.x, p.y + 0.3, p.z);
            this.controls.update();
        }
        this.monsterInstances.forEach(m => m.reset());
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

        if (this.isGameRunning) {
            const elapsed = (Date.now() - this.gameStartTime) / 1000;
            this._checkInteractions(dt, activeGround);
            this.telegraphManager.update();
            this.monsterInstances.forEach(m => m.update(elapsed, true, this.telegraphManager, this._handleAttack));
            this.characters.forEach(char => {
                char.updateStatusEffects(dt);
                if (!char.isPlayer) char.moveByPath(char.pathData, this.groundObjects, dt);
            });
        } else {
            this.monsterInstances.forEach(m => m.update(0, false, null, null));
        }

        if (this.controlledCharacter) {
            const oldPos = this.controlledCharacter.model.position.clone();
            this.controlledCharacter.moveByPlayer(this.controls, activeGround, dt);
            this._updateUI(this.controlledCharacter.model.position);
            const delta = this.controlledCharacter.model.position.clone().sub(oldPos);
            if (delta.length() > 10) {
                const p = this.controlledCharacter.config.default_position;
                this.camera.position.set(p.x, p.y + 0.5, p.z - 1);
                this.controls.target.set(p.x, p.y + 0.3, p.z);
            } else {
                this.camera.position.add(delta);
                this.controls.target.add(delta);
            }
        }
        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    _checkInteractions(dt, activeGround) {
        this.groundObjects.forEach(f => f.userData.activePlayers.clear());
        this.characters.forEach(char => {
            const ray = new THREE.Raycaster(char.model.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, -1, 0));
            const hit = ray.intersectObjects(activeGround);
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
}

const manager = new SceneManager();
export const createScene = (id, data, name) => manager.init(id, data, name);
export const startGame = () => manager.start();
export const resetGame = (name) => manager.reset(name);