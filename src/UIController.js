import * as THREE from "three";
import { AppState } from "./AppState.js";
import { SceneManager } from "./SceneManager.js";
import { ToolManager } from "./ToolManager.js";
import { SplatExporter } from "./SplatExporter.js";
import { ProjectManager } from "./ProjectManager.js";

export class UIController {
    static createLoadingOverlay() {
        this.loadingOverlay = document.createElement('div');
        this.loadingOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
            display: none; justify-content: center; align-items: center;
            flex-direction: column; z-index: 9999; color: white;
            font-family: sans-serif; transition: opacity 0.3s ease;
        `;

        this.loadingOverlay.innerHTML = `
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .spinner { width: 50px; height: 50px; border: 4px solid rgba(255, 255, 255, 0.3); border-top: 4px solid #ffc800; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px; }
            </style>
            <div class="spinner"></div>
            <h2 id="loading-text" style="margin: 0; font-weight: 400;">Loading...</h2>
        `;
        document.body.appendChild(this.loadingOverlay);
    }
    static toggleLoading(show, message = "Loading...") {
        if (show) {
            document.getElementById('loading-text').innerText = message;
            this.loadingOverlay.style.display = 'flex';
        } else {
            this.loadingOverlay.style.display = 'none';
        }
    }
    static updateTransformUI(mesh) {
        const inputs = document.querySelectorAll('.transform-input');
        if (inputs.length < 7) return;

        inputs[0].value = mesh.position.x.toFixed(2);
        inputs[1].value = mesh.position.y.toFixed(2);
        inputs[2].value = mesh.position.z.toFixed(2);
        inputs[3].value = THREE.MathUtils.radToDeg(mesh.rotation.x).toFixed(2);
        inputs[4].value = THREE.MathUtils.radToDeg(mesh.rotation.y).toFixed(2);
        inputs[5].value = THREE.MathUtils.radToDeg(mesh.rotation.z).toFixed(2);
        inputs[6].value = mesh.scale.x.toFixed(2); 
    }
    static setupTransformInputs() {
        const inputs = document.querySelectorAll('.transform-input');
        if (inputs.length < 7) return;

        const applyToMesh = () => {
            if (AppState.activeLayerIndex === -1) return;
            const proxy = AppState.loadedScenes[AppState.activeLayerIndex].proxy;
            
            proxy.position.set(
                parseFloat(inputs[0].value) || 0,
                parseFloat(inputs[1].value) || 0,
                parseFloat(inputs[2].value) || 0
            );

            proxy.rotation.set(
                THREE.MathUtils.degToRad(parseFloat(inputs[3].value) || 0),
                THREE.MathUtils.degToRad(parseFloat(inputs[4].value) || 0),
                THREE.MathUtils.degToRad(parseFloat(inputs[5].value) || 0)
            );

            const s = parseFloat(inputs[6].value) || 1;
            proxy.scale.set(s, s, s);
            
            proxy.updateMatrixWorld();
        };

        inputs.forEach(input => {
            input.addEventListener('change', applyToMesh);
        });
    }
    static init() {
        this.createLoadingOverlay();
        const toolButtons = document.querySelectorAll('.tool-btn');
        const colorPicker = document.getElementById('color-picker');
        const uiDesc = document.getElementById('ui-desc');

        this.setupTransformInputs();

        const tabEditor = document.getElementById('tab-editor');
        const tabTour = document.getElementById('tab-tour');
        const editorWorkspace = document.getElementById('editor-workspace');
        const tourWorkspace = document.getElementById('tour-workspace');
        const transformPanel = document.getElementById('floating-panel');

        const switchWorkspace = (workspace) => {
            if (workspace === 'EDITOR') {
                tabEditor.classList.add('active');
                tabTour.classList.remove('active');
                editorWorkspace.style.display = 'block';
                tourWorkspace.style.display = 'none';
                transformPanel.style.display = 'flex';

                SceneManager.atelierGroup.visible = false; 
                SceneManager.editorGroup.visible = true; 
                SceneManager.scene.background = new THREE.Color(0x111111);
                SceneManager.scene.environment = null; 
                
                AppState.mode = 'ERASE'; 
            } else {
                tabTour.classList.add('active');
                tabEditor.classList.remove('active');
                tourWorkspace.style.display = 'block';
                editorWorkspace.style.display = 'none';
                transformPanel.style.display = 'none'; 
                if (AppState.transformControl) AppState.transformControl.detach();
                
                SceneManager.atelierGroup.visible = true; 
                SceneManager.editorGroup.visible = false; 
                
                AppState.mode = 'MARKER'; 
            }
        };

        if (tabEditor) tabEditor.addEventListener('click', () => switchWorkspace('EDITOR'));
        if (tabTour) tabTour.addEventListener('click', () => switchWorkspace('TOUR'));

        const uploadTourSplat = document.getElementById('upload-splat-tour');
        if (uploadTourSplat) {
            uploadTourSplat.addEventListener('change', (e) => {
                if (e.target.files[0]) SceneManager.loadMainScene(URL.createObjectURL(e.target.files[0]));
            });
        }

        const panelHeader = document.querySelector('.panel-header');
        const panelContent = document.querySelector('.panel-content');
        if (panelHeader && panelContent) {
            panelHeader.style.cursor = 'pointer';
            panelHeader.title = "Click to collapse/expand";
            panelHeader.addEventListener('click', () => {
                if (panelContent.style.display === 'none') {
                    panelContent.style.display = 'block';
                    panelHeader.innerHTML = '☷ SCENE MANAGER';
                } else {
                    panelContent.style.display = 'none';
                    panelHeader.innerHTML = '☷ SCENE MANAGER (Minimized)';
                }
            });
        }
        const actionToggle = document.getElementById('selection-action-toggle');
        if (actionToggle) {
            actionToggle.addEventListener('change', (e) => {
                AppState.selectionAction = e.target.value;
            });
        }
        const opacitySlider = document.getElementById('paint-opacity-slider');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                AppState.paintOpacity = parseFloat(e.target.value);
            });
        }

        const setMode = (newMode, clickedButton) => {
            AppState.mode = newMode;
            
            toolButtons.forEach(btn => btn.classList.remove('active'));
            if (clickedButton) clickedButton.classList.add('active');

            if (newMode !== 'TRANSFORM' && AppState.transformControl) {
                AppState.transformControl.detach();
            }

            if (newMode === 'ERASE' || newMode === 'PAINT' || newMode === 'PICKER' || newMode === 'MARKER') {
                let cursorColor = colorPicker.value;
                if (newMode === 'ERASE') cursorColor = 0xff0000;
                if (newMode === 'MARKER') cursorColor = 0x2196F3;
                
                SceneManager.brushCursor.children[0].material.color.set(cursorColor);
            } else {
                SceneManager.brushCursor.visible = false;
            }

            if (newMode === 'TRANSFORM') {
                if (AppState.activeLayerIndex === -1 && AppState.selectedLayerIndices.length === 0) {
                    alert("Please load a .PLY file to transform it.");
                } else {
                    UIController.attachTransformGizmo();
                }
            }
        };

        toolButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetMode = e.currentTarget.getAttribute('data-mode');
                setMode(targetMode, e.currentTarget);
            });
        });

        setMode('ERASE', document.querySelector('[data-mode="ERASE"]'));

        colorPicker.addEventListener('input', (e) => {
            SceneManager.brushCursor.children[0].material.color.set(e.target.value);
            const c = new THREE.Color(e.target.value);
            AppState.paintColor = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255];
        });

        document.getElementById('upload-splat').addEventListener('change', (e) => {
            if (!e.target.files[0]) return;
            
            AppState.erasedIndices.clear();
            AppState.history.length = 0;
            AppState.currentPaintStroke.clear();
            
            SceneManager.loadMainScene(URL.createObjectURL(e.target.files[0]), e.target.files[0].name);
            uiDesc.innerText = `${e.target.files[0].name} loaded successfully.`;
        });

        const modeToggleBtn = document.getElementById('mode-toggle-btn');
        if (modeToggleBtn) {
            modeToggleBtn.addEventListener('click', () => this.togglePresentationMode());
        }

        const saveWaypointBtn = document.getElementById('save-waypoint-btn');
        if (saveWaypointBtn) {
            saveWaypointBtn.addEventListener('click', () => {
                AppState.waypoints.push({
                    position: SceneManager.camera.position.clone(),
                    target: SceneManager.controls.target.clone()
                });
                alert(`Viewpoint ${AppState.waypoints.length} saved successfully!`);
            });
        }

        const tourPrev = document.getElementById('tour-prev');
        const tourNext = document.getElementById('tour-next');
        
        const goToWaypoint = (direction) => {
            if (AppState.waypoints.length === 0) return;
            
            AppState.currentWaypointIndex += direction;
            
            if (AppState.currentWaypointIndex >= AppState.waypoints.length) AppState.currentWaypointIndex = 0;
            if (AppState.currentWaypointIndex < 0) AppState.currentWaypointIndex = AppState.waypoints.length - 1;

            const wp = AppState.waypoints[AppState.currentWaypointIndex];
            SceneManager.flyToCamera(wp.position, wp.target);
        };

        if (tourPrev) tourPrev.addEventListener('click', () => goToWaypoint(-1));
        if (tourNext) tourNext.addEventListener('click', () => goToWaypoint(1));

        const saveTourBtn = document.getElementById('save-tour-btn');
        if (saveTourBtn) {
            saveTourBtn.addEventListener('click', () => ProjectManager.save());
        }

        const loadTourInput = document.getElementById('load-tour-input');
        if (loadTourInput) {
            loadTourInput.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    ProjectManager.load(e.target.files[0]);
                    e.target.value = ''; 
                }
            });
        }
    }
    static togglePresentationMode() {
        AppState.isPresentationMode = !AppState.isPresentationMode;
        
        const toggleBtn = document.getElementById('mode-toggle-btn');
        const labelsContainer = document.getElementById('labels-container');
        const tourNav = document.getElementById('tour-nav'); 
        
        const uiElementsToHide = document.querySelectorAll('.tool-btn, .panel, #selection-action-toggle, label, input, #asset-panel, #save-waypoint-btn');
        
        if (AppState.isPresentationMode) {
            toggleBtn.innerHTML = "️RETURN TO EDITOR";
            toggleBtn.style.background = "#ff9800";
            
            uiElementsToHide.forEach(el => el.style.display = 'none');
            SceneManager.transformControl.detach();
            SceneManager.brushCursor.visible = false;
            
            if (AppState.waypoints.length > 0) {
                tourNav.style.display = 'flex';
                AppState.currentWaypointIndex = -1; 
            }
            
            labelsContainer.innerHTML = '';
            AppState.markers.forEach(marker => {
                const div = document.createElement('div');
                div.innerText = marker.label;
                div.style.cssText = `
                    position: absolute; top: 0; left: 0;
                    background: rgba(0, 0, 0, 0.8); color: white;
                    padding: 8px 12px; border-radius: 6px; border: 1px solid #2196F3;
                    font-family: sans-serif; font-size: 14px; pointer-events: auto;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.5); cursor: pointer;
                    transform-origin: bottom center; transition: opacity 0.2s;
                `;
                labelsContainer.appendChild(div);
                marker.labelElement = div;
            });
            
        } else {
            toggleBtn.innerHTML = "PRESENTATION MODE";
            toggleBtn.style.background = "#2196F3";
            
            uiElementsToHide.forEach(el => el.style.display = ''); 
            labelsContainer.innerHTML = ''; 
            tourNav.style.display = 'none'; 
        }
    }
    static buildLayerList() {
        const container = document.getElementById('scene-list-container');
        if (!container) return;
        container.innerHTML = '';

        AppState.loadedScenes.forEach((layer, idx) => {
            const div = document.createElement('div');
            div.style.cssText = `display: flex; align-items: center; padding: 6px; background: ${AppState.activeLayerIndex === idx ? '#222' : '#111'}; border: 1px solid ${AppState.activeLayerIndex === idx ? '#2196F3' : '#444'}; border-radius: 4px; cursor: pointer;`;

            const exportCheck = document.createElement('input');
            exportCheck.type = 'checkbox';
            exportCheck.checked = layer.exportable;
            exportCheck.title = "Include in Export";
            exportCheck.style.marginRight = '8px';
            exportCheck.onclick = (e) => { e.stopPropagation(); layer.exportable = e.target.checked; };

            const nameSpan = document.createElement('span');
            nameSpan.innerText = layer.name;
            nameSpan.style.flexGrow = '1';
            nameSpan.style.fontSize = '12px';
            nameSpan.style.color = 'white';

            const selectCheck = document.createElement('input');
            selectCheck.type = 'checkbox';
            selectCheck.checked = AppState.selectedLayerIndices.includes(idx);
            selectCheck.title = "Select for group transform";
            selectCheck.style.marginRight = '6px';
            selectCheck.onclick = (e) => {
                e.stopPropagation();

                if (e.target.checked) {
                    if (!AppState.selectedLayerIndices.includes(idx)) {
                        AppState.selectedLayerIndices.push(idx);
                    }
                    AppState.activeLayerIndex = idx;
                } else {
                    AppState.selectedLayerIndices = AppState.selectedLayerIndices.filter(i => i !== idx);
                    if (AppState.activeLayerIndex === idx) {
                        AppState.activeLayerIndex = AppState.selectedLayerIndices[0] ?? -1;
                    }
                }

                UIController.buildLayerList();

                if (AppState.mode === 'TRANSFORM') {
                    UIController.attachTransformGizmo();
                }
            };

            div.appendChild(selectCheck); 

            nameSpan.style.marginLeft = '8px';
            div.appendChild(nameSpan);

            const exportLabel = document.createElement('label');
            exportLabel.style.fontSize = '10px';
            exportLabel.style.color = '#888';
            exportLabel.style.display = 'flex';
            exportLabel.style.alignItems = 'center';
            exportLabel.style.cursor = 'pointer';
            exportLabel.innerText = 'Export: ';

            exportLabel.appendChild(exportCheck);
            div.appendChild(exportLabel);

            div.onclick = () => this.selectLayer(idx);

            container.appendChild(div);
        });
    }
    static attachTransformGizmo() {
        if (!AppState.transformControl) return;

        if (AppState.selectedLayerIndices.length > 1) {
            const groupProxy = SceneManager.getOrUpdateGroupProxy();
            AppState.transformControl.attach(groupProxy);
            return;
        }

        if (AppState.activeLayerIndex !== -1) {
            AppState.transformControl.attach(AppState.loadedScenes[AppState.activeLayerIndex].proxy);
        }
    }
    static selectLayer(idx) {
        if (idx < 0 || idx >= AppState.loadedScenes.length) return;
        
        AppState.activeLayerIndex = idx;
        const layer = AppState.loadedScenes[idx];
        
        AppState.activeSplatMesh = layer.mesh;
        AppState.splatBuffer = layer.splatBuffer;
        AppState.erasedIndices = layer.erasedIndices;
        AppState.currentPaintStroke = layer.currentPaintStroke;
        
        if (AppState.mode === 'TRANSFORM' ) {
            AppState.transformControl.attach(layer.proxy);
        }
        
        this.updateTransformUI(layer.proxy);
        this.buildLayerList(); 
    }
}