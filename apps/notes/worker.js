// theoazriel.com: the static site, plus one live endpoint for the Spotify track
// playing now or played last. Only requests under /api/ reach this script; the
// pages are served straight from the assets.
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
