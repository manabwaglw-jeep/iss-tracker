import { findPasses, formatDuration, azimuthToCompass, setMinElevation } from './passes.js';
import { getLookAngles } from './iss.js';

let observerLat = null;
let observerLon = null;
let currentPasses = [];
let selectedPass = null;
let nextVisiblePass = null;
let countdownInterval = null;
let settings = loadSettings();

let onTrackCallback = null;
let onFocusISSCallback = null;
let onFocusLocationCallback = null;
let onResetViewCallback = null;
let onToggleOrbitCallback = null;

export function initUI(callbacks) {
  onTrackCallback = callbacks.onTrack;
  onFocusISSCallback = callbacks.onFocusISS;
  onFocusLocationCallback = callbacks.onFocusLocation;
  onResetViewCallback = callbacks.onResetView;
  onToggleOrbitCallback = callbacks.onToggleOrbit;

  applySettings();

  document.getElementById('btn-track')?.addEventListener('click', handleTrack);
  document.getElementById('btn-geolocation')?.addEventListener('click', handleGeolocation);
  document.getElementById('btn-reset')?.addEventListener('click', () => onResetViewCallback?.());
  document.getElementById('btn-focus-iss')?.addEventListener('click', () => onFocusISSCallback?.());
  document.getElementById('btn-focus-loc')?.addEventListener('click', () => onFocusLocationCallback?.());
  document.getElementById('btn-toggle-orbit')?.addEventListener('click', () => onToggleOrbitCallback?.());
  document.getElementById('btn-close-detail')?.addEventListener('click', closePassDetail);

  const collapsibleHeader = document.querySelector('.collapsible-header');
  if (collapsibleHeader) {
    collapsibleHeader.addEventListener('click', () => {
      collapsibleHeader.closest('.collapsible')?.classList.toggle('open');
    });
  }

  document.getElementById('lat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleTrack();
  });
  document.getElementById('lon-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleTrack();
  });

  setupSettings();
}

function handleTrack() {
  const latInput = document.getElementById('lat-input');
  const lonInput = document.getElementById('lon-input');
  
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    showError('Please enter a valid latitude between -90 and 90.');
    return;
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    showError('Please enter a valid longitude between -180 and 180.');
    return;
  }

  observerLat = lat;
  observerLon = lon;

  onTrackCallback?.(lat, lon);
  calculateAndDisplayPasses();
}

function handleGeolocation() {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      document.getElementById('lat-input').value = lat.toFixed(4);
      document.getElementById('lon-input').value = lon.toFixed(4);
      handleTrack();
    },
    (error) => {
      switch (error.code) {
        case error.PERMISSION_DENIED:
          showError('Location permission denied. Please enter coordinates manually.');
          break;
        case error.POSITION_UNAVAILABLE:
          showError('Location information unavailable.');
          break;
        default:
          showError('Unable to retrieve location.');
      }
    },
    { timeout: 10000 }
  );
}

export function getObserverLocation() {
  return { lat: observerLat, lon: observerLon };
}

export function updateISSDisplay(issData) {
  if (!issData) return;
  const units = settings.units;
  const isMi = units === 'mi';
  const altVal = isMi ? issData.alt * 0.621371 : issData.alt;
  const velVal = isMi ? issData.velocity * 0.621371 : issData.velocity;
  const altUnit = isMi ? 'mi' : 'km';
  const velUnit = isMi ? 'mph' : 'km/h';

  const latElem = document.getElementById('iss-lat');
  const lonElem = document.getElementById('iss-lon');
  const altElem = document.getElementById('iss-alt');
  const velElem = document.getElementById('iss-vel');

  if (latElem) latElem.textContent = `${issData.lat.toFixed(4)}°`;
  if (lonElem) lonElem.textContent = `${issData.lon.toFixed(4)}°`;
  if (altElem) altElem.textContent = `${altVal.toFixed(0)} ${altUnit}`;
  if (velElem) velElem.textContent = `${Math.round(velVal).toLocaleString()} ${velUnit}`;
}

export function updateLastUpdate(date) {
  const timeStr = date.toISOString().split('T')[1].split('.')[0];
  const elem = document.getElementById('last-update');
  if (elem) elem.textContent = `LAST ORBIT UPDATE: ${timeStr} UTC`;
}

async function calculateAndDisplayPasses() {
  if (observerLat === null || observerLon === null) return;
  const passesList = document.getElementById('passes-list');
  if (passesList) {
    passesList.innerHTML = '<div class="pass-card" style="opacity:0.6">Calculating upcoming passes...</div>';
  }

  // 1. First try Skyfield Python backend
  try {
    const minElev = settings.minElevation || 10;
    const url = `http://localhost:5000/api/passes?lat=${observerLat}&lon=${observerLon}&min_elev=${minElev}&days=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data.passes && data.passes.length > 0) {
        currentPasses = data.passes.map(p => ({
          ...p,
          riseTime: new Date(p.riseTime),
          maxElevationTime: new Date(p.maxElevationTime),
          setTime: new Date(p.setTime),
          direction: `${azimuthToCompass(p.riseAzimuth)} → ${azimuthToCompass(p.setAzimuth)}`,
          points: [
            { elevation: minElev, azimuth: p.riseAzimuth },
            { elevation: p.maxElevation, azimuth: p.maxAzimuth },
            { elevation: minElev, azimuth: p.setAzimuth }
          ]
        }));
        displayPasses();
        return;
      }
    }
  } catch (err) {
    console.log('Using browser-side pass calculations:', err.message);
  }

  // 2. Client-side fallback calculation with SGP4 + Sun geometry
  setTimeout(() => {
    try {
      currentPasses = findPasses(observerLat, observerLon, 0, 10, 72);
      displayPasses();
    } catch (e) {
      console.error(e);
      if (passesList) passesList.innerHTML = '<div class="pass-card" style="opacity:0.6">Error calculating passes.</div>';
    }
  }, 40);
}


function displayPasses() {
  const passesList = document.getElementById('passes-list');
  if (!passesList) return;
  passesList.innerHTML = '';

  if (currentPasses.length === 0) {
    passesList.innerHTML = '<div class="pass-card" style="opacity:0.6">No passes found within the next 72 hours.</div>';
    return;
  }

  currentPasses.forEach((pass, index) => {
    const card = document.createElement('div');
    card.className = 'pass-card';
    card.addEventListener('click', () => showPassDetail(index));

    const dateStr = formatDate(pass.riseTime);
    const timeStr = formatTime(pass.riseTime);

    card.innerHTML = `
      <div class="pass-date">${dateStr}</div>
      <div class="pass-time">${timeStr}</div>
      <div class="pass-info">
        Duration: ${formatDuration(pass.duration)}<br>
        Max Elev: ${pass.maxElevation.toFixed(0)}° · ${pass.direction}
      </div>
      <span class="pass-rating ${pass.visibility.ratingClass}">${pass.visibility.rating}</span>
    `;
    passesList.appendChild(card);
  });

  const now = Date.now();
  nextVisiblePass = currentPasses.find(p => p.visibility.rating !== 'NOT VISIBLE' && p.riseTime.getTime() > now) ||
                    currentPasses.find(p => p.riseTime.getTime() > now);

  startCountdown();
}

function showPassDetail(index) {
  const pass = currentPasses[index];
  if (!pass) return;
  selectedPass = pass;

  const content = document.getElementById('pass-detail-content');
  if (content) {
    content.innerHTML = `
      <div class="detail-row"><span>Date</span><span>${formatDate(pass.riseTime)}</span></div>
      <div class="detail-row"><span>Starts</span><span>${formatTime(pass.riseTime)} (${azimuthToCompass(pass.riseAzimuth)} ${pass.riseAzimuth.toFixed(0)}°)</span></div>
      <div class="detail-row"><span>Peak</span><span>${formatTime(pass.maxElevationTime)} (${azimuthToCompass(pass.maxAzimuth)} ${pass.maxAzimuth.toFixed(0)}°)</span></div>
      <div class="detail-row"><span>Ends</span><span>${formatTime(pass.setTime)} (${azimuthToCompass(pass.setAzimuth)} ${pass.setAzimuth.toFixed(0)}°)</span></div>
      <div class="detail-row"><span>Max Elevation</span><span>${pass.maxElevation.toFixed(1)}°</span></div>
      <div class="detail-row"><span>Duration</span><span>${formatDuration(pass.duration)}</span></div>
      <div class="detail-row"><span>Direction</span><span>${pass.direction}</span></div>
      <div class="detail-row"><span>Visibility</span><span class="${pass.visibility.ratingClass}">${pass.visibility.rating}</span></div>
      <div class="detail-row" style="font-size:10px;color:#667;"><span>Note</span><span>${pass.visibility.reason}</span></div>
    `;
  }

  const passDetailElem = document.getElementById('pass-detail');
  if (passDetailElem) passDetailElem.style.display = 'block';

  drawSkyPath(pass);
}

function closePassDetail() {
  const passDetailElem = document.getElementById('pass-detail');
  if (passDetailElem) passDetailElem.style.display = 'none';
  selectedPass = null;
}

function drawSkyPath(pass) {
  const canvas = document.getElementById('sky-path-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 22;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6, 10, 24, 0.95)';
  ctx.fillRect(0, 0, w, h);

  // Horizon ring
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Rings for 30° and 60°
  [30, 60].forEach(elev => {
    const ringR = r * (1 - elev / 90);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.font = '9px monospace';
    ctx.fillText(`${elev}°`, cx + 3, cy - ringR + 10);
  });

  // Center point (Zenith 90°)
  ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  // Cardinal directions
  ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, 14);
  ctx.fillText('S', cx, h - 5);
  ctx.fillText('E', w - 10, cy + 4);
  ctx.fillText('W', 10, cy + 4);

  if (!pass.points || pass.points.length < 2) return;

  // Path
  ctx.strokeStyle = '#ff9500';
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  pass.points.forEach((point, i) => {
    const dist = r * (1 - point.elevation / 90);
    const azRad = (point.azimuth - 90) * (Math.PI / 180);
    const px = cx + dist * Math.cos(azRad);
    const py = cy + dist * Math.sin(azRad);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Start, Max, End Markers
  const pFirst = pass.points[0];
  const pLast = pass.points[pass.points.length - 1];

  drawSkyMarker(ctx, cx, cy, r, pFirst.elevation, pass.riseAzimuth, 'RISE', '#0f6');
  drawSkyMarker(ctx, cx, cy, r, pass.maxElevation, pass.maxAzimuth, 'MAX', '#ff9500');
  drawSkyMarker(ctx, cx, cy, r, pLast.elevation, pass.setAzimuth, 'SET', '#f44');
}

function drawSkyMarker(ctx, cx, cy, r, elev, az, label, color) {
  const dist = r * (1 - elev / 90);
  const azRad = (az - 90) * (Math.PI / 180);
  const px = cx + dist * Math.cos(azRad);
  const py = cy + dist * Math.sin(azRad);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, px, py - 6);
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateCountdown, 1000);
  updateCountdown();
}

function updateCountdown() {
  const display = document.getElementById('countdown-display');
  const label = document.getElementById('countdown-label');
  if (!display || !label) return;

  if (!nextVisiblePass) {
    display.textContent = '--:--:--';
    label.textContent = 'No upcoming passes calculated';
    return;
  }

  const now = Date.now();
  const riseTime = nextVisiblePass.riseTime.getTime();
  const setTime = nextVisiblePass.setTime ? nextVisiblePass.setTime.getTime() : riseTime + 600000;

  if (now >= riseTime && now <= setTime) {
    display.textContent = 'PASSING NOW';
    display.classList.add('passing-now');
    
    if (observerLat !== null && observerLon !== null) {
      const la = getLookAngles(observerLat, observerLon, 0, new Date());
      label.textContent = la ? `Elev: ${la.elevation.toFixed(0)}° · Az: ${azimuthToCompass(la.azimuth)} (${la.azimuth.toFixed(0)}°)` : 'Passing over horizon';
    } else {
      label.textContent = 'Passing overhead';
    }
    return;
  }

  display.classList.remove('passing-now');

  if (now > setTime) {
    nextVisiblePass = currentPasses.find(p => p.riseTime.getTime() > now && p.visibility.rating !== 'NOT VISIBLE') ||
                      currentPasses.find(p => p.riseTime.getTime() > now);
    if (!nextVisiblePass) {
      display.textContent = '--:--:--';
      label.textContent = 'Passes complete';
      return;
    }
  }

  const diff = nextVisiblePass.riseTime.getTime() - now;
  if (diff <= 0) return;

  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  display.textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  label.textContent = `STARTS AT ${formatTime(nextVisiblePass.riseTime)} · ${nextVisiblePass.visibility.rating}`;
}

function setupSettings() {
  const minElev = document.getElementById('setting-min-elev');
  const units = document.getElementById('setting-units');
  const time = document.getElementById('setting-time');
  const autorotate = document.getElementById('setting-autorotate');

  if (minElev) minElev.value = settings.minElevation || '10';
  if (units) units.value = settings.units || 'km';
  if (time) time.value = settings.timeFormat || '24';
  if (autorotate) autorotate.checked = settings.autoRotate !== false;

  minElev?.addEventListener('change', (e) => {
    settings.minElevation = parseInt(e.target.value);
    setMinElevation(settings.minElevation);
    saveSettings();
    calculateAndDisplayPasses();
  });

  units?.addEventListener('change', (e) => {
    settings.units = e.target.value;
    saveSettings();
  });

  time?.addEventListener('change', (e) => {
    settings.timeFormat = e.target.value;
    saveSettings();
    if (currentPasses.length > 0) displayPasses();
  });

  autorotate?.addEventListener('change', (e) => {
    settings.autoRotate = e.target.checked;
    saveSettings();
  });
}

function loadSettings() {
  try {
    const s = localStorage.getItem('iss-tracker-settings');
    return s ? JSON.parse(s) : { minElevation: 10, units: 'km', timeFormat: '24', autoRotate: true };
  } catch {
    return { minElevation: 10, units: 'km', timeFormat: '24', autoRotate: true };
  }
}

function saveSettings() {
  try {
    localStorage.setItem('iss-tracker-settings', JSON.stringify(settings));
  } catch {}
}

function applySettings() {
  if (settings.minElevation) setMinElevation(settings.minElevation);
}

export function getSettings() {
  return settings;
}

function formatTime(date) {
  if (!date) return '--:--';
  if (settings.timeFormat === '12') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDate(date) {
  if (!date) return '--';
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}

export function showError(message) {
  const toast = document.getElementById('error-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}

export function setStatus(online) {
  const ind = document.getElementById('status-indicator');
  if (!ind) return;
  if (online) {
    ind.className = 'status live';
    ind.textContent = '● LIVE';
  } else {
    ind.className = 'status offline';
    ind.textContent = '● OFFLINE';
  }
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

export function recalculatePasses() {
  if (observerLat !== null && observerLon !== null) {
    calculateAndDisplayPasses();
  }
}
