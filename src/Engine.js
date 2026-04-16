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
    // Increased scale 150
    this.sphereRadius = 150;
    // Changed subdivisions from 8 to 11 to roughly double the quad count
    const { lineGeometry, meshGeometry } = createQuadSphereEdges(this.sphereRadius, 11);
    
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

    // The Small Cube for Object Mode (fixed absolute radius)
    const cubeRad = 0.5;
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

    // Fauna and Systems
    this.fauna = [];
    this.particles = [];
    this.score = 0;
    this.onScoreUpdate = null;

    // Mode properties
    this.mode = 'orbit'; // 'orbit' or 'object'
    
    // FPS State
    this.keys = { w: false, a: false, s: false, d: false, space: false };
    this.pitch = 0;
    this.isPointerLocked = false;
    this.verticalVelocity = 0;
    this.isGrounded = false;
    
    // Orbital Physics State
    this.orbitVelocity = new THREE.Vector2(0, 0);
    this.isDragging = false;
    this.previousMouse = new THREE.Vector2();
    this.cameraOrbitQuat = new THREE.Quaternion();

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

  spawnFauna() {
    const fRad = 0.25; // 50% smaller
    const fGeo = new THREE.BoxGeometry(fRad * 2, fRad * 2, fRad * 2);
    const fMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
    const faunaMesh = new THREE.Mesh(fGeo, fMat);
    
    // Add glowing edges
    const fEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(fGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    faunaMesh.add(fEdges);
    
    // Random position on the sphere surface (roughly)
    const randomDir = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize();
    faunaMesh.position.copy(randomDir.multiplyScalar(this.sphereRadius + fRad + 5));
    
    this.scene.add(faunaMesh);
    
    this.fauna.push({
      mesh: faunaMesh,
      hp: 3,
      hitTimer: 0,
      vVel: 0,
      isGrounded: false,
      moveTimer: 0,
      targetMoveDir: new THREE.Vector3(0,0,1)
    });
  }

  spawnExplosion(pos) {
    for(let i=0; i<15; i++) {
      const pGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const pMat = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.copy(pos);
      this.scene.add(pMesh);
      this.particles.push({
        mesh: pMesh,
        vel: new THREE.Vector3((Math.random()-0.5)*10, (Math.random()-0.5)*10, (Math.random()-0.5)*10),
        life: 1.0
      });
    }
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
        
        // Pivot left/right heading incrementally directly on the character's local axis
        const yawDelta = -e.movementX * lookSensitivity;
        this.cube.rotateY(yawDelta);
        
        // Pivot up/down camera pitch tracking
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
    // Negate deltas to grab and rotate the observer camera opposite to drag movement
    const quatY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -deltaX);
    const quatX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -deltaY);
    
    // Trackball Camera rotation in global axes
    this.cameraOrbitQuat.premultiply(quatY);
    this.cameraOrbitQuat.premultiply(quatX);
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
       // Using fixed absolute traversal speed relative to the human-scale cube
       const moveSpeed = 5.0 * dt; 
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
        // Absolute rigid physics to match the human-scale cube
        const gravityAccelerate = 25.0; 
        this.verticalVelocity -= gravityAccelerate * dt;
        
        // Ensure jumping only activates when grounded
        if (this.isGrounded && this.keys.space) {
             this.verticalVelocity = 12.0; 
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
      
      // Find current local UP vector
      const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cube.quaternion);
      
      // Calculate rotation required to gently tilt the current UP directly towards the new surface normal
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(currentUp, faceNormal);
      
      // Apply this tilt incrementally to the existing rotation. This strictly preserves local yaw
      targetCubeRot = alignQuat.clone().multiply(this.cube.quaternion);
      
      // Ground clamping logic
      if (this.mode === 'object') {
          const distToSurface = intersects[0].distance;
          const cubeRad = 0.5; // Absolute human-scale size
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

    // -- Fauna Tick --
    const fRad = 0.25;
    for (let i = this.fauna.length - 1; i >= 0; i--) {
      const f = this.fauna[i];
      
      // Damage effect
      if (f.hitTimer > 0) {
        f.hitTimer -= dt;
        f.mesh.material.color.setHex(0xff0000); // Red
      } else {
        f.mesh.material.color.setHex(0xffff00); // Back to yellow
      }
      
      // Move logic (Random Walk)
      f.moveTimer -= dt;
      if (f.moveTimer <= 0) {
         f.moveTimer = 2.0 + Math.random() * 3.0; // new dir every 2 to 5 secs
         f.targetMoveDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      }
      
      const fMoveSpeed = 2.0 * dt;
      const fMove = f.targetMoveDir.clone().multiplyScalar(fMoveSpeed);
      fMove.applyQuaternion(f.mesh.quaternion);
      f.mesh.position.add(fMove);
      
      // Raycast for Fauna
      const dirToCenterF = new THREE.Vector3(0,0,0).sub(f.mesh.position).normalize();
      const gravityAccelerateF = 25.0; 
      f.vVel -= gravityAccelerateF * dt;
      
      // Jump occasionally
      if (f.isGrounded && Math.random() < 0.005) {
          f.vVel = 10.0; 
          f.isGrounded = false;
      }
      
      f.mesh.position.addScaledVector(dirToCenterF, -f.vVel * dt);
      
      this.raycaster.set(f.mesh.position, dirToCenterF);
      const intersectsF = this.raycaster.intersectObject(this.sphereMesh);
      
      let targetRotF = f.mesh.quaternion.clone();
      if (intersectsF.length > 0) {
          const faceNormal = intersectsF[0].face.normal.clone();
          faceNormal.transformDirection(this.sphereGroup.matrixWorld).normalize();
          const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(f.mesh.quaternion);
          const alignQuat = new THREE.Quaternion().setFromUnitVectors(currentUp, faceNormal);
          targetRotF = alignQuat.clone().multiply(f.mesh.quaternion);
          
          const distToSurface = intersectsF[0].distance;
          if (distToSurface <= fRad) {
              const pushZ = distToSurface - fRad;
              f.mesh.position.addScaledVector(dirToCenterF, pushZ);
              f.vVel = 0;
              f.isGrounded = true;
          } else {
              f.isGrounded = false;
          }
      }
      f.mesh.quaternion.slerp(targetRotF, 0.4);

      // Player Collision Check
      const collisionDist = 0.5 + fRad; 
      const dist = this.cube.position.distanceTo(f.mesh.position);
      if (dist < collisionDist) {
         // Prevent overlap (Pushback)
         const pushDir = this.cube.position.clone().sub(f.mesh.position).normalize();
         const overlap = collisionDist - dist;
         
         this.cube.position.add(pushDir.clone().multiplyScalar(overlap * 0.5));
         f.mesh.position.add(pushDir.clone().multiplyScalar(-overlap * 0.5));
         
         // Damage registration (only if hit_timer <= 0 to avoid multi-hits per sec)
         if (f.hitTimer <= 0) {
            // Check top face collision:
            const playerUpInFauna = new THREE.Vector3(0,1,0).applyQuaternion(f.mesh.quaternion);
            const toPlayer = this.cube.position.clone().sub(f.mesh.position);
            const heightDiff = toPlayer.dot(playerUpInFauna);
            
            // If player is falling and strictly on top of the fauna bounds
            if (heightDiff > fRad * 0.8 && this.verticalVelocity < 0) {
                f.hp -= 2;
                this.verticalVelocity = 8.0; // bounce off
            } else {
                f.hp -= 1;
            }
            f.hitTimer = 0.5; // flash timer
         }
      }
      
      // Death
      if (f.hp <= 0) {
         this.scene.remove(f.mesh);
         f.mesh.geometry.dispose();
         f.mesh.material.dispose();
         f.mesh.children.forEach(child => {
             if (child.geometry) child.geometry.dispose();
             if (child.material) child.material.dispose();
         });
         
         this.spawnExplosion(f.mesh.position);
         this.fauna.splice(i, 1);
         this.score += 1;
         if (this.onScoreUpdate) this.onScoreUpdate(this.score);
      }
    }

    // -- Particles Tick --
    for (let i = this.particles.length - 1; i >= 0; i--) {
       const p = this.particles[i];
       p.life -= dt;
       if (p.life <= 0) {
          this.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          this.particles.splice(i, 1);
       } else {
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.scale.setScalar(p.life);
       }
    }

    // -- Camera Director --
    if (this.mode === 'orbit') {
      // Fly the camera globally around the entire locked scene
      const targetPos = new THREE.Vector3(0, 0, this.macroDistance);
      targetPos.applyQuaternion(this.cameraOrbitQuat);
      
      // Remove position lerping delay to keep mouse drag tracking exactly 1:1
      this.camera.position.copy(targetPos);
      
      // Match camera's UP axis to the rolling trackball frame 
      const targetUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cameraOrbitQuat);
      this.camera.up.copy(targetUp);
      
      // Instantly stare at the center from current position to guarantee zero sphere drift
      this.camera.lookAt(0, 0, 0);

    } else if (this.mode === 'object') {
      // First-person / Clamp to cube view
      const cubeRad = 0.5; // Fixed absolute radius
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
