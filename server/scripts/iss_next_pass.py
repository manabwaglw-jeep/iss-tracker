from skyfield.api import load, EarthSatellite, wgs84

line1 = "1 25544U 98067A   26246.17593850  .00004078  00000+0  82215-4 0  9998"
line2 = "2 25544  51.6312 274.0958 0005015 102.3118 257.8432 15.48977273583844"

satellite = EarthSatellite(line1, line2, "ISS (ZARYA)")
observer = wgs84.latlon(27.7172, 85.3240)

ts = load.timescale()
t = ts.now()

difference = satellite - observer
topocentric = difference.at(t)

alt, az, distance = topocentric.altaz()

print("As seen from your location right now:")
print("Altitude:", alt)
print("Azimuth:", az)
print("Distance (km):", distance.km)

if alt.degrees > 0:
    print("=> The ISS is currently ABOVE your horizon (potentially visible)")
else:
    print("=> The ISS is currently BELOW your horizon (not visible)")
