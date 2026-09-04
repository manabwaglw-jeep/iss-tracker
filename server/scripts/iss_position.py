from skyfield.api import load, EarthSatellite, wgs84

line1 = "1 25544U 98067A   26246.17593850  .00004078  00000+0  82215-4 0  9998"
line2 = "2 25544  51.6312 274.0958 0005015 102.3118 257.8432 15.48977273583844"

satellite = EarthSatellite(line1, line2, "ISS (ZARYA)")
observer = wgs84.latlon(27.7172, 85.3240)

ts = load.timescale()
now = ts.now()
end_time = ts.tt_jd(now.tt + 2)

t, events = satellite.find_events(observer, now, end_time, altitude_degrees=10.0)
event_names = ["rise above 10°", "culminate (peak)", "set below 10°"]

if len(t) == 0:
    print("No passes found in the next 2 days above 10 degrees altitude.")
else:
    print("Upcoming ISS passes:")
    for ti, event in zip(t, events):
        name = event_names[event]
        print(f"{ti.utc_strftime('%Y-%m-%d %H:%M:%S')} UTC  -  {name}")
