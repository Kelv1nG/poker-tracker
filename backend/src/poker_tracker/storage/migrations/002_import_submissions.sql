CREATE TABLE import_submissions (
    submission_id VARCHAR PRIMARY KEY, job_id VARCHAR NOT NULL,
    source_hash VARCHAR NOT NULL, source_id VARCHAR NOT NULL,
    filename VARCHAR NOT NULL, trigger VARCHAR NOT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT current_timestamp
);
INSERT INTO import_submissions
    (submission_id, job_id, source_hash, source_id, filename, trigger, submitted_at)
    SELECT job_id, job_id, source_hash, source_id, filename, trigger, created_at FROM import_jobs;
CREATE INDEX import_submissions_source ON import_submissions(source_hash, source_id);
