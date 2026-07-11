import './style.css';
import { Preview3D } from './preview3d.js';
import { createSeamlessTexture, generatePBRMaps } from './generator.js';
import { exportBlenderZip } from './exporter.js';

// Application State
const state = {
    originalImage: null,        // Store original uploaded HTMLImageElement
    activeFilename: 'texture',   // Base name for export zip
    
    // Generator parameters
    tilingEnabled: false,
    tilingBlend: 30,
    normalStrength: 2.0,
    normalBlur: 0,
    roughnessBase: 0.5,
    roughnessContrast: 1.0,
    roughnessInvert: false,
    heightContrast: 1.0,
    aoStrength: 1.0,
    
    // Viewport parameters
    selectedGeom: 'sphere',
    lightRotation: 45,
    displacementScale: 0.05,
    tilingFrequency: 1,
    
    // Active preview canvases (downscaled for performance)
    canvases: {
        albedo: document.getElementById('canvas-albedo'),
        normal: document.getElementById('canvas-normal'),
        roughness: document.getElementById('canvas-roughness'),
        displacement: document.getElementById('canvas-displacement'),
        ao: document.getElementById('canvas-ao')
    }
};

// UI Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadPreviewContainer = dropZone.querySelector('.upload-preview-container');
const uploadPlaceholder = dropZone.querySelector('.upload-placeholder');
const uploadPreview = document.getElementById('upload-preview');
const btnRemoveImage = document.getElementById('btn-remove-image');

const slidersSection = document.getElementById('sliders-section');
const studioFooter = document.getElementById('studio-footer');

const toggleTiling = document.getElementById('toggle-tiling');
const tilingSliderWrapper = document.getElementById('tiling-slider-wrapper');
const sliderTilingBlend = document.getElementById('tiling-blend');
const valTilingBlend = document.getElementById('val-tiling-blend');

const sliderNormalStrength = document.getElementById('normal-strength');
const valNormalStrength = document.getElementById('val-normal-strength');
const sliderNormalBlur = document.getElementById('normal-blur');
const valNormalBlur = document.getElementById('val-normal-blur');

const sliderRoughnessBase = document.getElementById('roughness-base');
const valRoughnessBase = document.getElementById('val-roughness-base');
const sliderRoughnessContrast = document.getElementById('roughness-contrast');
const valRoughnessContrast = document.getElementById('val-roughness-contrast');
const checkRoughnessInvert = document.getElementById('roughness-invert');

const sliderHeightContrast = document.getElementById('height-contrast');
const valHeightContrast = document.getElementById('val-height-contrast');

const sliderAoStrength = document.getElementById('ao-strength');
const valAoStrength = document.getElementById('val-ao-strength');

const geomSelector = document.getElementById('geom-selector');
const sliderLightRotation = document.getElementById('light-rotation');
const sliderDisplacementScale = document.getElementById('displacement-scale');
const sliderTilingFrequency = document.getElementById('tiling-frequency');

const btnExport = document.getElementById('btn-export');

// Initialize 3D Viewport
let preview3D = null;
try {
    preview3D = new Preview3D('viewport-3d');
} catch (error) {
    console.error("Failed to initialize WebGL viewport:", error);
}

// ----------------------------------------------------
// File Upload & Image Loading
// ----------------------------------------------------

// Trigger browse
dropZone.addEventListener('click', (e) => {
    if (e.target !== btnRemoveImage && !btnRemoveImage.contains(e.target)) {
        fileInput.click();
    }
});

// Drag and drop handlers
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    }, false);
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

btnRemoveImage.addEventListener('click', (e) => {
    e.stopPropagation();
    resetStudio();
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
    }
    
    // Set base name
    state.activeFilename = file.name.substring(0, file.name.lastIndexOf('.')) || 'texture';
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            state.originalImage = img;
            
            // Show preview image in dropzone
            uploadPreview.src = e.target.result;
            uploadPlaceholder.style.display = 'none';
            uploadPreviewContainer.style.display = 'flex';
            
            // Enable UI Controls
            slidersSection.classList.remove('disabled');
            studioFooter.classList.remove('disabled');
            
            // Process texture maps
            processTextures();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function resetStudio() {
    state.originalImage = null;
    fileInput.value = '';
    uploadPreview.src = '';
    uploadPreviewContainer.style.display = 'none';
    uploadPlaceholder.style.display = 'flex';
    
    slidersSection.classList.add('disabled');
    studioFooter.classList.add('disabled');
}

// ----------------------------------------------------
// Texture Processing Pipeline (Downscaled for Live UI)
// ----------------------------------------------------

function processTextures() {
    if (!state.originalImage) return;
    
    // 1. Create a downscaled preview image to keep slider feedback 60fps
    // Maximum resolution of 512px for live calculations
    const maxPreviewSize = 512;
    let w = state.originalImage.width;
    let h = state.originalImage.height;
    
    if (w > maxPreviewSize || h > maxPreviewSize) {
        if (w > h) {
            h = Math.round((h * maxPreviewSize) / w);
            w = maxPreviewSize;
        } else {
            w = Math.round((w * maxPreviewSize) / h);
            h = maxPreviewSize;
        }
    }
    
    // Setup temporary downscaled working canvas
    const workingCanvas = document.createElement('canvas');
    workingCanvas.width = w;
    workingCanvas.height = h;
    const workingCtx = workingCanvas.getContext('2d');
    workingCtx.drawImage(state.originalImage, 0, 0, w, h);
    
    // 2. Compute Albedo Map (apply tiling if active)
    const albedoCanvas = state.canvases.albedo;
    albedoCanvas.width = w;
    albedoCanvas.height = h;
    const albedoCtx = albedoCanvas.getContext('2d');
    
    if (state.tilingEnabled) {
        // Downscale blendWidth proportionally to preview size
        const ratio = w / state.originalImage.width;
        const scaledBlendWidth = Math.max(2, Math.round(state.tilingBlend * ratio));
        
        const tiled = createSeamlessTexture(workingCanvas, scaledBlendWidth);
        albedoCtx.drawImage(tiled, 0, 0);
    } else {
        albedoCtx.drawImage(workingCanvas, 0, 0);
    }
    
    // 3. Compute rest of PBR Maps (Normal, Roughness, Disp, AO)
    const params = {
        tilingEnabled: state.tilingEnabled,
        normalStrength: state.normalStrength,
        normalBlur: state.normalBlur,
        roughnessBase: state.roughnessBase,
        roughnessContrast: state.roughnessContrast,
        roughnessInvert: state.roughnessInvert,
        heightContrast: state.heightContrast,
        aoStrength: state.aoStrength
    };
    
    const maps = generatePBRMaps(albedoCanvas, params);
    
    // Render computed textures into output preview canvases
    const renderToCanvas = (targetCanvas, sourceCanvas) => {
        targetCanvas.width = w;
        targetCanvas.height = h;
        const ctx = targetCanvas.getContext('2d');
        ctx.drawImage(sourceCanvas, 0, 0);
    };
    
    renderToCanvas(state.canvases.normal, maps.normal);
    renderToCanvas(state.canvases.roughness, maps.roughness);
    renderToCanvas(state.canvases.displacement, maps.displacement);
    renderToCanvas(state.canvases.ao, maps.ao);
    
    // 4. Send updated canvas maps to Three.js Preview Engine
    if (preview3D) {
        preview3D.updateMaterialTextures(state.canvases, state.tilingFrequency);
    }
}

// ----------------------------------------------------
// UI Sliders and Event Binding
// ----------------------------------------------------

// Helper to bind range slider inputs
// decimals: 0 for integer values (px, counts), 1 for float values (strengths, contrasts)
function bindSlider(sliderEl, valueEl, stateKey, suffix = '', decimals = 1) {
    sliderEl.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state[stateKey] = val;
        valueEl.textContent = val.toFixed(decimals) + suffix;
        processTextures();
    });
}

// Seamless Tiling
toggleTiling.addEventListener('change', (e) => {
    state.tilingEnabled = e.target.checked;
    if (state.tilingEnabled) {
        tilingSliderWrapper.classList.add('show');
    } else {
        tilingSliderWrapper.classList.remove('show');
    }
    processTextures();
});

bindSlider(sliderTilingBlend, valTilingBlend, 'tilingBlend', 'px', 0);

// Normal Map
bindSlider(sliderNormalStrength, valNormalStrength, 'normalStrength', '', 1);
bindSlider(sliderNormalBlur, valNormalBlur, 'normalBlur', 'px', 0);

// Roughness
bindSlider(sliderRoughnessBase, valRoughnessBase, 'roughnessBase', '', 2);
bindSlider(sliderRoughnessContrast, valRoughnessContrast, 'roughnessContrast', '', 1);
checkRoughnessInvert.addEventListener('change', (e) => {
    state.roughnessInvert = e.target.checked;
    processTextures();
});

// Height
bindSlider(sliderHeightContrast, valHeightContrast, 'heightContrast', '', 1);

// Ambient Occlusion
bindSlider(sliderAoStrength, valAoStrength, 'aoStrength', '', 1);

// Viewport Geometry Selector
geomSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-tab');
    if (!btn) return;
    
    geomSelector.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    state.selectedGeom = btn.dataset.geom;
    if (preview3D) {
        preview3D.setGeometry(state.selectedGeom);
    }
});

// Viewport Lighting Angle
sliderLightRotation.addEventListener('input', (e) => {
    state.lightRotation = parseInt(e.target.value);
    if (preview3D) {
        preview3D.setLightAngle(state.lightRotation);
    }
});

// Viewport Displacement Scale
sliderDisplacementScale.addEventListener('input', (e) => {
    state.displacementScale = parseFloat(e.target.value);
    if (preview3D) {
        preview3D.setDisplacementScale(state.displacementScale);
    }
});

// Viewport Tiling Frequency Repeat
sliderTilingFrequency.addEventListener('input', (e) => {
    state.tilingFrequency = parseInt(e.target.value);
    if (preview3D) {
        preview3D.setTilingFrequency(state.tilingFrequency);
    }
});

// ----------------------------------------------------
// Export Full-Resolution Pipeline
// ----------------------------------------------------
btnExport.addEventListener('click', async () => {
    if (!state.originalImage) return;
    
    // Add visual loading feedback to export button
    const btnText = btnExport.querySelector('span');
    const originalText = btnText.textContent;
    btnText.textContent = "Processing High-Res...";
    btnExport.style.pointerEvents = 'none';
    btnExport.style.opacity = '0.7';
    
    try {
        // Run full resolution processing in the microtask queue
        await new Promise((resolve) => setTimeout(resolve, 50));
        
        const w = state.originalImage.width;
        const h = state.originalImage.height;
        
        // Setup full-res working canvases
        const albedoCanvas = document.createElement('canvas');
        albedoCanvas.width = w;
        albedoCanvas.height = h;
        const albedoCtx = albedoCanvas.getContext('2d');
        
        if (state.tilingEnabled) {
            const tiled = createSeamlessTexture(state.originalImage, state.tilingBlend);
            albedoCtx.drawImage(tiled, 0, 0);
        } else {
            albedoCtx.drawImage(state.originalImage, 0, 0);
        }
        
        const params = {
            tilingEnabled: state.tilingEnabled,
            normalStrength: state.normalStrength,
            normalBlur: state.normalBlur,
            roughnessBase: state.roughnessBase,
            roughnessContrast: state.roughnessContrast,
            roughnessInvert: state.roughnessInvert,
            heightContrast: state.heightContrast,
            aoStrength: state.aoStrength
        };
        
        const maps = generatePBRMaps(albedoCanvas, params);
        
        // Package into zip
        const canvasesToExport = {
            albedo: albedoCanvas,
            normal: maps.normal,
            roughness: maps.roughness,
            displacement: maps.displacement,
            ao: maps.ao
        };
        
        await exportBlenderZip(canvasesToExport, `${state.activeFilename}_PBR`);
        
    } catch (err) {
        console.error("Export failed:", err);
        alert("An error occurred during high-resolution texture exporting: " + err.message);
    } finally {
        // Restore button state
        btnText.textContent = originalText;
        btnExport.style.pointerEvents = 'auto';
        btnExport.style.opacity = '1.0';
    }
});
