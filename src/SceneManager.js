import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import * as GaussianSplats3D from "@mkkellogg/gaussian-splats-3d";
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

import { AppState } from "./AppState.js";
import { ToolManager } from "./ToolManager.js";
import { UIController } from "./UIController.js";

export class SceneManager {
    static init() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1, 5);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
                
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.viewer = new GaussianSplats3D.DropInViewer({ gpuAcceleratedSort: false, sharedMemoryForWorkers: false, dynamicScene: true });
        this.scene.add(this.viewer);

        this.markerGroup = new THREE.Group();
        this.scene.add(this.markerGroup);

        this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
   
        this.transformControl.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        this.transformControl.addEventListener('change', () => {
            if (AppState.mode === 'TRANSFORM' && AppState.activeLayerIndex !== -1) {
                const proxy = AppState.loadedScenes[AppState.activeLayerIndex].proxy;
                UIController.updateTransformUI(proxy);
            }
        });

        
        window.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                ToolManager.undo();
            }

            if (AppState.mode === 'TRANSFORM') {
                switch (event.key.toLowerCase()) {
                    case 't': this.transformControl.setMode('translate'); break;
                    case 'r': this.transformControl.setMode('rotate'); break;
                    case 's': this.transformControl.setMode('scale'); break;
                }
            }
        });

        this.scene.add(this.transformControl.getHelper());
        AppState.transformControl = this.transformControl;
        

        this.atelierGroup = new THREE.Group();
        this.scene.add(this.atelierGroup);
        this.atelierGroup.visible = false; 

        new HDRLoader()
        .setPath('./textures/') 
        .load('university_workshop_4k.hdr', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture; 
            this.hdrTexture = texture; 
        });

        this.atelierGroup.add(new THREE.AmbientLight(0xffe6cc, 0.6));

        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2); 
        mainLight.position.set(0, 10, 5);
        this.atelierGroup.add(mainLight);

        const displayLight = new THREE.SpotLight(0xffffff, 100);
        displayLight.position.set(6, 6, -3);
        displayLight.penumbra = 0.2;
        displayLight.angle = Math.PI / 8; 
        this.atelierGroup.add(displayLight);

        this.editorGroup = new THREE.Group();
        this.scene.add(this.editorGroup);

        const worldGrid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
        worldGrid.position.y = -0.01; 
        this.editorGroup.add(worldGrid);

        const xAxisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-50, 0, 0), new THREE.Vector3(50, 0, 0)]);
        const zAxisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -50), new THREE.Vector3(0, 0, 50)]);
        
        const xAxisLine = new THREE.Line(xAxisGeo, new THREE.LineBasicMaterial({ color: 0xff3333, depthTest: false }));
        const zAxisLine = new THREE.Line(zAxisGeo, new THREE.LineBasicMaterial({ color: 0x3366ff, depthTest: false }));
        
        xAxisLine.renderOrder = 1;
        zAxisLine.renderOrder = 1;

        this.editorGroup.add(xAxisLine);
        this.editorGroup.add(zAxisLine);

        this.setupVisualBrush();
        this.startRenderLoop();
    }
    
    static setupVisualBrush() {
        this.brushCursor = new THREE.Group();
        
        const ringGeo = new THREE.RingGeometry(0.85, 1.0, 32);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.8, 
            side: THREE.DoubleSide,
            depthTest: false 
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        
        const axesHelper = new THREE.AxesHelper(1.0); 
        
        this.brushCursor.add(ring);
        this.brushCursor.add(axesHelper);
        this.brushCursor.visible = false;
        this.scene.add(this.brushCursor);
    }

 static async loadMainScene(url, fileName = "Loaded Splat", spawnPos = [0, 0, 0], spawnRot = [0, 0, 0, 1]) {
        if (AppState.isProcessing) return;
        AppState.isProcessing = true;
        UIController.toggleLoading(true, `Loading ${fileName}...`);

        try {
            const colorBackups = new Map();
            AppState.loadedScenes.forEach(layer => {
                if (layer.mesh) {
                    const colors = layer.mesh.getSplatDataTextures()?.baseData.colors;
                    if (colors) {
                        colorBackups.set(layer.name, new Float32Array(colors)); 
                    }
                }
            });

            await this.viewer.addSplatScenes([{
                path: url, format: GaussianSplats3D.SceneFormat.Ply, position: spawnPos, rotation: spawnRot, scale: [1, 1, 1], streamView: false
            }]);
           
            const sceneCount = this.viewer.getSceneCount();
            for (let i = 0; i < sceneCount; i++) {
                const layer = AppState.loadedScenes[i];
                if (!layer) continue;

                layer.splatScene = this.viewer.getSplatScene(i);
                layer.splatBuffer = layer.splatScene.splatBuffer;
                layer.mesh = this.viewer.splatMesh;
            }
            
            const mesh = (this.viewer.viewer && this.viewer.viewer.splatMesh) ? this.viewer.viewer.splatMesh : this.viewer.splatMesh;
            const gsViewer = this.viewer.viewer; 
            const sceneIndex = gsViewer.getSceneCount() - 1;
            const splatScene = gsViewer.getSplatScene(sceneIndex);

            const proxy = new THREE.Object3D();
            proxy.position.fromArray(spawnPos);
            proxy.quaternion.fromArray(spawnRot);
            this.scene.add(proxy);

            AppState.loadedScenes.push({
                name: fileName,
                sceneIndex: sceneIndex,
                proxy: proxy,
                exportable: true,
                splatScene: splatScene,
                splatBuffer: splatScene.splatBuffer,
                mesh: mesh,
                erasedIndices: new Set(),         
                currentPaintStroke: new Map()     
            });

            
            AppState.loadedScenes.forEach(layer => {
                if (layer.mesh && layer.splatBuffer) {
                    const colors = layer.mesh.getSplatDataTextures()?.baseData.colors;
                    
                    if (colors && colorBackups.has(layer.name)) {
                        colors.set(colorBackups.get(layer.name));
                    }
                    
                    const count = layer.splatBuffer.getSplatCount();
                    layer.mesh.updateDataTexturesFromBaseData(0, count - 1);
                    layer.mesh.material.uniformsNeedUpdate = true;
                }
            });

            UIController.selectLayer(AppState.loadedScenes.length - 1);

        } catch (e) {
        } finally { AppState.isProcessing = false; UIController.toggleLoading(false); }
    }
    static startRenderLoop() {
        const keys = { w: false, a: false, s: false, d: false };
        window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        const tempVec = new THREE.Vector3(); 

        this.renderer.setAnimationLoop(() => {
            this.camera.getWorldDirection(forward);
            forward.y = 0; forward.normalize();
            right.copy(forward).cross(this.camera.up).normalize();

            if (keys.w) { this.camera.position.addScaledVector(forward, 0.1); this.controls.target.addScaledVector(forward, 0.1); }
            if (keys.s) { this.camera.position.addScaledVector(forward, -0.1); this.controls.target.addScaledVector(forward, -0.1); }
            if (keys.a) { this.camera.position.addScaledVector(right, -0.1); this.controls.target.addScaledVector(right, -0.1); }
            if (keys.d) { this.camera.position.addScaledVector(right, 0.1); this.controls.target.addScaledVector(right, 0.1); }
            

            this.controls.update();
            const indices = AppState.selectedLayerIndices;
                if (indices.length > 1 && AppState.groupProxy) {
                    indices.forEach(i => {
                        const layer = AppState.loadedScenes[i];
                        const data = AppState.groupOffsets.get(i);
                        if (!layer || !data) return;

                        layer.proxy.position.copy(AppState.groupProxy.position).add(data.offset);
                        layer.proxy.quaternion.copy(AppState.groupProxy.quaternion).multiply(data.offsetQuat);
                        layer.proxy.scale.copy(AppState.groupProxy.scale).multiply(data.offsetScale);
                    });
                }
            AppState.loadedScenes.forEach(layer => {
                layer.splatScene.position.copy(layer.proxy.position);
                layer.splatScene.quaternion.copy(layer.proxy.quaternion);
                layer.splatScene.scale.copy(layer.proxy.scale);
            });

            if (AppState.isPresentationMode) {
                AppState.markers.forEach(marker => {
                    if (marker.labelElement) {
                        tempVec.copy(marker.position);
                        tempVec.y += 0.6; 
                        tempVec.project(this.camera);

                        if (tempVec.z > 1.0 || tempVec.z < -1.0) {
                            marker.labelElement.style.display = 'none';
                        } else {
                            marker.labelElement.style.display = 'block';
                            const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
                            const y = (tempVec.y * -0.5 + 0.5) * window.innerHeight;
                            marker.labelElement.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
                        }
                    }
                });
            }
            if (this.viewer && this.viewer.viewer) this.viewer.viewer.update(this.renderer, this.camera);
            this.renderer.render(this.scene, this.camera);
        });
    }

    static getOrUpdateGroupProxy() {
        if (!AppState.groupProxy) {
            AppState.groupProxy = new THREE.Object3D();
            this.scene.add(AppState.groupProxy);
        }

        const indices = AppState.selectedLayerIndices;
        if (indices.length === 0) return AppState.groupProxy;

        const avg = new THREE.Vector3();
        indices.forEach(i => {
            const layer = AppState.loadedScenes[i];
            if (layer) avg.add(layer.proxy.position);
        });
        avg.multiplyScalar(1 / indices.length);

        AppState.groupProxy.position.copy(avg);
        AppState.groupProxy.quaternion.identity();
        AppState.groupProxy.scale.set(1, 1, 1);

        AppState.groupOffsets.clear();
        indices.forEach(i => {
            const layer = AppState.loadedScenes[i];
            if (!layer) return;
            const offset = new THREE.Vector3().subVectors(layer.proxy.position, avg);
            const offsetQuat = layer.proxy.quaternion.clone();
            const offsetScale = layer.proxy.scale.clone();
            AppState.groupOffsets.set(i, { offset, offsetQuat, offsetScale });
        });

        return AppState.groupProxy;
    }

    static addMarkerVisual(position) {
        const group = new THREE.Group();
        
        const mat = new THREE.MeshStandardMaterial({ color: 0x2196F3, roughness: 0.4 });
        
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), mat);
        sphere.position.y = 0.3;
        
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 16), mat);
        cone.position.y = 0.1;
        cone.rotation.x = Math.PI; 
        
        group.add(sphere);
        group.add(cone);
        group.position.copy(position);
        
        this.markerGroup.add(group);
        return group; 
    }

    static isFlying = false;

    static flyToCamera(targetPosition, targetLookAt, duration = 1500) {
        if (this.isFlying) return;
        this.isFlying = true;
        this.controls.enabled = false;

        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const startTime = performance.now();

        const animate = (time) => {
            const elapsed = time - startTime;
            const t = Math.min(elapsed / duration, 1.0);
            
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            this.camera.position.lerpVectors(startPos, targetPosition, ease);
            this.controls.target.lerpVectors(startTarget, targetLookAt, ease);
            this.controls.update();

            if (t < 1.0) {
                requestAnimationFrame(animate); 
            } else {
                this.isFlying = false;
                this.controls.enabled = true; 
            }
        };
        
        requestAnimationFrame(animate);
    }

    static clearCurrentScene() {
        if (!this.viewer) return;
        
        const gsViewer = this.viewer.viewer ? this.viewer.viewer : this.viewer;
        const sceneCount = gsViewer.getSceneCount();
        
        for (let i = sceneCount - 1; i >= 0; i--) {
            gsViewer.removeSplatScene(i);
        }

        AppState.loadedScenes.forEach(layer => {
            if (layer.proxy) this.scene.remove(layer.proxy);
        });

        AppState.loadedScenes = [];
        AppState.activeLayerIndex = -1;
        AppState.selectedLayerIndices = [];
        AppState.erasedIndices.clear();
        AppState.currentPaintStroke.clear();
        AppState.history = [];
        
        if (this.transformControl) this.transformControl.detach();
        if (AppState.groupProxy) {
            this.scene.remove(AppState.groupProxy);
            AppState.groupProxy = null;
        }
        
    }
}