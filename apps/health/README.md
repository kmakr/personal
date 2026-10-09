# Air health dashboard

A local dashboard for Fitbit Air data from the Google Health API v4. It shows steps, active zone minutes, sleep stages, resting heart rate, heart rate variability, breathing rate, and blood oxygen.

## Run

Requires Node.js 22.12 or later and Bun.

This app is the `@theo/health` workspace in the personal site repository.
From the repository root, run `bun install`, then `bun run dev:health`.
The commands below run from `apps/health`.

```sh
bun run dev
```

Open http://localhost:3000. The first view shows **sample data**. Click **Connect Google Health** for the setup guide.

## Connect your account

1. Create a Google Cloud project and enable the [Google Health API](https://console.cloud.google.com/apis/library/health.googleapis.com).
2. Set up Google Auth Platform. Use an External audience in Testing mode. Add your Fitbit Google account as a test user.
3. Add these read-only scopes in Data Access:
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
4. Create an OAuth client of type **Web application**.
5. Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI.
6. Download the client JSON. Load it in the dashboard setup screen. Continue with Google and allow the requested read access.
7. Sync your Fitbit Air with the Google Health app. Then click Refresh in this dashboard.

The app saves the OAuth client file in `.local/google-oauth.json`, with owner-only file access. This folder is excluded from Git. Do not share this file. You can use `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` instead. Copy `.env.example` to `.env` for this option.

Access and refresh tokens stay in server memory. They do not go to browser storage or logs. The browser gets an HTTP-only session cookie. A server restart clears sessions and requires sign-in again. Google testing-mode refresh tokens can expire after seven days. Disconnect clears the local session and attempts to revoke Google access. If revocation fails, remove the app in your Google account permissions.

## Data rules

- The app reads Google and Fitbit wearable data with the `google-wearables` source family. This can include another Google wearable on the same account. It does not claim device-exclusive Air data.
- Daily totals use `dailyRollUp`. Daily measurements and sleep use `reconcile` with pagination.
- A range ends at midnight after the selected date. The dashboard uses civil dates from the API. Sleep is assigned to its wake date. Sleep chart times use the recorded UTC offset.
- Time asleep includes all sessions on a date. The sleep detail panel shows the main session, or the longest session when no main session is marked.
- Missing values remain null. Failed metrics have visible errors. Live data never falls back to sample records.
- Active zone minutes are already intensity-weighted by Google. The app sums the returned zone values without weighting them again.
- The step target is a fixed display target of 10,000. It is not read from your Fitbit account.
- Refresh reads cloud records. It does not trigger a device sync. The server caches one result per session for 60 seconds. Refresh bypasses that cache.

## Checks

```sh
bun run build
bun run test
bun run start
```

This app binds only to the local computer. It is not configured for a public server or multiple users. A public deployment requires a persistent session store, HTTPS, secret storage, and a separate access-control design.

## Official API references

- https://developers.google.com/health/setup
- https://developers.google.com/health/endpoints
- https://developers.google.com/health/data-types/device-compatibility
- https://health.googleapis.com/$discovery/rest?version=v4

The API request and response fields were checked against Google's v4 discovery document. Local tests use sample API responses. Live account access must be tested after you create the OAuth client and sign in.

## Public page on theoazriel.com

The public build runs at `https://theoazriel.com/health/` in a separate Cloudflare Worker, `theo-health`. It does not deploy or modify the notes site. Visitors can read daily steps and active zone minutes. Each day is published after seven full days. Complete weekly activity totals remain in the API. Google access still uses only the three read-only scopes above.

1. Complete Google sign-in on the local dashboard. If Google returns 403, add the Fitbit Google account to the Cloud project's Test users list.
2. Click **Publish my health data** on the local dashboard.
3. The local server sends the OAuth client and refresh token directly to the owner-only cloud endpoint over HTTPS. They are never sent to visitors or browser storage.
4. The cloud service encrypts credentials with AES-GCM. Its encryption key and owner access key are Cloudflare secrets. Private state is stored in a Durable Object.
5. The first sync starts at once. Later syncs run once per hour, even when this computer is off. The first sync requests 98 days of steps and active zone minutes in 14-day windows. A failed history request is retried on the next sync. Later syncs refresh the last 28 days. The service retains 98 days, which covers the 12 public weeks and the sharing delay. Blood oxygen, sleep, heart rate, HRV, and breathing rate are not fetched or stored by the cloud sync. A sharing-policy version change triggers a fresh history request so newly approved measurements are loaded.
6. The public response contains the sharing policy, a fixed 84-day daily window, and 12 calendar weeks of activity totals. Dates use Hong Kong time. A daily record appears after its day ends and seven full days pass. For example, 30 September 2026 appears at 00:00 on 8 October. Each weekly metric still needs seven recorded daily values. Daily values remain visible when a week is incomplete. Query parameters cannot bypass the delay or request other measurements. No exact sync timestamps, sleep records, unapproved measurements, account details, or credentials appear in the response. Missing data stays empty; the public build never substitutes sample values. The Worker keeps a copy of the response in the edge cache for five minutes. An owner action clears that copy in the data center that received it. Other data centers can show the old copy for up to five minutes.
7. Click **Remove public data** in the local dashboard to remove the cloud connection and its records. Local Google sign-in is separate. **Disconnect account** revokes local Google access; that can also stop future cloud syncs, but does not remove already published records.

Local owner settings are in `.local/public-cloud.json`. Cloud secret backup values are in `.local/cloud-secrets.json`. Both files have owner-only permissions and are excluded from Git. Do not put either file in a public asset folder.

Google testing-mode refresh tokens can expire after seven days. Sign in locally again and click **Publish my health data** to renew the cloud connection. Hosting a public read-only page does not require visitors to authorize Google access.

Commands:

```sh
bun run build:public
bunx wrangler dev --local --port 8787
bunx wrangler deploy --dry-run
bun run deploy:public
```

Cloud secrets required: `OWNER_KEY` (random owner authorization key) and `DATA_KEY` (base64-encoded 32-byte encryption key). Upload through `wrangler secret bulk` from the protected local secrets file. Never use a Vite variable for secrets.

## Repository migration

The source was copied from the original `health-dashboard` folder. That folder
remains available as a local backup. Its credentials, health records, build
output, and dependencies were not copied into this repository.

For local account setup, load the OAuth client JSON through the setup screen.
To use the existing cloud owner connection, copy only `.local/public-cloud.json`
from the original folder into this app's ignored `.local` folder. Keep the
folder permissions at `700` and the file permissions at `600`. Do not print or
commit its contents. Cloud credentials remain in the existing Cloudflare
Worker; moving the source does not require changing its secrets.

The health deployment workflow uses the repository's `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets. The token must permit version uploads and deployments of
`theo-health`. Automatic deployments keep the existing route and do not need
permission to edit it. The Worker name, route, Durable Object binding, and
migration tag are unchanged. Do not rename them during a source-only move.

## Public privacy policy

- Public: daily steps and intensity-weighted active zone minutes. Complete weekly activity totals are also available in the API.
- Delay: seven full days after each day ends, using Hong Kong time. Weekly totals retain their seven-day delay after the week ends.
- Private: blood oxygen, sleep duration and stages, sleep times, heart rate, HRV, breathing rate, and account information.
- The server applies this field allowlist and date limit to every response, including old stored data. Query parameters cannot override them.
- Cloud snapshots retain only the two approved activity measurements. The local owner dashboard can still show all authorized measurements.
- Missing values stay null. Partial-period sums on the page show their recorded-day counts. Incomplete weekly API totals stay null.

Automatic deployment uses `wrangler versions upload` and deploys that exact
version tag at 100 percent traffic. It keeps the existing `/health/` route and
needs Worker upload and deployment permissions only. A full manual
`bun run deploy:health` also needs `Workers Routes: Edit` for the
`theoazriel.com` zone. Keep any route access limited to that zone. Initial
route setup or a future Durable Object migration may require a full manual
deployment before automated version deployments resume.

### Public activity view

The page opens as a Monday-first garden calendar. Each shared date has a selectable plant. Stem height compares step counts within the selected period; leaf count compares active zone minutes. Missing step records use dotted stems. Recorded zero steps use a seed at the baseline. The garden starts on the first recorded day, so empty history before it is not drawn as missing plants. Dates before that day or outside the public 84-day window are faded and disabled. Garden ranges that would show no more days than a shorter range are disabled. The alternate Garden view retains 7-, 14-, and 28-day layouts.

A butterfly moves to the selected plant and perches above its flower, then stops. Selection works with a pointer or keyboard. The plants are one tab stop: the arrow keys move the selection by a day, or by a week in the calendar, and Home and End go to the first and last day. “Grow again” replays the plant animation. System reduced-motion settings disable movement and wing animation. The selected-day panel and expandable table show exact activity values.

Under the introduction, one sentence gives the average daily steps over the last four weeks, counting recorded days only. It appears once seven days are recorded. It compares with the four weeks before only when both windows have at least 14 recorded days; changes under 5 percent read as about the same. Rolling windows are used because the sharing delay always leaves the current calendar month partial.

Below the garden, “Week by week” draws the API's weekly totals as one plant per Monday-to-Sunday week, starting with the week of the first shared record. A week missing a day has no total and draws a dotted stem. The section stays hidden until there are two weeks to compare.

Blood oxygen is excluded from the public UI, API response, cloud fetch, and stored snapshot. Old cloud snapshots are stripped when loaded. The private local dashboard can still show blood oxygen.

The owner-only sync response reports whether the sync succeeded, whether the policy's history request completed, and the number of stored days per approved metric. These diagnostics do not appear in the public feed.
