CREATE TABLE app_settings (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL);

CREATE TABLE source_files (
    sha256 VARCHAR PRIMARY KEY, archive_path VARCHAR NOT NULL,
    byte_size BIGINT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
);
CREATE TABLE import_jobs (
    job_id VARCHAR PRIMARY KEY, source_hash VARCHAR NOT NULL REFERENCES source_files(sha256),
    source_id VARCHAR NOT NULL, trigger VARCHAR NOT NULL, filename VARCHAR NOT NULL,
    importer_version INTEGER NOT NULL, status VARCHAR NOT NULL,
    new_count INTEGER NOT NULL DEFAULT 0, duplicate_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0, conflict_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    started_at TIMESTAMP, finished_at TIMESTAMP, error VARCHAR, retry_of VARCHAR,
    source_metadata VARCHAR
);
CREATE TABLE hands (
    source_id VARCHAR NOT NULL, hand_id VARCHAR NOT NULL, payload_hash VARCHAR NOT NULL,
    payload VARCHAR NOT NULL, table_name VARCHAR NOT NULL,
    started_at_local TIMESTAMP NOT NULL, time_precision VARCHAR NOT NULL,
    source_timezone VARCHAR, started_at_utc TIMESTAMPTZ, currency_code VARCHAR,
    quality_flags VARCHAR NOT NULL,
    PRIMARY KEY (source_id, hand_id)
);
CREATE TABLE hand_sources (
    source_id VARCHAR NOT NULL, hand_id VARCHAR NOT NULL,
    source_hash VARCHAR NOT NULL REFERENCES source_files(sha256),
    source_index INTEGER NOT NULL, payload_hash VARCHAR NOT NULL,
    is_conflict BOOLEAN NOT NULL,
    PRIMARY KEY (source_id, hand_id, source_hash, source_index)
);
CREATE TABLE import_hand_results (
    job_id VARCHAR NOT NULL, source_index INTEGER NOT NULL,
    hand_id VARCHAR, payload_hash VARCHAR, outcome VARCHAR NOT NULL, reason VARCHAR,
    PRIMARY KEY (job_id, source_index)
);
CREATE TABLE hand_players (
    source_id VARCHAR NOT NULL, hand_id VARCHAR NOT NULL, ordinal INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    starting_balance DECIMAL(24,8) NOT NULL, starting_balance_display VARCHAR NOT NULL,
    starting_currency_symbol VARCHAR,
    net_result DECIMAL(24,8) NOT NULL, net_result_display VARCHAR NOT NULL,
    net_currency_symbol VARCHAR, final_hand VARCHAR NOT NULL,
    PRIMARY KEY (source_id, hand_id, name)
);
CREATE TABLE hand_phases (
    source_id VARCHAR NOT NULL, hand_id VARCHAR NOT NULL, ordinal INTEGER NOT NULL,
    name VARCHAR NOT NULL, board VARCHAR NOT NULL, new_cards VARCHAR NOT NULL,
    PRIMARY KEY (source_id, hand_id, ordinal)
);
CREATE TABLE hand_events (
    source_id VARCHAR NOT NULL, hand_id VARCHAR NOT NULL,
    phase_ordinal INTEGER NOT NULL, ordinal INTEGER NOT NULL,
    type VARCHAR NOT NULL, player VARCHAR, action VARCHAR NOT NULL, action_code VARCHAR,
    amount DECIMAL(24,8), amount_display VARCHAR, currency_symbol VARCHAR, cards VARCHAR NOT NULL,
    PRIMARY KEY (source_id, hand_id, phase_ordinal, ordinal)
);
CREATE INDEX hands_printed_time ON hands (started_at_local, source_id, hand_id);
CREATE INDEX import_jobs_status ON import_jobs (status);
