/**
 * IDHAM ERP - Jobs Center (مركز المهام والعمليات الخلفية)
 * Tracks async exports, heavy reports, and data imports with progress bars,
 * cancelation, and persistent state.
 */

export type JobType = 'EXPORT_EXCEL' | 'EXPORT_PDF' | 'EXPORT_CSV' | 'IMPORT_DATA' | 'BACKUP_SNAPSHOT';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundJob {
  id: string;
  type: JobType;
  title: string;
  status: JobStatus;
  progress: number; // 0 - 100
  createdAt: string;
  completedAt?: string;
  filename?: string;
  fileBlob?: Blob;
  error?: string;
  meta?: Record<string, any>;
}

const STORAGE_KEY = 'idham_jobs_center_v1';
const EVENT_NAME = 'idham_jobs_center_updated';

// In-memory cache of file blobs (since blobs can't be stored in localStorage)
const blobCache = new Map<string, Blob>();

export function getJobsList(): BackgroundJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: BackgroundJob[] = JSON.parse(raw);
    return list.map((job) => ({
      ...job,
      fileBlob: blobCache.get(job.id),
    }));
  } catch {
    return [];
  }
}

function persistJobs(jobs: BackgroundJob[]) {
  if (typeof window === 'undefined') return;
  // Strip non-serializable blob before storing in localStorage
  const serializable = jobs.map(({ fileBlob, ...rest }) => rest);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: jobs }));
}

export function createJob(params: { type: JobType; title: string; meta?: Record<string, any> }): BackgroundJob {
  const newJob: BackgroundJob = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: params.type,
    title: params.title,
    status: 'pending',
    progress: 0,
    createdAt: new Date().toISOString(),
    meta: params.meta,
  };
  const list = [newJob, ...getJobsList()];
  persistJobs(list);
  return newJob;
}

export function updateJob(
  id: string,
  patch: Partial<Omit<BackgroundJob, 'id' | 'createdAt'>> & { fileBlob?: Blob }
): BackgroundJob | null {
  const list = getJobsList();
  const idx = list.findIndex((j) => j.id === id);
  if (idx < 0) return null;

  if (patch.fileBlob) {
    blobCache.set(id, patch.fileBlob);
  }

  const updated: BackgroundJob = {
    ...list[idx],
    ...patch,
    completedAt:
      patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled'
        ? new Date().toISOString()
        : list[idx].completedAt,
  };

  list[idx] = updated;
  persistJobs(list);
  return updated;
}

export function cancelJob(id: string): void {
  updateJob(id, { status: 'cancelled', progress: 0 });
}

export function clearCompletedJobs(): void {
  const list = getJobsList().filter((j) => j.status === 'running' || j.status === 'pending');
  persistJobs(list);
}

export function downloadJobResult(job: BackgroundJob): void {
  const blob = job.fileBlob || blobCache.get(job.id);
  if (!blob || !job.filename) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = job.filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}
