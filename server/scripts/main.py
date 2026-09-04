from skyfield.api import load, EarthSatellite

line1 = "1 25544U 98067A   26246.17593850  .00004078  00000+0  82215-4 0  9998"
line2 = "2 25544  51.6312 274.0958 0005015 102.3118 257.8432 15.48977273583844"

satellite = EarthSatellite(line1, line2, "ISS (ZARYA)")

ts = load.timescale()
t = ts.now()

geocentric = satellite.at(t)
subpoint = geocentric.subpoint()

print("Current ISS position:")
print("Latitude:", subpoint.latitude)
print("Longitude:", subpoint.longitude)
print("Altitude (km):", subpoint.elevation.km)
