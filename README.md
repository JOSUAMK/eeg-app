# EEG Signal Analyzer

Full-stack EEG visualization app.

## What it does

- Visualizes EEG signals for channels **A3** and **A4** in:
  - **Time domain**
  - **Power Spectral Density (PSD)**
  - **Band power breakdown** (Delta, Theta, Alpha, Beta, Gamma)

## Modes

1. **CSV mode (static):** loads `public/eeg_data_a3_a4_utc.csv`
2. **Live simulator mode:** the Flask backend continuously writes synthetic EEG samples into a **SQLite** DB and the frontend streams new points.

## Run (Docker)

```bash
docker compose up --build
or
docker compose up --build --remove-orphans
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

## GitHub Codespaces

This repo includes a `.devcontainer/` configuration for easy Codespaces use.

### Quick start (recommended)

1. In GitHub, click **Code → Open with Codespaces → New codespace**.
2. Codespaces will use the `.devcontainer/devcontainer.json` which starts your Docker Compose services (db, rust-backend, backend, frontend).
3. Wait until the forwarded ports appear and the frontend build finishes.
4. Open the forwarded port **5173** (Frontend) — VS Code will usually open it automatically.

### Manual start (if needed)

If you see this message:

“Workspace does not exist”

This is a GitHub Codespaces UI issue, not a code error.

What to Do (Step-by-Step):

- Click the green “Open Workspace…” button

When the folder picker opens

- Click OK

👉 That’s it.Codespaces will automatically:

- Attach the workspace
- Start Docker containers
- Forward ports
- Launch the frontend

### Why live mode works in Codespaces

The frontend calls the backend through a **Vite dev-server proxy** by default:

- Frontend uses `VITE_API_BASE = "/api"`
- Vite proxies `/api/*` to the backend container (service name `backend` or `rust-backend`)

This avoids hard-coding `localhost:5000` which is not reachable from the container network.

### Optional: override backend URL

If you prefer to bypass the proxy, set `VITE_API_BASE` at build time (example in `frontend/eeg-visualizer/.env.example`).

> Tip: If Codespaces cannot forward a port, check the Ports view and enable Auto Forwarding for ports 5173, 8000, and 5000.
