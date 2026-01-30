use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::net::SocketAddr;
use tracing_subscriber;

#[derive(Clone)]
struct AppState {
    pool: PgPool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct EegSample {
    id: i32,
    ts: String,
    channel: String,
    value: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct LivePoint {
    id: i32,
    ts: String,
    value: f64,
}

#[derive(Debug, Deserialize)]
struct LiveQuery {
    channel: Option<String>,
    since_id: Option<i32>,
    limit: Option<i32>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://eeg_user:secret@db:5432/eeg".to_string());
    let pool = PgPool::connect(&database_url).await?;

    let state = AppState { pool };

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/dbtest", get(dbtest))
        .route("/samples", get(get_samples))
        .route("/live", get(get_live))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    tracing::info!("listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await?;
    Ok(())
}

async fn root() -> &'static str {
    "Rust EEG Backend"
}

async fn health() -> &'static str {
    "OK"
}

async fn dbtest(State(state): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let row: (i32,) = sqlx::query_as("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({"ok": true, "value": row.0})))
}

async fn get_samples(
    State(state): State<AppState>,
    Query(params): Query<LiveQuery>,
) -> Result<Json<Vec<EegSample>>, (StatusCode, String)> {
    let channel = params.channel.unwrap_or_else(|| "A3".to_string());
    let limit = params.limit.unwrap_or(100).min(1000);

    let samples: Vec<EegSample> = sqlx::query_as(
        "SELECT id, ts, channel, value FROM eeg_samples WHERE channel = $1 ORDER BY id DESC LIMIT $2",
    )
    .bind(&channel)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(samples))
}

async fn get_live(
    State(state): State<AppState>,
    Query(params): Query<LiveQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let channel = params.channel.unwrap_or_else(|| "A3".to_string());
    let since_id = params.since_id.unwrap_or(0);
    let limit = params.limit.unwrap_or(200).min(1000);

    let points: Vec<(i32, String, f64)> = sqlx::query_as(
        "SELECT id, ts, value FROM eeg_samples WHERE channel = $1 AND id > $2 ORDER BY id ASC LIMIT $3",
    )
    .bind(&channel)
    .bind(since_id)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let last_id = points.last().map(|(id, _, _)| *id).unwrap_or(since_id);
    let response_points: Vec<LivePoint> = points
        .into_iter()
        .map(|(id, ts, value)| LivePoint { id, ts, value })
        .collect();

    Ok(Json(json!({
        "points": response_points,
        "last_id": last_id,
        "channel": channel,
    })))
}
