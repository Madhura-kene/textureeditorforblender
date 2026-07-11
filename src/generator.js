/**
 * generator.js - Image processing library for PBR map generation
 */

// Helper to convert RGB to grayscale value
export function rgbToGrayscale(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Fast Box Blur implementation for canvasses
export function boxBlur(imageData, width, height, radius) {
    if (radius <= 0) return imageData;
    
    const src = imageData.data;
    const dst = new Uint8ClampedArray(src.length);
    const w = width;
    const h = height;
    const size = radius * 2 + 1;
    
    // Allocate temporary buffer for horizontal pass
    const temp = new Uint8ClampedArray(w * h * 4);
    
    // Horizontal pass
    for (let y = 0; y < h; y++) {
        for (let channel = 0; channel < 4; channel++) {
            if (channel === 3) { // Skip alpha channel
                for (let x = 0; x < w; x++) {
                    temp[(y * w + x) * 4 + 3] = src[(y * w + x) * 4 + 3];
                }
                continue;
            }
            
            let sum = 0;
            for (let k = -radius; k <= radius; k++) {
                const xIdx = Math.min(Math.max(k, 0), w - 1);
                sum += src[(y * w + xIdx) * 4 + channel];
            }
            
            for (let x = 0; x < w; x++) {
                temp[(y * w + x) * 4 + channel] = sum / size;
                const nextX = Math.min(Math.max(x + radius + 1, 0), w - 1);
                const prevX = Math.min(Math.max(x - radius, 0), w - 1);
                sum += src[(y * w + nextX) * 4 + channel] - src[(y * w + prevX) * 4 + channel];
            }
        }
    }
    
    // Vertical pass
    for (let x = 0; x < w; x++) {
        for (let channel = 0; channel < 4; channel++) {
            if (channel === 3) { // Skip alpha channel
                for (let y = 0; y < h; y++) {
                    dst[(y * w + x) * 4 + 3] = temp[(y * w + x) * 4 + 3];
                }
                continue;
            }
            
            let sum = 0;
            for (let k = -radius; k <= radius; k++) {
                const yIdx = Math.min(Math.max(k, 0), h - 1);
                sum += temp[(yIdx * w + x) * 4 + channel];
            }
            
            for (let y = 0; y < h; y++) {
                dst[(y * w + x) * 4 + channel] = sum / size;
                const nextY = Math.min(Math.max(y + radius + 1, 0), h - 1);
                const prevY = Math.min(Math.max(y - radius, 0), h - 1);
                sum += temp[(nextY * w + x) * 4 + channel] - temp[(prevY * w + x) * 4 + channel];
            }
        }
    }
    
    return new ImageData(dst, w, h);
}

/**
 * Creates a seamless tileable texture from an image using offset quadrant shifting
 * and center boundary edge-blending.
 */
export function createSeamlessTexture(img, blendWidth) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = img.width;
    const h = img.height;
    canvas.width = w;
    canvas.height = h;
    
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);
    
    // 1. Draw the quadrants offset by 50% horizontally & vertically
    // This moves the outer seams of the image to the vertical/horizontal center axes
    ctx.drawImage(img, halfW, halfH, halfW, halfH, 0, 0, halfW, halfH); // BR -> TL
    ctx.drawImage(img, 0, halfH, halfW, halfH, halfW, 0, halfW, halfH); // BL -> TR
    ctx.drawImage(img, halfW, 0, halfW, halfH, 0, halfH, halfW, halfH); // TR -> BL
    ctx.drawImage(img, 0, 0, halfW, halfH, halfW, halfH, halfW, halfH); // TL -> BR
    
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    
    // Get the original, un-offset image data to blend over the seams
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCtx.drawImage(img, 0, 0);
    const origData = tempCtx.getImageData(0, 0, w, h).data;
    
    // 2. Perform double-axis blending near center axes (x = w/2, y = h/2)
    // We blend the offset image (seamed at center) with the original image shifted (seamless at center)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let blendX = 0;
            let blendY = 0;
            
            const dx = Math.abs(x - halfW);
            if (dx < blendWidth) {
                blendX = 1.0 - (dx / blendWidth); // Linear blend ramp [0, 1]
            }
            
            const dy = Math.abs(y - halfH);
            if (dy < blendWidth) {
                blendY = 1.0 - (dy / blendWidth); // Linear blend ramp [0, 1]
            }
            
            const t = Math.max(blendX, blendY); // Maximize to handle corner crossing correctly
            
            if (t > 0) {
                const idx = (y * w + x) * 4;
                // Original pixel mapped coordinate
                const origX = (x + halfW) % w;
                const origY = (y + halfH) % h;
                const origIdx = (origY * w + origX) * 4;
                
                // Linear interpolation (lerp)
                data[idx] = t * origData[origIdx] + (1 - t) * data[idx];         // R
                data[idx + 1] = t * origData[origIdx + 1] + (1 - t) * data[idx + 1]; // G
                data[idx + 2] = t * origData[origIdx + 2] + (1 - t) * data[idx + 2]; // B
            }
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

/**
 * Generates PBR texture maps from an Albedo canvas
 */
export function generatePBRMaps(albedoCanvas, params) {
    const w = albedoCanvas.width;
    const h = albedoCanvas.height;
    
    const albedoCtx = albedoCanvas.getContext('2d');
    const albedoData = albedoCtx.getImageData(0, 0, w, h);
    const pixels = albedoData.data;
    
    // 1. Create a Grayscale map as our baseline for Normal, Roughness, Height, and AO
    const grayscaleData = new Uint8ClampedArray(w * h);
    for (let i = 0; i < pixels.length; i += 4) {
        grayscaleData[i / 4] = rgbToGrayscale(pixels[i], pixels[i+1], pixels[i+2]);
    }
    
    // 2. Generate Height / Displacement Map
    const dispCanvas = document.createElement('canvas');
    dispCanvas.width = w;
    dispCanvas.height = h;
    const dispCtx = dispCanvas.getContext('2d');
    const dispData = dispCtx.createImageData(w, h);
    const dispPixels = dispData.data;
    
    for (let i = 0; i < w * h; i++) {
        let gray = grayscaleData[i] / 255.0;
        
        // Adjust Contrast: scale around 0.5
        gray = (gray - 0.5) * params.heightContrast + 0.5;
        gray = Math.min(Math.max(gray, 0.0), 1.0);
        
        const val = Math.floor(gray * 255);
        const idx = i * 4;
        dispPixels[idx] = val;
        dispPixels[idx+1] = val;
        dispPixels[idx+2] = val;
        dispPixels[idx+3] = 255;
    }
    dispCtx.putImageData(dispData, 0, 0);
    
    // 3. Generate Normal Map (using Sobel Filter from the Height map)
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = w;
    normalCanvas.height = h;
    const normalCtx = normalCanvas.getContext('2d');
    
    // First, let's blur the grayscale height data if smoothness slider is active
    let blurredHeightData = grayscaleData;
    if (params.normalBlur > 0) {
        // Build an ImageData of grayscale to blur
        const tempDispData = dispCtx.getImageData(0, 0, w, h);
        const blurredDisp = boxBlur(tempDispData, w, h, params.normalBlur);
        blurredHeightData = new Uint8ClampedArray(w * h);
        const bDispPixels = blurredDisp.data;
        for (let i = 0; i < w * h; i++) {
            blurredHeightData[i] = bDispPixels[i * 4];
        }
    }
    
    const normalData = normalCtx.createImageData(w, h);
    const normalPixels = normalData.data;
    
    const wrap = params.tilingEnabled;
    const getPixel = (x, y) => {
        if (wrap) {
            const rx = (x + w) % w;
            const ry = (y + h) % h;
            return blurredHeightData[ry * w + rx] / 255.0;
        } else {
            const rx = Math.min(Math.max(x, 0), w - 1);
            const ry = Math.min(Math.max(y, 0), h - 1);
            return blurredHeightData[ry * w + rx] / 255.0;
        }
    };
    
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Sobel kernels
            // Horizontal gradient (dX)
            // [ -1  0  1 ]
            // [ -2  0  2 ]
            // [ -1  0  1 ]
            const dX = (
                -1 * getPixel(x - 1, y - 1) + 1 * getPixel(x + 1, y - 1) +
                -2 * getPixel(x - 1, y)     + 2 * getPixel(x + 1, y) +
                -1 * getPixel(x - 1, y + 1) + 1 * getPixel(x + 1, y + 1)
            );
            
            // Vertical gradient (dY)
            // [ -1 -2 -1 ]
            // [  0  0  0 ]
            // [  1  2  1 ]
            const dY = (
                -1 * getPixel(x - 1, y - 1) - 2 * getPixel(x, y - 1) - 1 * getPixel(x + 1, y - 1) +
                 1 * getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + 1 * getPixel(x + 1, y + 1)
            );
            
            // Calculate normal vector components (x, y, z)
            // strength amplifies dX and dY. Invert dX/dY to follow OpenGL texture standards.
            const nx = -dX * params.normalStrength;
            const ny = -dY * params.normalStrength;
            const nz = 1.0;
            
            // Normalize normal vector
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            const normX = nx / len;
            const normY = ny / len;
            const normZ = nz / len;
            
            // Map [-1, 1] range to [0, 255] RGB color space
            const r = Math.floor((normX + 1.0) / 2.0 * 255);
            const g = Math.floor((normY + 1.0) / 2.0 * 255);
            const b = Math.floor((normZ + 1.0) / 2.0 * 255);
            
            const idx = (y * w + x) * 4;
            normalPixels[idx] = r;
            normalPixels[idx+1] = g;
            normalPixels[idx+2] = b;
            normalPixels[idx+3] = 255;
        }
    }
    normalCtx.putImageData(normalData, 0, 0);
    
    // 4. Generate Roughness Map
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = w;
    roughCanvas.height = h;
    const roughCtx = roughCanvas.getContext('2d');
    const roughData = roughCtx.createImageData(w, h);
    const roughPixels = roughData.data;
    
    for (let i = 0; i < w * h; i++) {
        let gray = grayscaleData[i] / 255.0;
        
        // Handle inversion (glossy = dark roughness vs glossy = bright roughness)
        if (params.roughnessInvert) {
            gray = 1.0 - gray;
        }
        
        // Contrast scaling
        gray = (gray - 0.5) * params.roughnessContrast + 0.5;
        // Shift base roughness offset
        gray = gray + (params.roughnessBase - 0.5);
        gray = Math.min(Math.max(gray, 0.0), 1.0);
        
        const val = Math.floor(gray * 255);
        const idx = i * 4;
        roughPixels[idx] = val;
        roughPixels[idx+1] = val;
        roughPixels[idx+2] = val;
        roughPixels[idx+3] = 255;
    }
    roughCtx.putImageData(roughData, 0, 0);
    
    // 5. Generate Ambient Occlusion (AO) Map
    // Simple screen-space local valley approximation:
    // Compares each pixel's height with the average height of its local neighborhood.
    // Valleys (local depth) get shaded darker.
    const aoCanvas = document.createElement('canvas');
    aoCanvas.width = w;
    aoCanvas.height = h;
    const aoCtx = aoCanvas.getContext('2d');
    const aoData = aoCtx.createImageData(w, h);
    const aoPixels = aoData.data;
    
    // We compute a blurred height map to represent regional average heights
    const aoRadius = 3;
    const blurredHeightImgData = boxBlur(dispCtx.getImageData(0, 0, w, h), w, h, aoRadius);
    const blurredHeight = blurredHeightImgData.data;
    
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const currentHeight = dispPixels[idx] / 255.0;
            const regionalAverageHeight = blurredHeight[idx] / 255.0;
            
            // Check if local area is lower than average
            const depthDiff = Math.max(0.0, regionalAverageHeight - currentHeight);
            
            // Apply scale multiplier and subtract from white base (no shadow)
            const shadowIntensity = depthDiff * params.aoStrength * 6.0;
            const ao = Math.min(Math.max(1.0 - shadowIntensity, 0.0), 1.0);
            
            const val = Math.floor(ao * 255);
            aoPixels[idx] = val;
            aoPixels[idx+1] = val;
            aoPixels[idx+2] = val;
            aoPixels[idx+3] = 255;
        }
    }
    aoCtx.putImageData(aoData, 0, 0);
    
    return {
        displacement: dispCanvas,
        normal: normalCanvas,
        roughness: roughCanvas,
        ao: aoCanvas
    };
}
