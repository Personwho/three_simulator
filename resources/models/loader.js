import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export function loadModel(scene, modelPath) {

    loader.load(modelPath, (gltf) => {
        scene.add(gltf.scene);
    });
}