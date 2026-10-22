# DroneOps – Centralized Drone Operations Management Web App

## Updated database
This version uses **MongoDB** instead of PostgreSQL.

## Technology stack
- React + TypeScript – frontend
- Node.js + Express.js – backend
- REST API – frontend/backend communication
- MongoDB – database
- Redis – caching
- OpenStreetMap Nominatim – location search/geocoding
- Docker + Docker Compose – containerization
- Git/GitHub – version control

## Web app visualization
The application opens in a browser at `http://localhost:5173` and has a professional dark operations-dashboard style with:
- Dashboard KPI cards
- Live/simulated fleet map
- Drone fleet table and battery bars
- Mission management and progress
- Mission Planner with location search
- Flight schedule
- Operators
- Battery monitoring
- Maintenance
- Alerts and resolve actions
- Analytics charts
- Activity logs and settings

## Run
From the `droneops` folder:

```cmd
docker compose up --build
```

Open `http://localhost:5173`.

Backend health: `http://localhost:4000/health`

Stop:

```cmd
docker compose down
```

Run again:

```cmd
docker compose up
```

Use `docker compose up --build` after changing dependencies/Dockerfiles.

## Location API
Mission Planner calls the backend endpoint:

`GET /api/geocode?q=Chennai`

The backend uses OpenStreetMap Nominatim and returns latitude/longitude.

## MongoDB collections
- drones
- operators
- missions
- alerts
- maintenance

Live demo data is persisted in MongoDB, so it remains after a normal container restart while the Docker volume is kept.
