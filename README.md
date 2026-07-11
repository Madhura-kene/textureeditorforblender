# TEB — Texture Editor for Blender

**TEB** is a fully client-side, browser-based PBR texture map generator for Blender. Upload any image and instantly generate five production-ready texture maps with a real-time interactive 3D preview — no server required.

![TEB Studio](https://raw.githubusercontent.com/Madhura-kene/texture-editor-for-blender/main/preview.png)

---

## ✨ Features

- **5 PBR Maps generated in-browser** — Albedo, Normal (Sobel filter), Roughness, Displacement/Height, Ambient Occlusion
- **Real-time slider controls** — adjust Normal Strength, Roughness Contrast, AO Strength, Seamless Blend, and more with instant live canvas feedback
- **Optional Seamless Tiling** — quadrant-shift + center edge-blend algorithm for perfectly tileable textures
- **Interactive Three.js 3D Viewport** — orbit, pan, zoom, and a cursor-tracked point light to preview normal & roughness shading in real-time
- **4 Preview Geometries** — Sphere, Cube, Cylinder, Plane
- **Viewport controls** — Light Angle, Displacement Scale, Tiling Repeat
- **One-click Blender Export** — downloads a `.zip` with all 5 maps as PNGs + a Python script that auto-wires the complete Principled BSDF node graph in Blender
- **Privacy-first** — 100% client-side; no images ever leave your browser

---

## 🚀 Getting Started

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

---

## 🎨 Using TEB

1. **Upload** — drag any JPG/PNG/WEBP texture onto the dropzone, or click to browse
2. **Tune** — use the sliders to control Normal strength, Roughness contrast, AO intensity, and optionally enable Seamless Tiling
3. **Preview** — rotate the 3D mesh with left-click drag; move your cursor over it to see the cursor-tracked point light illuminate the surface details
4. **Switch geometry** — use the toolbar above the viewport to swap between Sphere, Cube, Cylinder, and Plane
5. **Export** — click **Export Blender Zip** to download a production-ready archive

---

## 📦 Blender Integration

After exporting:

1. Extract the `.zip` to a folder
2. Open Blender → select a mesh → open the **Scripting** workspace
3. Click **Open** and load `setup_material.py` from the extracted folder
4. Click **Run Script**

The script automatically creates a material with:
- `Image Texture (sRGB)` → **Base Color**
- `Image Texture (Non-Color)` → `Normal Map node` → **Normal**
- `Image Texture (Non-Color)` → **Roughness**
- `Image Texture (Non-Color)` → `Bump node` (daisy-chained from Normal) → **Normal**

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Bundler | [Vite](https://vitejs.dev/) |
| 3D Engine | [Three.js](https://threejs.org/) |
| ZIP Export | [JSZip](https://stuk.github.io/jszip/) |
| Fonts | [Plus Jakarta Sans + Space Grotesk](https://fonts.google.com/) |
| Styling | Vanilla CSS (Glassmorphism + Dark Mode) |
| Processing | HTML5 Canvas API (Sobel filter, Box Blur, Tiling) |

---

## 📁 Project Structure

```
teb/
├── index.html          # Studio layout, controls, viewport
├── package.json
├── vite.config.js
└── src/
    ├── main.js         # Event routing, state, processing pipeline
    ├── style.css       # Dark mode glassmorphic theme
    ├── generator.js    # PBR map generation (Normal, Roughness, AO, Displacement, Tiling)
    ├── preview3d.js    # Three.js scene, lights, OrbitControls, canvas textures
    └── exporter.js     # JSZip bundler + Blender Python script generator
```

---

## 📄 License

MIT — feel free to use, modify, and distribute.
