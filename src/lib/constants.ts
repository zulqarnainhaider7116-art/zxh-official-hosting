export const FRAMEWORKS: { value: string; label: string; output?: string }[] = [
  { value: 'nextjs', label: 'Next.js', output: '.next' },
  { value: 'vite', label: 'Vite', output: 'dist' },
  { value: 'create-react-app', label: 'Create React App', output: 'build' },
  { value: 'vue', label: 'Vue CLI', output: 'dist' },
  { value: 'nuxtjs', label: 'Nuxt', output: '.output' },
  { value: 'astro', label: 'Astro', output: 'dist' },
  { value: 'angular', label: 'Angular', output: 'dist' },
  { value: 'gatsby', label: 'Gatsby', output: 'public' },
  { value: 'remix', label: 'Remix', output: 'build' },
  { value: 'sveltekit-1', label: 'SvelteKit' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'static', label: 'Static HTML / Other' },
];

export const frameworkLabel = (v?: string | null) => FRAMEWORKS.find((f) => f.value === v)?.label || 'Static / Other';

export const NODE_VERSIONS = ['24.x', '22.x', '20.x', '18.x'];

export type Tone = 'ember' | 'ok' | 'bad' | 'warn' | 'info' | 'muted';

export const STATUS: Record<string, { label: string; tone: Tone; live?: boolean }> = {
  queued: { label: 'Queued', tone: 'muted', live: true },
  preparing: { label: 'Preparing', tone: 'info', live: true },
  uploading: { label: 'Uploading', tone: 'info', live: true },
  building: { label: 'Building', tone: 'warn', live: true },
  checking: { label: 'Checking', tone: 'info', live: true },
  completed: { label: 'Completed', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  live: { label: 'Live', tone: 'ok' },
  ready: { label: 'Ready', tone: 'info' },
  draft: { label: 'Draft', tone: 'muted' },
  deploying: { label: 'Deploying', tone: 'warn', live: true },
  active: { label: 'Active', tone: 'ok' },
  pending_attach: { label: 'Awaiting deploy', tone: 'muted' },
  pending_verification: { label: 'Needs verification', tone: 'warn' },
  misconfigured: { label: 'DNS misconfigured', tone: 'warn' },
  error: { label: 'Error', tone: 'bad' },
  connected: { label: 'Connected', tone: 'ok' },
  invalid: { label: 'Invalid token', tone: 'bad' },
  pending: { label: 'Pending review', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  correction_requested: { label: 'Correction requested', tone: 'warn' },
  expired: { label: 'Expired', tone: 'muted' },
  replaced: { label: 'Replaced', tone: 'muted' },
  suspended: { label: 'Suspended', tone: 'bad' },
};

export const ACTIVE_STATUSES = ['queued', 'preparing', 'uploading', 'building', 'checking'];
export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];
export const PHASES = [
  { id: 'queued', label: 'Queued' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'uploading', label: 'Uploading' },
  { id: 'building', label: 'Building' },
  { id: 'checking', label: 'Checking' },
  { id: 'completed', label: 'Live' },
];
