import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SCOPES, fetchHealth, validDate } from './health.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const base = new URL(process.env.APP_URL || `http://localhost:${port}`);
if (!['localhost', '127.0.0.1'].includes(base.hostname) || base.protocol !== 'http:')
  throw new Error('This app supports local HTTP use only.');
const redirectUri = `${base.origin}/auth/google/callback`;
let config;
let publicCloud;
try {
  publicCloud = JSON.parse(await readFile('.local/public-cloud.json', 'utf8'));
} catch {
  // Cloud publishing remains unavailable until local owner settings exist.
}
try {
  config = JSON.parse(await readFile('.local/google-oauth.json', 'utf8'));
} catch {
  // The setup screen or environment can supply the OAuth client.
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  config = {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
  };
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.headers.host !== base.host)
    return res.status(403).send(`Open ${base.origin} to use this app.`);
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  });
  if (
    req.method === 'POST' &&
    (req.headers.origin !== base.origin || req.headers['x-air-request'] !== '1')
  )
    return res.status(403).json({ error: 'Request origin rejected.' });
  next();
});
app.use(express.json({ limit: '32kb' }));
const sessionStore = new session.MemoryStore();
// Clear expired local sessions even when their browsers do not return.
setInterval(() => sessionStore.all(() => {}), 300000).unref();
app.use(
  session({
    store: sessionStore,
    secret: randomBytes(48).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
const oauth = () => new OAuth2Client(config.client_id, config.client_secret, redirectUri);
app.get('/api/status', (req, res) =>
  res.json({
    configured: !!config,
    publicPublishing: !!publicCloud,
    connected: !!req.session.tokens,
    redirectUri,
    scopes: SCOPES,
  }),
);
app.post('/api/setup', async (req, res) => {
  const web = req.body?.web;
  if (
    typeof web?.client_id !== 'string' ||
    !web.client_id.endsWith('.apps.googleusercontent.com') ||
    typeof web.client_secret !== 'string' ||
    !web.client_secret ||
    web.client_secret.length > 1000
  )
    return res.status(400).json({ error: 'Select the OAuth JSON file for a Web application.' });
  if (!web.redirect_uris?.includes(redirectUri))
    return res.status(400).json({
      error: `Add ${redirectUri} to the allowed redirect URIs. Then download the JSON file again.`,
    });
  await mkdir('.local', { recursive: true, mode: 0o700 });
  const nextConfig = {
    client_id: web.client_id,
    client_secret: web.client_secret,
  };
  await writeFile('.local/google-oauth.json', JSON.stringify(nextConfig), {
    mode: 0o600,
  });
  config = nextConfig;
  req.session.tokens = null;
  res.json({ configured: true });
});
app.get('/auth/google', async (req, res) => {
  if (!config) return res.redirect('/?setup=1');
  const client = oauth();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  req.session.oauth = {
    state: randomBytes(32).toString('hex'),
    verifier: codeVerifier,
    created: Date.now(),
  };
  const url = client.generateAuthUrl({
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: req.session.oauth.state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  req.session.save(() => res.redirect(url));
});
app.get('/auth/google/callback', async (req, res) => {
  const pending = req.session.oauth;
  delete req.session.oauth;
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (
    !pending ||
    Date.now() - pending.created > 600000 ||
    !/^[a-f0-9]{64}$/.test(state) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))
  )
    return res.redirect('/?authError=state');
  if (req.query.error || typeof req.query.code !== 'string')
    return res.redirect('/?authError=denied');
  try {
    const { tokens } = await oauth().getToken({
      code: req.query.code,
      codeVerifier: pending.verifier,
    });
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.tokens = tokens;
    req.session.save(() => res.redirect('/?connected=1'));
  } catch {
    res.redirect('/?authError=exchange');
  }
});
app.post('/api/disconnect', async (req, res) => {
  let revoked = false;
  if (req.session.tokens && config) {
    try {
      const client = oauth();
      client.setCredentials(req.session.tokens);
      await client.revokeCredentials();
      revoked = true;
    } catch {
      // Still clear the local session and report that revocation failed.
    }
  }
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ disconnected: true, revoked });
  });
});
app.get('/api/dashboard', async (req, res) => {
  if (!config || !req.session.tokens)
    return res.status(401).json({ error: 'Connect your Google account to load your health data.' });
  const days = Number(req.query.days || 7),
    endDate = req.query.end;
  if (![7, 14].includes(days) || !validDate(endDate))
    return res.status(400).json({ error: 'Select a valid date and a 7 or 14 day range.' });
  const cacheKey = `${endDate}:${days}`;
  if (
    req.session.healthCache?.key === cacheKey &&
    Date.now() - req.session.healthCache.time < 60000 &&
    req.query.refresh !== '1'
  )
    return res.json(req.session.healthCache.data);
  const client = oauth();
  client.setCredentials(req.session.tokens);
  client.on('tokens', (tokens) => {
    req.session.tokens = { ...req.session.tokens, ...tokens };
  });
  const data = await fetchHealth(client, endDate, days);
  req.session.tokens = { ...req.session.tokens, ...client.credentials };
  req.session.healthCache = { key: cacheKey, time: Date.now(), data };
  res.json(data);
});
app.post('/api/cloud/:action', async (req, res) => {
  if (!publicCloud || !['connect', 'disconnect'].includes(req.params.action))
    return res.status(400).json({ error: 'Public publishing is not configured.' });
  if (req.params.action === 'connect' && (!config || !req.session.tokens?.refresh_token))
    return res.status(401).json({
      error: 'Sign in with Google first. Allow all three read-only health permissions.',
    });
  const payload =
    req.params.action === 'connect'
      ? {
          clientId: config.client_id,
          clientSecret: config.client_secret,
          tokens: req.session.tokens,
        }
      : {};
  try {
    const result = await fetch(`https://theoazriel.com/health/api/admin/${req.params.action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicCloud.ownerKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    const body = await result.json();
    res.status(result.status).json(body);
  } catch {
    res.status(502).json({ error: 'The public service could not be reached. Try again.' });
  }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { port: 24679 } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'The local server could not complete the request.' });
});
app.listen(port, '127.0.0.1', () => console.log(`Air dashboard: ${base.origin}`));
