import * as THREE from "three";
import { AppState } from "./AppState.js";
import { SceneManager } from "./SceneManager.js";

export class ProjectManager {
    static save() {
        if (AppState.markers.length === 0 && AppState.waypoints.length === 0) {
            return alert("No markers or waypoints to save yet!");
        }
         
        const projectData = {
            markers: AppState.markers.map(m => ({
                position: { x: m.position.x, y: m.position.y, z: m.position.z },
                label: m.label
            })),
            waypoints: AppState.waypoints.map(wp => ({
                position: { x: wp.position.x, y: wp.position.y, z: wp.position.z },
                target: { x: wp.target.x, y: wp.target.y, z: wp.target.z }
            }))
        };

        const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "museum_tour.json";
        link.click();
        URL.revokeObjectURL(link.href);
    }

    static async load(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (AppState.markers) {
                AppState.markers.forEach(m => SceneManager.markerGroup.remove(m.mesh));
            }
            AppState.markers = [];
            AppState.waypoints =[];

            if (data.markers) {
                data.markers.forEach(m => {
                    const pos = new THREE.Vector3(m.position.x, m.position.y, m.position.z);
                    const mesh = SceneManager.addMarkerVisual(pos);
                    AppState.markers.push({ position: pos, label: m.label, mesh: mesh });
                });
            }

            if (data.waypoints) {
                data.waypoints.forEach(wp => {
                    AppState.waypoints.push({
                        position: new THREE.Vector3(wp.position.x, wp.position.y, wp.position.z),
                        target: new THREE.Vector3(wp.target.x, wp.target.y, wp.target.z)
                    });
                });
            }
            alert(`Successfully loaded ${AppState.markers.length} markers and ${AppState.waypoints.length} viewpoints!`);
        } catch (e) {
            alert("Failed to parse the project file. Make sure it's a valid JSON.");
        }
    }
}