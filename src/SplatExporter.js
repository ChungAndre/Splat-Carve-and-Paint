import * as THREE from "three";
import { AppState } from "./AppState.js";


export class SplatExporter {
    static save() {
        if (!AppState.activeSplatMesh) return alert('No active splat to save.');
        const btn = document.getElementById('save-exhibit-btn');
        btn.innerText = 'Baking Transform...'; 
        btn.disabled = true;

        const tCenter = new THREE.Vector3();
        const tRot = new THREE.Quaternion();
        const tScale = new THREE.Vector3();

        const validSplats = [];
        const visualColors = AppState.activeSplatMesh.getSplatDataTextures()?.baseData.colors;

        let globalIndex = 0;
        const scenes = AppState.activeSplatMesh.scenes;

        AppState.loadedScenes.forEach(layer => {
            if (!layer.exportable) return;

            const count = layer.splatBuffer.getSplatCount();
            const colors = layer.mesh.getSplatDataTextures()?.baseData.colors;

            const meshMatrix = layer.proxy.matrixWorld;
            const meshQuat = new THREE.Quaternion().setFromRotationMatrix(meshMatrix);
            const meshScale = new THREE.Vector3().setFromMatrixScale(meshMatrix);

            for (let i = 0; i < count; i++) {
                if (layer.erasedIndices.has(i)) continue;
                
                layer.splatBuffer.getSplatCenter(i, tCenter); 
                layer.splatBuffer.getSplatScaleAndRotation(i, tScale, tRot);
                
                tCenter.applyMatrix4(meshMatrix);
                tRot.premultiply(meshQuat); 
                tScale.multiply(meshScale); 
                
                const r = colors ? colors[i * 4 + 0] : 255;
                const g = colors ? colors[i * 4 + 1] : 255;
                const b = colors ? colors[i * 4 + 2] : 255;
                const a = colors ? colors[i * 4 + 3] : 255;

                validSplats.push({
                    x: tCenter.x, y: tCenter.y, z: tCenter.z,
                    scaleX: tScale.x, scaleY: tScale.y, scaleZ: tScale.z,
                    rotW: tRot.w, rotX: tRot.x, rotY: tRot.y, rotZ: tRot.z,
                    color:[r, g, b, a]
                });
            }
        });

        btn.innerText = 'Generating PLY...';

        const workerCode = `
            self.onmessage = function(e) {
                const { validSplats } = e.data;
                const SH_C0 = 0.28209479177387814;
                const totalVertices = validSplats.length;

                const header = "ply\\nformat binary_little_endian 1.0\\nelement vertex " + totalVertices + "\\nproperty float x\\nproperty float y\\nproperty float z\\nproperty float nx\\nproperty float ny\\nproperty float nz\\nproperty float f_dc_0\\nproperty float f_dc_1\\nproperty float f_dc_2\\nproperty float opacity\\nproperty float scale_0\\nproperty float scale_1\\nproperty float scale_2\\nproperty float rot_0\\nproperty float rot_1\\nproperty float rot_2\\nproperty float rot_3\\nend_header\\n";
                
                const headerBytes = new TextEncoder().encode(header);
                const BYTES_PER_VERTEX = 68; 
                
                const data = new ArrayBuffer(headerBytes.length + (totalVertices * BYTES_PER_VERTEX));
                const view = new DataView(data);
                new Uint8Array(data).set(headerBytes, 0);
                let offset = headerBytes.length;

                for (let i = 0; i < validSplats.length; i++) {
                    const s = validSplats[i];
                    
                    view.setFloat32(offset, s.x, true); 
                    view.setFloat32(offset+4, -s.y, true); 
                    view.setFloat32(offset+8, -s.z, true);
                    
                    view.setFloat32(offset+12, 0, true); view.setFloat32(offset+16, 0, true); view.setFloat32(offset+20, 0, true);
                    
                    view.setFloat32(offset+24, ((s.color[0]/255.0)-0.5)/SH_C0, true); 
                    view.setFloat32(offset+28, ((s.color[1]/255.0)-0.5)/SH_C0, true); 
                    view.setFloat32(offset+32, ((s.color[2]/255.0)-0.5)/SH_C0, true);
                    
                    const a = Math.max(0.0001, Math.min(0.9999, s.color[3]/255.0));
                    view.setFloat32(offset+36, Math.log(a / (1.0 - a)), true);
                    
                    view.setFloat32(offset+40, Math.log(Math.max(0.00001, s.scaleX)), true); 
                    view.setFloat32(offset+44, Math.log(Math.max(0.00001, s.scaleY)), true); 
                    view.setFloat32(offset+48, Math.log(Math.max(0.00001, s.scaleZ)), true);
                    
                    view.setFloat32(offset+52, s.rotW, true); 
                    view.setFloat32(offset+56, s.rotX, true); 
                    view.setFloat32(offset+60, -s.rotY, true); 
                    view.setFloat32(offset+64, -s.rotZ, true);
                    
                    offset += BYTES_PER_VERTEX;
                }

                self.postMessage(data, [data]); 
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));

        worker.onmessage = function(e) {
            const finalBuffer = e.data;
            const fileBlob = new Blob([finalBuffer], { type: 'application/octet-stream' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(fileBlob);
            link.download = 'edited_exhibit.ply';
            link.click();
            URL.revokeObjectURL(link.href);
            
            worker.terminate();
            btn.innerText = '💾 2. Export Clean Scene'; 
            btn.disabled = false;
        };

        worker.postMessage({ validSplats: validSplats });
    }
}