# TEB — Texture Editor for Blender

**TEB** is a browser-based PBR texture map generator for Blender. Upload any image and instantly generate five production-ready texture maps with a real-time interactive 3D preview, then export either a Blender zip package or a ready-made `.blend` through a local headless Blender service.

![TEB Studio](https://raw.githubusercontent.com/Madhura-kene/texture-editor-for-blender/main/preview.png)

---

##  Features

- **5 PBR Maps generated in-browser** — Albedo, Normal (Sobel filter), Roughness, Displacement/Height, Ambient Occlusion
- **Real-time slider controls** — adjust Normal Strength, Roughness Contrast, AO Strength, Seamless Blend, and more with instant live canvas feedback
- **Optional Seamless Tiling** — quadrant-shift + center edge-blend algorithm for perfectly tileable textures
- **Interactive Three.js 3D Viewport** — orbit, pan, zoom, and a cursor-tracked point light to preview normal & roughness shading in real-time
- **4 Preview Geometries** — Sphere, Cube, Cylinder, Plane
- **Viewport controls** — Light Angle, Displacement Scale, Tiling Repeat
- **Dual Blender Export** — download a `.zip` with the maps and setup script, or a generated `.blend` file through your local headless Blender service
- **Privacy-first** — processing stays local: browser-side maps plus optional local Blender generation

---

##  Getting Started

### Prerequisites
- Node.js 18+

### Install & Run
```bash
git clone https://github.com/Madhura-kene/texture-editor-for-blender.git
cd texture-editor-for-blender
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Optional `.blend` export service
If you want direct `.blend` downloads, run the local Blender bridge in a second terminal:

```bash
npm run dev:blender
```

If Blender is not on your `PATH`, set `BLENDER_PATH` first.

Windows PowerShell example:

```powershell
$env:BLENDER_PATH="C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
npm run dev:blender
```

---

##  Using TEB

1. **Upload** — drag any JPG/PNG/WEBP texture onto the dropzone, or click to browse
2. **Tune** — use the sliders to control Normal strength, Roughness contrast, AO intensity, and optionally enable Seamless Tiling
3. **Preview** — rotate the 3D mesh with left-click drag; move your cursor over it to see the cursor-tracked point light illuminate the surface details
4. **Switch geometry** — use the toolbar above the viewport to swap between Sphere, Cube, Cylinder, and Plane
5. **Export** — click **Export Blender Zip** for maps plus setup script, or **Export .blend** when the local Blender service is running

---

##  Blender Integration

### Zip export

After exporting the zip:

1. Extract the `.zip` to a folder
2. Open Blender → select a mesh → open the **Scripting** workspace
3. Click **Open** and load `setup_material.py` from the extracted folder
4. Click **Run Script**

The script automatically creates a material with:
- `UV` → `Mapping` → all texture nodes
- `Image Texture (sRGB)` → **Base Color**
- `Image Texture (Non-Color)` → **Roughness**
- `Image Texture (Non-Color)` → `Normal Map node` → **Normal**
- `Image Texture (Non-Color)` → `Displacement node` → **Material Output Displacement**

### Direct `.blend` export

When `npm run dev:blender` is running, the website can:

1. Generate all maps locally in the browser
2. Send them to the local Blender bridge on `http://localhost:3001`
3. Launch Blender in headless mode
4. Return a downloadable `.blend` with the selected preview geometry and wired material

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Bundler | [Vite](https://vitejs.dev/) |
| 3D Engine | [Three.js](https://threejs.org/) |
| Local `.blend` Export | Node.js + Headless Blender |
| ZIP Export | [JSZip](https://stuk.github.io/jszip/) |
| Fonts | [Plus Jakarta Sans + Space Grotesk](https://fonts.google.com/) |
| Styling | Vanilla CSS (Glassmorphism + Dark Mode) |
| Processing | HTML5 Canvas API (Sobel filter, Box Blur, Tiling) |

---

##  Project Structure

```
teb/
├── index.html          # Studio layout, controls, viewport
├── package.json
├── server/
│   └── blender-service.mjs   # Local bridge that calls headless Blender
├── vite.config.js
└── src/
    ├── main.js         # Event routing, state, processing pipeline
    ├── style.css       # Dark mode glassmorphic theme
    ├── generator.js    # PBR map generation (Normal, Roughness, AO, Displacement, Tiling)
    ├── preview3d.js    # Three.js scene, lights, OrbitControls, canvas textures
    └── exporter.js     # JSZip bundler + Blender Python script generator
```

---

