import { getLookAngles, getISSPosition } from './iss.js';
import { isObserverInDarkness, isISSIlluminated } from './sun.js';

let MIN_ELEVATION = 10; // degrees

export function setMinElevation(deg) {
  MIN_ELEVATION = deg;
}

export function getMinElevation() {
  return MIN_ELEVATION;
}

export function findPasses(lat, lon, altMeters = 0, maxPasses = 10, hoursAhead = 72) {
  const passes = [];
  const now = new Date();
  const endTime = new Date(now.getTime() + hoursAhead * 3600000);
  const step = 30000; // 30s step
  
  let inPass = false;
  let passData = null;
  let t = now.getTime();
  
  while (t < endTime.getTime() && passes.length < maxPasses) {
    const date = new Date(t);
    const lookAngles = getLookAngles(lat, lon, altMeters, date);
    
    if (!lookAngles) {
      t += step;
      continue;
    }
    
    const elev = lookAngles.elevation;
    
    if (!inPass && elev >= MIN_ELEVATION) {
      const riseTime = refineTime(t - step, t, lat, lon, altMeters, MIN_ELEVATION, 'rise');
      const riseLook = getLookAngles(lat, lon, altMeters, riseTime) || lookAngles;
      
      passData = {
        riseTime: riseTime,
        riseAzimuth: riseLook.azimuth,
        maxElevation: elev,
        maxElevationTime: date,
        maxAzimuth: lookAngles.azimuth,
        setTime: null,
        setAzimuth: 0,
        points: [{
          time: date,
          elevation: elev,
          azimuth: lookAngles.azimuth,
        }],
      };
      inPass = true;
    } else if (inPass) {
      if (elev > passData.maxElevation) {
        passData.maxElevation = elev;
        passData.maxElevationTime = date;
        passData.maxAzimuth = lookAngles.azimuth;
      }
      
      passData.points.push({
        time: date,
        elevation: elev,
        azimuth: lookAngles.azimuth,
      });
      
      if (elev < MIN_ELEVATION) {
        const setTime = refineTime(t - step, t, lat, lon, altMeters, MIN_ELEVATION, 'set');
        const setLook = getLookAngles(lat, lon, altMeters, setTime) || lookAngles;
        
        passData.setTime = setTime;
        passData.setAzimuth = setLook.azimuth;
        passData.duration = (passData.setTime.getTime() - passData.riseTime.getTime()) / 1000;
        passData.visibility = calculateVisibility(passData, lat, lon);
        passData.direction = `${azimuthToCompass(passData.riseAzimuth)} → ${azimuthToCompass(passData.setAzimuth)}`;
        
        passes.push(passData);
        inPass = false;
        passData = null;
      }
    }
    
    t += step;
  }
  
  return passes;
}

function refineTime(tStart, tEnd, lat, lon, alt, threshold, type) {
  for (let i = 0; i < 12; i++) {
    const tMid = (tStart + tEnd) / 2;
    const la = getLookAngles(lat, lon, alt, new Date(tMid));
    if (!la) break;
    
    if (type === 'rise') {
      if (la.elevation >= threshold) {
        tEnd = tMid;
      } else {
        tStart = tMid;
      }
    } else {
      if (la.elevation >= threshold) {
        tStart = tMid;
      } else {
        tEnd = tMid;
      }
    }
  }
  return new Date(type === 'rise' ? tEnd : tStart);
}

function calculateVisibility(passData, lat, lon) {
  const checkTimes = [
    passData.riseTime,
    passData.maxElevationTime,
    passData.setTime,
  ].filter(Boolean);
  
  let darkCount = 0;
  let illumCount = 0;
  
  for (const time of checkTimes) {
    const issPos = getISSPosition(time);
    if (!issPos) continue;
    
    if (isObserverInDarkness(lat, lon, time)) {
      darkCount++;
    }
    if (isISSIlluminated(issPos.lat, issPos.lon, issPos.alt, time)) {
      illumCount++;
    }
  }
  
  const observerDark = darkCount >= 2;
  const issLit = illumCount >= 2;
  const maxElev = passData.maxElevation;
  
  if (!observerDark || !issLit) {
    return {
      rating: 'NOT VISIBLE',
      ratingClass: 'rating-not-visible',
      reason: !observerDark ? 'Daylight at observer location' : 'ISS in Earth shadow',
      observerDark,
      issIlluminated: issLit,
    };
  }
  
  let rating, ratingClass;
  if (maxElev >= 60 && passData.duration >= 180) {
    rating = 'EXCELLENT';
    ratingClass = 'rating-excellent';
  } else if (maxElev >= 35 && passData.duration >= 120) {
    rating = 'GOOD';
    ratingClass = 'rating-good';
  } else if (maxElev >= 20) {
    rating = 'FAIR';
    ratingClass = 'rating-fair';
  } else {
    rating = 'POOR';
    ratingClass = 'rating-poor';
  }
  
  return {
    rating,
    ratingClass,
    reason: `Max elevation ${maxElev.toFixed(0)}°, duration ${formatDuration(passData.duration)}`,
    observerDark,
    issIlluminated: issLit,
  };
}

export function azimuthToCompass(az) {
  az = ((az % 360) + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(az / 22.5) % 16;
  return dirs[index];
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
