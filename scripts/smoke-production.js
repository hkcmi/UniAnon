import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

function onceWithTimeout(promise, ms, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return port;
}

async function waitForHealth(url) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json();
        if (body.ok === true && Array.isArray(body.allowed_domains)) {
          return body;
        }
        lastError = new Error(`unexpected health response: ${JSON.stringify(body)}`);
      } else {
        lastError = new Error(`health returned ${response.status}`);
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw lastError || new Error('health check did not complete');
}

function strongSecret(label) {
  return `${label}-production-smoke-secret-1234567890`;
}

const tempDir = await mkdtemp(path.join(tmpdir(), 'unianon-production-smoke-'));
const port = await getFreePort();
const healthUrl = `http://127.0.0.1:${port}/health`;

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  TRUST_PROXY: 'loopback',
  DATABASE_PATH: path.join(tempDir, 'unianon.sqlite'),
  SERVER_SECRET: strongSecret('server'),
  AUTH_SUBJECT_SECRET: strongSecret('subject'),
  AUTH_LOG_SECRET: strongSecret('auth-log'),
  NULLIFIER_SECRET: strongSecret('nullifier'),
  MEMBERSHIP_ASSERTION_SECRET: strongSecret('assertion'),
  COMMUNITY_ID: 'unianon-production-smoke',
  ALLOWED_DOMAINS: 'example.edu',
  APP_BASE_URL: 'https://unianon-smoke.example.edu',
  EMAIL_DELIVERY: 'smtp',
  EMAIL_FROM: 'UniAnon Smoke <no-reply@unianon-smoke.example.edu>',
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  REDIS_URL: ''
};

const child = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const health = await onceWithTimeout(waitForHealth(healthUrl), timeoutMs, 'production smoke test');
  if (!health.allowed_domains.includes('example.edu')) {
    throw new Error(`health response did not include configured domain: ${JSON.stringify(health)}`);
  }

  console.log(`Production smoke test passed on ${healthUrl}`);
} catch (error) {
  console.error('Production smoke test failed.');
  if (stdout) {
    console.error(`stdout:\n${stdout}`);
  }
  if (stderr) {
    console.error(`stderr:\n${stderr}`);
  }
  throw error;
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 1000);
  });
  await rm(tempDir, { recursive: true, force: true });
}
