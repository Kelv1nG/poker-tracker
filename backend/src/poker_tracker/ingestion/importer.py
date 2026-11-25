import hashlib
import json
from uuid import uuid4

from poker_tracker.ingestion.archive import archive_source, ArchivedSource
from poker_tracker.ingestion.bet88 import normalize_hand, validate_envelope
from poker_tracker.ingestion.jobs import Counts, ImportJob, WatchReceipt
from poker_tracker.storage.database import Database
from poker_tracker.storage.repositories import Repository

IMPORTER_VERSION = 1


class Importer:
    def __init__(self, settings):
        self.settings = settings
        self.database = Database(settings.database_path)

    def enqueue(self, stream, filename: str, trigger: str, source_id='bet88', *, watch_receipt: WatchReceipt | None = None) -> ImportJob:
        if trigger not in ('upload', 'watch') or source_id != 'bet88':
            raise ValueError('Unsupported import trigger or source')
        if not isinstance(filename, str) or not filename:
            raise ValueError('A source filename is required')
        if watch_receipt is not None and trigger != 'watch':
            raise ValueError('Watch receipts are only valid for directory imports')
        archive = archive_source(stream, self.settings)
        with self.database.write_transaction() as con:
            job = self._queue(con, archive, filename, trigger, source_id)
            if watch_receipt is not None:
                Repository.remember_watch_receipt(con, watch_receipt)
            return job

    def _queue(self, con, archive, filename, trigger, source_id, retry_of=None):
        active = con.execute('''SELECT job_id FROM import_jobs WHERE source_hash=?
            AND source_id=? AND importer_version=? AND status IN ('queued','processing')
            ORDER BY created_at, job_id LIMIT 1''', [archive.sha256, source_id, IMPORTER_VERSION]).fetchone()
        if active:
            job_id = active[0]
        else:
            con.execute('''INSERT INTO source_files (sha256, archive_path, byte_size) VALUES (?, ?, ?)
                ON CONFLICT DO NOTHING''', [archive.sha256,
                    str(archive.path.relative_to(self.settings.data_dir)), archive.byte_size])
            job_id = str(uuid4())
            con.execute('''INSERT INTO import_jobs (job_id,source_hash,source_id,trigger,filename,
                importer_version,status,retry_of) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)''',
                [job_id, archive.sha256, source_id, trigger, filename, IMPORTER_VERSION, retry_of])
        con.execute('''INSERT INTO import_submissions
            (submission_id,job_id,source_hash,source_id,filename,trigger) VALUES (?, ?, ?, ?, ?, ?)''',
            [str(uuid4()),job_id,archive.sha256,source_id,filename,trigger])
        return Repository.get_job(con, job_id)

    def retry(self, job_id):
        with self.database.write_transaction() as con:
            job = Repository.get_job(con, str(job_id))
            path, size = con.execute('SELECT archive_path, byte_size FROM source_files WHERE sha256=?',
                                     [job.source_hash]).fetchone()
            archive = ArchivedSource(job.source_hash, self.settings.data_dir / path, size)
            return self._queue(con, archive, job.filename, 'retry', job.source_id, job.job_id)

    def get_job(self, job_id) -> ImportJob:
        with self.database.read_connection() as con:
            return Repository.get_job(con, str(job_id))

    def recover(self) -> None:
        with self.database.write_transaction() as con:
            con.execute("""UPDATE import_jobs SET status='queued', started_at=NULL,
                finished_at=NULL,error=NULL WHERE status='processing'""")

    def run_next(self) -> ImportJob | None:
        with self.database.write_transaction() as con:
            candidate = con.execute("""SELECT job_id FROM import_jobs WHERE status='queued'
                ORDER BY created_at, job_id LIMIT 1""").fetchone()
            if not candidate:
                return None
            job_id = candidate[0]
            con.execute("UPDATE import_jobs SET status='processing', started_at=current_timestamp WHERE job_id=?", [job_id])
            job = Repository.get_job(con, job_id)
            path = con.execute('SELECT archive_path FROM source_files WHERE sha256=?', [job.source_hash]).fetchone()[0]
            context = {key: json.loads(value) for key, value in con.execute(
                "SELECT key,value FROM app_settings WHERE key IN ('source_timezone','currency_code')").fetchall()}
        try:
            raw = (self.settings.data_dir / path).read_bytes()
            if hashlib.sha256(raw).hexdigest() != job.source_hash:
                raise ValueError('Archived source checksum does not match; restore it from backup')
            envelope = validate_envelope(raw)
            prepared = []
            for index, value in enumerate(envelope.hands):
                try:
                    prepared.append((index, normalize_hand(value, job.source_id, **context), None))
                except ValueError as exc:
                    prepared.append((index, None, str(exc)))
            counts = {'new': 0, 'duplicate': 0, 'rejected': 0, 'conflict': 0}
            # Canonical rows, all child rows, provenance, outcomes and terminal status
            # become visible together. Interrupted preparation leaves a recoverable job.
            with self.database.write_transaction() as con:
                for index, hand, reason in prepared:
                    outcome, identifier, fingerprint = 'rejected', None, None
                    if hand is not None:
                        identifier, fingerprint = hand.hand_id, hand.payload_hash
                        existing = con.execute('SELECT payload_hash FROM hands WHERE source_id=? AND hand_id=?',
                                               [hand.source_id, identifier]).fetchone()
                        if existing is None:
                            Repository.insert_hand(con, hand)
                            outcome = 'new'
                        elif existing[0] == fingerprint:
                            outcome = 'duplicate'
                        else:
                            outcome = 'conflict'
                            reason = 'Payload differs from the existing canonical hand; original preserved'
                        con.execute('''INSERT INTO hand_sources VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT DO NOTHING''', [job.source_id, identifier, job.source_hash,
                                index, fingerprint, outcome == 'conflict'])
                    elif isinstance(envelope.hands[index], dict):
                        candidate_id = envelope.hands[index].get('id')
                        identifier = candidate_id if isinstance(candidate_id, str) else None
                    counts[outcome] += 1
                    if outcome == 'conflict':
                        counts['rejected'] += 1
                    con.execute('INSERT INTO import_hand_results VALUES (?, ?, ?, ?, ?, ?)',
                                [job_id, index, identifier, fingerprint, outcome, reason])
                Repository.finish_job(con, job_id, Counts(**counts), envelope.metadata)
        except Exception as exc:
            with self.database.write_transaction() as con:
                con.execute('''UPDATE import_jobs SET status='failed', error=?,
                    finished_at=current_timestamp WHERE job_id=?''', [str(exc), job_id])
        return self.get_job(job_id)
