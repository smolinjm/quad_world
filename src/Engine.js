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
    // Increased scale 10x (from 5 to 50)
    this.sphereRadius = 50;
    // Changed subdivisions from 6 to 8 to approximately double the quad count (216 -> 384)
    const { lineGeometry, meshGeometry } = createQuadSphereEdges(this.sphereRadius, 8);
    
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
    const cubeMat = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true });
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
    
    // FPS State
    this.keys = { w: false, a: false, s: false, d: false, space: false };
    this.yaw = 0;
    this.pitch = 0;
    this.isPointerLocked = false;
    this.verticalVelocity = 0;
    this.isGrounded = false;
    
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
    
    // Keyboard listener
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'object') return;
      if (e.key === 'w' || e.key === 'W') this.keys.w = true;
      if (e.key === 'a' || e.key === 'A') this.keys.a = true;
      if (e.key === 's' || e.key === 'S') this.keys.s = true;
      if (e.key === 'd' || e.key === 'D') this.keys.d = true;
      if (e.key === ' ') this.keys.space = true;
    });

    window.addEventListener('keyup', (e) => {
      if (this.mode !== 'object') return;
      if (e.key === 'w' || e.key === 'W') this.keys.w = false;
      if (e.key === 'a' || e.key === 'A') this.keys.a = false;
      if (e.key === 's' || e.key === 'S') this.keys.s = false;
      if (e.key === 'd' || e.key === 'D') this.keys.d = false;
      if (e.key === ' ') this.keys.space = false;
    });

    // Pointer Lock events
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === el;
    });

    el.addEventListener('click', () => {
      if (this.mode === 'object' && !this.isPointerLocked) {
        el.requestPointerLock();
      }
    });

    el.addEventListener('pointerdown', (e) => {
      if (this.mode === 'orbit') {
        this.isDragging = true;
        this.previousMouse.set(e.clientX, e.clientY);
        
        // Second click stops spin instantly
        if (this.orbitVelocity.lengthSq() > 0.0001) {
           this.orbitVelocity.set(0, 0);
        }
      }
    });

    el.addEventListener('pointermove', (e) => {
      // Orbit drag handling
      if (this.mode === 'orbit' && this.isDragging) {
        const deltaX = e.clientX - this.previousMouse.x;
        const deltaY = e.clientY - this.previousMouse.y;
        
        // Impart momentum based on drag speed
        const dragSensitivity = 0.002;
        this.orbitVelocity.x = deltaX * dragSensitivity;
        this.orbitVelocity.y = deltaY * dragSensitivity;
        
        this.applyOrbitRotation(deltaX * 0.01, deltaY * 0.01);
        this.previousMouse.set(e.clientX, e.clientY);
      } 
      // FPS Mouse Look handling
      else if (this.mode === 'object' && this.isPointerLocked) {
        const lookSensitivity = 0.002;
        this.yaw -= e.movementX * lookSensitivity;
        this.pitch -= e.movementY * lookSensitivity;
        
        // Clamp pitch to prevent flipping perfectly backwards
        const maxPitch = Math.PI / 2 - 0.05;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      }
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

    // -- FPS Character Movement --
    if (this.mode === 'object') {
       // Dynamically bind speed to the sphere radius so traversal feels consistent regardless of planet size
       const moveSpeed = this.sphereRadius * dt; 
       const moveDir = new THREE.Vector3(0, 0, 0);

       if (this.keys.w) moveDir.z -= 1;
       if (this.keys.s) moveDir.z += 1;
       if (this.keys.a) moveDir.x -= 1;
       if (this.keys.d) moveDir.x += 1;

       if (moveDir.lengthSq() > 0) {
          moveDir.normalize().multiplyScalar(moveSpeed);
          // Move outward based on cube's local rotation mapping
          moveDir.applyQuaternion(this.cube.quaternion);
          this.cube.position.add(moveDir);
       }
    }

    // -- Physics Raycast & Alignment --
    // Shoot ray exactly from the cube towards the origin of the sphere
    let targetCubeRot = this.cube.quaternion.clone();
    
    // Calculate vertical down direction targeting sphere's global center (local gravity core)
    const dirToCenter = new THREE.Vector3(0,0,0).sub(this.cube.position).normalize();

    // Gravity and Jump forces
    if (this.mode === 'object') {
        // Dynamically scale physics to the planet's size
        const gravityAccelerate = this.sphereRadius * 5.0; // scales to 250
        this.verticalVelocity -= gravityAccelerate * dt;
        
        // Ensure jumping only activates when grounded
        if (this.isGrounded && this.keys.space) {
             this.verticalVelocity = this.sphereRadius * 2.4; // scales to 120
             this.isGrounded = false;
        }

        // Apply physical lift/drop by driving against dirToCenter 
        this.cube.position.addScaledVector(dirToCenter, -this.verticalVelocity * dt);
    }
    
    this.raycaster.set(this.cube.position, dirToCenter);
    const intersects = this.raycaster.intersectObject(this.sphereMesh);
    
    if (intersects.length > 0) {
      const faceNormal = intersects[0].face.normal.clone();
      // Face normals are in local space of sphere. Transform to world.
      faceNormal.transformDirection(this.sphereGroup.matrixWorld).normalize();
      
      const upDir = new THREE.Vector3(0, 1, 0);
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(upDir, faceNormal);
      
      // Combine normal alignment with player yaw (heading)
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      targetCubeRot = alignQuat.clone().multiply(yawQuat);
      
      // Ground clamping logic
      if (this.mode === 'object') {
          const distToSurface = intersects[0].distance;
          const cubeRad = this.sphereRadius / 10;
          const expectedDistanceIfResting = cubeRad;
          
          if (distToSurface <= expectedDistanceIfResting) {
              const pushZ = distToSurface - expectedDistanceIfResting;
              this.cube.position.addScaledVector(dirToCenter, pushZ);
              this.verticalVelocity = 0;
              this.isGrounded = true;
          } else {
              this.isGrounded = false; 
          }
      }
    }
    
    // Smooth SLERP alignment visually
    this.cube.quaternion.slerp(targetCubeRot, 0.4);

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
      // First-person / Clamp to cube view
      const cubeRad = this.sphereRadius / 10;
      const cubeHeight = cubeRad * 2;
      
      // Position offset Y by 0.3 the height of the cube
      const offset = new THREE.Vector3(0, cubeHeight * 0.3, 0);
      offset.applyQuaternion(this.cube.quaternion); // Match offset relative to local orientation
      
      const targetPos = this.cube.position.clone().add(offset);
      this.camera.position.lerp(targetPos, 0.08);

      // Rotate camera to match cube (which incorporates yaw), then apply pitch
      const camQuat = this.cube.quaternion.clone();
      const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
      camQuat.multiply(pitchQuat);
      
      // Fast lerp so the camera snaps responsively like an FPS
      this.camera.quaternion.slerp(camQuat, 0.4);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
