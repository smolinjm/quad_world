import * as THREE from 'three';

export function createQuadSphereEdges(radius, segments = 6) {
  const positions = [];
  const indices = [];
  
  // Math for uniform spherical mapping from a cube
  function mapCubeToSphere(x, y, z) {
    const x2 = x * x;
    const y2 = y * y;
    const z2 = z * z;
    const sx = x * Math.sqrt(1 - (y2 / 2) - (z2 / 2) + (y2 * z2 / 3));
    const sy = y * Math.sqrt(1 - (x2 / 2) - (z2 / 2) + (x2 * z2 / 3));
    const sz = z * Math.sqrt(1 - (x2 / 2) - (y2 / 2) + (x2 * y2 / 3));
    return [sx * radius, sy * radius, sz * radius];
  }

  let vertexIndex = 0;
  const step = 2 / segments;
  // Face directions: +Z, -Z, +X, -X, +Y, -Y
  const dirs = [
    (u, v) => [u, v, 1],
    (u, v) => [-u, v, -1],
    (u, v) => [1, v, -u],
    (u, v) => [-1, v, u],
    (u, v) => [u, 1, -v],
    (u, v) => [u, -1, v]
  ];

  for (let f = 0; f < 6; f++) {
    const startIdx = vertexIndex;
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        // Map from 0..segments to -1..1
        const u = -1 + j * step;
        const v = -1 + i * step;
        
        const [cx, cy, cz] = dirs[f](u, v);
        const [sx, sy, sz] = mapCubeToSphere(cx, cy, cz);
        positions.push(sx, sy, sz);
        
        // Add indices for horizontal and vertical lines in this face
        const current = startIdx + i * (segments + 1) + j;
        if (j < segments) {
          indices.push(current, current + 1); // horizontal edge
        }
        if (i < segments) {
          indices.push(current, current + (segments + 1)); // vertical edge
        }
        vertexIndex++;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  
  // Create an invisible mesh version with exactly the same vertices but triangles for Raycasting.
  const triIndices = [];
  for (let f = 0; f < 6; f++) {
    const startIdx = f * (segments + 1) * (segments + 1);
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < segments; j++) {
            const row0 = startIdx + i * (segments + 1) + j;
            const row1 = startIdx + (i + 1) * (segments + 1) + j;
            // two triangles per quad
            triIndices.push(row0, row0 + 1, row1);
            triIndices.push(row1, row0 + 1, row1 + 1);
        }
    }
  }
  
  const meshGeometry = new THREE.BufferGeometry();
  meshGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  meshGeometry.setIndex(triIndices);
  meshGeometry.computeVertexNormals();
  meshGeometry.computeBoundingSphere();
  
  return { lineGeometry: geometry, meshGeometry };
}
