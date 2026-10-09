// One-time Spotify sign-in for the "Listening" section on the homepage.
// Reads the Spotify app's client ID and secret from .local/spotify-client.json,
// opens Spotify's consent page, and saves the refresh token to
// .local/spotify-token.json with owner-only access. Nothing secret is printed.
//
//   node tools/spotify-auth.mjs                 sign in and save the token
//   node tools/spotify-auth.mjs secrets | bunx wrangler secret bulk
//                                               upload all three as Worker secrets
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';

const PORT = 8888;
// Spotify accepts loopback redirects only as 127.0.0.1, not localhost.
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = 'user-read-currently-playing user-read-recently-played';

const { clientId, clientSecret } = JSON.parse(await readFile('.local/spotify-client.json', 'utf8'));
if (!clientId || !clientSecret || /paste/i.test(clientId + clientSecret))
  throw new Error('Add the client ID and secret to .local/spotify-client.json first.');

if (process.argv[2] === 'secrets') {
  const { refreshToken } = JSON.parse(await readFile('.local/spotify-token.json', 'utf8'));
  process.stdout.write(
    JSON.stringify({
      SPOTIFY_CLIENT_ID: clientId,
      SPOTIFY_CLIENT_SECRET: clientSecret,
      SPOTIFY_REFRESH_TOKEN: refreshToken,
    }),
  );
} else {
  const state = randomBytes(16).toString('hex');
  const consent = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: REDIRECT,
    state,
  })}`;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, REDIRECT);
    if (url.pathname !== '/callback') return response.writeHead(404).end();
    const code = url.searchParams.get('code');
    const done = (message, failed = false) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' }).end(message);
      console.log(message);
      if (failed) process.exitCode = 1;
      server.close();
    };
    if (url.searchParams.get('state') !== state || !code)
      return done('Spotify sign-in was cancelled or failed. Run the script again.', true);
    const token = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
    });
    const body = await token.json();
    if (!token.ok || !body.refresh_token)
      return done(`Spotify did not return a token (${token.status}). Run the script again.`, true);
    await writeFile(
      '.local/spotify-token.json',
      JSON.stringify({ refreshToken: body.refresh_token }),
      { mode: 0o600 },
    );
    done('Saved .local/spotify-token.json. You can close this tab.');
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log('Opening Spotify sign-in in your browser…');
    execFile('open', [consent]);
  });
}
