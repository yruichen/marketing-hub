import { spawn } from 'node:child_process';
import { context } from 'esbuild';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCommand = process.platform === 'win32'
  ? 'node_modules\\.bin\\electron.cmd'
  : 'node_modules/.bin/electron';
const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173';
const children = new Set();
let electronProcess = null;
let shuttingDown = false;
let restartTimer = null;

function spawnChild(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function waitForRenderer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(rendererUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Renderer did not start at ${rendererUrl}`);
}

function restartElectron() {
  if (shuttingDown) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (electronProcess && !electronProcess.killed) electronProcess.kill();
    electronProcess = spawnChild(electronCommand, ['.'], {
      env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
    });
  }, 150);
}

const restartPlugin = {
  name: 'restart-electron',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) restartElectron();
    });
  },
};

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  await Promise.all([mainContext.dispose(), preloadContext.dispose()]);
  process.exit(exitCode);
}

const shared = {
  bundle: true,
  external: ['electron'],
  logLevel: 'info',
  platform: 'node',
  sourcemap: true,
  target: 'node24',
};

const mainContext = await context({
  ...shared,
  entryPoints: ['src/main/index.ts'],
  format: 'esm',
  outfile: 'dist/main/index.js',
  plugins: [restartPlugin],
});
const preloadContext = await context({
  ...shared,
  entryPoints: ['src/preload/index.ts'],
  format: 'cjs',
  outfile: 'dist/preload/index.cjs',
  plugins: [restartPlugin],
});

const rendererProcess = spawnChild(npmCommand, ['--prefix', '../frontend', 'run', 'dev', '--', '--host', '127.0.0.1'], {
  env: { ...process.env },
});
rendererProcess.once('exit', (code) => {
  if (!shuttingDown) void shutdown(code ?? 1);
});

await Promise.all([mainContext.watch(), preloadContext.watch(), waitForRenderer()]);
restartElectron();

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('uncaughtException', (error) => {
  console.error(error);
  void shutdown(1);
});
