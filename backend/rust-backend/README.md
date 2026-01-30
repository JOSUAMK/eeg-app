# Rust backend

This service provides a REST API using `axum` and connects to Postgres via `sqlx`.

## Endpoints

- `GET /` — service message
- `GET /health` — health check (returns "OK")
- `GET /dbtest` — tests database connection (SELECT 1)
- `GET /samples?channel=A3&limit=100` — fetch EEG samples by channel
  - `channel` (optional, default: "A3"): "A3" or "A4"
  - `limit` (optional, default: 100): max results
- `GET /live?channel=A3&since_id=0&limit=200` — live streaming endpoint
  - `channel` (optional, default: "A3"): "A3" or "A4"
  - `since_id` (optional, default: 0): fetch points newer than this ID
  - `limit` (optional, default: 200): max results
  - Returns: `{ "points": [...], "last_id": N, "channel": "..." }`

## Environment

- `DATABASE_URL` — e.g. `postgres://eeg_user:secret@db:5432/eeg` (set in docker-compose)

## Running

From repository root:

```bash
docker-compose up --build
```

The Rust backend will listen on port `8000`; Postgres on `5432`.
