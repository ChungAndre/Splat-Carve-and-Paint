import * as THREE from "three";
import { AppState } from "./AppState.js";
import { SceneManager } from "./SceneManager.js";

export class ToolManager {
    static _tempHit = new THREE.Vector3();
    static _tempVec = new THREE.Vector3();
    static _vectorToSplat = new THREE.Vector3();
    static _invMatrix = new THREE.Matrix4();
    static _localRay = new THREE.Ray();
    static isRaycastingPending = false;

    static init() {
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.lassoPoints = [];
        this.isLassoDrawing = false;
        this.setupLassoCanvas();

        window.addEventListener('pointerdown', this.onPointerDown.bind(this));
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('click', this.onClick.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this));
    }

    static getIntersection() {
        let finalHit = null;
        let hitType = null; 
        let minDistSq = Infinity;
        let bestSplatScore = Infinity;
        let bestSplatHitWorld = null;

        AppState.loadedScenes.forEach(layer => {
            if (!layer.mesh || !layer.splatBuffer) return;

            layer.proxy.updateMatrixWorld(); 

            this._invMatrix.copy(layer.proxy.matrixWorld).invert();
            this._localRay.copy(this.raycaster.ray).applyMatrix4(this._invMatrix);

            const scale = new THREE.Vector3().setFromMatrixScale(layer.mesh.matrixWorld).x;
            const thresholdSq = (0.4 / scale) ** 2; 

            const count = layer.splatBuffer.getSplatCount();
            const stride = 4; 

            for (let i = 0; i < count; i += stride) {
                if (layer.erasedIndices.has(i)) continue; 
                
                layer.mesh.getSplatCenter(i, this._tempVec);
                const distSqToRay = this._localRay.distanceSqToPoint(this._tempVec);
                
                if (distSqToRay < thresholdSq) {
                    this._vectorToSplat.subVectors(this._tempVec, this._localRay.origin);
                    if (this._localRay.direction.dot(this._vectorToSplat) > 0) { 
                        
                        const worldPos = this._tempVec.clone().applyMatrix4(layer.proxy.matrixWorld);
                        const distToCamSq = SceneManager.camera.position.distanceToSquared(worldPos);

                        if (distToCamSq > minDistSq) continue;

                        const depthScore = Math.sqrt(distToCamSq);
                        const rayProximityScore = distSqToRay * 10;
                        const score = depthScore + rayProximityScore; 

                        if (score < bestSplatScore) { 
                            bestSplatScore = score; 
                            bestSplatHitWorld = worldPos;
                            minDistSq = distToCamSq;
                            hitLayer = layer; 
                        }
                    }
                }
            }
        });
        
        if (bestSplatHitWorld) {
            finalHit = bestSplatHitWorld;
            const surfaceNormal = this.estimateSurfaceNormal(finalHit, hitLayer);
            SceneManager.brushCursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfaceNormal);
        } else {
            SceneManager.brushCursor.quaternion.set(0,0,0,1);
        }

        return finalHit;
    }

    static setupLassoCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '5';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
    }

    static onPointerDown(event) {
        if (AppState.isPresentationMode) return;
        if (!event.shiftKey || event.buttons !== 1) return;

        if (AppState.mode === 'LASSO' || AppState.mode === 'RECTANGLE' || AppState.mode === 'CIRCLE') {
            this.isLassoDrawing = true;
            this.lassoPoints = [[event.clientX, event.clientY]];
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            SceneManager.controls.enabled = false;
        } 
    }

    static onPointerMove(event) {
        if (AppState.isPresentationMode) return;
        if (!event.shiftKey) { 
            SceneManager.brushCursor.visible = false; 
            return; 
        }

        if (this.isLassoDrawing) {
            if (AppState.mode === 'LASSO') {
                this.lassoPoints.push([event.clientX, event.clientY]);
            } else {
                this.lassoPoints[1] = [event.clientX, event.clientY];
            }
            this.drawSelectionShape(); 
            return; 
        }

        if (this.isRaycastingPending) return;
        this.isRaycastingPending = true;

        requestAnimationFrame(() => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, SceneManager.camera);

            const hitPoint = this.getIntersection();
            const isBrushMode = AppState.mode === 'PICKER' || AppState.mode === 'MARKER' ;
            SceneManager.brushCursor.visible = !!hitPoint && isBrushMode;

            if (hitPoint) {
                SceneManager.brushCursor.position.copy(hitPoint);
                if (event.buttons === 1) {
                    SceneManager.controls.enabled = false; 
                    if (AppState.mode === 'PICKER') this.pickColor(hitPoint);
                }
            }
            this.isRaycastingPending = false;
        });
    }

    static onPointerUp() {
        SceneManager.controls.enabled = true;


        if (this.isLassoDrawing) {
            this.isLassoDrawing = false;
            this.applySelectionAction();
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.lassoPoints =[];
        }


        if (AppState.currentEraseStroke.length > 0) {
            AppState.history.push({
                type: 'ERASE',
                indices:[...AppState.currentEraseStroke]
            });
            AppState.currentEraseStroke =[];
        }
        if (AppState.currentPaintStroke && AppState.currentPaintStroke.size > 0) {
            AppState.history.push({ type: 'PAINT', stroke: new Map(AppState.currentPaintStroke) });
            AppState.currentPaintStroke.clear();
        }

    }
    
    static drawSelectionShape() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const isCrop = AppState.selectionAction === 'CROP';
        this.ctx.strokeStyle = isCrop ? '#4caf50' : '#ff9800'; 
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.fillStyle = 'rgba(255, 152, 0, 0.2)';
        
        this.ctx.beginPath();
        
        if (AppState.mode === 'LASSO') {
            this.ctx.moveTo(this.lassoPoints[0][0], this.lassoPoints[0][1]);
            for (let i = 1; i < this.lassoPoints.length; i++) {
                this.ctx.lineTo(this.lassoPoints[i][0], this.lassoPoints[i][1]);
            }
        } 
        else if (AppState.mode === 'RECTANGLE' && this.lassoPoints.length > 1) {
            const startX = this.lassoPoints[0][0];
            const startY = this.lassoPoints[0][1];
            const width = this.lassoPoints[1][0] - startX;
            const height = this.lassoPoints[1][1] - startY;
            this.ctx.rect(startX, startY, width, height);
        } 
        else if (AppState.mode === 'CIRCLE' && this.lassoPoints.length > 1) {
            const startX = this.lassoPoints[0][0];
            const startY = this.lassoPoints[0][1];
            const endX = this.lassoPoints[1][0];
            const endY = this.lassoPoints[1][1];
            const radius = Math.hypot(endX - startX, endY - startY);
            this.ctx.arc(startX, startY, radius, 0, Math.PI * 2);
        }

        this.ctx.stroke();
        this.ctx.fill();
    }
    
    static applySelectionAction() {
        if (this.lassoPoints.length < 2 || !AppState.activeSplatMesh || !AppState.splatBuffer) return;
       
        if (AppState.activeLayerIndex === -1) return;
        const activeProxy = AppState.loadedScenes[AppState.activeLayerIndex].proxy;
        
        const count = AppState.splatBuffer.getSplatCount();
        if (count <= 0) return;
        const tempVec = new THREE.Vector3();
        const colors = AppState.activeSplatMesh.getSplatDataTextures()?.baseData.colors;
        let erasedCount = 0;

        const layer = AppState.loadedScenes[AppState.activeLayerIndex];
        if (!layer) return;

        const mvpMatrix = new THREE.Matrix4();
        mvpMatrix.multiplyMatrices(SceneManager.camera.projectionMatrix, SceneManager.camera.matrixWorldInverse);
        mvpMatrix.multiply(activeProxy.matrixWorld);

        let startX, startY, endX, endY, minX, maxX, minY, maxY, radiusSq;
        if (AppState.mode === 'RECTANGLE' || AppState.mode === 'CIRCLE') {
            startX = this.lassoPoints[0][0]; startY = this.lassoPoints[0][1];
            endX = this.lassoPoints[1][0];   endY = this.lassoPoints[1][1];
            
            if (AppState.mode === 'RECTANGLE') {
                minX = Math.min(startX, endX); maxX = Math.max(startX, endX);
                minY = Math.min(startY, endY); maxY = Math.max(startY, endY);
            } else {
                radiusSq = (endX - startX) ** 2 + (endY - startY) ** 2;
            }
        }

        for (let i = 0; i < count; i++) {
            if (AppState.erasedIndices.has(i)) continue;

            AppState.activeSplatMesh.getSplatCenter(i, tempVec);
            tempVec.applyMatrix4(mvpMatrix);

            const isBehindCamera = tempVec.z > 1.0 || tempVec.z < -1.0;
            const screenX = (tempVec.x + 1) * window.innerWidth / 2;
            const screenY = (-tempVec.y + 1) * window.innerHeight / 2;

            let isInside = false;

            if (!isBehindCamera) {
                const screenX = (tempVec.x + 1) * window.innerWidth / 2;
                const screenY = (-tempVec.y + 1) * window.innerHeight / 2;

                if (AppState.mode === 'LASSO') {
                    isInside = this.pointInPolygon([screenX, screenY], this.lassoPoints);
                } 
                else if (AppState.mode === 'RECTANGLE') {
                    isInside = screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY;
                } 
                else if (AppState.mode === 'CIRCLE') {
                    const distSq = (screenX - startX) ** 2 + (screenY - startY) ** 2;
                    isInside = distSq <= radiusSq;
                }
            }
            
            const shouldErase = AppState.selectionAction === 'CROP' 
                ? (!isInside || isBehindCamera)
                : (isInside && !isBehindCamera);

            if (shouldErase) {
                if (AppState.selectionAction === 'COPY') {
                    AppState.currentEraseStroke.push(i);
                }
                else if (AppState.selectionAction === 'PAINT') {
                    if (!AppState.currentPaintStroke.has(i)) {
                        AppState.currentPaintStroke.set(i, [colors[i * 4 + 0], colors[i * 4 + 1], colors[i * 4 + 2]]);
                    }
                    const blend = AppState.paintOpacity;
                    colors[i * 4 + 0] = colors[i * 4 + 0] * (1 - blend) + AppState.paintColor[0] * blend;
                    colors[i * 4 + 1] = colors[i * 4 + 1] * (1 - blend) + AppState.paintColor[1] * blend;
                    colors[i * 4 + 2] = colors[i * 4 + 2] * (1 - blend) + AppState.paintColor[2] * blend;
                    erasedCount++;
                }  else {
                    AppState.erasedIndices.add(i);
                    AppState.currentEraseStroke.push(i);
                    if (colors) colors[i * 4 + 3] = 0;
                    erasedCount++;
                }
            }
        }

        if (AppState.selectionAction === 'COPY' && AppState.currentEraseStroke.length > 0) {
            this.createCustomStamp(AppState.currentEraseStroke);
            AppState.currentEraseStroke =   [];
        }

        if (erasedCount > 0 && colors) {
            AppState.activeSplatMesh.updateDataTexturesFromBaseData(0, count - 1);
            AppState.activeSplatMesh.material.uniformsNeedUpdate = true;
        }
    }

    static pointInPolygon(point, vs) {
        let x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let xi = vs[i][0], yi = vs[i][1];
            let xj = vs[j][0], yj = vs[j][1];
            let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    static async onClick(event) {
        if (AppState.isPresentationMode) return;
        if (!event.shiftKey) return;

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, SceneManager.camera);

        const hitPoint = this.getIntersection();

        if (AppState.mode === 'PICKER' && hitPoint) {
            this.pickColor(hitPoint);
            return;
        }

        if (AppState.mode === 'MARKER' && hitPoint) {
            const labelText = prompt("Enter a label for this location:", "New Marker");
            if (labelText !== null) { 
                const markerMesh = SceneManager.addMarkerVisual(hitPoint);
                AppState.markers.push({ position: hitPoint.clone(), label: labelText, mesh: markerMesh });
                AppState.history.push({ type: 'MARKER' });
            }
            return;
        }
    }


    static pickColor(hitPoint) {
        let closestIdx = -1;
        let minDistSq = Infinity;
        let hitLayer = null;

        AppState.loadedScenes.forEach(layer => {
            if (!layer.mesh || !layer.splatBuffer) return;

            this._invMatrix.copy(layer.proxy.matrixWorld).invert();
            const localHit = hitPoint.clone().applyMatrix4(this._invMatrix);
            
            const count = layer.splatBuffer.getSplatCount();
            
            for(let i = 0; i < count; i += 4) {
                if(layer.erasedIndices.has(i)) continue;
                
                layer.mesh.getSplatCenter(i, this._tempVec);
                const d = this._tempVec.distanceToSquared(localHit);
                if(d < minDistSq) { 
                    minDistSq = d; 
                    closestIdx = i; 
                    hitLayer = layer;
                }
            }
        });

        if(closestIdx !== -1 && hitLayer) {
            const colors = hitLayer.mesh.getSplatDataTextures()?.baseData.colors;
            if(colors) {
                const r = colors[closestIdx * 4];
                const g = colors[closestIdx * 4 + 1];
                const b = colors[closestIdx * 4 + 2];
                
                AppState.paintColor = [r, g, b, 255];
                const hex = "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
                
                const colorPicker = document.getElementById('color-picker');
                if (colorPicker) colorPicker.value = hex;
                
                SceneManager.brushCursor.children[0].material.color.set(hex);
            }
        }
    }
    static estimateSurfaceNormal(hitPoint, layer) {
        if (!layer || !layer.mesh || !layer.splatBuffer) return new THREE.Vector3(0, 1, 0);

        const count = layer.splatBuffer.getSplatCount();
        
        this._invMatrix.copy(layer.proxy.matrixWorld).invert();
        
        const localHit = hitPoint.clone().applyMatrix4(this._invMatrix);
        const scale = new THREE.Vector3().setFromMatrixScale(layer.proxy.matrixWorld).x;
        const localRadiusSq = 0.25 / (scale * scale);

        let centroid = new THREE.Vector3();
        let neighborIndices = [];

        for (let i = 0; i < count; i += 8) { 
            if (layer.erasedIndices.has(i)) continue;
            layer.mesh.getSplatCenter(i, this._tempVec);

            if (this._tempVec.distanceToSquared(localHit) < localRadiusSq) {
                neighborIndices.push(i);
                centroid.add(this._tempVec); 
            }
        }

        if (neighborIndices.length < 3) {
            return new THREE.Vector3().subVectors(SceneManager.camera.position, hitPoint).normalize();
        }

        centroid.divideScalar(neighborIndices.length);

        let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
        for (let idx of neighborIndices) {
            layer.mesh.getSplatCenter(idx, this._tempVec);
            let dx = this._tempVec.x - centroid.x;
            let dy = this._tempVec.y - centroid.y;
            let dz = this._tempVec.z - centroid.z;
            xx += dx * dx; xy += dx * dy; xz += dx * dz;
            yy += dy * dy; yz += dy * dz; zz += dz * dz;
        }

        let detX = yy * zz - yz * yz;
        let detY = xx * zz - xz * xz;
        let detZ = xx * yy - xy * xy;
        let maxDet = Math.max(detX, detY, detZ);
        
        let localNormal = new THREE.Vector3();
        if (maxDet === detX) localNormal.set(detX, xz * yz - xy * zz, xy * yz - xz * yy);
        else if (maxDet === detY) localNormal.set(xz * yz - xy * zz, detY, xy * xz - yz * xx);
        else localNormal.set(xy * yz - xz * yy, xy * xz - yz * xx, detZ);
        localNormal.normalize();

        const normalMatrix = new THREE.Matrix3().getNormalMatrix(layer.proxy.matrixWorld);
        let worldNormal = localNormal.applyMatrix3(normalMatrix).normalize();

        const viewVector = new THREE.Vector3().subVectors(SceneManager.camera.position, hitPoint);
        if (worldNormal.dot(viewVector) < 0) worldNormal.negate();

        return worldNormal;
    }
    static createCustomStamp(indices) {
        if (indices.length === 0) return alert("Nothing selected to copy!");

        const count = indices.length;
        const meshMatrix = AppState.activeSplatMesh.matrixWorld;
        const visualColors = AppState.activeSplatMesh.getSplatDataTextures()?.baseData.colors;

        const tCenter = new THREE.Vector3();
        const tRot = new THREE.Quaternion();
        const tScale = new THREE.Vector3();

        const centroid = new THREE.Vector3();
        indices.forEach(i => {
            AppState.splatBuffer.getSplatCenter(i, tCenter);
            tCenter.applyMatrix4(meshMatrix);
            centroid.add(tCenter);
        });
        centroid.divideScalar(count);

        const SH_C0 = 0.28209479177387814;
        const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\nproperty float x\nproperty float y\nproperty float z\nproperty float nx\nproperty float ny\nproperty float nz\nproperty float f_dc_0\nproperty float f_dc_1\nproperty float f_dc_2\nproperty float opacity\nproperty float scale_0\nproperty float scale_1\nproperty float scale_2\nproperty float rot_0\nproperty float rot_1\nproperty float rot_2\nproperty float rot_3\nend_header\n`;
        
        const headerBytes = new TextEncoder().encode(header);
        const data = new ArrayBuffer(headerBytes.length + count * 68);
        const view = new DataView(data);
        new Uint8Array(data).set(headerBytes, 0);
        let offset = headerBytes.length;

        const meshQuat = new THREE.Quaternion().setFromRotationMatrix(meshMatrix);
        const meshScale = new THREE.Vector3().setFromMatrixScale(meshMatrix);

        indices.forEach(i => {
            AppState.splatBuffer.getSplatCenter(i, tCenter); 
            AppState.splatBuffer.getSplatScaleAndRotation(i, tScale, tRot);
            
            tCenter.applyMatrix4(meshMatrix);
            tRot.premultiply(meshQuat); 
            tScale.multiply(meshScale); 

            tCenter.sub(centroid); 
            
            const r = visualColors ? visualColors[i * 4 + 0] : 255;
            const g = visualColors ? visualColors[i * 4 + 1] : 255;
            const b = visualColors ? visualColors[i * 4 + 2] : 255;
            const a = visualColors ? visualColors[i * 4 + 3] : 255;

            view.setFloat32(offset, tCenter.x, true); view.setFloat32(offset+4, tCenter.y, true); view.setFloat32(offset+8, tCenter.z, true);
            view.setFloat32(offset+12, 0, true); view.setFloat32(offset+16, 0, true); view.setFloat32(offset+20, 0, true);
            view.setFloat32(offset+24, ((r/255.0)-0.5)/SH_C0, true); view.setFloat32(offset+28, ((g/255.0)-0.5)/SH_C0, true); view.setFloat32(offset+32, ((b/255.0)-0.5)/SH_C0, true);
            view.setFloat32(offset+36, Math.log(Math.max(0.0001, Math.min(0.9999, a/255.0)) / (1.0 - Math.max(0.0001, Math.min(0.9999, a/255.0)))), true);
            view.setFloat32(offset+40, Math.log(Math.max(0.00001, tScale.x)), true); view.setFloat32(offset+44, Math.log(Math.max(0.00001, tScale.y)), true); view.setFloat32(offset+48, Math.log(Math.max(0.00001, tScale.z)), true);
            view.setFloat32(offset+52, tRot.w, true); view.setFloat32(offset+56, tRot.x, true); view.setFloat32(offset+60, tRot.y, true); view.setFloat32(offset+64, tRot.z, true);
            offset += 68;
        });

        const fileBlob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(fileBlob);
        
        SceneManager.loadMainScene(url, "Cloned Patch", [centroid.x, centroid.y, centroid.z]);

        const transformBtn = document.querySelector('[data-mode="TRANSFORM"]');
        if (transformBtn) transformBtn.click();
    }
    
    
    static undo() {
        if (AppState.history.length === 0 || !AppState.activeSplatMesh) return;

        const lastAction = AppState.history.pop();
        const count = AppState.splatBuffer.getSplatCount();
        const colors = AppState.activeSplatMesh.getSplatDataTextures()?.baseData.colors;

        if (lastAction.type === 'ERASE' && colors) {
            lastAction.indices.forEach(index => {
                AppState.erasedIndices.delete(index);
                colors[index * 4 + 3] = 255;
            });

            AppState.activeSplatMesh.updateDataTexturesFromBaseData(0, count - 1);
            AppState.activeSplatMesh.material.uniformsNeedUpdate = true;
        }

        else if (lastAction.type === 'PAINT' && colors) {
            lastAction.stroke.forEach((originalColor, index) => {
                colors[index * 4 + 0] = originalColor[0];
                colors[index * 4 + 1] = originalColor[1];
                colors[index * 4 + 2] = originalColor[2];
            });

            AppState.activeSplatMesh.updateDataTexturesFromBaseData(0, count - 1);
            AppState.activeSplatMesh.material.uniformsNeedUpdate = true;
        }
        else if (lastAction.type === 'MARKER') {
            const lastMarker = AppState.markers.pop();
            if (lastMarker) {
                SceneManager.markerGroup.remove(lastMarker.mesh);
                lastMarker.mesh.children.forEach(child => {
                    child.geometry.dispose();
                    child.material.dispose();
                });
            }
        }
    }
}