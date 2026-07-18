/**
 * exporter.js - Handles ZIP export and Blender Python integration scripts
 */
import JSZip from 'jszip';

const BLENDER_SERVICE_URL = 'http://localhost:3001';

// Readme text instructions for the user
function getReadmeText() {
    return `-------------------------------------------------------
TEB - Texture Editor for Blender
-------------------------------------------------------

This package contains:
1. albedo.png        - Base diffuse color map
2. normal.png        - Sobel filtered surface normal map (OpenGL style)
3. roughness.png     - Surface roughness map (inverted contrast)
4. displacement.png  - Height / displacement details map
5. ao.png            - Ambient Occlusion (crevice shading) map
6. setup_material.py - Blender Python automated wiring script

INSTRUCTIONS FOR BLENDER SETUP:
-------------------------------------------------------
1. Extract this entire zip file into a dedicated folder on your computer.
2. Open Blender (v3.0 or higher is recommended).
3. Select the 3D Object you want to apply the material to (e.g., a Mesh Cube, Sphere, or Plane).
4. Go to the "Scripting" workspace from the top menu bar.
5. Click "Open" in the text editor and load "setup_material.py" from the extracted folder.
6. Click the "Run Script" button (the triangular Play button in the top right of the scripting viewport).
7. Change your 3D Viewport shading mode to "Material Preview" or "Rendered" to see the textured material.

Note:
The python script will automatically create a UV-driven Mapping setup and wire albedo, roughness, normal, and true displacement nodes with the correct Color Space settings ('sRGB' for Albedo and 'Non-Color' for normal, roughness, displacement, and AO).
`;
}

// Blender Python script template
function getBlenderPythonScript() {
    return `import bpy
import os

# Get directory of the script to load relative files
script_dir = os.path.dirname(os.path.realpath(__file__)) if __file__ else ""

def create_material(material_name="TEB_Material"):
    # Create a new material
    mat = bpy.data.materials.new(name=material_name)
    mat.use_nodes = True
    if hasattr(mat, "displacement_method"):
        mat.displacement_method = 'BOTH'
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Clear default nodes
    nodes.clear()
    
    # Create Material Output node
    output_node = nodes.new(type='ShaderNodeOutputMaterial')
    output_node.location = (700, -50)
    
    # Create Principled BSDF node
    bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf_node.location = (300, 50)
    links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])

    # Shared UV mapping controls for all image textures
    tex_coord_node = nodes.new(type='ShaderNodeTexCoord')
    tex_coord_node.location = (-900, -50)

    mapping_node = nodes.new(type='ShaderNodeMapping')
    mapping_node.location = (-650, -50)
    links.new(tex_coord_node.outputs['UV'], mapping_node.inputs['Vector'])
    
    # Helper to add an Image Texture node
    def add_image_texture(file_name, label, color_space='sRGB'):
        file_path = os.path.join(script_dir, file_name)
        if not os.path.exists(file_path):
            print(f"Warning: {file_name} not found in script directory.")
            return None
        
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.label = label
        try:
            img = bpy.data.images.load(file_path)
            tex_node.image = img
        except Exception as e:
            print(f"Error loading {file_name}: {e}")
            return None
            
        if hasattr(img, 'colorspace_settings'):
            img.colorspace_settings.name = color_space
        return tex_node
        
    # 1. Albedo (Base Color)
    albedo_node = add_image_texture("albedo.png", "Albedo (Color)", 'sRGB')
    if albedo_node:
        albedo_node.location = (-350, 250)
        links.new(mapping_node.outputs['Vector'], albedo_node.inputs['Vector'])
        color_input = bsdf_node.inputs.get('Base Color') or bsdf_node.inputs.get('Color')
        if color_input:
            links.new(albedo_node.outputs['Color'], color_input)
        
    # 2. Roughness
    rough_node = add_image_texture("roughness.png", "Roughness", 'Non-Color')
    if rough_node:
        rough_node.location = (-350, 500)
        links.new(mapping_node.outputs['Vector'], rough_node.inputs['Vector'])
        rough_input = bsdf_node.inputs.get('Roughness')
        if rough_input:
            links.new(rough_node.outputs['Color'], rough_input)
        
    # 3. Normal Map
    normal_img_node = add_image_texture("normal.png", "Normal Map Image", 'Non-Color')
    if normal_img_node:
        normal_img_node.location = (-350, -250)
        links.new(mapping_node.outputs['Vector'], normal_img_node.inputs['Vector'])
        normal_map_node = nodes.new(type='ShaderNodeNormalMap')
        normal_map_node.location = (-50, -250)
        links.new(normal_img_node.outputs['Color'], normal_map_node.inputs['Color'])
        
        normal_input = bsdf_node.inputs.get('Normal')
        if normal_input:
            links.new(normal_map_node.outputs['Normal'], normal_input)
        
    # 4. True displacement wired to the Material Output node
    disp_node = add_image_texture("displacement.png", "Displacement/Height", 'Non-Color')
    if disp_node:
        disp_node.location = (-350, -500)
        links.new(mapping_node.outputs['Vector'], disp_node.inputs['Vector'])

        displacement_node = nodes.new(type='ShaderNodeDisplacement')
        displacement_node.location = (300, -450)
        displacement_node.inputs['Scale'].default_value = 0.1
        displacement_node.inputs['Midlevel'].default_value = 0.5
        links.new(disp_node.outputs['Color'], displacement_node.inputs['Height'])
        links.new(displacement_node.outputs['Displacement'], output_node.inputs['Displacement'])

    # 5. AO is exported for optional use but left unconnected by default
    ao_node = add_image_texture("ao.png", "Ambient Occlusion", 'Non-Color')
    if ao_node:
        ao_node.location = (-350, 750)
        links.new(mapping_node.outputs['Vector'], ao_node.inputs['Vector'])
                
    # Assign material to active object if available
    active_obj = bpy.context.active_object
    if active_obj and active_obj.type in {'MESH', 'CURVE', 'SURFACE', 'META', 'FONT'}:
        if not active_obj.data.materials:
            active_obj.data.materials.append(mat)
        else:
            active_obj.data.materials[0] = mat
        print(f"Material '{material_name}' assigned to {active_obj.name}")
    else:
        print(f"Material '{material_name}' created (select an object and run script to assign).")

create_material()
`;
}

// Convert canvas element to Blob
function canvasToBlob(canvas) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/png');
    });
}

function canvasToDataUrl(canvas) {
    return canvas.toDataURL('image/png');
}

/**
 * Zips all canvas texture maps and the Blender import python script,
 * then triggers a browser download.
 */
export async function exportBlenderZip(canvases, baseFilename = "TEB_PBR_Textures") {
    const zip = new JSZip();
    
    // Resolve canvas blobs
    const albedoBlob = await canvasToBlob(canvases.albedo);
    const normalBlob = await canvasToBlob(canvases.normal);
    const roughnessBlob = await canvasToBlob(canvases.roughness);
    const displacementBlob = await canvasToBlob(canvases.displacement);
    const aoBlob = await canvasToBlob(canvases.ao);
    
    // Add textures
    zip.file("albedo.png", albedoBlob);
    zip.file("normal.png", normalBlob);
    zip.file("roughness.png", roughnessBlob);
    zip.file("displacement.png", displacementBlob);
    zip.file("ao.png", aoBlob);
    
    // Add code and readme metadata files
    zip.file("setup_material.py", getBlenderPythonScript());
    zip.file("README.txt", getReadmeText());
    
    // Package zip asynchronously
    const zipBlob = await zip.generateAsync({ type: "blob" });
    
    // Trigger download in browser
    const downloadUrl = URL.createObjectURL(zipBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `${baseFilename}.zip`;
    
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    // Cleanup reference
    setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
    }, 100);
}

export async function checkBlenderService() {
    const response = await fetch(`${BLENDER_SERVICE_URL}/api/health`);
    if (!response.ok) {
        throw new Error('Blender service is unavailable.');
    }
    return response.json();
}

export async function exportBlenderFile(
    canvases,
    {
        baseFilename = 'TEB_PBR_Textures',
        geometry = 'plane',
        displacementScale = 0.1,
        tilingFrequency = 1
    } = {}
) {
    const response = await fetch(`${BLENDER_SERVICE_URL}/api/export-blend`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            baseFilename,
            geometry,
            displacementScale,
            tilingFrequency,
            textures: {
                albedo: canvasToDataUrl(canvases.albedo),
                normal: canvasToDataUrl(canvases.normal),
                roughness: canvasToDataUrl(canvases.roughness),
                displacement: canvasToDataUrl(canvases.displacement),
                ao: canvasToDataUrl(canvases.ao)
            }
        })
    });

    if (!response.ok) {
        let errorMessage = 'Failed to export .blend file.';
        try {
            const payload = await response.json();
            if (payload?.error) {
                errorMessage = payload.error;
            }
        } catch {
            // Keep fallback message when the response body is not JSON.
        }
        throw new Error(errorMessage);
    }

    const blendBlob = await response.blob();
    const downloadUrl = URL.createObjectURL(blendBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `${baseFilename}.blend`;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
    }, 100);
}
