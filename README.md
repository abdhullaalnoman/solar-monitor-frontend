# Solar Monitor Frontend

React + Vite + Tailwind + Firebase Auth + Chart.js

## Run
    npm install
    npm run dev        # http://localhost:5173
    npm run build      # production build -> dist/

Backend API must be running at http://localhost:3200 (change in src/config/config.js)
and must allow CORS from the frontend origin (http://localhost:5173).

## Pages
- Login (same Firebase users as SA monitor: power / admin)
- Sites table  <- GET /api/dashboard/summary
- Site dashboard (click a row) <- /api/dashboard/:code/summary, power-24h, daily, monthly
- Admin (Solar Admin button)  <- /api/solar CRUD
