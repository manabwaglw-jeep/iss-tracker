import os
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from skyfield.api import load, EarthSatellite, wgs84
from datetime import datetime, timezone, timedelta

app = Flask(__name__)
CORS(app)  # Allow frontend on Vite (localhost:5173) to connect

# Cache TLE
tle_cache = {
    "line1": None,
    "line2": None,
    "fetched_at": 0
}

FALLBACK_LINE1 = "1 25544U 98067A   26246.17593850  .00004078  00000+0  82215-4 0  9998"
FALLBACK_LINE2 = "2 25544  51.6312 274.0958 0005015 102.3118 257.8432 15.48977273583844"

ts = load.timescale()

def get_satellite():
    global tle_cache
    now_ts = datetime.now(timezone.utc).timestamp()
    
    # Refresh TLE every 30 minutes
    if not tle_cache["line1"] or (now_ts - tle_cache["fetched_at"] > 1800):
        try:
            url = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE"
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                lines = [l.strip() for l in resp.text.strip().splitlines() if l.strip()]
                l1 = next((l for l in lines if l.startswith("1 ")), None)
                l2 = next((l for l in lines if l.startswith("2 ")), None)
                if l1 and l2:
                    tle_cache["line1"] = l1
                    tle_cache["line2"] = l2
                    tle_cache["fetched_at"] = now_ts
        except Exception as e:
            print("TLE fetch error, using fallback/cached:", e)
            if not tle_cache["line1"]:
                tle_cache["line1"] = FALLBACK_LINE1
                tle_cache["line2"] = FALLBACK_LINE2
                tle_cache["fetched_at"] = now_ts

    line1 = tle_cache["line1"] or FALLBACK_LINE1
    line2 = tle_cache["line2"] or FALLBACK_LINE2
    return EarthSatellite(line1, line2, "ISS (ZARYA)"), line1, line2

@app.route("/api/tle", methods=["GET"])
def api_tle():
    sat, l1, l2 = get_satellite()
    return jsonify({
        "line1": l1,
        "line2": l2,
        "name": sat.name,
        "updated": datetime.fromtimestamp(tle_cache["fetched_at"], timezone.utc).isoformat()
    })

@app.route("/api/position", methods=["GET"])
def api_position():
    sat, _, _ = get_satellite()
    t = ts.now()
    geocentric = sat.at(t)
    subpoint = geocentric.subpoint()
    
    # Velocity magnitude km/s
    vel = geocentric.velocity.km_per_s
    vel_km_h = (vel[0]**2 + vel[1]**2 + vel[2]**2)**0.5 * 3600

    return jsonify({
        "latitude": subpoint.latitude.degrees,
        "longitude": subpoint.longitude.degrees,
        "altitude": subpoint.elevation.km,
        "velocity": vel_km_h,
        "time": t.utc_iso()
    })

@app.route("/api/observer", methods=["GET"])
def api_observer():
    lat = float(request.args.get("lat", 27.7172))
    lon = float(request.args.get("lon", 85.3240))
    alt_m = float(request.args.get("alt", 0.0))

    sat, _, _ = get_satellite()
    observer = wgs84.latlon(lat, lon, elevation_m=alt_m)
    t = ts.now()
    topocentric = (sat - observer).at(t)
    alt, az, distance = topocentric.altaz()

    return jsonify({
        "altitude_deg": alt.degrees,
        "azimuth_deg": az.degrees,
        "distance_km": distance.km,
        "is_above_horizon": bool(alt.degrees > 0)
    })

@app.route("/api/passes", methods=["GET"])
def api_passes():
    lat = float(request.args.get("lat", 27.7172))
    lon = float(request.args.get("lon", 85.3240))
    days = float(request.args.get("days", 3.0))
    min_elev = float(request.args.get("min_elev", 10.0))

    sat, _, _ = get_satellite()
    observer = wgs84.latlon(lat, lon)
    now = ts.now()
    end_time = ts.tt_jd(now.tt + days)

    t_events, events = sat.find_events(observer, now, end_time, altitude_degrees=min_elev)

    # Pair events into pass groups: rise(0) -> culminate(1) -> set(2)
    passes = []
    current_pass = {}

    for ti, event in zip(t_events, events):
        if event == 0:  # Rise
            topocentric = (sat - observer).at(ti)
            _, az, _ = topocentric.altaz()
            current_pass = {
                "riseTime": ti.utc_datetime().isoformat(),
                "riseAzimuth": az.degrees,
            }
        elif event == 1 and "riseTime" in current_pass:  # Culminate / Peak
            topocentric = (sat - observer).at(ti)
            alt, az, _ = topocentric.altaz()
            current_pass["maxElevation"] = alt.degrees
            current_pass["maxElevationTime"] = ti.utc_datetime().isoformat()
            current_pass["maxAzimuth"] = az.degrees
        elif event == 2 and "riseTime" in current_pass:  # Set
            topocentric = (sat - observer).at(ti)
            _, az, _ = topocentric.altaz()
            current_pass["setTime"] = ti.utc_datetime().isoformat()
            current_pass["setAzimuth"] = az.degrees
            
            # Duration in seconds
            rise_dt = datetime.fromisoformat(current_pass["riseTime"])
            set_dt = datetime.fromisoformat(current_pass["setTime"])
            duration_s = (set_dt - rise_dt).total_seconds()
            current_pass["duration"] = duration_s

            max_elev = current_pass.get("maxElevation", min_elev)
            # Visibility rating
            if max_elev >= 60 and duration_s >= 180:
                rating = "EXCELLENT"
                rclass = "rating-excellent"
            elif max_elev >= 35 and duration_s >= 120:
                rating = "GOOD"
                rclass = "rating-good"
            elif max_elev >= 20:
                rating = "FAIR"
                rclass = "rating-fair"
            else:
                rating = "POOR"
                rclass = "rating-poor"

            current_pass["visibility"] = {
                "rating": rating,
                "ratingClass": rclass,
                "reason": f"Max elevation {max_elev:.0f}°, duration {int(duration_s//60)}m {int(duration_s%60)}s"
            }
            passes.append(current_pass)
            current_pass = {}

    return jsonify({"passes": passes})

if __name__ == "__main__":
    print("Starting ISS Skyfield Backend on http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
