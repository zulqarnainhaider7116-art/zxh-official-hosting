import { decodeText, isBinary, type Bundle } from './zip';

export interface Analysis {
  framework: string;
  frameworkLabel: string;
  confidence: 'high' | 'medium' | 'low';
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'none';
  buildCommand: string;
  installCommand: string;
  outputDirectory: string;
  nodeVersion: string;
  rootDirectory: string;
  projectName: string;
  dependencies: { name: string; version: string; dev: boolean }[];
  scripts: Record<string, string>;
  configFiles: string[];
  entryPoints: string[];
  envRefs: { key: string; files: string[] }[];
  warnings: string[];
  errors: string[];
  stats: { files: number; size: number; textFiles: number; byExt: { ext: string; count: number }[] };
  supported: boolean;
}

const CONFIG_PATTERNS = [/^next\.config\.(js|mjs|ts|cjs)$/, /^vite\.config\.(js|mjs|ts|cjs|mts)$/, /^vue\.config\.js$/, /^nuxt\.config\.(js|ts|mjs)$/, /^astro\.config\.(mjs|js|ts)$/, /^angular\.json$/, /^svelte\.config\.js$/, /^gatsby-config\.(js|ts)$/, /^remix\.config\.js$/, /^tsconfig(\..+)?\.json$/, /^tailwind\.config\.(js|ts|cjs|mjs)$/, /^postcss\.config\.(js|cjs|mjs)$/, /^vercel\.json$/, /^\.babelrc$/, /^babel\.config\.js$/, /^\.nvmrc$/, /^\.node-version$/, /^package\.json$/, /^\.npmrc$/, /^webpack\.config\.js$/];
const ENTRY_CANDIDATES = ['index.html', 'public/index.html', 'src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js', 'src/index.tsx', 'src/index.ts', 'src/index.jsx', 'src/index.js', 'src/App.tsx', 'src/App.jsx', 'src/App.vue', 'app/page.tsx', 'app/page.jsx', 'app/page.js', 'src/app/page.tsx', 'src/app/page.jsx', 'pages/index.tsx', 'pages/index.jsx', 'pages/index.js', 'src/pages/index.astro', 'src/routes/+page.svelte', 'app/root.tsx', 'server.js', 'index.js'];
const IGNORED_ENV = new Set(['NODE_ENV', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL', 'PORT', 'CI', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL']);

function detectFramework(deps: Record<string, string>, hasPkg: boolean, hasIndex: boolean) {
  const has = (n: string) => n in deps;
  if (has('next')) return { framework: 'nextjs', label: 'Next.js', output: '.next', confidence: 'high' as const };
  if (has('nuxt') || has('nuxt3')) return { framework: 'nuxtjs', label: 'Nuxt', output: '.output', confidence: 'high' as const };
  if (has('@remix-run/dev') || has('@remix-run/react')) return { framework: 'remix', label: 'Remix', output: 'build', confidence: 'high' as const };
  if (has('@sveltejs/kit')) return { framework: 'sveltekit-1', label: 'SvelteKit', output: '', confidence: 'high' as const };
  if (has('astro')) return { framework: 'astro', label: 'Astro', output: 'dist', confidence: 'high' as const };
  if (has('gatsby')) return { framework: 'gatsby', label: 'Gatsby', output: 'public', confidence: 'high' as const };
  if (has('@angular/core')) return { framework: 'angular', label: 'Angular', output: '', confidence: 'high' as const };
  if (has('react-scripts')) return { framework: 'create-react-app', label: 'Create React App', output: 'build', confidence: 'high' as const };
  if (has('@vue/cli-service')) return { framework: 'vue', label: 'Vue CLI', output: 'dist', confidence: 'high' as const };
  if (has('vite')) {
    const flavor = has('react') ? 'React' : has('vue') ? 'Vue' : has('svelte') ? 'Svelte' : has('preact') ? 'Preact' : has('solid-js') ? 'Solid' : 'Vanilla';
    return { framework: 'vite', label: `Vite + ${flavor}`, output: 'dist', confidence: 'high' as const };
  }
  if (hasPkg && (has('react') || has('vue'))) return { framework: 'static', label: has('react') ? 'React (custom build)' : 'Vue (custom build)', output: '', confidence: 'low' as const };
  if (hasIndex) return { framework: 'static', label: 'Static HTML/CSS/JS', output: '', confidence: hasPkg ? 'medium' as const : 'high' as const };
  return { framework: 'static', label: 'Unknown', output: '', confidence: 'low' as const };
}

function nodeFrom(spec: string) {
  const m = /(\d{2})/.exec(spec || '');
  if (!m) return '';
  const major = Number(m[1]);
  if (major >= 24) return '24.x';
  if (major >= 22) return '22.x';
  if (major >= 20) return '20.x';
  if (major >= 18) return '18.x';
  return '';
}

export function analyze(bundle: Bundle): Analysis {
  const paths = bundle.files.map((f) => f.path);
  const pathSet = new Set(paths);
  const warnings: string[] = [];
  const errors: string[] = [];
  const read = (p: string) => { const d = bundle.contents.get(p); return d ? decodeText(d) : null; };

  // Root directory: if no package.json at root but exactly one nested package.json (monorepo-ish), suggest it.
  let root = '';
  if (!pathSet.has('package.json') && !pathSet.has('index.html')) {
    const nested = paths.filter((p) => /(^|\/)package\.json$/.test(p) && p.split('/').length <= 3);
    if (nested.length === 1) { root = nested[0].replace(/\/?package\.json$/, ''); warnings.push(`No package.json at the archive root — using "${root}" as the root directory.`); }
    else {
      const html = paths.filter((p) => /(^|\/)index\.html$/.test(p)).sort((a, b) => a.length - b.length)[0];
      if (html && html.includes('/')) { root = html.replace(/\/?index\.html$/, ''); warnings.push(`index.html found in "${root}" — using it as the root directory.`); }
    }
  }
  const rp = (p: string) => (root ? `${root}/${p}` : p);

  let pkg: any = null;
  const pkgText = read(rp('package.json'));
  if (pkgText !== null) {
    try { pkg = JSON.parse(pkgText); } catch { errors.push('package.json is not valid JSON — the build will fail until it is fixed.'); }
  }
  const deps: Record<string, string> = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const hasIndex = pathSet.has(rp('index.html')) || pathSet.has(rp('public/index.html'));
  const fw = detectFramework(deps, !!pkg, hasIndex);

  let pm: Analysis['packageManager'] = pkg ? 'npm' : 'none';
  if (pathSet.has(rp('pnpm-lock.yaml'))) pm = 'pnpm';
  else if (pathSet.has(rp('yarn.lock'))) pm = 'yarn';
  else if (pathSet.has(rp('bun.lockb')) || pathSet.has(rp('bun.lock'))) pm = 'bun';
  else if (pathSet.has(rp('package-lock.json'))) pm = 'npm';
  else if (pkg) warnings.push('No lockfile found — dependency versions may differ from your local build.');
  if (typeof pkg?.packageManager === 'string') {
    const m = /^(npm|yarn|pnpm|bun)@/.exec(pkg.packageManager);
    if (m) pm = m[1] as Analysis['packageManager'];
  }

  const scripts: Record<string, string> = pkg?.scripts || {};
  const run = pm === 'yarn' ? 'yarn build' : pm === 'pnpm' ? 'pnpm run build' : pm === 'bun' ? 'bun run build' : 'npm run build';
  const buildCommand = pkg ? (scripts.build ? run : '') : '';
  const installCommand = pkg ? (pm === 'yarn' ? 'yarn install' : pm === 'pnpm' ? 'pnpm install' : pm === 'bun' ? 'bun install' : 'npm install') : '';
  if (pkg && !scripts.build && fw.framework !== 'static') warnings.push('package.json has no "build" script — Vercel will use the framework default.');
  if (pkg && !scripts.build && fw.framework === 'static') warnings.push('No build script — files will be served as-is.');

  let nodeVersion = nodeFrom(pkg?.engines?.node || '') || nodeFrom(read(rp('.nvmrc')) || '') || nodeFrom(read(rp('.node-version')) || '');
  if (pkg?.engines?.node && !nodeVersion) warnings.push(`engines.node "${pkg.engines.node}" is not a supported Vercel version — defaulting to 22.x.`);
  if (!nodeVersion && pkg) nodeVersion = '22.x';

  const configFiles = paths.filter((p) => { const rel = root && p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p; return !rel.includes('/') && CONFIG_PATTERNS.some((re) => re.test(rel)); });
  const entryPoints = ENTRY_CANDIDATES.map(rp).filter((p) => pathSet.has(p));

  if (!pkg && !hasIndex && !root) errors.push('Unsupported project: no package.json or index.html was found.');
  if (fw.framework === 'static' && !pkg && !hasIndex) errors.push('Static sites need an index.html file at the root.');
  if (fw.framework === 'nextjs' && !paths.some((p) => /(^|\/)(src\/)?(app|pages)\//.test(p))) warnings.push('Next.js detected but no app/ or pages/ directory was found.');
  if (fw.framework === 'vite' && !pathSet.has(rp('index.html'))) warnings.push('Vite projects normally have an index.html at the root.');
  if (bundle.skipped.some((s) => s.reason.startsWith('secret file'))) warnings.push('.env files were removed from the upload for safety. Add their values as environment variables.');
  if (bundle.skipped.some((s) => s.reason.startsWith('node_modules'))) warnings.push('node_modules was excluded — dependencies are installed fresh on Vercel.');
  const big = bundle.files.filter((f) => f.size > 10 * 1048576);
  if (big.length) warnings.push(`${big.length} file(s) larger than 10 MB may slow down deployment.`);
  const vercelJson = read(rp('vercel.json'));
  if (vercelJson) { try { JSON.parse(vercelJson); } catch { errors.push('vercel.json is not valid JSON.'); } }
  if (deps.next && /\b(output\s*:\s*['"]standalone['"])/.test(read(rp('next.config.js')) || read(rp('next.config.mjs')) || '')) warnings.push('Next.js "standalone" output is ignored on Vercel.');

  // Environment variable references
  const env = new Map<string, Set<string>>();
  const re = /(?:process\.env\.|import\.meta\.env\.)([A-Z_][A-Z0-9_]*)|process\.env\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\]/g;
  let textFiles = 0;
  let scanned = 0;
  for (const f of bundle.files) {
    if (scanned > 1500 || f.size > 300000) continue;
    if (!/\.(m?[jt]sx?|cjs|vue|svelte|astro|html)$/.test(f.path)) continue;
    const d = bundle.contents.get(f.path)!;
    if (isBinary(f.path, d)) continue;
    textFiles++;
    scanned++;
    const t = decodeText(d);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(t))) {
      const k = m[1] || m[2];
      if (IGNORED_ENV.has(k)) continue;
      if (!env.has(k)) env.set(k, new Set());
      env.get(k)!.add(f.path);
    }
  }
  for (const ex of ['.env.example', '.env.sample'].map(rp)) {
    const t = read(ex);
    if (!t) continue;
    for (const line of t.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (m && !IGNORED_ENV.has(m[1])) { if (!env.has(m[1])) env.set(m[1], new Set()); env.get(m[1])!.add(ex); }
    }
  }
  const envRefs = [...env.entries()].map(([key, files]) => ({ key, files: [...files].slice(0, 5) })).sort((a, b) => a.key.localeCompare(b.key));
  if (fw.framework === 'vite' && envRefs.some((e) => !e.key.startsWith('VITE_') && e.files.some((f) => f.includes('src/')))) warnings.push('Some client-side env vars do not start with VITE_ — Vite will not expose them to the browser.');
  if (fw.framework === 'create-react-app' && envRefs.some((e) => !e.key.startsWith('REACT_APP_'))) warnings.push('Create React App only exposes env vars prefixed with REACT_APP_.');

  const extCount = new Map<string, number>();
  for (const p of paths) { const e = (/\.([a-z0-9]+)$/i.exec(p)?.[1] || 'other').toLowerCase(); extCount.set(e, (extCount.get(e) || 0) + 1); }

  const dependencies = [
    ...Object.entries(pkg?.dependencies || {}).map(([name, version]) => ({ name, version: String(version), dev: false })),
    ...Object.entries(pkg?.devDependencies || {}).map(([name, version]) => ({ name, version: String(version), dev: true })),
  ];

  return {
    framework: fw.framework,
    frameworkLabel: fw.label,
    confidence: fw.confidence,
    packageManager: pm,
    buildCommand,
    installCommand,
    outputDirectory: fw.output,
    nodeVersion,
    rootDirectory: root,
    projectName: String(pkg?.name || bundle.name.replace(/\.zip$/i, '')).replace(/^@[^/]+\//, ''),
    dependencies,
    scripts,
    configFiles,
    entryPoints,
    envRefs,
    warnings,
    errors,
    stats: { files: bundle.files.length, size: bundle.totalSize, textFiles, byExt: [...extCount.entries()].map(([ext, count]) => ({ ext, count })).sort((a, b) => b.count - a.count).slice(0, 8) },
    supported: errors.length === 0,
  };
}
