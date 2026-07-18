TEB - Texture Editor for Blender

TEB is a browser-based texture tool that turns a single input image into a small PBR texture set for Blender. It generates `albedo`, `normal`, `roughness`, `displacement`, and `ao` maps in the browser, shows them on a live 3D preview, and lets you export either:

- a Blender zip with the generated maps plus a setup script
- a ready-made `.blend` file through a local headless Blender bridge

## What It Does

- Upload one texture image and generate 5 derived maps locally
- Tweak normal strength, roughness, AO, tiling, and displacement behavior in real time
- Preview the material on `sphere`, `cube`, `cylinder`, or `plane`
- Export a Blender-ready zip package
- Export a `.blend` file with the generated material already wired

## Generated Maps

- `albedo.png`: base color
- `normal.png`: Sobel-based normal map
- `roughness.png`: grayscale roughness map
- `displacement.png`: grayscale height/displacement map
- `ao.png`: ambient occlusion map

## Stack

- `Vite`
- `Three.js`
- `JSZip`
- `Vanilla JavaScript`
- `Headless Blender` for direct `.blend` export

## Project Structure

```text
teb/
|- index.html
|- package.json
|- vite.config.js
|- server/
|  \- blender-service.mjs
\- src/
   |- main.js
   |- generator.js
   |- preview3d.js
   |- exporter.js
   \- style.css
```

## Requirements

- `Node.js 18+`
- `Blender` installed locally if you want `.blend` export

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Direct .blend Export

The app supports two export modes.

### 1. Blender Zip Export

This works with no backend.

It downloads:

- the generated PNG maps
- `setup_material.py`
- a small readme text file

Use this when you want a simple Blender handoff and are okay with running the script inside Blender.

### 2. Headless Blender Export

This creates a downloadable `.blend` file directly from the website.

Start the local Blender bridge in a second terminal:

```bash
npm run dev:blender
```

The bridge listens on `http://localhost:3001`.

If Blender is not on your `PATH`, set `BLENDER_PATH` first.

PowerShell example:

```powershell
$env:BLENDER_PATH="C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
npm run dev:blender
```

Once the service is running, the app can:

1. Generate the maps in the browser
2. Send them to the local bridge
3. Launch Blender in background mode
4. Build a `.blend` file
5. Download that `.blend` back to the browser

## Blender Material Wiring

Both export flows use the same default node layout:

- `UV` -> `Mapping` -> all texture `Vector` inputs
- `albedo` -> `Principled BSDF / Base Color`
- `roughness` -> `Principled BSDF / Roughness`
- `normal` -> `Normal Map` node -> `Principled BSDF / Normal`
- `displacement` -> `Displacement` node -> `Material Output / Displacement`

`ao.png` is exported and included, but it is not connected by default.

## How To Use

1. Upload a JPG, PNG, or WEBP image
2. Adjust the controls until the preview looks right
3. Choose a preview geometry
4. Export either:
   - `Export Blender Zip`
   - `Export .blend`

## Notes

- All map generation happens locally in the browser
- `.blend` export also stays local if you run the Blender bridge on your own machine
- The exported `.blend` currently uses the selected preview geometry as the object in the generated file
- The Blender bridge packs the generated images into the `.blend` before returning it

## Scripts

- `npm run dev`: start the Vite app
- `npm run dev:blender`: start the local Blender export bridge
- `npm run build`: build the frontend
- `npm run preview`: preview the production build
