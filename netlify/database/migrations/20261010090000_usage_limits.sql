-- Operational metadata only. Never add messages, reports or images to this table.
CREATE TABLE usage_limits (
  bucket TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX usage_limits_expiry ON usage_limits (expires_at);
