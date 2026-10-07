import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const base = 'http://localhost:3137';
let child;
test.before(async () => {
  child = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3137',
      APP_URL: base,
      GOOGLE_CLIENT_ID: 'local-test.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'not-a-real-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server start timeout')), 10000);
    child.stdout.on('data', (data) => {
      if (data.toString().includes('Air dashboard:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      reject(new Error('Server exited before start'));
    });
  });
});
test.after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, 'exit');
  }
});
test('keeps credentials out of the status endpoint', async () => {
  const res = await fetch(base + '/api/status');
  const body = await res.json();
  assert.equal(body.configured, true);
  assert.equal(body.connected, false);
  assert.ok(!JSON.stringify(body).includes('not-a-real-secret'));
  assert.equal(res.headers.get('cache-control'), 'no-store');
});
test('requires a signed-in session for health data', async () => {
  assert.equal((await fetch(base + '/api/dashboard?end=2026-09-22&days=7')).status, 401);
});
test('rejects writes from other origins', async () => {
  assert.equal(
    (
      await fetch(base + '/api/setup', {
        method: 'POST',
        headers: {
          origin: 'https://example.com',
          'Content-Type': 'application/json',
          'X-Air-Request': '1',
        },
        body: '{}',
      })
    ).status,
    403,
  );
});
test('rejects malformed client files', async () => {
  assert.equal(
    (
      await fetch(base + '/api/setup', {
        method: 'POST',
        headers: {
          origin: base,
          'Content-Type': 'application/json',
          'X-Air-Request': '1',
        },
        body: JSON.stringify({ web: { client_id: 3 } }),
      })
    ).status,
    400,
  );
});
test('creates a read-only Google consent URL with state and PKCE', async () => {
  const res = await fetch(base + '/auth/google', { redirect: 'manual' });
  assert.equal(res.status, 302);
  const url = new URL(res.headers.get('location'));
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), base + '/auth/google/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state').length, 64);
  assert.ok(
    url.searchParams
      .get('scope')
      .split(' ')
      .every((s) => s.endsWith('.readonly')),
  );
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const callback = await fetch(base + '/auth/google/callback?state=invalid&code=invalid', {
    redirect: 'manual',
    headers: { cookie: cookie.split(';')[0] },
  });
  assert.equal(callback.headers.get('location'), '/?authError=state');
});
test('serves the production dashboard', async () => {
  const res = await fetch(base);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Health \| Theo Azriel/);
});
