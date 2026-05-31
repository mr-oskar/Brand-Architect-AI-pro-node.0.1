"""
Persistent async job store for long-running AI operations.

Jobs are stored in PostgreSQL so they survive server restarts.
The client polls GET /api/jobs/:id for status updates.
Jobs older than 24 hours are auto-cleaned from the DB.

Architecture:
  - Primary store: PostgreSQL table `background_jobs`
  - In-memory cache: dict with 10s TTL for fast polling reads
  - Thread-safe: uses threading.Lock for cache mutations

NOTE: SQLAlchemy + psycopg2 uses %(param)s style, so avoid ::jsonb cast in
      text() queries — pass JSON as a plain TEXT column instead.
"""
import json
import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

logger = logging.getLogger("brand-os.jobs")

JobStatus = Literal["pending", "running", "done", "failed"]

_CACHE_TTL = 10            # seconds — serve from memory before re-reading DB
_CLEANUP_INTERVAL = 30 * 60   # 30 minutes
_JOB_MAX_AGE = 24 * 60 * 60  # 24 hours


@dataclass
class Job:
    id: str
    user_id: Optional[str]
    status: JobStatus
    progress: int
    total: int
    step: str = ""
    result: Any = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)


# ── SQL (using %s-style params — psycopg2 native, avoids ::jsonb conflicts) ───

_SQL_CREATE_TABLE = """
    CREATE TABLE IF NOT EXISTS background_jobs (
        id          TEXT PRIMARY KEY,
        user_id     TEXT,
        status      TEXT    NOT NULL DEFAULT 'pending',
        progress    INTEGER NOT NULL DEFAULT 0,
        total       INTEGER NOT NULL DEFAULT 100,
        step        TEXT,
        result      TEXT,
        error       TEXT,
        created_at  DOUBLE PRECISION NOT NULL,
        updated_at  DOUBLE PRECISION NOT NULL
    )
"""

_SQL_CREATE_INDEX = (
    "CREATE INDEX IF NOT EXISTS idx_background_jobs_user ON background_jobs (user_id)"
)

_SQL_UPSERT = """
    INSERT INTO background_jobs
        (id, user_id, status, progress, total, step, result, error, created_at, updated_at)
    VALUES
        (%(id)s, %(user_id)s, %(status)s, %(progress)s, %(total)s,
         %(step)s, %(result)s, %(error)s, %(created_at)s, %(updated_at)s)
    ON CONFLICT (id) DO UPDATE SET
        status     = EXCLUDED.status,
        progress   = EXCLUDED.progress,
        total      = EXCLUDED.total,
        step       = EXCLUDED.step,
        result     = EXCLUDED.result,
        error      = EXCLUDED.error,
        updated_at = EXCLUDED.updated_at
"""

_SQL_SELECT = "SELECT * FROM background_jobs WHERE id = %(id)s"

_SQL_DELETE_OLD = "DELETE FROM background_jobs WHERE created_at < %(cutoff)s"


class JobStore:
    """
    Thread-safe job store backed by PostgreSQL with an in-memory read cache.

    Write path: every create/update writes to DB immediately (via raw psycopg2
                connection to avoid SQLAlchemy text() parameter conflicts),
                then updates the cache.
    Read path:  serve from cache if fresh (< _CACHE_TTL seconds); re-read DB
                if stale or cache miss.
    """

    def __init__(self):
        self._cache: dict[str, tuple[Job, float]] = {}  # job_id → (Job, cached_at)
        self._lock = threading.Lock()
        self._db_available = False
        self._init_db()
        self._start_cleanup_thread()

    # ── DB bootstrap ──────────────────────────────────────────────────────────

    def _get_raw_conn(self):
        """Get a raw psycopg2 connection from the SQLAlchemy pool."""
        from app.database import engine
        return engine.raw_connection()

    def _init_db(self) -> None:
        """Create the background_jobs table if it doesn't exist."""
        try:
            conn = self._get_raw_conn()
            try:
                cur = conn.cursor()
                cur.execute(_SQL_CREATE_TABLE)
                cur.execute(_SQL_CREATE_INDEX)
                conn.commit()
                cur.close()
            finally:
                conn.close()
            self._db_available = True
            logger.info("JobStore: DB table ready (background_jobs)")
        except Exception as exc:
            logger.warning(
                "JobStore: DB init failed (%s) — falling back to in-memory only", exc
            )
            self._db_available = False

    # ── DB helpers ────────────────────────────────────────────────────────────

    def _db_write(self, job: Job) -> None:
        if not self._db_available:
            return
        try:
            conn = self._get_raw_conn()
            try:
                cur = conn.cursor()
                cur.execute(_SQL_UPSERT, {
                    "id":         job.id,
                    "user_id":    job.user_id,
                    "status":     job.status,
                    "progress":   job.progress,
                    "total":      job.total,
                    "step":       job.step or "",
                    "result":     json.dumps(job.result) if job.result is not None else None,
                    "error":      job.error,
                    "created_at": job.created_at,
                    "updated_at": time.time(),
                })
                conn.commit()
                cur.close()
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("JobStore: DB write failed (non-critical): %s", exc)

    def _db_read(self, job_id: str) -> Optional[Job]:
        if not self._db_available:
            return None
        try:
            conn = self._get_raw_conn()
            try:
                cur = conn.cursor()
                cur.execute(_SQL_SELECT, {"id": job_id})
                row = cur.fetchone()
                cur.close()
            finally:
                conn.close()

            if not row:
                return None

            # Row columns: id, user_id, status, progress, total, step, result,
            #              error, created_at, updated_at
            (r_id, r_user, r_status, r_progress, r_total,
             r_step, r_result, r_error, r_created, _r_updated) = row

            # r_result may already be a dict (psycopg2 auto-parses JSON strings)
            if isinstance(r_result, (dict, list)):
                parsed_result = r_result
            elif isinstance(r_result, str):
                parsed_result = json.loads(r_result)
            else:
                parsed_result = None

            return Job(
                id=r_id,
                user_id=r_user,
                status=r_status,
                progress=r_progress,
                total=r_total,
                step=r_step or "",
                result=parsed_result,
                error=r_error,
                created_at=r_created,
            )
        except Exception as exc:
            logger.debug("JobStore: DB read failed: %s", exc)
            return None

    # ── Public API ────────────────────────────────────────────────────────────

    def create(self, total: int = 100, user_id: Optional[str] = None) -> Job:
        job = Job(
            id=str(uuid.uuid4()),
            user_id=user_id,
            status="pending",
            progress=0,
            total=total,
        )
        with self._lock:
            self._cache[job.id] = (job, time.time())
        self._db_write(job)
        return job

    def update(self, job_id: str, **kwargs) -> None:
        with self._lock:
            cached = self._cache.get(job_id)
            job = cached[0] if cached else None

        if job is None:
            job = self._db_read(job_id)
            if job is None:
                logger.warning("JobStore.update: job %s not found", job_id)
                return

        for k, v in kwargs.items():
            setattr(job, k, v)

        with self._lock:
            self._cache[job_id] = (job, time.time())

        self._db_write(job)

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            cached = self._cache.get(job_id)
            if cached:
                job, cached_at = cached
                if time.time() - cached_at < _CACHE_TTL:
                    return job

        job = self._db_read(job_id)
        if job:
            with self._lock:
                self._cache[job_id] = (job, time.time())
        return job

    # ── Cleanup ───────────────────────────────────────────────────────────────

    def _cleanup(self) -> None:
        cutoff = time.time() - _JOB_MAX_AGE

        with self._lock:
            stale = [jid for jid, (j, _) in self._cache.items() if j.created_at < cutoff]
            for jid in stale:
                del self._cache[jid]

        if self._db_available:
            try:
                conn = self._get_raw_conn()
                try:
                    cur = conn.cursor()
                    cur.execute(_SQL_DELETE_OLD, {"cutoff": cutoff})
                    conn.commit()
                    cur.close()
                finally:
                    conn.close()
            except Exception as exc:
                logger.debug("JobStore: cleanup failed: %s", exc)

    def _start_cleanup_thread(self) -> None:
        def run():
            while True:
                time.sleep(_CLEANUP_INTERVAL)
                self._cleanup()
        t = threading.Thread(target=run, daemon=True)
        t.start()


# Module-level singleton
job_store = JobStore()
