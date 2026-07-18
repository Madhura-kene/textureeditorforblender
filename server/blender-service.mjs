import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.TEB_BLENDER_PORT || 3001);
const BLENDER_PATH = process.env.BLENDER_PATH || 'blender';

const PYTHON_SCRIPT = `import bpy
import json
import os
import sys


def load_config():
    args = sys.argv
    if "--" not in args:
        raise RuntimeError("Missing export arguments.")
    idx = args.index("--")
    config_path = args[idx + 1]
    output_path = args[idx + 2]
    with open(config_path, "r", encoding="utf-8") as fh:
        config = json.load(fh)
    return config, output_path


def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.images:
        if not block.packed_file:
            bpy.data.images.remove(block)


def add_geometry(geometry):
    if geometry == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=64, ring_count=32)
    elif geometry == "cube":
        bpy.ops.mesh.primitive_cube_add(size=2.0)
    elif geometry == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.0, depth=2.0)
    else:
        bpy.ops.mesh.primitive_plane_add(size=2.5)
    return bpy.context.active_object


def ensure_cycles():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'


def create_material(config):
    texture_dir = config["textureDir"]
    tiling_frequency = max(1.0, float(config.get("tilingFrequency", 1.0)))
    displacement_scale = float(config.get("displacementScale", 0.1))

    mat = bpy.data.materials.new(name="TEB_Material")
    mat.use_nodes = True
    if hasattr(mat, "displacement_method"):
        mat.displacement_method = 'BOTH'

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output_node = nodes.new(type='ShaderNodeOutputMaterial')
    output_node.location = (700, -50)

    bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf_node.location = (300, 50)
    links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])

    tex_coord_node = nodes.new(type='ShaderNodeTexCoord')
    tex_coord_node.location = (-900, -50)

    mapping_node = nodes.new(type='ShaderNodeMapping')
    mapping_node.location = (-650, -50)
    mapping_node.inputs['Scale'].default_value[0] = tiling_frequency
    mapping_node.inputs['Scale'].default_value[1] = tiling_frequency
    links.new(tex_coord_node.outputs['UV'], mapping_node.inputs['Vector'])

    def add_texture(filename, label, color_space, location):
        file_path = os.path.join(texture_dir, filename)
        if not os.path.exists(file_path):
            return None
        node = nodes.new(type='ShaderNodeTexImage')
        node.label = label
        node.location = location
        # Always load a fresh datablock for each generated map so Blender does not
        # accidentally reuse a cached image from a previous export session.
        img = bpy.data.images.load(file_path, check_existing=False)
        img.colorspace_settings.name = color_space
        node.image = img
        links.new(mapping_node.outputs['Vector'], node.inputs['Vector'])
        return node

    rough_node = add_texture("roughness.png", "Roughness", 'Non-Color', (-350, 500))
    if rough_node:
        links.new(rough_node.outputs['Color'], bsdf_node.inputs['Roughness'])

    albedo_node = add_texture("albedo.png", "Albedo", 'sRGB', (-350, 250))
    if albedo_node:
        links.new(albedo_node.outputs['Color'], bsdf_node.inputs['Base Color'])

    normal_img_node = add_texture("normal.png", "Normal", 'Non-Color', (-350, -250))
    if normal_img_node:
        normal_map_node = nodes.new(type='ShaderNodeNormalMap')
        normal_map_node.location = (-50, -250)
        links.new(normal_img_node.outputs['Color'], normal_map_node.inputs['Color'])
        links.new(normal_map_node.outputs['Normal'], bsdf_node.inputs['Normal'])

    displacement_img_node = add_texture("displacement.png", "Displacement", 'Non-Color', (-350, -500))
    if displacement_img_node:
        displacement_node = nodes.new(type='ShaderNodeDisplacement')
        displacement_node.location = (300, -450)
        displacement_node.inputs['Scale'].default_value = displacement_scale
        displacement_node.inputs['Midlevel'].default_value = 0.5
        links.new(displacement_img_node.outputs['Color'], displacement_node.inputs['Height'])
        links.new(displacement_node.outputs['Displacement'], output_node.inputs['Displacement'])

    add_texture("ao.png", "AO", 'Non-Color', (-350, 750))

    return mat


def assign_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def main():
    config, output_path = load_config()
    reset_scene()
    ensure_cycles()
    obj = add_geometry(config.get("geometry", "plane"))
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mat = create_material(config)
    assign_material(obj, mat)

    # Embed the generated texture files into the .blend before the temp folder is deleted.
    for image in bpy.data.images:
        if image.source == 'FILE' and image.filepath:
            try:
                image.pack()
            except RuntimeError:
                pass

    bpy.ops.wm.save_as_mainfile(filepath=output_path, compress=True)


main()
`;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sanitizeFilename(name) {
  return (name || 'texture')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'texture';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100 * 1024 * 1024) {
        reject(new Error('Payload too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

function decodeDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) {
    throw new Error('Invalid texture data received.');
  }
  return Buffer.from(match[2], 'base64');
}

async function writeTextures(tempDir, textures) {
  const requiredTextures = ['albedo', 'normal', 'roughness', 'displacement', 'ao'];
  await Promise.all(requiredTextures.map(async (name) => {
    const dataUrl = textures?.[name];
    if (!dataUrl) {
      throw new Error(`Missing texture: ${name}`);
    }
    await fs.writeFile(path.join(tempDir, `${name}.png`), decodeDataUrl(dataUrl));
  }));
}

function runBlender(scriptPath, configPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      BLENDER_PATH,
      ['-b', '--factory-startup', '-P', scriptPath, '--', configPath, outputPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start Blender from "${BLENDER_PATH}": ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Blender exited with code ${code}.\n${stderr || stdout}`));
      }
    });
  });
}

const server = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      blenderPath: BLENDER_PATH,
      port: PORT
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/export-blend') {
    let tempDir = '';

    try {
      const payload = await readJsonBody(req);
      const filenameBase = sanitizeFilename(payload.baseFilename);
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'teb-blend-'));
      const scriptPath = path.join(tempDir, 'build_blend.py');
      const configPath = path.join(tempDir, 'config.json');
      const outputPath = path.join(tempDir, `${filenameBase}.blend`);

      await writeTextures(tempDir, payload.textures);

      const config = {
        textureDir: tempDir,
        geometry: payload.geometry || 'plane',
        displacementScale: payload.displacementScale ?? 0.1,
        tilingFrequency: payload.tilingFrequency ?? 1
      };

      await fs.writeFile(scriptPath, PYTHON_SCRIPT, 'utf8');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

      await runBlender(scriptPath, configPath, outputPath);

      const blendBuffer = await fs.readFile(outputPath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filenameBase}.blend"`,
        'Content-Length': blendBuffer.length
      });
      res.end(blendBuffer);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message
      });
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`TEB Blender service listening on http://localhost:${PORT}`);
  console.log(`Using Blender executable: ${BLENDER_PATH}`);
});
