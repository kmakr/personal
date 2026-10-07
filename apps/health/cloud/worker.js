import { DurableObject } from 'cloudflare:workers';
import { OAuth2Client } from 'google-auth-library';
import { fetchHealth, addDays, SCOPES } from '../server/health.js';
import { activitySnapshot, readPublicData, hongKongDate, seal, unseal } from './public-data.js';
const prefix = '/health';
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
const today = hongKongDate;
async function owner(request, env) {
  if (!env.OWNER_KEY) return false;
  const given = request.headers.get('Authorization') || '';
  const [a, b] = await Promise.all(
    [given, `Bearer ${env.OWNER_KEY}`].map((s) =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
  );
  const x = new Uint8Array(a),
    y = new Uint8Array(b);
  return x.reduce((r, v, i) => r | (v ^ y[i]), 0) === 0;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/health') return Response.redirect(`${url.origin}/health/`, 308);
    if (!path.startsWith(prefix + '/')) return fetch(request);
    const store = env.HEALTH.get(env.HEALTH.idFromName('theo'));
    try {
      if (path.startsWith(prefix + '/api/admin/')) {
        if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
        if (!(await owner(request, env))) return json({ error: 'Owner access required.' }, 401);
        const action = path.slice((prefix + '/api/admin/').length);
        if (!['connect', 'disconnect', 'sync'].includes(action))
          return json({ error: 'Not found.' }, 404);
        if (Number(request.headers.get('content-length') || 0) > 32000)
          return json({ error: 'Request too large.' }, 413);
        const text = await request.text();
        if (text.length > 32000) return json({ error: 'Request too large.' }, 413);
        return store.fetch(
          new Request(`https://internal/${action}`, {
            method: 'POST',
            body: text,
          }),
        );
      }
      if (path === prefix + '/api/status' && request.method === 'GET')
        return store.fetch('https://internal/status');
      if (path === prefix + '/api/dashboard' && request.method === 'GET')
        return store.fetch(`https://internal/data${url.search}`);
      if (path.startsWith(prefix + '/api/')) return json({ error: 'Not found.' }, 404);
      if (!['GET', 'HEAD'].includes(request.method))
        return json({ error: 'Method not allowed.' }, 405);
      url.pathname = path.slice(prefix.length) || '/';
      const response = await env.ASSETS.fetch(new Request(url, request));
      const headers = new Headers(response.headers);
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return json({ error: 'The health feed is temporarily unavailable.' }, 503);
    }
  },
};
export class HealthFeed extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.syncing = null;
    this.epoch = 0;
    this.ctx.blockConcurrencyWhile(async () => {
      const snapshot = await this.ctx.storage.get('snapshot');
      if (snapshot) await this.ctx.storage.put('snapshot', activitySnapshot(snapshot));
    });
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (['/connect', '/disconnect'].includes(path)) {
      return this.ctx.blockConcurrencyWhile(() => this.handle(request));
    }
    return this.handle(request);
  }
  async handle(request) {
    const url = new URL(request.url);
    if (url.pathname === '/status') {
      const connection = await this.ctx.storage.get('credentials');
      return json({ public: true, configured: true, connected: !!connection });
    }
    if (url.pathname === '/connect' && request.method === 'POST') {
      let input;
      try {
        input = await request.json();
      } catch {
        return json({ error: 'Invalid JSON.' }, 400);
      }
      if (
        typeof input.clientId !== 'string' ||
        !input.clientId.endsWith('.apps.googleusercontent.com') ||
        typeof input.clientSecret !== 'string' ||
        typeof input.tokens?.refresh_token !== 'string'
      )
        return json({ error: 'Sign in again to obtain offline access.' }, 400);
      const scopes = (input.tokens.scope || '').trim().split(/\s+/);
      if (SCOPES.some((s) => !scopes.includes(s)) || scopes.some((s) => !SCOPES.includes(s)))
        return json({ error: 'Grant all three read-only health permissions.' }, 400);
      this.epoch++;
      await this.ctx.storage.put(
        'credentials',
        await seal(
          {
            clientId: input.clientId,
            clientSecret: input.clientSecret,
            tokens: input.tokens,
          },
          this.env.DATA_KEY,
        ),
      );
      await this.ctx.storage.delete('snapshot');
      await this.ctx.storage.delete('lastError');
      await this.ctx.storage.setAlarm(Date.now() + 1000);
      return json({
        connected: true,
        message: 'Public health sync will start now.',
      });
    }
    if (url.pathname === '/disconnect' && request.method === 'POST') {
      this.epoch++;
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return json({ disconnected: true });
    }
    if (url.pathname === '/sync' && request.method === 'POST') {
      await this.sync();
      return json({ synced: true });
    }
    if (url.pathname === '/data') {
      // User-supplied ranges never select daily or more recent records.
      return json(await readPublicData(this.ctx.storage));
    }
    return json({ error: 'Not found.' }, 404);
  }
  async sync() {
    if (this.syncing) return this.syncing;
    this.syncing = this.performSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }
  async performSync() {
    const epoch = this.epoch;
    const sealed = await this.ctx.storage.get('credentials');
    if (!sealed) return;
    try {
      const saved = await unseal(sealed, this.env.DATA_KEY);
      const client = new OAuth2Client(saved.clientId, saved.clientSecret);
      client.setCredentials(saved.tokens);
      const end = today();
      const recent = await fetchHealth(client, end, 14, ['steps', 'zoneMinutes']);
      const older = await fetchHealth(client, addDays(end, -14), 14, ['steps', 'zoneMinutes']);
      const data = {
        fetchedAt: recent.fetchedAt,
        days: [...older.days, ...recent.days],
      };
      await this.ctx.blockConcurrencyWhile(async () => {
        if (epoch !== this.epoch) return;
        saved.tokens = { ...saved.tokens, ...client.credentials };
        await this.ctx.storage.put('credentials', await seal(saved, this.env.DATA_KEY));
        if (recent.warnings.length === 2 && older.warnings.length === 2) {
          await this.ctx.storage.put(
            'lastError',
            'The last update failed. Previously loaded values remain visible.',
          );
          return;
        }
        // Keep up to 90 days already fetched. Failed measurements retain their prior records.
        const previous = await this.ctx.storage.get('snapshot');
        const merged = new Map((previous?.days || []).map((r) => [r.date, r]));
        for (const row of data.days) {
          const old = merged.get(row.date);
          if (old)
            for (const w of row.date <= addDays(end, -14) ? older.warnings : recent.warnings) {
              if (w.metric === 'sleep') {
                row.sleep = old.sleep;
                row.sleepMinutes = old.sleepMinutes;
              } else row[w.metric] = old[w.metric];
            }
          merged.set(row.date, row);
        }
        data.days = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
        await this.ctx.storage.put('snapshot', activitySnapshot(data));
        await this.ctx.storage.delete('lastError');
      });
    } catch {
      if (epoch !== this.epoch) return;
      await this.ctx.storage.put(
        'lastError',
        'The Google connection needs attention. Previously loaded values remain visible.',
      );
    }
  }
  async alarm() {
    try {
      await this.sync();
    } finally {
      if (await this.ctx.storage.get('credentials'))
        await this.ctx.storage.setAlarm(Date.now() + 3600000);
    }
  }
}
