CREATE TABLE IF NOT EXISTS eeg_samples (
  id SERIAL PRIMARY KEY,
  ts TEXT NOT NULL,
  channel TEXT NOT NULL,
  value FLOAT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eeg_samples_channel_id
ON eeg_samples(channel, id);

-- Insert some sample data for testing
INSERT INTO eeg_samples (ts, channel, value) VALUES
  ('2024-01-01T12:00:00Z', 'A3', 10.5),
  ('2024-01-01T12:00:01Z', 'A3', 11.2),
  ('2024-01-01T12:00:02Z', 'A3', 10.8),
  ('2024-01-01T12:00:00Z', 'A4', 9.5),
  ('2024-01-01T12:00:01Z', 'A4', 9.8),
  ('2024-01-01T12:00:02Z', 'A4', 10.1);
