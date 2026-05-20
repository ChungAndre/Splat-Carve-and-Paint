import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import * as GaussianSplats3D from "@mkkellogg/gaussian-splats-3d";

import { AppState } from "./AppState.js";
import { SceneManager } from "./SceneManager.js";
import { ToolManager } from "./ToolManager.js";
import { UIController } from "./UIController.js";
import { SplatExporter } from "./SplatExporter.js";
import { ProjectManager } from "./ProjectManager.js";

SceneManager.init();
UIController.init();
ToolManager.init();
