# Photo-to-PBR

Photo-to-PBR is an MVP web application that turns a single close-up material photo into a Blender-ready PBR package.

## Stack

- `frontend/`: Next.js app for upload, preview, and download
- `backend/`: FastAPI service for photo processing and export generation

## Features

- Single-image upload for `JPG`, `PNG`, and `WEBP`
- Material auto-detection with manual override
- Lighting flattening and seamless tiling
- Generated `albedo`, `roughness`, `normal`, `height`, `ao`, and `metallic` maps
- Browser preview for a sphere and tiled plane
- Downloadable `.zip` with textures, Blender Python script, and readme

## Run locally

Backend:

```bash
uvicorn app.main:app --reload --app-dir backend
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

If needed, point the frontend at a different backend URL with `NEXT_PUBLIC_API_BASE`.
