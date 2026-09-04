import * as THREE from 'three';

export function createEarth() {
  const group = new THREE.Group();
  const EARTH_RADIUS = 5;

  let earthMesh = null;
  let cloudMesh = null;

  const textureLoader = new THREE.TextureLoader();

  // 1. High-res Day Texture
  const earthTexture = textureLoader.load(
    '/earth/textures/Earth_baseColor.jpeg',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
  );

  // 2. High-res City Lights Emissive Texture
  const nightLightsTexture = textureLoader.load(
    '/earth/textures/Earth_emissive.jpeg',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
  );

  // 3. Clouds Texture
  const cloudsTexture = textureLoader.load(
    '/earth/textures/Clouds_baseColor.png',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
  );

  // Direction of the Sun in world coordinates (synchronized with directional sun light in main.js)
  const sunDirection = new THREE.Vector3(60, 30, 45).normalize();

  // Custom Day/Night Terminator Shader for Earth
  // This accurately keeps the day side lit by the sun, and illuminates golden city lights in the night side!
  const earthShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: earthTexture },
      nightTexture: { value: nightLightsTexture },
      sunDirection: { value: sunDirection },
      nightBoost: { value: 2.2 }, // Golden boost matching the NASA black-marble photo
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        
        // World space normal and position for accurate sun alignment
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      uniform vec3 sunDirection;
      uniform float nightBoost;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 dayColor = texture2D(dayTexture, vUv).rgb;
        vec3 rawNight = texture2D(nightTexture, vUv).rgb;

        // Cosine angle between surface normal and sunlight
        float sunDot = dot(vWorldNormal, sunDirection);

        // Day illumination factor with smooth twilight falloff (-0.15 to +0.15)
        float dayFactor = smoothstep(-0.15, 0.20, sunDot);

        // Night factor: 1.0 in full shadow, 0.0 in day
        float nightFactor = 1.0 - smoothstep(-0.20, 0.05, sunDot);

        // Exponential power curve to bring out smaller towns & highway webs, plus bright metropolitan cores
        float lum = dot(rawNight, vec3(0.299, 0.587, 0.114));
        vec3 boostedLights = rawNight * 3.6;
        
        // Add subtle incandescent glow to town clusters and highways
        vec3 ambientTowns = pow(rawNight, vec3(0.75)) * vec3(1.2, 0.85, 0.45) * 1.8;
        
        // Intense golden-white core for major metropolitan centers
        vec3 metroCores = pow(rawNight, vec3(1.4)) * vec3(1.4, 1.25, 0.9) * 2.5;

        vec3 goldenNightLights = (boostedLights + ambientTowns + metroCores) * vec3(1.2, 0.95, 0.6);

        // Ambient deep ocean night tone
        vec3 nightAmbient = dayColor * 0.035;

        // Combine day side and dense nighttime city lights
        vec3 finalColor = (dayColor * dayFactor) + ((goldenNightLights + nightAmbient) * nightFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });


  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);
  earthMesh = new THREE.Mesh(earthGeo, earthShaderMaterial);
  group.add(earthMesh);

  // Photorealistic Dual-Layer Cloud System:
  // Layer 1: Subtle ground shadow layer beneath clouds (creates realistic altitude depth)
  const shadowCloudGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.006, 128, 128);
  const shadowCloudMat = new THREE.MeshBasicMaterial({
    map: cloudsTexture,
    transparent: true,
    opacity: 0.28,
    color: 0x050810,
    depthWrite: false,
  });
  const shadowCloudMesh = new THREE.Mesh(shadowCloudGeo, shadowCloudMat);
  group.add(shadowCloudMesh);

  // Layer 2: Main illuminated volumetric cloud layer with day/night shading & sunset amber scattering
  const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.018, 128, 128);
  const cloudShaderMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      cloudTexture: { value: cloudsTexture },
      sunDirection: { value: sunDirection },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudTexture;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec4 tex = texture2D(cloudTexture, vUv);
        // Alpha density from texture brightness
        float density = tex.r;
        if (density < 0.05) discard;

        // Alignment with sunlight
        float sunDot = dot(vWorldNormal, sunDirection);

        // Day factor
        float dayFactor = smoothstep(-0.15, 0.25, sunDot);

        // Sunset/sunrise twilight rim tint (warm golden-orange on clouds at terminator)
        float twilight = smoothstep(-0.2, 0.0, sunDot) * (1.0 - smoothstep(0.0, 0.25, sunDot));
        vec3 sunsetTint = vec3(1.0, 0.65, 0.38) * twilight * 0.7;

        // Bright white sunlit clouds on day side
        vec3 dayCloudColor = vec3(0.96, 0.98, 1.0) * (0.4 + 0.6 * dayFactor) + sunsetTint;

        // Faint dark indigo/blue tint on night side (visible against city lights and stars)
        vec3 nightCloudColor = vec3(0.04, 0.07, 0.14);

        vec3 finalCloudColor = mix(nightCloudColor, dayCloudColor, dayFactor);

        // Cloud opacity naturally higher in thick cloud vortices, faint at edges
        float finalOpacity = smoothstep(0.08, 0.95, density) * 0.85;

        gl_FragColor = vec4(finalCloudColor, finalOpacity);
      }
    `
  });

  cloudMesh = new THREE.Mesh(cloudGeo, cloudShaderMat);
  group.add(cloudMesh);


  // Atmospheric Glow Shaders — softened & subtle
  const atmosVS = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // Soft natural cyan-blue limb scattering (reduced brightness)
  const atmosFS = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vec3 viewDir = normalize(-vPosition);
      float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
      float intensity = pow(rim, 4.5);
      gl_FragColor = vec4(0.2, 0.55, 0.95, intensity * 0.55);
    }
  `;

  const atmos = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.022, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader: atmosVS,
      fragmentShader: atmosFS,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  group.add(atmos);

  // Subtle outer space haze
  const outerGlowFS = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vec3 viewDir = normalize(-vPosition);
      float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
      float intensity = pow(rim, 6.0);
      gl_FragColor = vec4(0.12, 0.42, 0.85, intensity * 0.22);
    }
  `;

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.08, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader: atmosVS,
      fragmentShader: outerGlowFS,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  group.add(glow);

  // REALISTIC SATELLITE-VIEW LIGHTNING FLASHES in nighttime storms
  const lightningLight = new THREE.PointLight(0xbbe0ff, 0, 2.5, 3);
  const lightningPos = new THREE.Vector3();
  group.add(lightningLight);

  let nextFlashTime = 0;
  let flashRemainingTicks = 0;

  function updateLightning(now) {
    if (flashRemainingTicks > 0) {
      flashRemainingTicks--;
      lightningLight.intensity = Math.random() * 3.2 + 1.0;
      if (flashRemainingTicks === 0) {
        lightningLight.intensity = 0;
        nextFlashTime = now + Math.random() * 2500 + 700;
      }
      return;
    }

    if (now >= nextFlashTime) {
      // Pick random coordinates in the dark tropical / mid-latitude storm belts
      const lat = (Math.random() - 0.5) * 55;
      const lon = (Math.random() - 0.5) * 160 - 80;
      const latR = lat * (Math.PI / 180);
      const lonR = -lon * (Math.PI / 180);

      const r = EARTH_RADIUS * 1.014;
      lightningPos.set(
        r * Math.cos(latR) * Math.sin(lonR),
        r * Math.sin(latR),
        r * Math.cos(latR) * Math.cos(lonR)
      );

      lightningLight.position.copy(lightningPos);
      lightningLight.color.setHex(Math.random() > 0.3 ? 0xccedff : 0x99ccff);
      lightningLight.intensity = 2.8;
      flashRemainingTicks = Math.floor(Math.random() * 4) + 2;
    }
  }

  return {
    group,
    earthMesh,
    cloudMesh,
    atmosphere: atmos,
    EARTH_RADIUS,
    update(dt) {
      // Earth rotation
      if (earthMesh) earthMesh.rotation.y += 0.00012 * dt;

      // Realistic cloud drift over continents
      if (cloudMesh) cloudMesh.rotation.y += 0.00045 * dt;
      if (shadowCloudMesh) shadowCloudMesh.rotation.y = cloudMesh.rotation.y;

      // Thunderstorm lightning strikes
      updateLightning(Date.now());
    }
  };
}

