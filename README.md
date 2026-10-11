# Intelligent Urban Traffic Management System

A local full-stack academic/demo project for managing traffic junctions, reviewing uploaded lane videos, simulating traffic, and recording incidents and emergency reports.

## Technology stack

- Frontend: React 18, Vite, React Router, Axios, Recharts, Leaflet
- Backend/API: Java 17, Spring Boot 3.3.5, Spring JDBC, Maven
- Database: MySQL 8+
- Video analysis: Python 3.11, Ultralytics YOLOv8, OpenCV, NumPy

## What the project does

- Dashboard: shows junction snapshots and latest traffic summaries.
- Junctions: view, add, update, and disable junctions.
- Signals: view and update demo signal settings and request a timing recommendation.
- Upload Videos: upload up to four lane clips, run vehicle detection, inspect annotated frames beside a three-lamp red/amber/green signal display, and view approximate class counts, peak visible counts, and a lane density chart. The highest-demand analyzed lane is recommended green, the next-highest lane with traffic is yellow as the next-phase candidate, and other lanes are red.
- Simulation: creates synthetic traffic samples for the dashboard and analytics.
- Emergency: record an emergency event, view a demo route, activate and complete the simulated priority event.
- Incidents: create and update incident reports.
- Analytics: review traffic samples, data sources, incidents, and junction summaries.

## Requirements on Windows

Install these before running the app:

1. Java 17 or newer.
2. Maven 3.8 or newer.
3. Node.js 18 or newer (includes npm).
4. MySQL Server 8, with a working local `root` password.
5. Python 3.11 (64-bit recommended). Python 3.11.9 is the final 3.11 release that has a Windows installer; later 3.11 security releases are source-only. Keep Python 3.15 installed if you use it too; the backend explicitly selects Python 3.11 on Windows.

## One-time setup

Open **Command Prompt** (CMD), not the MySQL Shell prompt. The commands below assume the project is extracted to:

```text
C:\Users\abhin\Documents\Codex\2026-10-09\al\outputs\traffic-system-complete-updated\traffic-system
```

If your project is in a different folder, replace that path in the commands.

### 1. Confirm Python 3.11

```cmd
py -3.11 --version
```

It should print `Python 3.11.9` or another 3.11 patch version. If it does not, use the Python 3.11.9 Windows installer and then open a new Command Prompt. Python.org release page: https://www.python.org/downloads/release/python-3119/ .

### 2. Install video-analysis packages

```cmd
cd /d "C:\Users\abhin\Documents\Codex\2026-10-09\al\outputs\traffic-system-complete-updated\traffic-system\backend"
```

```cmd
py -3.11 -m pip install -r ai\requirements.txt
```

This downloads the Python libraries used by the video analyzer. It can take several minutes because the vision framework is large. The YOLO model weights are downloaded on the first successful analysis.

### 3. Start MySQL

Open **Command Prompt as Administrator** and run:

```cmd
net start MySQL80
```

If the service is already running, continue. If `net` is not recognized, try:

```cmd
C:\Windows\System32\net.exe start MySQL80
```

The app connects to MySQL at `localhost:3306`, database `traffic_management`. The schema and demo junctions are initialized by Spring Boot at startup. Set the password to your own MySQL root password in the backend terminal; do not put it in this README or share it.

## Run the application (every time)

Keep the backend and frontend running in separate Command Prompt windows.

### A. Start the backend

Open a normal Command Prompt and run each command:

```cmd
cd /d "C:\Users\abhin\Documents\Codex\2026-10-09\al\outputs\traffic-system-complete-updated\traffic-system\backend"
```

```cmd
set "DB_USERNAME=root"
```

```cmd
set "DB_PASSWORD=your_actual_mysql_password"
```

Replace `your_actual_mysql_password` with your MySQL root password. This variable applies only to this Command Prompt window.

Start Spring Boot with Maven:

```cmd
mvn spring-boot:run
```

If CMD says `mvn` is not recognized, use the Maven location on your computer, for example:

```cmd
"C:\Users\abhin\Downloads\apache-maven-3.10.0\bin\mvn.cmd" spring-boot:run
```

Wait for the message that Spring Boot started, then leave this window open. The API base URL is `http://localhost:8000/api`; health check: `http://localhost:8000/api/health`.

### B. Start the frontend

Open a **second** normal Command Prompt:

```cmd
cd /d "C:\Users\abhin\Documents\Codex\2026-10-09\al\outputs\traffic-system-complete-updated\traffic-system\frontend"
```

Run this first time only, or whenever frontend dependencies have changed:

```cmd
npm install
```

Then start the web app:

```cmd
npm run dev
```

Leave the window open and visit the local URL printed by Vite, usually `http://localhost:5173`.

## Sign in

Demo accounts (local demo authentication):

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@traffic-system.example` | `Admin@12345` |
| Traffic operator | `operator@traffic-system.example` | `Operator@12345` |
| Emergency operator | `emergency@traffic-system.example` | `Emergency@12345` |

Use the traffic operator account to upload lane videos and manage traffic. Demo accounts are hard-coded for local evaluation; do not use them for a public deployment.

## Analyze lane videos

1. Make sure MySQL, the Spring Boot backend, and Vite frontend are all running.
2. Sign in as the administrator or traffic operator.
3. Open **Upload Videos** in the left navigation.
4. Choose a junction. Select one video per lane; Lane 1 is required and the other lanes are optional.
5. Supported extensions: MP4, AVI, MOV, MKV, MPEG, MPG, WEBM. Limit: 500 MB per clip.
6. Click **Upload and Start**. The first run may take longer while the YOLO model weights download.
7. Review each lane’s annotated frame, counts, density chart, and advisory.

Video uploads are processed locally by the Python worker started by Java. Temporary uploaded clips are removed after analysis. Saved analysis summaries and results are stored in MySQL.

## Interpretation and limitations

- YOLOv8 COCO classes include cars, buses, trucks, motorcycles, and bicycles. It does not include an ambulance class.
- Emergency-vehicle recognition is not implemented. The COCO model has no ambulance class; operators must review footage and report confirmed emergencies manually.
- At most 120 frames are sampled per uploaded clip. YOLO ByteTrack IDs are used for approximate unique counts when available; if IDs are unavailable, the peak visible count is used as a conservative fallback. Results can still miss or double-count vehicles.
- Current results do not establish exact vehicles crossing a stop line, measured waiting time, or a live CCTV feed.
- The red/amber/green lamp graphic shows an advisory based on detected peak traffic: highest demand green, next non-empty demand yellow, and remaining approaches red. On ties, input lane order is used. It does not change physical traffic lights or model safe conflict geometry, minimum green, amber clearance, pedestrian stages, or all-red clearance.
- The simulation generates synthetic values; it is separate from the measured video sample.
- Do not use these results to control real traffic or emergency response. Ensure you have permission to use videos, including Kaggle datasets.

## Configuration

Backend settings are read from environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_URL` | `jdbc:mysql://localhost:3306/traffic_management?...` | MySQL connection string |
| `DB_USERNAME` | `root` | MySQL login name |
| `DB_PASSWORD` | empty | MySQL login password |
| `SERVER_PORT` | `8000` | Spring Boot port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `AI_PYTHON` | Windows: `py -3.11`; other systems: `python3.11` | Optional Python executable override; on Windows it must be a single executable path if set |

Frontend API base URL is configured in `frontend/.env.example`; default is `http://localhost:8000/api`.

## Main API routes

All routes start with `/api`:

- `GET /health`
- `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`
- `GET/POST /junctions`, `GET/PUT/DELETE /junctions/{id}`
- `GET /signals`, `PUT /signals/{id}`, `POST /signals/junctions/{id}/optimize`
- `GET /traffic/live`, `GET /traffic/history`, `POST /traffic/simulate/{id}`, `POST /traffic/simulate-all`
- `POST /traffic/junctions/{id}/lanes/upload`, `GET /traffic/junctions/{id}/lanes/latest`
- `GET/POST /incidents`, `PUT /incidents/{id}`
- `GET/POST /emergency/events`, `GET /emergency/events/{id}/route`, `POST /emergency/{id}/activate`, `POST /emergency/{id}/complete`
- `GET /analytics`

## Troubleshooting

### `py -3.11` says no matching runtime

Run `py -0p` to list installed Python versions. Confirm the Python 3.11 Windows installer was run (downloading a `.tar.xz` source archive is not an installation). Open a new CMD after installing, then retry `py -3.11 --version`.

### Video analysis says to install Python or requirements

In the backend folder, run `py -3.11 -m pip install -r ai\requirements.txt`. Confirm pip finishes successfully, stop Spring Boot with Ctrl+C, and start it again. On Windows the backend invokes `py -3.11` directly to avoid accidentally using Python 3.15.

### Maven or Vite is not recognized

Maven: use the full path to `mvn.cmd` shown above, or add Maven’s `bin` folder to PATH. Vite: first run `npm install` from `frontend`, then `npm run dev`.

### Cannot connect to MySQL

Start the `MySQL80` service, verify that MySQL listens on port `3306`, then set `DB_USERNAME` and `DB_PASSWORD` in the same CMD window before starting Spring Boot. Do not post your password in screenshots or chat.

### Port already in use

Close the old backend/frontend terminal or change `SERVER_PORT` for the backend. Vite will offer a different port if 5173 is occupied; update `CORS_ORIGIN` to match if needed.

## Project folders

```text
backend/                  Spring Boot API and database schema
backend/ai/               Python YOLO video-analysis worker and dependencies
frontend/                 React/Vite web application
README.md                 This setup and project guide
```

## Security and production notes

This is a local academic/demo application, not a production traffic-control platform. Authentication uses in-memory demo sessions and hard-coded sample credentials. Configure secure identity, secret management, database migrations, upload scanning and storage policies, monitoring, and real sensor integrations before any public deployment. This software does not control physical traffic lights.

