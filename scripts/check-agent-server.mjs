// Black-box check of the built agent server, as the Go backend and Vercel see
// it: start `.mastra/output/index.mjs`, then assert over HTTP and SQL. No model
// is called. Run after `npm run build`, with CHECK_DATABASE_URL pointing at a
// throwaway Postgres database (CI provides one).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import pg from 'pg';

const databaseUrl = process.env.CHECK_DATABASE_URL;
if (!databaseUrl) throw new Error('CHECK_DATABASE_URL is required.');

const server = new URL('../.mastra/output/index.mjs', import.meta.url).pathname;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer().once('error', reject).listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Starts the server with exactly these variables on top of PATH, so a
// developer's own .env never leaks into the check.
function start(env) {
  const child = spawn(process.execPath, [server], { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  return { child, exited, output: () => output };
}

async function waitForHealth(base, run, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (run.child.exitCode !== null) throw new Error(`Agent server exited early:\n${run.output()}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.status === 200) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Agent server did not become healthy within ${timeoutMs}ms:\n${run.output()}`);
}

async function stop(run) {
  if (run.child.exitCode === null) run.child.kill('SIGTERM');
  await run.exited;
}

async function mastraTables() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'mastra'");
    return rows.map((row) => row.table_name);
  } finally {
    await client.end();
  }
}

// 1. With storage configured, the server starts, answers its health check and
//    creates its tables in the `mastra` schema.
{
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const run = start({ PORT: String(port), MASTRA_DATABASE_URL: databaseUrl });
  try {
    await waitForHealth(base, run);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200, 'GET /health must return 200.');
    let tables = [];
    for (let attempt = 0; attempt < 40 && tables.length === 0; attempt += 1) {
      tables = await mastraTables();
      if (tables.length === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(tables.length > 0, 'Mastra must create its tables in the `mastra` schema on start.');
    console.log(`ok: healthy, ${tables.length} tables in schema mastra`);
  } finally {
    await stop(run);
  }
}

// 2. Without MASTRA_DATABASE_URL the server refuses to start and names the
//    missing variable.
{
  const port = await freePort();
  const run = start({ PORT: String(port) });
  const code = await Promise.race([run.exited, new Promise((resolve) => setTimeout(() => resolve('timeout'), 30_000))]);
  if (code === 'timeout') await stop(run);
  assert.notEqual(code, 'timeout', 'The server must exit when MASTRA_DATABASE_URL is missing.');
  assert.notEqual(code, 0, 'The server must exit with a failure code when MASTRA_DATABASE_URL is missing.');
  assert.match(run.output(), /MASTRA_DATABASE_URL is required/, 'The startup error must name MASTRA_DATABASE_URL.');
  console.log('ok: refuses to start without MASTRA_DATABASE_URL');
}

console.log('Agent server checks passed.');
