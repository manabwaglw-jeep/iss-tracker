import * as THREE from 'three';

export function createStars() {
  const group = new THREE.Group();

  // 1. PRIMARY STARFIELD (Varying magnitudes and realistic stellar temperatures)
  const starCount = 6500;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 240 + Math.random() * 120;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Stellar spectral classification colors (O, B, A, F, G, K, M)
    const t = Math.random();
    if (t < 0.45) {
      // White / bright
      colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.96; colors[i * 3 + 2] = 1.0;
    } else if (t < 0.70) {
      // Hot blue-white stars
      colors[i * 3] = 0.65; colors[i * 3 + 1] = 0.82; colors[i * 3 + 2] = 1.0;
    } else if (t < 0.88) {
      // Yellow-white solar type
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.92; colors[i * 3 + 2] = 0.75;
    } else {
      // Orange/Red giants
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.62; colors[i * 3 + 2] = 0.45;
    }
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const starsMesh = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      size: 0.85,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      sizeAttenuation: true,
      depthWrite: false,
    })
  );
  group.add(starsMesh);

  // 2. FAINT MILKY WAY / DEEP SPACE DUST DENSITY
  const dustCount = 4000;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);

  for (let i = 0; i < dustCount; i++) {
    // Concentrated in a galactic band
    const theta = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 60;
    const rad = 260 + Math.random() * 80;

    dustPos[i * 3] = rad * Math.cos(theta);
    dustPos[i * 3 + 1] = height + Math.sin(theta * 2) * 20;
    dustPos[i * 3 + 2] = rad * Math.sin(theta);

    dustCol[i * 3] = 0.55 + Math.random() * 0.2;
    dustCol[i * 3 + 1] = 0.65 + Math.random() * 0.2;
    dustCol[i * 3 + 2] = 0.85 + Math.random() * 0.15;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));

  const dustMesh = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 0.45,
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
      depthWrite: false,
    })
  );
  group.add(dustMesh);

  return {
    mesh: group,
    update(dt) {
      group.rotation.y += 0.000004 * dt;
    }
  };
}
