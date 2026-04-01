import * as THREE from 'three';
import { createQuadSphereEdges } from './QuadSphere.js';

export class Engine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    
    // Core Three.js setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Quad Sphere Setup
    this.sphereRadius = 5;
    const { lineGeometry, meshGeometry } = createQuadSphereEdges(this.sphereRadius, 6);
    
    // The glowing wireframe (Visual)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f3ff, linewidth: 2 });
    this.sphereLines = new THREE.LineSegments(lineGeometry, lineMat);
    
    // The mesh (Invisible, for physics/raycasting)
    const meshMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    this.sphereMesh = new THREE.Mesh(meshGeometry, meshMat);
    
    // Group them so they rotate together
    this.sphereGroup = new THREE.Group();
    this.sphereGroup.add(this.sphereLines);
    this.sphereGroup.add(this.sphereMesh);
    this.scene.add(this.sphereGroup);

    // The Small Cube for Object Mode (10x smaller radius)
    const cubeRad = this.sphereRadius / 10;
    const cubeGeo = new THREE.BoxGeometry(cubeRad*2, cubeRad*2, cubeRad*2);
    const cubeMat = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: false });
    this.cube = new THREE.Mesh(cubeGeo, cubeMat);
    
    // Add glowing edges to cube
    const cubeEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cubeGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    this.cube.add(cubeEdges);
    
    // Start cube resting right above the sphere's top pole
    this.cube.position.set(0, this.sphereRadius + cubeRad + 0.1, 0);
    this.scene.add(this.cube);

    // Mode properties
    this.mode = 'orbit'; // 'orbit' or 'object'
    
    // Orbital Physics State
    this.orbitVelocity = new THREE.Vector2(0, 0);
    this.isDragging = false;
    this.previousMouse = new THREE.Vector2();

    // Resize handlers
    this.resize();
    
    // We bind a ResizeObserver to explicitly watch the draggable UI window's content area
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(this.container);

    // Setup Raycaster
    this.raycaster = new THREE.Raycaster();

    // Input Events
    this.setupInputs();

    // Loop
    this.clock = new THREE.Clock();
    this.tick = this.tick.bind(this);
    this.tick();
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Sphere takes exactly 66% of vertical FOV
    const fovRad = this.camera.fov * THREE.MathUtils.DEG2RAD;
    const targetViewHeight = (this.sphereRadius * 2) / 0.66;
    this.macroDistance = targetViewHeight / (2 * Math.tan(fovRad / 2));
    
    if (this.mode === 'orbit') {
      this.camera.position.set(0, 0, this.macroDistance);
      this.camera.lookAt(0, 0, 0);
    }
  }

  setMode(newMode) {
    if (this.mode === newMode) return;
    this.mode = newMode;
  }

  setupInputs() {
    const el = this.renderer.domElement;
    
    el.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.previousMouse.set(e.clientX, e.clientY);
      
      if (this.mode === 'orbit') {
         // Second click stops spin instantly
         if (this.orbitVelocity.lengthSq() > 0.0001) {
            this.orbitVelocity.set(0, 0);
         }
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        const deltaX = e.clientX - this.previousMouse.x;
        const deltaY = e.clientY - this.previousMouse.y;
        
        if (this.mode === 'orbit') {
          // Impart momentum based on drag speed
          const dragSensitivity = 0.002;
          this.orbitVelocity.x = deltaX * dragSensitivity;
          this.orbitVelocity.y = deltaY * dragSensitivity;
          
          this.applyOrbitRotation(deltaX * 0.01, deltaY * 0.01);
        } else if (this.mode === 'object') {
          // Move cube across sphere surface based on mouse drag
          const moveSpeed = 0.01;
          
          const pos = this.cube.position.clone();
          const axisY = new THREE.Vector3(0, 1, 0);
          
          // Obtain an X axis relative to current camera looking at the cube
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          const axisX = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
          if (axisX.lengthSq() < 0.001) axisX.set(1, 0, 0);
          
          pos.applyAxisAngle(axisY, -deltaX * moveSpeed);
          pos.applyAxisAngle(axisX, -deltaY * moveSpeed);
          
          // Predict distance roughly close to surface so it glides along
          pos.normalize().multiplyScalar(this.sphereRadius + (this.sphereRadius/10) + 0.1);
          this.cube.position.copy(pos);
        }
      }
      this.previousMouse.set(e.clientX, e.clientY);
    });

    el.addEventListener('pointerup', () => {
      this.isDragging = false;
    });
    
    el.addEventListener('pointerleave', () => {
      this.isDragging = false;
    });
  }

  applyOrbitRotation(deltaX, deltaY) {
    const quatY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX);
    const quatX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaY);
    
    // Multiply global rotation axes
    this.sphereGroup.quaternion.premultiply(quatY);
    this.sphereGroup.quaternion.premultiply(quatX);
  }

  tick() {
    requestAnimationFrame(this.tick);
    
    const dt = Math.min(this.clock.getDelta(), 0.1);

    // Orbital Physics / Inertial spin
    if (this.mode === 'orbit' && !this.isDragging) {
      if (this.orbitVelocity.lengthSq() > 0.000001) {
        this.applyOrbitRotation(this.orbitVelocity.x, this.orbitVelocity.y);
        // Inertial damping
        this.orbitVelocity.multiplyScalar(0.95); 
      }
    }

    // -- Physics Raycast & Alignment --
    // Shoot ray exactly from the cube towards the origin of the sphere
    let targetCubeRot = this.cube.quaternion.clone();
    
    const dirToCenter = new THREE.Vector3(0,0,0).sub(this.cube.position).normalize();
    this.raycaster.set(this.cube.position, dirToCenter);
    const intersects = this.raycaster.intersectObject(this.sphereMesh);
    
    if (intersects.length > 0) {
      const faceNormal = intersects[0].face.normal.clone();
      // Face normals are in local space of sphere. Transform to world.
      faceNormal.transformDirection(this.sphereGroup.matrixWorld).normalize();
      
      const upDir = new THREE.Vector3(0, 1, 0);
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(upDir, faceNormal);
      targetCubeRot = alignQuat;
      
      // Keep cube pinned to exactly rest on the plane (based on geometry collision distance)
      if (this.mode === 'object') {
          const distToSurface = intersects[0].distance;
          const cubeRad = this.sphereRadius / 10;
          const expectedDistanceIfResting = cubeRad;
          const pushZ = distToSurface - expectedDistanceIfResting;
          this.cube.position.addScaledVector(dirToCenter, pushZ);
      }
    }
    
    // Smooth SLERP alignment visually
    this.cube.quaternion.slerp(targetCubeRot, 0.2);

    // -- Camera Director --
    if (this.mode === 'orbit') {
      // Lerp Camera outward to Macro view
      const targetPos = new THREE.Vector3(0, 0, this.macroDistance);
      this.camera.position.lerp(targetPos, 0.05);
      
      const currentRot = this.camera.quaternion.clone();
      this.camera.lookAt(new THREE.Vector3(0, 0, 0));
      const targetQuat = this.camera.quaternion.clone();
      this.camera.quaternion.copy(currentRot);
      this.camera.quaternion.slerp(targetQuat, 0.05);

    } else if (this.mode === 'object') {
      // Third-person / Chased offset view
      const offset = new THREE.Vector3(0, 15, 25).multiplyScalar(this.sphereRadius / 10);
      offset.applyQuaternion(this.cube.quaternion); // Match offset relative to tangent plane
      
      const targetPos = this.cube.position.clone().add(offset);
      this.camera.position.lerp(targetPos, 0.08);

      const currentRot = this.camera.quaternion.clone();
      this.camera.lookAt(this.cube.position);
      const targetQuat = this.camera.quaternion.clone();
      this.camera.quaternion.copy(currentRot);
      this.camera.quaternion.slerp(targetQuat, 0.08);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
