/**
 * exporter.js - Handles ZIP export and Blender Python integration scripts
 */
import JSZip from 'jszip';

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
The python script will automatically hook up color, normal mapping, roughness and daisy-chain height maps using bump parameters, selecting the correct Color Space ('sRGB' for Albedo and 'Non-Color' for normal, roughness, and displacement).
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
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Clear default nodes
    nodes.clear()
    
    # Create Material Output node
    output_node = nodes.new(type='ShaderNodeOutputMaterial')
    output_node.location = (600, 0)
    
    # Create Principled BSDF node
    bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf_node.location = (200, 0)
    links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])
    
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
        albedo_node.location = (-250, 300)
        color_input = bsdf_node.inputs.get('Base Color') or bsdf_node.inputs.get('Color')
        if color_input:
            links.new(albedo_node.outputs['Color'], color_input)
        
    # 2. Roughness
    rough_node = add_image_texture("roughness.png", "Roughness", 'Non-Color')
    if rough_node:
        rough_node.location = (-250, 50)
        rough_input = bsdf_node.inputs.get('Roughness')
        if rough_input:
            links.new(rough_node.outputs['Color'], rough_input)
        
    # 3. Normal Map
    normal_img_node = add_image_texture("normal.png", "Normal Map Image", 'Non-Color')
    if normal_img_node:
        normal_img_node.location = (-500, -200)
        normal_map_node = nodes.new(type='ShaderNodeNormalMap')
        normal_map_node.location = (-250, -200)
        links.new(normal_img_node.outputs['Color'], normal_map_node.inputs['Color'])
        
        normal_input = bsdf_node.inputs.get('Normal')
        if normal_input:
            links.new(normal_map_node.outputs['Normal'], normal_input)
        
    # 4. Displacement / Height (Wiring as Bump)
    disp_node = add_image_texture("displacement.png", "Displacement/Height", 'Non-Color')
    if disp_node:
        disp_node.location = (-500, -450)
        bump_node = nodes.new(type='ShaderNodeBump')
        bump_node.location = (-250, -450)
        bump_node.inputs['Strength'].default_value = 0.2
        links.new(disp_node.outputs['Color'], bump_node.inputs['Height'])
        
        # Daisy-chain with Normal Map if normal is present
        if normal_img_node:
            links.new(normal_map_node.outputs['Normal'], bump_node.inputs['Normal'])
            normal_input = bsdf_node.inputs.get('Normal')
            if normal_input:
                links.new(bump_node.outputs['Normal'], normal_input)
        else:
            normal_input = bsdf_node.inputs.get('Normal')
            if normal_input:
                links.new(bump_node.outputs['Normal'], normal_input)
                
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
