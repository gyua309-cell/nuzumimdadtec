/**
 * Local development PostgreSQL runner.
 *
 * Runs REAL PostgreSQL binaries (shipped by the `@embedded-postgres/*` npm
 * package) so developers without Docker / a system-wide PostgreSQL install can
 * work. Production and staging MUST use an installed / managed PostgreSQL
 * server and only point DATABASE_URL at it. This tool is never shipped.
 *
 * PostgreSQL on Windows cannot execute from non-ASCII paths (the project lives
 * in an Arabic-named folder), so the binaries are copied once to an ASCII-only
 * directory (IDHAM_DEVDB_DIR, default C:\idham-devdb) and executed from there.
 *
 * Usage:  node start.js          -> init (first time) + start + create DBs, stays in foreground
 *         node start.js --stop   -> stop the server
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, spawn } = require('child_process');
const net = require('net');

const root = process.env.IDHAM_DEVDB_DIR || path.join(process.env.SystemDrive || 'C:', path.sep, 'idham-devdb');
const port = Number(process.env.IDHAM_DEVDB_PORT || 54329);
const user = process.env.IDHAM_DEVDB_USER || 'idham_owner';
const password = process.env.IDHAM_DEVDB_PASSWORD || 'idham_dev_only_password';
const databases = ['idham', 'idham_test'];

const binDir = path.join(root, 'pgsql', 'bin');
const dataDir = path.join(root, 'data');
const logFile = path.join(root, 'postgres.log');
const exe = (name) => path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);

function platformPackageDir() {
  const pkg = path.join('@embedded-postgres', `${process.platform === 'win32' ? 'windows' : process.platform}-${os.arch()}`);
  for (const base of require.resolve.paths('embedded-postgres') || []) {
    const candidate = path.join(base, pkg);
    if (fs.existsSync(path.join(candidate, 'native'))) return candidate;
  }
  throw new Error(`PostgreSQL binaries package ${pkg} not found. Run npm install.`);
}

function ensureBinaries() {
  if (fs.existsSync(exe('postgres'))) return;
  const src = path.join(platformPackageDir(), 'native');
  console.log(`[devdb] copying PostgreSQL binaries to ${path.join(root, 'pgsql')} ...`);
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(src, path.join(root, 'pgsql'), { recursive: true });
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) {
    throw new Error(`${path.basename(cmd)} failed (${r.status}): ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

function initCluster() {
  if (fs.existsSync(path.join(dataDir, 'PG_VERSION'))) return;
  console.log(`[devdb] initialising cluster at ${dataDir}`);
  const pwFile = path.join(os.tmpdir(), `idham-pw-${process.pid}`);
  fs.writeFileSync(pwFile, password);
  try {
    run(exe('initdb'), [
      `--pgdata=${dataDir}`, `--username=${user}`, `--pwfile=${pwFile}`,
      '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--lc-messages=C',
    ]);
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
}

function isPortOpen() {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' }, () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

function connect(database) {
  const { Client } = require('pg');
  return new Client({ host: '127.0.0.1', port, user, password, database });
}

async function waitReady(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = connect('postgres');
    try {
      await c.connect();
      await c.end();
      return;
    } catch {
      await new Promise((res) => setTimeout(res, 500));
    }
  }
  throw new Error('PostgreSQL did not become ready in time');
}

async function createDatabases() {
  const c = connect('postgres');
  await c.connect();
  try {
    for (const db of databases) {
      const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
      if (r.rowCount === 0) {
        await c.query(`CREATE DATABASE "${db}" ENCODING 'UTF8' TEMPLATE template0`);
        console.log(`[devdb] created database ${db}`);
      }
    }
  } finally {
    await c.end();
  }
}

function stop() {
  spawnSync(exe('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'inherit' });
}

async function main() {
  ensureBinaries();
  if (process.argv.includes('--stop')) { stop(); return; }
  initCluster();

  let child = null;
  if (!(await isPortOpen())) {
    // stale pid file from a killed run would block startup
    fs.rmSync(path.join(dataDir, 'postmaster.pid'), { force: true });
    const out = fs.openSync(logFile, 'a');
    child = spawn(exe('postgres'), ['-D', dataDir, '-p', String(port), '-c', 'listen_addresses=127.0.0.1'],
      { stdio: ['ignore', out, out], windowsHide: true });
    child.on('exit', (code) => {
      console.log(`[devdb] postgres exited with code ${code}`);
      process.exit(code ?? 0);
    });
  } else {
    console.log(`[devdb] something is already listening on ${port}, reusing it`);
  }
  await waitReady();
  await createDatabases();

  console.log(`\n[devdb] PostgreSQL ready on 127.0.0.1:${port}`);
  console.log(`[devdb] DATABASE_URL=postgres://${user}:<password>@127.0.0.1:${port}/idham`);
  console.log(`[devdb] log: ${logFile}`);
  if (!child) return;
  console.log('[devdb] running in foreground - press Ctrl+C (or npm run db:stop) to stop.');
  const shutdown = () => { stop(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[devdb] failed:', e.message || e);
  process.exit(1);
});
