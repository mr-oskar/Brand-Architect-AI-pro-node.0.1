/**
 * useJobPoller — polls a background AI job until it completes or fails.
 *
 * Background jobs (campaign generation, bulk image generation) return a jobId
 * immediately. This hook polls GET /api/jobs/:id at a regular interval and
 * returns the job progress so the UI can show a live progress bar.
 *
 * @param jobId   The job ID to poll. Pass null/undefined to disable polling.
 * @param options Optional configuration for poll interval and timeout.
 * @returns       Current job state: { status, progress, total, step, result, error }
 *
 * @example
 *   const [jobId, setJobId] = useState<string | null>(null);
 *   const job = useJobPoller(jobId);
 *
 *   // start job
 *   const { data } = useMutation(generateCampaign, {
 *     onSuccess: (res) => setJobId(res.jobId),
 *   });
 *
 *   // render progress
 *   if (job.status === "running") return <ProgressBar value={job.progress} max={job.total} />;
 *   if (job.status === "done")    return <CampaignView data={job.result} />;
 */
import { useEffect, useRef, useState } from "react";
import { JOB_POLL_INTERVAL_MS, JOB_POLL_TIMEOUT_MS } from "@/lib/constants";
import type { JobProgress, JobStatus } from "@/types";

interface JobPollerOptions {
  /** Polling interval in ms. Default: JOB_POLL_INTERVAL_MS (2000). */
  interval?: number;
  /** Max total poll time in ms before timing out. Default: JOB_POLL_TIMEOUT_MS. */
  timeout?: number;
  /** Called when the job reaches "done" status. */
  onDone?: (result: unknown) => void;
  /** Called when the job reaches "failed" status or times out. */
  onError?: (error: string) => void;
}

const INITIAL_STATE: JobProgress = {
  id: "",
  status: "pending",
  progress: 0,
  total: 100,
  step: undefined,
  result: undefined,
  error: null,
};

export function useJobPoller(
  jobId: string | null | undefined,
  options: JobPollerOptions = {},
): JobProgress {
  const {
    interval = JOB_POLL_INTERVAL_MS,
    timeout = JOB_POLL_TIMEOUT_MS,
    onDone,
    onError,
  } = options;

  const [job, setJob] = useState<JobProgress>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(0);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!jobId) {
      setJob(INITIAL_STATE);
      return;
    }

    startedAtRef.current = Date.now();
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      // Timeout guard
      if (Date.now() - startedAtRef.current > timeout) {
        const errMsg = "Job timed out. Please refresh and try again.";
        setJob((prev) => ({ ...prev, status: "failed", error: errMsg }));
        onErrorRef.current?.(errMsg);
        return;
      }

      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: JobProgress = await res.json();

        if (!cancelled) {
          setJob(data);
          if (data.status === "done") {
            onDoneRef.current?.(data.result);
            return; // stop polling
          }
          if (data.status === "failed") {
            onErrorRef.current?.(data.error ?? "Job failed");
            return; // stop polling
          }
          // Still running — schedule next poll
          timerRef.current = setTimeout(poll, interval);
        }
      } catch (err) {
        if (!cancelled) {
          timerRef.current = setTimeout(poll, interval * 2); // back off on error
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, interval, timeout]);

  return job;
}
