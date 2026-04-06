-- +goose Up
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    brief_time VARCHAR(10) NOT NULL DEFAULT '8 AM',
    nudge_frequency VARCHAR(20) NOT NULL DEFAULT 'regular',
    proactive_reprioritization BOOLEAN NOT NULL DEFAULT true,
    eod_reminder BOOLEAN NOT NULL DEFAULT false,
    eod_time VARCHAR(10) NOT NULL DEFAULT '6 PM',
    mic_sensitivity FLOAT NOT NULL DEFAULT 0.5,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    save_transcripts BOOLEAN NOT NULL DEFAULT true,
    last_standup_date DATE,
    streak INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS users;
