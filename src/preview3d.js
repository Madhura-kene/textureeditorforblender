import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class Preview3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        // Scene configurations
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#030206');
        
        // Camera setup — use fallback dimensions if container not yet laid out
        const w = this.container.clientWidth || 800;
        const h = this.container.clientHeight || 500;
        const aspect = w / h;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this.camera.position.set(0, 0, 3);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(w, h, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        // Make canvas fill container
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.container.appendChild(this.renderer.domElement);
        
        // Orbit Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 10;
        this.controls.minDistance = 1.2;
        
        // Texture references
        this.textures = {
            map: null,
            normalMap: null,
            roughnessMap: null,
            displacementMap: null,
            aoMap: null
        };
        
        // Lighting Setup
        this.setupLights();
        
        // Geometry database
        this.geometries = {
            sphere: new THREE.SphereGeometry(0.7, 64, 64),
            cube: new THREE.BoxGeometry(1, 1, 1, 64, 64, 64),
            cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1.2, 64, 64),
            plane: new THREE.PlaneGeometry(1.2, 1.2, 128, 128)
        };
        
        // Initialize AO uv2 mapping for standard geometries
        Object.values(this.geometries).forEach(geom => {
            geom.setAttribute('uv2', geom.attributes.uv.clone());
        });
        
        // Material Creation
        this.material = new THREE.MeshStandardMaterial({
            roughness: 0.5,
            metalness: 0.0,
            displacementScale: 0.05,
            side: THREE.DoubleSide
        });
        
        // Mesh Setup
        this.currentGeomKey = 'sphere';
        this.mesh = new THREE.Mesh(this.geometries.sphere, this.material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
        
        // Interactive light setup (Mouse follower)
        this.setupInteractiveLight();
        
        // Events
        window.addEventListener('resize', this.onResize.bind(this));
        
        // Start Loop
        this.animate();
    }
    
    setupLights() {
        // Soft ambient fill light
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(this.ambientLight);
        
        // Directional Key Light (Sun)
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.dirLight.position.set(2, 2, 2);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.bias = -0.001;
        this.scene.add(this.dirLight);
        
        // Rim Light (back highlights)
        this.rimLight = new THREE.DirectionalLight(0xa5b4fc, 0.4);
        this.rimLight.position.set(-2, 1, -2);
        this.scene.add(this.rimLight);
    }
    
    setupInteractiveLight() {
        // Point Light that orbits / follows mouse pointer to show off reflections
        this.pointerLight = new THREE.PointLight(0xffffff, 1.5, 5);
        this.pointerLight.position.set(0, 0, 1.5);
        this.scene.add(this.pointerLight);
        
        // Helper visual sphere for light (extremely subtle)
        const lightGeom = new THREE.SphereGeometry(0.02, 8, 8);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.pointerLightMesh = new THREE.Mesh(lightGeom, lightMat);
        this.scene.add(this.pointerLightMesh);
        
        // Raycasting listener
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1.2); // Projection plane
        
        this.container.addEventListener('mousemove', (e) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, this.camera);
            const target = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, target);
            
            // Limit distance of point light to feel natural
            if (target.length() < 3) {
                // Smooth position update
                this.pointerLight.position.copy(target).add(new THREE.Vector3(0, 0, 0.3));
                this.pointerLightMesh.position.copy(this.pointerLight.position);
            }
        });
    }
    
    // Set Directional Light rotation based on slider degree angle (0 - 360)
    setLightAngle(degrees) {
        const rad = THREE.MathUtils.degToRad(degrees);
        // Maintain an offset orbit around Y axis
        this.dirLight.position.x = Math.cos(rad) * 2;
        this.dirLight.position.z = Math.sin(rad) * 2;
        this.dirLight.position.y = 1.5;
    }
    
    // Set active shape geometry
    setGeometry(geomName) {
        if (!this.geometries[geomName]) return;
        this.currentGeomKey = geomName;
        this.mesh.geometry = this.geometries[geomName];
    }
    
    // Set displacement scale multiplier
    setDisplacementScale(scale) {
        this.material.displacementScale = scale;
    }
    
    // Set texture tiling repeat values
    setTilingFrequency(freq) {
        Object.values(this.textures).forEach(tex => {
            if (tex) {
                tex.repeat.set(freq, freq);
                tex.needsUpdate = true;
            }
        });
    }
    
    // Load canvas images into Three.js textures
    updateMaterialTextures(canvases, frequency = 1) {
        const updateTexture = (key, canvas, colorSpace) => {
            if (!canvas) return;
            
            if (this.textures[key]) {
                // Texture already exists, update buffer
                this.textures[key].image = canvas;
                this.textures[key].needsUpdate = true;
            } else {
                // Create new CanvasTexture
                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(frequency, frequency);
                tex.colorSpace = colorSpace;
                
                this.textures[key] = tex;
                this.material[key] = tex;
            }
        };
        
        updateTexture('map', canvases.albedo, THREE.SRGBColorSpace);
        updateTexture('normalMap', canvases.normal, THREE.NoColorSpace);
        updateTexture('roughnessMap', canvases.roughness, THREE.NoColorSpace);
        updateTexture('displacementMap', canvases.displacement, THREE.NoColorSpace);
        updateTexture('aoMap', canvases.ao, THREE.NoColorSpace);
        
        this.material.needsUpdate = true;
    }
    
    onResize() {
        const canvas = this.renderer.domElement;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === 0 || h === 0) return;
        
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(w, h, false);
    }
    
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        // Auto-orbit light slightly if mouse is idle
        // Let's add simple orbit to give dynamic depth
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
