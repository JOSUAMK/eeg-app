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
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

## GitHub Codespaces

This repo includes a `.devcontainer/` configuration. In Codespaces:

1. Create the Codespace from this repo
2. Wait for containers to start (or run `docker compose up --build`)
3. Open the forwarded port **5173** in the browser

### Why live mode works in Codespaces

The frontend calls the backend through a **Vite dev-server proxy**:

- Frontend uses `API_BASE = "/api"` by default
- Vite proxies `/api/*` to the backend container (`http://backend:5000`)

This avoids hard-coding `localhost:5000`, which is different inside Codespaces.

### Optional: override backend URL

If you do not want to use the proxy, you can set `VITE_API_BASE`.
Example file: `frontend/eeg-visualizer/.env.example`
