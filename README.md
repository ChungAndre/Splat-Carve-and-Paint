# Splat-Carve-and-Paint: 3D Gaussian Splatting Platform

**A dual-workspace web application for authoring, editing, and showcasing 3D Gaussian Splatting (3DGS) environments.**

## Overview
In the past year, 3D Gaussian Splatting has revolutionized photogrammetry. However, while capturing environments is highly accessible, editing and presenting these non-polygonal point clouds remains difficult. 

This project bridges that gap by providing a unified, browser-based Single Page Application (SPA). It allows users to import raw `.ply` scans, use 2D-to-3D frustum projection to carve out noise, composite selected elements onto new layers, and ultimately build an automated, guided museum tour for end-users.

## Core Features

### Workspace A: The Editor (Authoring)
* **Selection & Carving:** Draw 2D shapes (Rectangle, Circle, Lasso) over the 3D viewport to precisely select splats.
* **Non-Destructive Actions:** Apply actions to selections, including **Erase Inside**, **Crop (Keep Inside)**, or **Copy to New Layer**.
* **Semantic Tinting:** By selecting "Paint", the engine dynamically blends custom RGB values and opacity into the selected splats' data textures, allowing users to highlight areas of interest without adding artificial polygon geometry.
* **Layer Compositing & Transform:** Cloned selections become independent 3D layers. Use the Transform Gizmo to freely translate, rotate, and scale individual artifacts within the scene.
* **Color Inspector (Eyedropper):** Sample the exact RGB data of any individual Gaussian Splat in the scene.
* **Optimized Export:** Merge active layers and export a clean, optimized Level-0 `.ply` scene.

### Workspace B: The Museum (Showcase)
* **Semantic 3D Markers:** Drop contextual 3D pins onto the artifact and assign text metadata.
* **Cinematic Waypoints:** Save specific camera angles and targets to curate a guided tour.
* **Presentation Mode:** Hides the editing UI, projects 3D markers into floating HTML text bubbles, and uses mathematical easing to fly the camera smoothly between saved waypoints.
* **JSON State Saving:** Save and load your curated tours (Markers and Viewpoints) independently of the heavy `.ply` geometry.

## Engine Architecture & Implementation Details

To achieve smooth performance in a web browser manipulating millions of points, several advanced graphics engineering techniques were implemented:

* **2D-to-3D Projection:** To enable the selection tools (Lasso/Rectangle/Circle), the engine pre-calculates the Model-View-Projection (MVP) Matrix. It transforms the 3D splats into Normalized Device Coordinates (NDC), allowing for instantaneous Point-In-Polygon math against the user's 2D screen-space drawing.
* **Optimized Local-Space Raycasting:** To support the Color Inspector and Marker placement, the engine applies an Inverse World Matrix to the mouse ray, transforming the raycaster into Local Space. This bypasses the $O(n)$ CPU overhead of transforming millions of splats into World Space every frame.
* **Zero-Copy Web Worker Exporting:** The `.ply` generator runs on a background CPU thread. It formats the raw 32-bit float arrays and strictly adheres to the Level-0 PLY format (stripping out unused Spherical Harmonics) to reduce exported file sizes by up to 50% without freezing the UI.
* **Dynamic Layer Matrix Management:** Cloned splats are decoupled from the base mesh via a proxy `THREE.Object3D`. The render loop synchronizes the splat scene to the proxy, allowing independent transformation of multiple 3DGS layers in a single WebGL context.

## Local Development

This project uses [Vite](https://vitejs.dev/) as its build tool and development server. 

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation & Running

1. **Clone the repository and navigate into it:**
   ```bash
   git clone https://github.com/ChungAndre/Splat-Carve-and-Paint.git
   cd Splat-Carve-and-Paint
   ```

2. **Install dependencies:**
    ```bash
    npm install
    ```

3. **Start the local development server:**
    ```bash
    npm run dev
    ```
## How to Use
* **Editor Mode:** Load a `.ply` file, use the shape tools to crop noise, and export the clean scene.
* **Tour Mode:** Switch to the Tour tab, load your clean `.ply`, place markers, save waypoints, and click "Presentation Mode".

## Sample Data / Demo Assets

Due to file size constraints, some raw 3D Gaussian Splats (`.ply`) files are not included in this repository. 

You can download sample environments to test the application from the following Google Drive folder:
**[Download Sample Splats (Google Drive)](https://drive.google.com/drive/folders/1WSy2DpK6W2ZKB_2zHBTWD-59wK5vQW7c?usp=share_link)**

**To use the sample data:**
1. Download a `.ply` file from the Google Drive link.
2. You can place the downloaded file in the `public/models/` directory, or simply load it directly from your local machine when using the Editor.
