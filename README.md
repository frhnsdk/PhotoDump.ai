# 📸 PhotoDump

**Drop & Share Every Memory** — A self-hosted, private photo sharing platform where you create password-protected "dumps" for events, share the link, and let guests browse, download, and contribute their own photos.

![PhotoDump Landing Page](photos/image1.png)
![PhotoDump Preview](photos/image2.png)

> **Portfolio Note:** This project demonstrates my ability to design and deploy **multi-container, multi-server architectures** using **Docker** and **Docker Compose** — including cross-host HTTP communication between independent services, GPU resource management, persistent volume orchestration, and graceful degradation when optional services are unavailable.

---

## ✨ Features

### 🔐 Authentication & Access Control
- **User Registration & Login** — JWT-based auth with bcrypt-hashed passwords
- **Password-Protected Dumps** — Every dump is locked behind its own access password
- **Dump Access Tokens** — Guests get scoped tokens that only unlock specific dumps

![Sign Up](photos/signUp.png)
![Log In](photos/LogIn.png)
![Access Dump with Password](photos/AccessDumpIDPass.png)

### 🗂️ Dump Management (Owner)
- **Create Dumps** — Name, description, access password, optional expiry, and custom background color
- **Dashboard** — View all your dumps at a glance with photo counts and sizes
- **Upload Photos** — Drag-and-drop or browse, with batch upload support
- **Approve Contributions** — Review and approve/reject photos submitted by guests
- **Delete Dumps** — Nuke everything including all photos with a single click
- **Share Info** — One-click copy of dump name and access URL to share with guests
- **Settings** — Customize the gallery background color with a full color wheel

![Create a Dump](photos/CreateADumpOptions.png)
![Owner Dashboard](photos/DumpOwnerDashboard.png)
![Upload Photos](photos/UploadPhotosSectionInDump.png)
![Dump Settings — Color Picker](photos/SettingsSectionInDump.png)

### 🖼️ Gallery & Viewing (Guest + Owner)
- **Pinterest-Style Masonry Layout** — Photos displayed in a beautiful multi-column layout with natural aspect ratios
- **Custom Background Color** — Each dump's gallery area uses the owner's chosen color
- **Lightbox Viewer** — Full-screen preview with keyboard navigation (← → Esc)
- **Select & Download** — Pick individual photos or download everything as a ZIP
- **Responsive Grid** — Adapts from 4 columns on desktop down to 1 on mobile

![Guest Gallery View](photos/GuestGalarySection.png)
![Owner Gallery View](photos/GalarySectionInDump.png)

### 🤝 Guest Contributions
- **Contribute Photos** — Guests can upload their own shots to any dump they have access to
- **Contributor Tags** — Each photo shows who uploaded it
- **Pending Approval** — Owner reviews guest photos before they appear in the gallery

![Guest Contribute Section](photos/GuestContributeSection.png)

### 🧠 AI Face Recognition (Phase 2)
- **Find My Photos** — Guests upload a selfie and instantly see every photo they appear in
- **DeepFace + Facenet512** — 512-dimensional face embeddings with RetinaFace detection
- **100% Local** — No cloud APIs; all model weights baked into the Docker image at build time
- **GPU Microservice** — Runs on a separate server (or same machine), portable to any host
- **Auto-Indexing** — Faces are automatically extracted when photos are uploaded
- **Manual Indexing** — Owners can trigger full re-index from the Settings tab
- **Batch Download** — One-click ZIP download of all matched photos
- **Graceful Degradation** — When the GPU server is down, the UI shows "GPU server is not up right now" and all other features continue working

### ⚙️ Under the Hood
- **Thumbnail Generation** — Auto-generated via Pillow with aspect-ratio preservation
- **Auto-Expiry Cleanup** — Background scheduler (APScheduler) removes expired dumps hourly
- **Docker-Ready** — Multi-container setup (app + PostgreSQL + optional GPU service) with persistent volumes
- **No-Cache Static Middleware** — Ensures CSS/JS updates are always served fresh

---

## 🏗️ Architecture

```
PhotoDump/
├── docker-compose.yml          # App + PostgreSQL (multi-server GPU setup)
├── docker-compose-full.yml     # App + PostgreSQL + GPU service (single server)
├── Dockerfile                  # Multi-stage build (Python 3.12-slim)
├── .env.example                # Environment configuration template
├── backend/
│   ├── main.py                 # FastAPI app, middleware, static serving
│   ├── models.py               # SQLAlchemy ORM — User, Dump, Photo, FaceEmbedding
│   ├── schemas.py              # Pydantic validation schemas
│   ├── database.py             # DB engine & session factory
│   ├── auth_utils.py           # JWT + bcrypt helpers
│   ├── gpu_client.py           # HTTP client for GPU face-recognition service
│   ├── requirements.txt        # Python dependencies
│   └── routers/
│       ├── auth.py             # /api/auth/* — register, login, me
│       ├── dumps.py            # /api/dumps/* — CRUD, access, share
│       ├── photos.py           # /api/dumps/*/photos/* — upload, serve, download
│       └── faces.py            # /api/gpu/*, /api/dumps/*/index-faces, find-my-photos
├── gpu-service/                # Standalone GPU microservice (deploy anywhere)
│   ├── main.py                 # FastAPI: /health, /extract-embeddings, /find-matches
│   ├── Dockerfile              # Pre-downloads model weights at build time
│   ├── docker-compose.yml      # Standalone deploy for GPU server
│   └── requirements.txt        # DeepFace + dependencies
├── frontend/
│   ├── index.html              # Landing page
│   ├── login.html / register.html
│   ├── dashboard.html          # Owner dashboard
│   ├── create-dump.html        # New dump form
│   ├── manage-dump.html        # Owner view — upload, gallery, pending, settings, face AI
│   ├── view-dump.html          # Guest view — gallery, contribute, find photos
│   ├── access-dump.html        # Enter dump name + password
│   ├── find-photos.html        # Face search — upload selfie, view matches
│   ├── css/main.css            # All styles (dark theme, Pinterest grid, face search)
│   └── js/
│       ├── api.js              # API client, auth helpers, image loader
│       ├── dashboard.js        # Dashboard logic
│       ├── create-dump.js      # Create dump form
│       ├── manage-dump.js      # Owner dump management + face indexing
│       ├── view-dump.js        # Guest dump viewing + find photos link
│       ├── find-photos.js      # Face search: selfie upload → results
│       └── icons.js            # SVG icon helpers
└── photos/                     # Screenshots for this README
```

### System Architecture

```
┌──── Server A (192.168.0.210) ─────────────────────────────────┐
│                                                                │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐   │
│  │  PhotoDump   │    │  PostgreSQL  │    │  Photo         │   │
│  │  App         │◄──►│  Database    │    │  Storage       │   │
│  │  (port 8000) │    │  (internal)  │    │  (volume)      │   │
│  └──────┬───────┘    └──────────────┘    └────────────────┘   │
│         │  HTTP (GPU_SERVICE_URL)                              │
└─────────┼─────────────────────────────────────────────────────┘
          │
          ▼
┌──── Server B (192.168.0.106) ─────┐
│                                    │
│  ┌──────────────────────────────┐  │
│  │  GPU Face Recognition        │  │
│  │  Service (port 5050)         │  │
│  │  DeepFace + Facenet512       │  │
│  │  100% Offline                │  │
│  └──────────────────────────────┘  │
│                                    │
└────────────────────────────────────┘
```

> In single-server mode, all containers run on the same machine using `docker-compose-full.yml`.

### Two-Server Communication Flow

The app server and GPU server are fully independent Docker deployments that communicate over HTTP. Here's how they interact during the two core AI operations:

```
── Photo Upload (Face Indexing) ──────────────────────────────────────────────

  User                  Server A (App)                 Server B (GPU)
   │                        │                              │
   │  POST /photos          │                              │
   │───────────────────────►│                              │
   │                        │  save photo + thumbnail      │
   │                        │──────┐                       │
   │                        │◄─────┘                       │
   │  ✅ 200 OK             │                              │
   │◄───────────────────────│                              │
   │                        │                              │
   │                        │  POST /extract-embeddings    │
   │                        │  (sends photo bytes)         │
   │                        │─────────────────────────────►│
   │                        │                              │  RetinaFace detects faces
   │                        │                              │  Facenet512 → 512-dim vectors
   │                        │    [{embedding, bbox}, ...]  │
   │                        │◄─────────────────────────────│
   │                        │                              │
   │                        │  store embeddings in         │
   │                        │  PostgreSQL                  │
   │                        │──────┐                       │
   │                        │◄─────┘                       │

── "Find My Photos" (Face Search) ───────────────────────────────────────────

  Guest                 Server A (App)                 Server B (GPU)
   │                        │                              │
   │  POST /find-my-photos  │                              │
   │  (selfie upload)       │                              │
   │───────────────────────►│                              │
   │                        │  POST /extract-embeddings    │
   │                        │  (sends selfie bytes)        │
   │                        │─────────────────────────────►│
   │                        │                              │  extract probe embedding
   │                        │    [{embedding, bbox}]       │
   │                        │◄─────────────────────────────│
   │                        │                              │
   │                        │  POST /find-matches          │
   │                        │  {probe, candidates[]}       │
   │                        │─────────────────────────────►│
   │                        │                              │  cosine similarity
   │                        │                              │  threshold ≤ 0.35
   │                        │    [matching indices]        │
   │                        │◄─────────────────────────────│
   │                        │                              │
   │  matched photo list    │                              │
   │◄───────────────────────│                              │
```

**Key design decisions for multi-server operation:**

| Aspect | Implementation |
|---|---|
| **Service Discovery** | `GPU_SERVICE_URL` env var — point to any host (e.g. `http://192.168.0.106:5050`) |
| **Communication** | Plain HTTP + JSON over the local network; no message queue needed |
| **Data Transfer** | Photo bytes sent as multipart form data; embeddings returned as JSON arrays |
| **Fault Tolerance** | App checks `/health` before GPU calls; UI degrades gracefully if GPU is offline |
| **Deployment Flexibility** | Same GPU service image runs anywhere — laptop, dedicated GPU server, or cloud VM |
| **Docker Networking** | Single-server mode uses Compose internal DNS (`http://gpu-service:5050`); multi-server uses host IPs |

**Services:**

| Container | Image | Purpose |
|---|---|---|
| `photodump-app-1` | `python:3.12-slim` | FastAPI + Uvicorn serving API & frontend |
| `photodump-db-1` | `postgres:16-alpine` | PostgreSQL database |
| `gpu-service` | `python:3.12-slim` + DeepFace | Face detection & embedding extraction (optional) |

**Persistent Volumes:**

| Volume | Mount | Stores |
|---|---|---|
| `pg_data` | `/var/lib/postgresql/data` | Database files |
| `photodumpstorage` | `/app/data` | Uploaded photos & generated thumbnails |
| `model_cache` | `/app/models` (GPU service) | DeepFace model weights (Facenet512 + RetinaFace) |

---

## 🚀 How to Run

### Prerequisites

- **Docker Desktop** installed and running
  - [Download for Windows](https://docs.docker.com/desktop/install/windows-install/)
  - [Download for macOS](https://docs.docker.com/desktop/install/mac-install/)
  - [Download for Linux](https://docs.docker.com/desktop/install/linux/)
- **Git** (to clone the repo)

### Step 1 — Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/PhotoDump.git
cd PhotoDump
```

### Step 2 — Configure Environment

Copy the example env file and edit it:

```bash
cp .env.example .env
```

Key settings in `.env`:

```env
# Database
DB_NAME=photodump
DB_USER=photodump
DB_PASS=change_this_db_password

# Security — CHANGE THIS to a long random string
SECRET_KEY=change_this_secret_in_production

# GPU Service — see Setup A or B below
GPU_SERVICE_URL=
```

> **For production:** Always change `SECRET_KEY` to a long random string and use a strong `DB_PASS`.
> Generate one: `python -c "import secrets; print(secrets.token_hex(32))"`

---

### Setup A — Single Server (Everything on One Machine)

This runs the app, database, **and** GPU face recognition service all on one machine. Simplest way to get started.

```bash
docker compose -f docker-compose-full.yml up -d --build
```

That's it! The GPU service URL is automatically set to `http://gpu-service:5050` inside the compose network.

> **Note:** The first build takes a while (~5-10 min) because it downloads the Facenet512 + RetinaFace model weights (~200MB) and bakes them into the image. Subsequent builds use the Docker cache.

> **GPU acceleration (optional):** If you have an NVIDIA GPU, install [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) on the host, then uncomment the `deploy` section in `docker-compose-full.yml` under `gpu-service`. Without a GPU it runs on CPU (slower but works fine).

### Setup B — Multi-Server (GPU on a Separate Machine)

For better performance, run the GPU service on a dedicated machine (ideally with a GPU) and the main app elsewhere.

#### On the GPU Server (e.g. 192.168.0.106)

1. Copy the `gpu-service/` folder to the GPU machine:
   ```bash
   scp -r gpu-service/ user@192.168.0.106:~/gpu-service/
   ```

2. SSH in and start it:
   ```bash
   ssh user@192.168.0.106
   cd gpu-service
   docker compose up -d --build
   ```

3. Verify it's running:
   ```bash
   curl http://localhost:5050/health
   # → {"status":"ok","model":"Facenet512","detector":"retinaface","mode":"local"}
   ```

#### On the App Server (e.g. 192.168.0.210)

1. Edit `.env` to point to the GPU server:
   ```env
   GPU_SERVICE_URL=http://192.168.0.106:5050
   ```

2. Start the app:
   ```bash
   docker compose up -d --build
   ```

### Setup C — No Face Recognition (App Only)

If you don't need AI face search, just leave `GPU_SERVICE_URL` empty in `.env`:

```env
GPU_SERVICE_URL=
```

```bash
docker compose up -d --build
```

The app works normally — the "Find My Photos" button will show "GPU server is not up right now" and all other features work perfectly.

---

### Open the App

```
http://localhost:8000
```

Register an account, create a dump, and start uploading!

### Stopping

```bash
# Single server
docker compose -f docker-compose-full.yml down

# Multi-server (run on each machine)
docker compose down
```

> Your photos and database are saved in Docker volumes and persist across restarts.

### Full Reset (Deletes Everything)

```bash
docker compose -f docker-compose-full.yml down -v
```

> The `-v` flag removes volumes — all uploaded photos, database data, and model cache will be permanently deleted.

---

## 🔧 Running Without Docker (Development)

If you prefer running directly on your machine:

### Prerequisites
- **Python 3.12+**
- **PostgreSQL 16+** running locally

### Setup

```bash
# 1. Install Python dependencies
cd backend
pip install -r requirements.txt

# 2. Set environment variables (PowerShell)
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
$env:DB_NAME = "photodump"
$env:DB_USER = "photodump"
$env:DB_PASS = "photodump"
$env:SECRET_KEY = "dev-secret-key"
$env:DATA_DIR = "../data"
$env:FRONTEND_DIR = "../frontend"

# 3. Create the database
psql -U postgres -c "CREATE DATABASE photodump;"
psql -U postgres -c "CREATE USER photodump WITH PASSWORD 'photodump';"
psql -U postgres -c "GRANT ALL ON DATABASE photodump TO photodump;"

# 4. Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

For **bash/zsh** (Linux/macOS), use `export` instead of `$env:`:
```bash
export DB_HOST=localhost
export DB_PORT=5432
# ... etc.
```

---

## 🧪 Running Tests

A PowerShell integration test script is included:

```powershell
.\test.ps1
```

This hits every API endpoint (register → login → create dump → upload → download → delete) and reports pass/fail.

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/auth/me` | Get current user info |

### Dumps
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/dumps/` | Create a new dump |
| `GET` | `/api/dumps/` | List your dumps |
| `POST` | `/api/dumps/access` | Get access token for a dump |
| `GET` | `/api/dumps/{name}` | Get dump details |
| `PATCH` | `/api/dumps/{name}` | Update dump settings (e.g. background color) |
| `DELETE` | `/api/dumps/{name}` | Delete dump and all photos |

### Photos
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/dumps/{name}/photos` | Upload photos (multipart) |
| `GET` | `/api/dumps/{name}/photos` | List photos in a dump |
| `GET` | `/api/dumps/{name}/photos/{id}/file` | Serve full image |
| `GET` | `/api/dumps/{name}/photos/{id}/thumb` | Serve thumbnail |
| `GET` | `/api/dumps/{name}/photos/{id}/download` | Download single photo |
| `GET` | `/api/dumps/{name}/download-all` | Download all as ZIP (supports `?ids=` filter) |
| `DELETE` | `/api/dumps/{name}/photos/{id}` | Delete a photo |
| `PATCH` | `/api/dumps/{name}/photos/{id}/approve` | Approve a contributed photo |

### Face Recognition (GPU)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/gpu/status` | Check GPU service availability |
| `POST` | `/api/dumps/{name}/index-faces` | Index all unindexed photos for face embeddings |
| `POST` | `/api/dumps/{name}/find-my-photos` | Upload selfie → find matching photos (multipart) |

### GPU Microservice (internal, port 5050)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check + model info |
| `POST` | `/extract-embeddings` | Upload image → get face embeddings + bounding boxes |
| `POST` | `/find-matches` | Probe embedding + candidates → matching indices |

---

## 🧠 How Face Recognition Works

```
                         ┌─────────────────────────┐
  1. Upload photos ────► │  PhotoDump App           │
                         │  (auto-indexes faces     │
                         │   in background)          │
                         └──────────┬──────────────┘
                                    │ HTTP POST /extract-embeddings
                                    ▼
                         ┌─────────────────────────┐
                         │  GPU Service             │
                         │  DeepFace + Facenet512   │
                         │  RetinaFace detector     │
                         └──────────┬──────────────┘
                                    │ returns 512-dim embeddings
                                    ▼
                         ┌─────────────────────────┐
                         │  PostgreSQL              │
                         │  face_embeddings table   │
                         │  (JSON column, 512 floats│
                         │   per face + bbox)       │
                         └──────────┬──────────────┘
                                    │
  2. Guest uploads selfie ────────► │ cosine similarity search
                                    │ threshold ≤ 0.35
                                    ▼
                         ┌─────────────────────────┐
                         │  Matched Photos          │
                         │  Filtered gallery +      │
                         │  one-click ZIP download  │
                         └─────────────────────────┘
```

### Face Embeddings Table

```
face_embeddings
├── id              (PK, auto-increment)
├── photo_id        (FK → photos, CASCADE delete)
├── dump_id         (FK → dumps, CASCADE delete)
├── embedding       (JSON — list of 512 floats)
├── bbox_x, y, w, h (face bounding box in pixels)
└── created_at
```

### Key Technical Decisions

| Decision | Choice | Why |
|---|---|---|
| **ML Model** | DeepFace + Facenet512 | Best accuracy/speed tradeoff, 512-dim embeddings |
| **Detector** | RetinaFace | Accurate multi-face detection, handles angles well |
| **Vector Storage** | PostgreSQL JSON column | No extra dependencies (pgvector), works for dumps up to ~10K photos |
| **Distance Metric** | Cosine distance (threshold ≤ 0.35) | Standard for face embeddings, tunable via env var |
| **Processing** | Background async task on upload + manual trigger | Keeps uploads fast, owner can re-index anytime |
| **GPU Support** | Optional NVIDIA via nvidia-container-toolkit | CPU fallback works, GPU just makes it faster |
| **Privacy** | 100% local, all env vars block external calls | HF_HUB_OFFLINE=1, TRANSFORMERS_OFFLINE=1, models baked into image |

---

## 🗺️ Roadmap

### Future Enhancements (Planned)
- **Face Clustering** — Auto-group photos by person without needing a selfie
- **Face Tagging** — Owner can name detected faces
- **pgvector** — Switch from JSON to native vector similarity for larger dumps
- **Webcam Capture** — Take a selfie directly from the browser instead of uploading

---

## 🛡️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12, FastAPI, Uvicorn |
| **Database** | PostgreSQL 16 (Alpine) |
| **ORM** | SQLAlchemy 2.0 |
| **Auth** | JWT (python-jose) + bcrypt |
| **Images** | Pillow (thumbnails, processing) |
| **Scheduler** | APScheduler (expired dump cleanup) |
| **Face Recognition** | DeepFace 0.0.93, Facenet512, RetinaFace |
| **GPU Communication** | httpx (async HTTP client) |
| **Frontend** | Vanilla HTML/CSS/JS (no framework) |
| **Containers** | Docker, Docker Compose |

---

## 📝 License

This project is open source. See [LICENSE](LICENSE) for details.
