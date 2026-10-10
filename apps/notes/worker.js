// theoazriel.com: the static site, plus two live endpoints: the Spotify track
// playing now or played last, and the ink drops visitors leave on the homepage.
// Only requests under /api/ reach this script; the pages are served straight
// from the assets.
import { DurableObject } from 'cloudflare:workers';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PLAYER = 'https://api.spotify.com/v1/me/player';
// Shared by every visitor for 30 seconds, so Spotify sees at most two calls a minute.
const MAX_AGE = 30;

const json = (body, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
  });

async function accessToken(env) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
    }),
  });
  if (!response.ok) throw new Error(`Spotify token request failed: ${response.status}`);
  return (await response.json()).access_token;
}

// Only the fields the page shows. Podcast episodes and local files are skipped.
export function publicTrack(item) {
  if (!item || item.type !== 'track' || item.is_local) return null;
  const images = item.album?.images || [];
  // Spotify lists covers largest first; 300px is plenty for a 64px sleeve.
  const image = images.find((cover) => cover.width && cover.width <= 300) || images.at(-1);
  return {
    title: item.name,
    artists: (item.artists || []).map((artist) => artist.name),
    album: item.album?.name ?? null,
    image: image?.url ?? null,
    url: item.external_urls?.spotify ?? null,
  };
}

export async function nowPlaying(env, fetcher = fetch) {
  const headers = { Authorization: `Bearer ${await accessToken(env)}` };
  // 204 means nothing is playing; anything but a playing track falls through.
  const current = await fetcher(`${PLAYER}/currently-playing`, { headers });
  if (current.status === 200) {
    const body = await current.json();
    const track = publicTrack(body.item);
    if (body.is_playing && track) return { playing: true, track };
  }
  const recent = await fetcher(`${PLAYER}/recently-played?limit=1`, { headers });
  if (!recent.ok) throw new Error(`Spotify history request failed: ${recent.status}`);
  const last = (await recent.json()).items?.[0];
  return {
    playing: false,
    // To the minute; the page only says how long ago.
    playedAt: last?.played_at ? `${last.played_at.slice(0, 16)}Z` : null,
    track: publicTrack(last?.track),
  };
}

// --- Shared ink drops ----------------------------------------------------------
// A drop is only where it fell and the seed that shapes it: no text, no name, and
// no address is kept. The newest few dozen stay for a week, then dry away.
const KEEP = 48;
const WEEK = 7 * 24 * 60 * 60 * 1000;

// Where a drop fell: across from the middle of the page (so it lands in the same
// place beside the column on any screen width) and down from the top.
export function validDrop(body) {
  const { x, y, seed } = body ?? {};
  if (![x, y, seed].every(Number.isFinite)) return null;
  if (Math.abs(x) > 1200 || y < 0 || y > 8000) return null;
  if (!Number.isInteger(seed) || seed < 0 || seed > 9999) return null;
  return { x: Math.round(x), y: Math.round(y), seed };
}

export class InkDrops extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS drops (id INTEGER PRIMARY KEY, x INTEGER, y INTEGER, seed INTEGER, at INTEGER)',
    );
    // Recent drops per visitor, held in memory only, to keep one hand from
    // flooding the page. It empties whenever the object sleeps.
    this.recent = new Map();
  }

  list() {
    const since = Date.now() - WEEK;
    this.ctx.storage.sql.exec('DELETE FROM drops WHERE at < ?', since);
    return this.ctx.storage.sql
      .exec('SELECT x, y, seed, at FROM drops ORDER BY at DESC LIMIT ?', KEEP)
      .toArray()
      .map(({ x, y, seed, at }) => ({
        x,
        y,
        seed,
        // Only how old it is, to the hour; enough to let older ink fade.
        hours: Math.floor((Date.now() - at) / 3600000),
      }));
  }

  add(drop, visitor) {
    const now = Date.now();
    const times = (this.recent.get(visitor) ?? []).filter((time) => now - time < 3600000);
    // At most one drop a second and twenty an hour from any one visitor.
    if (now - (times.at(-1) ?? 0) < 1000 || times.length >= 20) return false;
    times.push(now);
    this.recent.set(visitor, times);
    if (this.recent.size > 500) this.recent.delete(this.recent.keys().next().value);
    const sql = this.ctx.storage.sql;
    sql.exec(
      'INSERT INTO drops (x, y, seed, at) VALUES (?, ?, ?, ?)',
      drop.x,
      drop.y,
      drop.seed,
      now,
    );
    sql.exec(
      'DELETE FROM drops WHERE id NOT IN (SELECT id FROM drops ORDER BY at DESC LIMIT ?)',
      KEEP,
    );
    return true;
  }
}

async function inkDrops(request, env) {
  const url = new URL(request.url);
  const paper = env.INK_DROPS.get(env.INK_DROPS.idFromName('home'));
  if (request.method === 'GET') return json({ drops: await paper.list() });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  // Only the site's own pages may leave ink.
  if (request.headers.get('Origin') !== url.origin) return json({ error: 'Forbidden.' }, 403);
  const drop = validDrop(await request.json().catch(() => null));
  if (!drop) return json({ error: 'Not a drop.' }, 400);
  const visitor = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  return (await paper.add(drop, visitor))
    ? json({ ok: true }, 201)
    : json({ error: 'Slow down.' }, 429);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ink-drops') return inkDrops(request, env);
    if (url.pathname !== '/api/now-playing') return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    if (!env.SPOTIFY_REFRESH_TOKEN) return json({ playing: false, track: null });
    const key = new Request(`${url.origin}/api/now-playing`);
    const cached = await caches.default.match(key);
    if (cached) return cached;
    try {
      const response = json(await nowPlaying(env), 200, `public, max-age=${MAX_AGE}`);
      ctx.waitUntil(caches.default.put(key, response.clone()));
      return response;
    } catch {
      return json({ error: 'Spotify is unavailable.' }, 503);
    }
  },
};
