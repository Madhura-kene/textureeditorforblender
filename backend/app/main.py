from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.services.pipeline import SUPPORTED_MATERIALS, process_photo_to_pbr


ROOT_DIR = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT_DIR / "work" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Photo-to-PBR API",
    version="0.1.0",
    summary="MVP photo-to-material generation pipeline for Blender users.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/generated", StaticFiles(directory=GENERATED_DIR), name="generated")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/materials")
async def list_materials() -> dict[str, tuple[str, ...]]:
    return {"materials": SUPPORTED_MATERIALS}


@app.post("/api/process")
async def process_texture(
    request: Request,
    file: UploadFile = File(...),
    material_override: str = Form("auto"),
    surface_width_cm: float | None = Form(None),
) -> dict:
    if material_override not in SUPPORTED_MATERIALS:
        raise HTTPException(status_code=400, detail="Unsupported material override.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename was provided.")

    content_type = file.content_type or ""
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Supported formats are JPG, PNG, and WEBP.")

    image_bytes = await file.read()
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds the 20MB size limit.")

    base_url = str(request.base_url).rstrip("/")
    return process_photo_to_pbr(
        image_bytes=image_bytes,
        filename=file.filename,
        output_root=GENERATED_DIR,
        base_url=base_url,
        material_override=material_override,
        surface_width_cm=surface_width_cm,
    )
