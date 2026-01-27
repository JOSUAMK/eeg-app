CREATE TABLE IF NOT EXISTS eeg_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  channel TEXT NOT NULL,
  value REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eeg_samples_channel_id
ON eeg_samples(channel, id);
