# 🛰️ ISS Tracker

A real-time web-based **International Space Station (ISS) tracker** that allows users to explore the current position of the ISS and determine when it may be visible from their location.

## 🌍 About the Project

**ISS Tracker** is an interactive satellite-tracking website designed to make tracking the International Space Station simple and visual.

Users can provide their **latitude and longitude**, and the system can use that location to determine the ISS's position and visibility information.

The project combines a modern web interface with real-time orbital and location data to create an interactive space-tracking experience.

## ✨ Features

* 🛰️ Real-time ISS position tracking
* 🌍 Interactive Earth/space visualization
* 📍 Location input using latitude and longitude
* 🔭 ISS visibility information
* 📅 Upcoming ISS viewing opportunities
* ⏱️ Orbital tracking and timing information
* 📊 Satellite/orbital data display
* 💻 Responsive web interface
* 🚀 Sci-fi / space-themed UI

## 🛠️ Technologies Used

### Frontend

* HTML5
* CSS3
* JavaScript
* WebGL / 3D visualization *(if used in the current version)*

### Backend

* Python
* Flask *(if used in the current version)*

### Data & APIs

* ISS orbital/satellite data APIs
* Geolocation data
* Astronomical calculations

## 📁 Project Structure

```text
iss-tracker/
│
├── server/
│   ├── app.py
│   └── ...
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── ...
│
├── .gitignore
├── README.md
└── ...
```

> The exact structure may change as the project develops.

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/manabwaglw-jeep/iss-tracker.git
```

### 2. Enter the project directory

```bash
cd iss-tracker
```

### 3. Install dependencies

If the project uses Python:

```bash
pip install -r requirements.txt
```

### 4. Start the server

```bash
python server/app.py
```

Then open the local address shown by the server in your browser.

## 📍 How It Works

1. Enter your **latitude and longitude**.
2. The application identifies your observation location.
3. The system retrieves current ISS orbital information.
4. The ISS position is calculated/updated in real time.
5. The application determines when the ISS may be visible from your location.
6. The results are presented through the interactive space-tracking interface.

## 🔭 Future Improvements

* 🌌 Track additional satellites
* 🗺️ Ground-track visualization
* 🌅 Sunrise and sunset calculations
* ☁️ Weather conditions during ISS passes
* 🔔 Visibility notifications
* 📱 Improved mobile experience
* 🌎 More detailed 3D Earth
* 🛰️ Support for multiple satellites
* 📡 More advanced orbital prediction
* 🎥 Live ISS camera integration

## 🎯 Goal

The goal of this project is to build an accessible and visually engaging platform for learning about **satellite tracking, orbital mechanics, astronomy, and real-time geospatial data**.

## ⚠️ Disclaimer

ISS visibility predictions depend on orbital data, observer location, time, weather conditions, and other environmental factors. Predictions should be treated as estimates rather than guarantees.

## 👨‍💻 Author

**Manab Wagle**

Computer Engineering Student

---

⭐ If you find this project interesting, consider giving the repository a star!

## 📜 License

This project is intended for educational and experimental purposes.
