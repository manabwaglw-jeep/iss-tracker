import * as THREE from 'three';
import * as satellite from 'satellite.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { API_BASE } from './config.js';

const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_SCENE = 5;
const KM_TO_SCENE = EARTH_RADIUS_SCENE / EARTH_RADIUS_KM;

const FALLBACK_TLE = {
  line1: '1 25544U 98067A   26246.17593850  .00004078  00000+0  82215-4 0  9998',
  line2: '2 25544  51.6312 274.0958 0005015 102.3118 257.8432 15.48977273583844'
};

let satrec = null;
let tleEpoch = null;
let lastTLEFetch = 0;
const TLE_FETCH_INTERVAL = 1800000;

export async function fetchTLE() {
  try {
    const res = await fetch(`${API_BASE}/api/tle`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      if (data.line1 && data.line2) {
        satrec = satellite.twoline2satrec(data.line1, data.line2);
        tleEpoch = new Date();
        lastTLEFetch = Date.now();
        return { success: true, source: 'Python Skyfield Backend' };
      }
    }
  } catch {}

  const urls = [
    'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
    'https://tle.ivanstanojevic.me/api/tle/25544',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      if (url.includes('celestrak')) {
        const text = await res.text();
        const lines = text.trim().split('\n').map(l => l.trim());
        const l1 = lines.find(l => l.startsWith('1 '));
        const l2 = lines.find(l => l.startsWith('2 '));
        if (l1 && l2) {
          satrec = satellite.twoline2satrec(l1, l2);
          tleEpoch = new Date(); lastTLEFetch = Date.now();
          return { success: true, source: 'CelesTrak' };
        }
      } else {
        const data = await res.json();
        if (data.line1 && data.line2) {
          satrec = satellite.twoline2satrec(data.line1, data.line2);
          tleEpoch = new Date(); lastTLEFetch = Date.now();
          return { success: true, source: 'TLE API' };
        }
      }
    } catch (e) { console.warn(`TLE fetch failed: ${url}`, e.message); }
  }
  satrec = satellite.twoline2satrec(FALLBACK_TLE.line1, FALLBACK_TLE.line2);
  tleEpoch = new Date(); lastTLEFetch = Date.now();
  return { success: false, source: 'Fallback' };
}

export async function fetchLiveBackendPosition() {
  try {
    const res = await fetch(`${API_BASE}/api/position`, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      const data = await res.json();
      const scenePos = latLonAltToScene(data.latitude, data.longitude, data.altitude);
      return {
        lat: data.latitude,
        lon: data.longitude,
        alt: data.altitude,
        velocity: data.velocity,
        scenePosition: scenePos,
        source: 'Skyfield Backend'
      };
    }
  } catch {}
  return null;
}

export function getISSPosition(date) {
  if (!satrec) return null;
  const pv = satellite.propagate(satrec, date);
  if (!pv.position || pv.position === false) return null;
  const gmst = satellite.gstime(date);
  const gd = satellite.eciToGeodetic(pv.position, gmst);
  const lat = satellite.degreesLat(gd.latitude);
  const lon = satellite.degreesLong(gd.longitude);
  const alt = gd.height;
  const v = pv.velocity;
  const velKmH = Math.sqrt(v.x**2 + v.y**2 + v.z**2) * 3600;
  return { lat, lon, alt, velocity: velKmH, scenePosition: latLonAltToScene(lat, lon, alt), eciPosition: pv.position, gmst };
}

export function getLookAngles(observerLat, observerLon, observerAlt, date) {
  if (!satrec) return null;
  const pv = satellite.propagate(satrec, date);
  if (!pv.position || pv.position === false) return null;
  const gmst = satellite.gstime(date);
  const obsGd = {
    latitude: satellite.degreesToRadians(observerLat),
    longitude: satellite.degreesToRadians(observerLon),
    height: observerAlt / 1000
  };
  const la = satellite.ecfToLookAngles(obsGd, satellite.eciToEcf(pv.position, gmst));
  return { azimuth: la.azimuth * 180 / Math.PI, elevation: la.elevation * 180 / Math.PI, rangeSat: la.rangeSat };
}

export function latLonAltToScene(lat, lon, alt) {
  const r = EARTH_RADIUS_SCENE + alt * KM_TO_SCENE;
  const latR = lat * Math.PI / 180;
  const lonR = -lon * Math.PI / 180;
  return new THREE.Vector3(r * Math.cos(latR) * Math.sin(lonR), r * Math.sin(latR), r * Math.cos(latR) * Math.cos(lonR));
}

export function latLonToScene(lat, lon) { return latLonAltToScene(lat, lon, 0); }

/**
 * Builds the authentic ISS model directly matching the official NASA configuration photo:
 * - Integrated Truss Structure (ITS) spanning horizontally
 * - 4 Solar Array Wings (SAW) sets with authentic dual panels (deep space blue-black top, copper-amber backing)
 * - Pressurized Mating Adapters & Habitation Modules (Destiny, Unity, Zvezda, Zarya, Kibo, Columbus)
 * - Heat rejection thermal radiator panels (bright white rectangular fins perpendicular to truss)
 * - Canadarm2 robotic arm
 */
function buildAuthenticISS() {
  const iss = new THREE.Group();

  // Materials
  const trussMat = new THREE.MeshStandardMaterial({
    color: 0xd8dbe2,
    metalness: 0.85,
    roughness: 0.25,
    wireframe: false
  });

  const moduleMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    metalness: 0.9,
    roughness: 0.2,
  });

  const moduleGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.95,
    roughness: 0.15,
  });

  const solarFrontMat = new THREE.MeshStandardMaterial({
    color: 0x112244,
    metalness: 0.95,
    roughness: 0.1,
    emissive: 0x051122,
  });

  const solarBackMat = new THREE.MeshStandardMaterial({
    color: 0xc66518, // Amber/copper color as seen in the real photo
    metalness: 0.7,
    roughness: 0.35,
  });

  const radiatorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.3,
    roughness: 0.1,
    side: THREE.DoubleSide
  });

  // 1. INTEGRATED TRUSS STRUCTURE (Main Horizontal Beam)
  const trussLength = 3.6;
  const trussGeo = new THREE.BoxGeometry(trussLength, 0.08, 0.08);
  const trussMesh = new THREE.Mesh(trussGeo, trussMat);
  iss.add(trussMesh);

  // Truss details / segments
  for (let x = -1.6; x <= 1.6; x += 0.4) {
    const ringGeo = new THREE.BoxGeometry(0.02, 0.11, 0.11);
    const ring = new THREE.Mesh(ringGeo, trussMat);
    ring.position.x = x;
    iss.add(ring);
  }

  // 2. CENTRAL HABITATION & LABORATORY MODULES
  const centralGroup = new THREE.Group();

  // Main Forward Lab (Destiny / Harmony)
  const lab1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.65, 24), moduleMat);
  lab1.rotation.x = Math.PI / 2;
  lab1.position.set(0, -0.1, 0.25);
  centralGroup.add(lab1);

  // Unity / Node 1
  const unity = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 24), moduleMat);
  unity.rotation.x = Math.PI / 2;
  unity.position.set(0, -0.1, -0.1);
  centralGroup.add(unity);

  // Zarya (FGB)
  const zarya = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 24), moduleMat);
  zarya.rotation.x = Math.PI / 2;
  zarya.position.set(0, -0.08, -0.45);
  centralGroup.add(zarya);

  // Zvezda Service Module
  const zvezda = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.55, 24), moduleMat);
  zvezda.rotation.x = Math.PI / 2;
  zvezda.position.set(0, -0.06, -0.9);
  centralGroup.add(zvezda);

  // Kibo Laboratory (Japanese Module with Experiment Logistics Module)
  const kibo = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.5, 24), moduleMat);
  kibo.rotation.z = Math.PI / 2;
  kibo.position.set(-0.35, -0.1, 0.3);
  centralGroup.add(kibo);

  // Columbus Laboratory (ESA Module)
  const columbus = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.35, 24), moduleMat);
  columbus.rotation.z = Math.PI / 2;
  columbus.position.set(0.3, -0.1, 0.3);
  centralGroup.add(columbus);

  // Cupola Observatory Window
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.05, 12), moduleGoldMat);
  cupola.position.set(0, -0.22, 0.25);
  centralGroup.add(cupola);

  // Quest Airlock / Storage Pods
  const airlock = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 16), moduleMat);
  airlock.position.set(0.2, 0.05, -0.05);
  centralGroup.add(airlock);

  // Canadarm2 Robotic Arm
  const armMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.3 });
  const armSeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), armMat);
  armSeg1.position.set(-0.25, -0.2, 0.45);
  armSeg1.rotation.z = Math.PI / 4;
  centralGroup.add(armSeg1);

  const armSeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 8), armMat);
  armSeg2.position.set(-0.35, -0.3, 0.55);
  armSeg2.rotation.x = Math.PI / 3;
  centralGroup.add(armSeg2);

  iss.add(centralGroup);

  // 3. SOLAR ARRAY WINGS (8 Dual-sided panels matching the photo layout)
  // Photo shows: 4 sets (2 sets on Starboard, 2 sets on Port).
  // Top half is space-blue solar cells, bottom half is copper-amber cells.
  const panelWidth = 0.28;
  const panelHeight = 1.15;
  const panelThick = 0.012;

  function createSolarWing(isUpper) {
    const wing = new THREE.Group();
    const halfH = panelHeight / 2;

    // Front: dark blue cells
    const frontHalf = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth, halfH, panelThick),
      solarFrontMat
    );
    frontHalf.position.y = halfH / 2;

    // Back / opposite side: amber / gold cells as in user photo
    const backHalf = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth, halfH, panelThick),
      solarBackMat
    );
    backHalf.position.y = -halfH / 2;

    // Mast in center
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, panelHeight * 1.05, 8),
      trussMat
    );

    wing.add(mast);
    wing.add(isUpper ? frontHalf : backHalf);
    wing.add(isUpper ? backHalf : frontHalf);

    // Subtle grid lines texture on panel
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth * 1.02, panelHeight * 1.01, panelThick * 0.8),
      trussMat
    );
    wing.add(border);

    return wing;
  }

  // Positions of the 4 main Solar Array Wings (P4, P6, S4, S6)
  // Port wings (left in photo)
  const portPositions = [-1.65, -1.3];
  portPositions.forEach(x => {
    // Upper wing
    const upperWing = createSolarWing(true);
    upperWing.position.set(x, 0.72, 0);
    iss.add(upperWing);

    // Lower wing
    const lowerWing = createSolarWing(false);
    lowerWing.position.set(x, -0.72, 0);
    iss.add(lowerWing);
  });

  // Starboard wings (right in photo)
  const starPositions = [1.3, 1.65];
  starPositions.forEach(x => {
    // Upper wing
    const upperWing = createSolarWing(true);
    upperWing.position.set(x, 0.72, 0);
    iss.add(upperWing);

    // Lower wing
    const lowerWing = createSolarWing(false);
    lowerWing.position.set(x, -0.72, 0);
    iss.add(lowerWing);
  });

  // 4. HEAT REJECTION RADIATOR PANELS (3 White accordions behind truss)
  // Starboard & Port Radiators
  [-0.6, 0.6].forEach(x => {
    const radGroup = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.35), radiatorMat);
      fin.position.set(x + (i - 1) * 0.1, 0.08, -0.25);
      radGroup.add(fin);
    }
    iss.add(radGroup);
  });

  // Center / Module radiators
  const centerRad = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.01, 0.25), radiatorMat);
  centerRad.position.set(0, 0.12, -0.15);
  iss.add(centerRad);

  return iss;
}

export function createISSModel() {
  const issContainer = new THREE.Group();

  // Build authentic procedural model matching NASA photo
  const authenticModel = buildAuthenticISS();
  authenticModel.scale.set(0.65, 0.65, 0.65);
  issContainer.add(authenticModel);

  // Also attempt to load external GLTF if user model has textures
  const loader = new GLTFLoader();
  loader.load(
    '/iss/scene.gltf',
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);

      if (maxDim > 0.01) {
        const scale = 1.3 / maxDim;
        model.scale.set(scale, scale, scale);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center.multiplyScalar(scale));

        // Swap with loaded model
        issContainer.remove(authenticModel);
        issContainer.add(model);
      }
    },
    undefined,
    () => {
      // Keep authentic procedural model
    }
  );

  // Soft white beacon light
  const beacon = new THREE.PointLight(0xffffff, 1.2, 5);
  issContainer.add(beacon);

  return issContainer;
}

export function createOrbitLine() {
  const pts = []; for (let i = 0; i <= 360; i++) pts.push(new THREE.Vector3());
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      linewidth: 1.5,
      depthWrite: false
    })
  );
  line.frustumCulled = false;
  return line;
}

export function updateOrbitLine(line, date) {
  if (!satrec) return;
  const pts = [];
  const period = (2 * Math.PI) / satrec.no * 60000;
  for (let i = 0; i <= 360; i++) {
    const t = new Date(date.getTime() + (i / 360) * period);
    const pos = getISSPosition(t);
    if (pos) pts.push(pos.scenePosition);
  }
  if (pts.length > 0) {
    const positions = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { positions[i*3] = p.x; positions[i*3+1] = p.y; positions[i*3+2] = p.z; });
    line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  }
}

export function createObserverMarker() {
  const g = new THREE.Group();
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 16),
    new THREE.MeshPhongMaterial({ color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 })
  );
  g.add(marker);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.12, 32),
    new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  g.add(ring);

  const pulseMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 32), pulseMat);
  g.add(pulseRing);
  g.visible = false;

  return {
    group: g,
    update(lat, lon) {
      if (lat == null || lon == null) return;
      g.position.copy(latLonToScene(lat, lon));
      g.lookAt(0, 0, 0);
      g.rotateX(Math.PI);
      const s = 1 + Math.sin(Date.now() * 0.003) * 0.3;
      pulseRing.scale.set(s, s, 1);
      pulseMat.opacity = 0.5 - Math.sin(Date.now() * 0.003) * 0.3;
      g.visible = true;
    }
  };
}

export function needsTLERefresh() { return Date.now() - lastTLEFetch > TLE_FETCH_INTERVAL; }
export function hasTLE() { return satrec !== null; }
