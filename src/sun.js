/**
 * Sun position calculations for ISS visibility.
 * Approximations suitable for pass visibility estimation.
 */
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const EARTH_R = 6371;

function julianDate(date) { return date.getTime() / 86400000 + 2440587.5; }

export function getSunPosition(date) {
  const n = julianDate(date) - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const eps = 23.439 * D2R;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * R2D;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * R2D;
  return { declination: dec, rightAscension: ra };
}

export function getSunAltitude(lat, lon, date) {
  const sun = getSunPosition(date);
  const latR = lat * D2R, decR = sun.declination * D2R;
  const n = julianDate(date) - 2451545.0;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const ha = ((gmst + lon) % 360 - sun.rightAscension) * D2R;
  return Math.asin(Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(ha)) * R2D;
}

export function isObserverInDarkness(lat, lon, date) {
  return getSunAltitude(lat, lon, date) < -6; // Civil twilight
}

export function isISSIlluminated(issLat, issLon, issAlt, date) {
  const sun = getSunPosition(date);
  const issR = EARTH_R + issAlt;
  const iLatR = issLat * D2R, iLonR = issLon * D2R;
  const ix = Math.cos(iLatR) * Math.cos(iLonR);
  const iy = Math.cos(iLatR) * Math.sin(iLonR);
  const iz = Math.sin(iLatR);

  const n = julianDate(date) - 2451545.0;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const sLon = (sun.rightAscension - gmst) * D2R;
  const sLat = sun.declination * D2R;
  const sx = Math.cos(sLat) * Math.cos(sLon);
  const sy = Math.cos(sLat) * Math.sin(sLon);
  const sz = Math.sin(sLat);

  const dot = ix * sx + iy * sy + iz * sz;
  if (dot > 0) return true;

  const earthAngR = Math.asin(EARTH_R / issR);
  const antiDot = -dot;
  const angle = Math.acos(Math.min(1, Math.max(-1, antiDot)));
  return angle > earthAngR;
}
