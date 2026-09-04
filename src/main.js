import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createEarth } from './earth.js';
import { createStars } from './stars.js';
import {
  fetchTLE, getISSPosition, fetchLiveBackendPosition, createISSModel, createOrbitLine,
  updateOrbitLine, createObserverMarker, needsTLERefresh, hasTLE,
  latLonAltToScene
} from './iss.js';

import {
  initUI, updateISSDisplay, updateLastUpdate, showError,
  setStatus, hideLoading, getObserverLocation, getSettings,
  recalculatePasses
} from './ui.js';

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 4, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 6.2;
controls.maxDistance = 50;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.enablePan = false;

// Realistic Space Lighting matching reference image
const ambientLight = new THREE.AmbientLight(0x1a2035, 0.4);
scene.add(ambientLight);

// Powerful directional sunlight from side/top
const sunLight = new THREE.DirectionalLight(0xffffff, 2.8);
sunLight.position.set(60, 30, 45);
scene.add(sunLight);

// Earth atmosphere rim backlight
const rimLight = new THREE.DirectionalLight(0x4080ff, 0.8);
rimLight.position.set(-50, -20, -40);
scene.add(rimLight);


// Scene elements
const earth = createEarth();
scene.add(earth.group);

const stars = createStars();
scene.add(stars.mesh);

const issModel = createISSModel();
scene.add(issModel);

const orbitLine = createOrbitLine();
scene.add(orbitLine);

const observerMarker = createObserverMarker();
scene.add(observerMarker.group);

// Camera animation
let cameraAnimating = false;
function animateCamera(target, distance = 11) {
  const newPos = target.clone().normalize().multiplyScalar(distance);
  cameraAnimating = true;
  const startPos = camera.position.clone();
  const startTime = Date.now();
  const duration = 1200;

  function step() {
    const t = Math.min(1, (Date.now() - startTime) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(startPos, newPos, eased);
    camera.lookAt(0, 0, 0);

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      cameraAnimating = false;
    }
  }
  step();
}

// UI Linkage
initUI({
  onTrack: (lat, lon) => {
    observerMarker.update(lat, lon);
    const pos = latLonAltToScene(lat, lon, 0);
    animateCamera(pos, 11);
    controls.autoRotate = false;
  },
  onFocusISS: () => {
    if (issCurrentPosition.lengthSq() > 0) {
      animateCamera(issCurrentPosition, 9.5);
      controls.autoRotate = false;
    }
  },
  onFocusLocation: () => {
    const loc = getObserverLocation();
    if (loc.lat !== null && loc.lon !== null) {
      const pos = latLonAltToScene(loc.lat, loc.lon, 0);
      animateCamera(pos, 11);
      controls.autoRotate = false;
    }
  },
  onResetView: () => {
    cameraAnimating = false;
    camera.position.set(0, 4, 15);
    camera.lookAt(0, 0, 0);
    controls.autoRotate = getSettings().autoRotate !== false;
  },
  onToggleOrbit: () => {
    orbitLine.visible = !orbitLine.visible;
    const btn = document.getElementById('btn-toggle-orbit');
    if (btn) btn.textContent = orbitLine.visible ? 'HIDE ORBIT' : 'SHOW ORBIT';
  },
});

let lastISSUpdateTime = 0;
const ISS_UPDATE_INTERVAL = 1000;
let lastOrbitUpdateTime = 0;
const ORBIT_UPDATE_INTERVAL = 60000;
let lastTLECheckTime = 0;
const TLE_CHECK_INTERVAL = 300000;

const issTargetPosition = new THREE.Vector3();
const issCurrentPosition = new THREE.Vector3();

async function updateISSPosition() {
  // 1. Try Python Skyfield backend for ground-truth position
  const backendData = await fetchLiveBackendPosition();
  if (backendData) {
    issTargetPosition.copy(backendData.scenePosition);
    updateISSDisplay(backendData);
    return;
  }

  // 2. Fall back to client-side SGP4 satellite.js propagation
  if (!hasTLE()) return;
  const now = new Date();
  const issData = getISSPosition(now);
  if (issData) {
    issTargetPosition.copy(issData.scenePosition);
    updateISSDisplay(issData);
  }
}


async function init() {
  try {
    const result = await fetchTLE();
    setStatus(result.success);
    updateLastUpdate(new Date());
    if (!result.success) {
      showError('Unable to connect to live CelesTrak. Running on fallback orbital elements.');
    }

    updateISSPosition();
    issCurrentPosition.copy(issTargetPosition);
    issModel.position.copy(issCurrentPosition);
    updateOrbitLine(orbitLine, new Date());
    hideLoading();
    recalculatePasses();
  } catch (err) {
    console.error('Init error:', err);
    setStatus(false);
    showError('Initialization encountered an error. Working offline.');
    hideLoading();
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta() * 60;
  const now = Date.now();

  earth.update(dt);
  stars.update(dt);

  if (now - lastISSUpdateTime > ISS_UPDATE_INTERVAL) {
    updateISSPosition();
    lastISSUpdateTime = now;
  }

  // Smooth interpolation for ISS
  issCurrentPosition.lerp(issTargetPosition, 0.08);
  issModel.position.copy(issCurrentPosition);
  if (issCurrentPosition.lengthSq() > 0) {
    issModel.lookAt(0, 0, 0);
  }

  if (now - lastOrbitUpdateTime > ORBIT_UPDATE_INTERVAL) {
    updateOrbitLine(orbitLine, new Date());
    lastOrbitUpdateTime = now;
  }

  if (now - lastTLECheckTime > TLE_CHECK_INTERVAL) {
    if (needsTLERefresh()) {
      fetchTLE().then(res => {
        setStatus(res.success);
        updateLastUpdate(new Date());
        updateOrbitLine(orbitLine, new Date());
        recalculatePasses();
      });
    }
    lastTLECheckTime = now;
  }

  const loc = getObserverLocation();
  if (loc.lat !== null) {
    observerMarker.update(loc.lat, loc.lon);
  }

  if (!cameraAnimating) {
    controls.update();
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
animate();
