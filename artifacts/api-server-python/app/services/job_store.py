"""
In-memory async job store for long-running AI operations.

Jobs are tracked by UUID. The client polls GET /api/jobs/:id for status.
Jobs older than 30 minutes are auto-cleaned.

Extension points:
  - Replace with Redis for multi-process deployments (uvicorn with multiple workers).
  - Add persistent job history to DB for audit/retry capabilities.
  - Add webhooks: notify a URL when a job completes.
"""
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal, Optional


JobStatus = Literal["pending", "running", "done", "failed"]


@dataclass
class Job:
    id: str
    user_id: str | None
    status: JobStatus
    progress: int
    total: int
    step: str = ""
    result: Any = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)


class JobStore:
    """
    Thread-safe in-memory job store.

    NOTE: Jobs are lost on server restart. For persistence, use a DB-backed store.
    NOTE: Not suitable for multi-process deployments without Redis.
    """

    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._start_cleanup_thread()

    def create(self, total: int = 100, user_id: str | None = None) -> Job:
        job = Job(
            id=str(uuid.uuid4()),
            user_id=user_id,
            status="pending",
            progress=0,
            total=total,
        )
        with self._lock:
            self._jobs[job.id] = job
        return job

    def update(self, job_id: str, **kwargs) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                for k, v in kwargs.items():
                    setattr(job, k, v)

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def _cleanup(self) -> None:
        cutoff = time.time() - 30 * 60  # 30 minutes
        with self._lock:
            stale = [jid for jid, j in self._jobs.items() if j.created_at < cutoff]
            for jid in stale:
                del self._jobs[jid]

    def _start_cleanup_thread(self) -> None:
        def run():
            while True:
                time.sleep(5 * 60)  # every 5 minutes
                self._cleanup()
        t = threading.Thread(target=run, daemon=True)
        t.start()


# Module-level singleton
job_store = JobStore()
