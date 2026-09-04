import requests

url = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE"

response = requests.get(url)

print("Status code:", response.status_code)
print("Raw response:")
print(response.text)
