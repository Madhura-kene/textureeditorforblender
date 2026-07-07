from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4
import textwrap
import zipfile

import numpy as np
from PIL import Image, ImageFilter, ImageOps


SUPPORTED_MATERIALS = (
    "auto",
    "leather",
    "wood",
    "fabric",
    "stone",
    "metal",
    "concrete",
    "plastic",
)


@dataclass(frozen=True)
class MaterialProfile:
    label: str
    base_roughness: float
    metallic: float
    default_scale_cm: float
    summary: str


MATERIAL_PROFILES = {
    "leather": MaterialProfile(
        label="Leather",
        base_roughness=0.64,
        metallic=0.0,
        default_scale_cm=30.0,
        summary="Soft organic grain with medium-to-high roughness and shallow height detail.",
    ),
    "wood": MaterialProfile(
        label="Wood",
        base_roughness=0.52,
        metallic=0.0,
        default_scale_cm=50.0,
        summary="Directional surface pattern with moderate roughness and visible grain variation.",
    ),
    "fabric": MaterialProfile(
        label="Fabric",
        base_roughness=0.75,
        metallic=0.0,
        default_scale_cm=40.0,
        summary="Diffuse woven surface with high roughness and fine repeated detail.",
    ),
    "stone": MaterialProfile(
        label="Stone",
        base_roughness=0.7,
        metallic=0.0,
        default_scale_cm=60.0,
        summary="Dense mineral surface with stronger height variation and dry roughness.",
    ),
    "metal": MaterialProfile(
        label="Metal",
        base_roughness=0.28,
        metallic=0.95,
        default_scale_cm=35.0,
        summary="Reflective surface with low roughness and mostly flat metallic response.",
    ),
    "concrete": MaterialProfile(
        label="Concrete",
        base_roughness=0.82,
        metallic=0.0,
        default_scale_cm=75.0,
        summary="Granular matte surface with broad tonal variation and noticeable cavity shading.",
    ),
    "plastic": MaterialProfile(
        label="Plastic",
        base_roughness=0.34,
        metallic=0.0,
        default_scale_cm=25.0,
        summary="Smoother manufactured material with lower roughness and subtle height variation.",
    ),
}


def process_photo_to_pbr(
    *,
    image_bytes: bytes,
    filename: str,
    output_root: Path,
    base_url: str,
    material_override: str = "auto",
    surface_width_cm: float | None = None,
) -> dict[str, Any]:
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    image = normalize_input_image(image)

    detected_material = infer_material(image, filename)
    material_key = (
        material_override
        if material_override in MATERIAL_PROFILES
        else detected_material
    )
    profile = MATERIAL_PROFILES[material_key]

    flattened = delight_image(image)
    albedo = make_seamless(flattened)

    grayscale = to_float_grayscale(albedo)
    detail = np.abs(grayscale - blur_channel(grayscale, radius=10))

    roughness = build_roughness_map(grayscale, detail, profile.base_roughness)
    height = build_height_map(grayscale, detail)
    ao = build_ao_map(height)
    normal = build_normal_map(height, strength=5.0 if material_key in {"stone", "concrete"} else 3.5)
    metallic = build_metallic_map(profile.metallic, (height.height, height.width))

    scale_cm = surface_width_cm if surface_width_cm and surface_width_cm > 0 else profile.default_scale_cm
    seam_score = measure_seam_quality(np.asarray(albedo, dtype=np.float32) / 255.0)

    job_id = uuid4().hex[:10]
    job_dir = output_root / job_id
    textures_dir = job_dir / "textures"
    textures_dir.mkdir(parents=True, exist_ok=True)

    texture_images: dict[str, Image.Image] = {
        "albedo": albedo,
        "roughness": roughness,
        "normal": normal,
        "height": height,
        "ao": ao,
        "metallic": metallic,
    }

    texture_urls: dict[str, str] = {}
    for map_name, map_image in texture_images.items():
        map_path = textures_dir / f"{map_name}.png"
        map_image.save(map_path, format="PNG")
        texture_urls[map_name] = f"{base_url}/generated/{job_id}/textures/{map_name}.png"

    script_path = job_dir / "build_material.py"
    script_path.write_text(generate_blender_script(scale_cm), encoding="utf-8")

    readme_path = job_dir / "readme.txt"
    readme_path.write_text(generate_readme(), encoding="utf-8")

    zip_path = job_dir / "photo_to_pbr_package.zip"
    create_download_zip(zip_path, textures_dir, script_path, readme_path)

    return {
        "jobId": job_id,
        "sourceResolution": {"width": image.width, "height": image.height},
        "detectedMaterial": detected_material,
        "effectiveMaterial": material_key,
        "materialProfile": {
            "label": profile.label,
            "summary": profile.summary,
            "baseRoughness": profile.base_roughness,
            "metallic": profile.metallic,
        },
        "scale": {
            "surfaceWidthCm": round(scale_cm, 2),
            "mappingScale": round(100.0 / scale_cm, 3),
        },
        "seamQuality": round(seam_score, 4),
        "notes": [
            "This MVP uses deterministic image-processing heuristics rather than expensive hosted diffusion models.",
            "Material classification is rule-based with visual heuristics; users can override it before processing.",
            "Generated roughness, height, and normal maps are plausible approximations from a single photo, not physically scanned truth.",
        ],
        "maps": texture_urls,
        "scriptUrl": f"{base_url}/generated/{job_id}/build_material.py",
        "readmeUrl": f"{base_url}/generated/{job_id}/readme.txt",
        "downloadUrl": f"{base_url}/generated/{job_id}/photo_to_pbr_package.zip",
    }


def normalize_input_image(image: Image.Image) -> Image.Image:
    max_dimension = 2048
    min_dimension = 1024

    if min(image.size) < min_dimension:
        upscale_ratio = min_dimension / min(image.size)
        image = image.resize(
            (int(image.width * upscale_ratio), int(image.height * upscale_ratio)),
            Image.Resampling.LANCZOS,
        )

    if max(image.size) > max_dimension:
        image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

    return ImageOps.autocontrast(image)


def infer_material(image: Image.Image, filename: str) -> str:
    lowercase_name = filename.lower()
    for key in MATERIAL_PROFILES:
        if key in lowercase_name:
            return key

    array = np.asarray(image, dtype=np.float32) / 255.0
    mean_rgb = array.mean(axis=(0, 1))
    luminance = 0.2126 * array[:, :, 0] + 0.7152 * array[:, :, 1] + 0.0722 * array[:, :, 2]
    contrast = float(luminance.std())
    saturation = float((array.max(axis=2) - array.min(axis=2)).mean())

    if mean_rgb.mean() < 0.28 and contrast < 0.14:
        return "leather"
    if mean_rgb[0] > mean_rgb[2] + 0.08 and saturation > 0.16:
        return "wood"
    if contrast > 0.23 and saturation < 0.18:
        return "concrete"
    if contrast > 0.18 and mean_rgb.mean() > 0.55:
        return "stone"
    if saturation < 0.1 and contrast < 0.12:
        return "metal"
    if saturation > 0.22 and contrast < 0.12:
        return "plastic"
    return "fabric"


def delight_image(image: Image.Image) -> Image.Image:
    arr = np.asarray(image, dtype=np.float32) / 255.0
    blur_radius = max(12, min(image.size) // 18)
    lighting = np.asarray(image.filter(ImageFilter.GaussianBlur(radius=blur_radius)), dtype=np.float32) / 255.0
    flattened = np.clip(arr / np.maximum(lighting, 0.18), 0.0, 1.0)
    flattened = normalize_float_image(flattened)
    return Image.fromarray((flattened * 255).astype(np.uint8))


def make_seamless(image: Image.Image) -> Image.Image:
    arr = np.asarray(image, dtype=np.float32)
    height, width, _ = arr.shape
    margin = max(24, min(height, width) // 8)
    out = arr.copy()

    for offset in range(margin):
        alpha = offset / max(1, margin - 1)
        left = arr[:, offset, :]
        right = arr[:, width - margin + offset, :]
        mixed = (1.0 - alpha) * left + alpha * right
        out[:, offset, :] = mixed
        out[:, width - margin + offset, :] = mixed

    arr_after_horizontal = out.copy()
    for offset in range(margin):
        alpha = offset / max(1, margin - 1)
        top = arr_after_horizontal[offset, :, :]
        bottom = arr_after_horizontal[height - margin + offset, :, :]
        mixed = (1.0 - alpha) * top + alpha * bottom
        out[offset, :, :] = mixed
        out[height - margin + offset, :, :] = mixed

    smoothed = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    smoothed = Image.blend(smoothed, smoothed.filter(ImageFilter.GaussianBlur(radius=1.5)), alpha=0.18)
    return ImageOps.autocontrast(smoothed)


def to_float_grayscale(image: Image.Image) -> np.ndarray:
    arr = np.asarray(image, dtype=np.float32) / 255.0
    return 0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]


def blur_channel(channel: np.ndarray, radius: int) -> np.ndarray:
    image = Image.fromarray(np.clip(channel * 255.0, 0, 255).astype(np.uint8))
    blurred = image.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.asarray(blurred, dtype=np.float32) / 255.0


def build_roughness_map(gray: np.ndarray, detail: np.ndarray, base_roughness: float) -> Image.Image:
    rough = np.clip(base_roughness + detail * 1.35 + (0.5 - gray) * 0.22, 0.04, 0.98)
    return Image.fromarray((rough * 255).astype(np.uint8), mode="L")


def build_height_map(gray: np.ndarray, detail: np.ndarray) -> Image.Image:
    shaped = normalize_channel(gray * 0.58 + detail * 1.85)
    return Image.fromarray((shaped * 255).astype(np.uint8), mode="L")


def build_ao_map(height_map: Image.Image) -> Image.Image:
    height = np.asarray(height_map, dtype=np.float32) / 255.0
    broad = blur_channel(height, radius=8)
    cavities = np.clip(broad - height, -1.0, 1.0)
    ao = np.clip(1.0 - cavities * 2.1, 0.1, 1.0)
    return Image.fromarray((ao * 255).astype(np.uint8), mode="L")


def build_normal_map(height_map: Image.Image, strength: float) -> Image.Image:
    height = np.asarray(height_map, dtype=np.float32) / 255.0
    grad_y, grad_x = np.gradient(height)
    nx = -grad_x * strength
    ny = -grad_y * strength
    nz = np.ones_like(height)

    normal = np.stack((nx, ny, nz), axis=2)
    norm = np.linalg.norm(normal, axis=2, keepdims=True)
    normal = normal / np.maximum(norm, 1e-8)
    packed = ((normal + 1.0) * 0.5 * 255.0).astype(np.uint8)
    return Image.fromarray(packed, mode="RGB")


def build_metallic_map(metallic_value: float, shape: tuple[int, int]) -> Image.Image:
    value = int(np.clip(metallic_value, 0.0, 1.0) * 255)
    image = np.full(shape, value, dtype=np.uint8)
    return Image.fromarray(image, mode="L")


def normalize_float_image(arr: np.ndarray) -> np.ndarray:
    p1, p99 = np.percentile(arr, (1, 99))
    return np.clip((arr - p1) / max(p99 - p1, 1e-6), 0.0, 1.0)


def normalize_channel(channel: np.ndarray) -> np.ndarray:
    minimum = float(channel.min())
    maximum = float(channel.max())
    return (channel - minimum) / max(maximum - minimum, 1e-6)


def measure_seam_quality(arr: np.ndarray) -> float:
    left_right = float(np.abs(arr[:, 0, :] - arr[:, -1, :]).mean())
    top_bottom = float(np.abs(arr[0, :, :] - arr[-1, :, :]).mean())
    return max(0.0, 1.0 - ((left_right + top_bottom) / 2.0))


def create_download_zip(
    zip_path: Path,
    textures_dir: Path,
    script_path: Path,
    readme_path: Path,
) -> None:
    with zipfile.ZipFile(zip_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for texture_path in textures_dir.glob("*.png"):
            archive.write(texture_path, arcname=f"textures/{texture_path.name}")
        archive.write(script_path, arcname="build_material.py")
        archive.write(readme_path, arcname="readme.txt")


def generate_blender_script(scale_cm: float) -> str:
    mapping_scale = round(100.0 / scale_cm, 3)
    return textwrap.dedent(
        f"""
        import bpy
        import os


        def load_texture(textures_dir, filename, colorspace="sRGB"):
            path = os.path.join(textures_dir, filename)
            image = bpy.data.images.load(path, check_existing=True)
            image.colorspace_settings.name = colorspace
            return image


        script_dir = os.path.dirname(os.path.realpath(__file__)) if "__file__" in globals() else os.getcwd()
        textures_dir = os.path.join(script_dir, "textures")

        material = bpy.data.materials.new(name="PhotoToPBR_Material")
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()

        output = nodes.new("ShaderNodeOutputMaterial")
        output.location = (950, 0)

        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.location = (650, 0)
        bsdf.inputs["Roughness"].default_value = 0.5

        tex_coord = nodes.new("ShaderNodeTexCoord")
        tex_coord.location = (-850, 40)

        mapping = nodes.new("ShaderNodeMapping")
        mapping.location = (-620, 40)
        mapping.inputs["Scale"].default_value[0] = {mapping_scale}
        mapping.inputs["Scale"].default_value[1] = {mapping_scale}
        mapping.inputs["Scale"].default_value[2] = 1.0

        albedo = nodes.new("ShaderNodeTexImage")
        albedo.location = (-360, 240)
        albedo.image = load_texture(textures_dir, "albedo.png", "sRGB")

        roughness = nodes.new("ShaderNodeTexImage")
        roughness.location = (-360, 70)
        roughness.image = load_texture(textures_dir, "roughness.png", "Non-Color")

        metallic = nodes.new("ShaderNodeTexImage")
        metallic.location = (-360, -90)
        metallic.image = load_texture(textures_dir, "metallic.png", "Non-Color")

        normal_tex = nodes.new("ShaderNodeTexImage")
        normal_tex.location = (-360, -260)
        normal_tex.image = load_texture(textures_dir, "normal.png", "Non-Color")

        height_tex = nodes.new("ShaderNodeTexImage")
        height_tex.location = (-360, -430)
        height_tex.image = load_texture(textures_dir, "height.png", "Non-Color")

        ao_tex = nodes.new("ShaderNodeTexImage")
        ao_tex.location = (-360, -600)
        ao_tex.image = load_texture(textures_dir, "ao.png", "Non-Color")

        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.location = (120, -230)
        normal_map.inputs["Strength"].default_value = 1.0

        bump = nodes.new("ShaderNodeBump")
        bump.location = (360, -240)
        bump.inputs["Strength"].default_value = 0.18

        ao_mix = nodes.new("ShaderNodeMixRGB")
        ao_mix.location = (160, 210)
        ao_mix.blend_type = "MULTIPLY"
        ao_mix.inputs["Fac"].default_value = 1.0

        displacement = nodes.new("ShaderNodeDisplacement")
        displacement.location = (640, -420)
        displacement.inputs["Scale"].default_value = 0.04

        links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])
        for texture_node in [albedo, roughness, metallic, normal_tex, height_tex, ao_tex]:
            links.new(mapping.outputs["Vector"], texture_node.inputs["Vector"])

        links.new(albedo.outputs["Color"], ao_mix.inputs[1])
        links.new(ao_tex.outputs["Color"], ao_mix.inputs[2])
        links.new(ao_mix.outputs["Color"], bsdf.inputs["Base Color"])

        links.new(roughness.outputs["Color"], bsdf.inputs["Roughness"])
        links.new(metallic.outputs["Color"], bsdf.inputs["Metallic"])
        links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bump.inputs["Normal"])
        links.new(height_tex.outputs["Color"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        links.new(height_tex.outputs["Color"], displacement.inputs["Height"])
        links.new(displacement.outputs["Displacement"], output.inputs["Displacement"])

        links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

        if bpy.context.active_object and getattr(bpy.context.active_object.data, "materials", None) is not None:
            obj = bpy.context.active_object
            if len(obj.data.materials) == 0:
                obj.data.materials.append(material)
            else:
                obj.data.materials[0] = material

            has_uvs = bool(getattr(obj.data, "uv_layers", []))
            if not has_uvs:
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.03)
                bpy.ops.object.mode_set(mode="OBJECT")
        """
    ).strip() + "\n"


def generate_readme() -> str:
    return textwrap.dedent(
        """
        Photo-to-PBR Export

        Files included:
        - textures/albedo.png
        - textures/roughness.png
        - textures/normal.png
        - textures/height.png
        - textures/ao.png
        - textures/metallic.png
        - build_material.py

        Usage:
        1. Extract this zip to a folder.
        2. Open Blender 4.x.
        3. Switch to the Scripting workspace.
        4. Open build_material.py and click Run Script.
        5. If an object is selected, the material will be assigned automatically.
        """
    ).strip() + "\n"
