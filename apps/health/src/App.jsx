import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Heart,
  Link2,
  Moon,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { demoData, localDate } from './demo';

const format = (v) => (v == null ? '—' : Math.round(v).toLocaleString());
const duration = (v) =>
  v == null ? '—' : `${Math.floor(Math.round(v) / 60)}h ${Math.round(v) % 60}m`;
const dateLabel = (s) =>
  new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
const mean = (rows, key) => {
  const v = rows.map((r) => r[key]).filter((v) => v != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
async function api(url, body) {
  const res = await fetch(
    url,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Air-Request': '1' },
          body: JSON.stringify(body),
        },
  );
  // An HTML error page from a proxy or a crashed server is not JSON.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function Spark({ values, color = '#242424' }) {
  const valid = values.filter((v) => v != null);
  if (!valid.length) return <div className="spark empty-spark">No data</div>;
  const low = Math.min(...valid) - 3,
    high = Math.max(...valid) + 3;
  const points = values.map((v, i) =>
    v == null ? null : `${(i * 120) / (values.length - 1)},${35 - ((v - low) / (high - low)) * 30}`,
  );
  let paths = [],
    current = [];
  for (const p of points) {
    if (p) current.push(p);
    else {
      if (current.length) paths.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) paths.push(current.join(' '));
  return (
    <svg className="spark" viewBox="0 0 120 40" aria-hidden="true">
      {paths.map((p, i) => (
        <polyline
          key={i}
          points={p}
          fill="none"
          stroke={color}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
function Metric({ icon: Icon, title, value, unit, values, color, note }) {
  return (
    <article className="metric">
      <div className="metric-name">
        <Icon size={17} style={{ color }} />
        {title}
      </div>
      <div className="metric-body">
        <div>
          <strong>{value}</strong>
          <span>{unit}</span>
        </div>
        <Spark values={values} color={color} />
      </div>
      <p>{note}</p>
    </article>
  );
}
function SleepChart({ sleep }) {
  const types = ['AWAKE', 'REM', 'LIGHT', 'DEEP'];
  const labels = ['Awake', 'REM', 'Light', 'Deep'];
  const start = Date.parse(sleep?.interval?.startTime),
    end = Date.parse(sleep?.interval?.endTime);
  const stages = sleep?.stages || [];
  const clock = (t, offset) =>
    new Date(t + Number.parseFloat(offset || '0') * 1000).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  return (
    <>
      <div className="sleep-chart">
        <div className="stage-labels">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <div className="stage-plot">
          {types.map((t) => (
            <div className="stage-line" key={t} />
          ))}
          {stages.length && end > start ? (
            <svg
              viewBox="0 0 600 112"
              preserveAspectRatio="none"
              role="img"
              aria-label="Sleep stages during the selected night"
            >
              {stages
                .filter((s) => types.includes(s.type))
                .map((s, i) => (
                  <rect
                    key={i}
                    x={((Date.parse(s.startTime) - start) / (end - start)) * 600}
                    y={types.indexOf(s.type) * 28 + 4}
                    width={Math.max(
                      1,
                      ((Date.parse(s.endTime) - Date.parse(s.startTime)) / (end - start)) * 600,
                    )}
                    height="18"
                    rx="3"
                    className={`stage-${s.type}`}
                  />
                ))}
            </svg>
          ) : (
            <div className="chart-empty">No sleep stages for this date</div>
          )}
        </div>
      </div>
      <div className="sleep-axis">
        <span>{sleep ? clock(start, sleep.interval.startUtcOffset) : 'Bedtime'}</span>
        <span>{sleep ? clock(end, sleep.interval.endUtcOffset) : 'Wake time'}</span>
      </div>
      <div className="sleep-key">
        {['DEEP', 'LIGHT', 'REM', 'AWAKE'].map((type) => {
          const v = sleep?.summary?.stagesSummary?.find((s) => s.type === type)?.minutes;
          return (
            <div key={type}>
              <span>
                <i className={`stage-${type}`} />
                {type === 'REM' ? 'REM' : type[0] + type.slice(1).toLowerCase()}
              </span>
              <b>{duration(v == null ? null : Number(v))}</b>
            </div>
          );
        })}
      </div>
    </>
  );
}
function Setup({ status, onClose, onStatus }) {
  const [step, setStep] = useState(status?.configured ? 3 : 1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const dialog = useRef();
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/setup', JSON.parse(await file.text()));
      await onStatus();
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="setup-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="setup">
        <button className="close icon-button" aria-label="Close setup" onClick={onClose}>
          <X size={20} />
        </button>
        <div className="setup-icon">
          <Link2 size={25} />
        </div>
        <h2 id="setup-title">Connect your Fitbit Air</h2>
        <p>Read your data through the Google Health API. Complete this setup once.</p>
        <div className="setup-steps">
          {['Google Cloud', 'Client file', 'Connect'].map((s, i) => (
            <button
              key={s}
              className={step === i + 1 ? 'active' : ''}
              onClick={() => setStep(i + 1)}
            >
              <span>{i + 1}</span>
              {s}
            </button>
          ))}
        </div>
        {step === 1 && (
          <div className="setup-content">
            <h3>Set up your Google project</h3>
            <ol>
              <li>
                <a
                  href="https://console.cloud.google.com/projectcreate"
                  target="_blank"
                  rel="noreferrer"
                >
                  Create a Google Cloud project <ArrowUpRight size={13} />
                </a>
                .
              </li>
              <li>
                <a
                  href="https://console.cloud.google.com/apis/library/health.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Enable the Google Health API
                </a>{' '}
                in that project.
              </li>
              <li>
                Open Google Auth Platform. Set up the app name and your contact email. Select{' '}
                <b>External</b> for the audience.
              </li>
              <li>
                Keep the app in <b>Testing</b>. Add the Google account used with your Fitbit Air to{' '}
                <b>Test users</b>.
              </li>
              <li>
                Under <b>Data Access</b>, add these read-only scopes:
                <div className="scope-list">
                  {[
                    'googlehealth.activity_and_fitness.readonly',
                    'googlehealth.sleep.readonly',
                    'googlehealth.health_metrics_and_measurements.readonly',
                  ].map((s) => (
                    <code key={s}>{s}</code>
                  ))}
                </div>
              </li>
            </ol>
            <button className="primary" onClick={() => setStep(2)}>
              Next: create the client <ChevronRight size={16} />
            </button>
          </div>
        )}
        {step === 2 && (
          <div className="setup-content">
            <h3>Create a Web application client</h3>
            <ol>
              <li>
                In Google Auth Platform, open <b>Clients → Create client</b>.
              </li>
              <li>
                Select <b>Web application</b>. Give the client a name.
              </li>
              <li>
                Add this exact <b>Authorized redirect URI</b>:
                <code className="redirect">
                  {status?.redirectUri || 'http://localhost:3000/auth/google/callback'}
                </code>
              </li>
              <li>Create the client. Download its JSON file, then load it below.</li>
            </ol>
            <label className="upload">
              <Upload size={22} />
              <b>{busy ? 'Loading file…' : 'Load OAuth client JSON'}</b>
              <span>The file stays on this computer.</span>
              <input
                aria-label="Load OAuth client JSON"
                type="file"
                accept=".json,application/json"
                onChange={upload}
                disabled={busy}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="setup-content">
            <h3>{status?.configured ? 'Ready to connect' : 'Load your client file first'}</h3>
            <p>
              Sign in with the Google account used by your Fitbit Air. Allow read access to
              activity, sleep, and health measurements.
            </p>
            <p className="info">
              <ShieldCheck size={20} />
              The app reads your records. It does not change them. Access tokens stay in server
              memory. Sign in again after a server restart.
            </p>
            {status?.configured ? (
              <a className="primary" href="/auth/google">
                Continue with Google <ArrowUpRight size={16} />
              </a>
            ) : (
              <button className="primary" onClick={() => setStep(2)}>
                Load client file
              </button>
            )}
            <p className="fine">
              In Google testing mode, access can expire after 7 days. Sign in again when required.
            </p>
          </div>
        )}
        <a
          className="docs-link"
          href="https://developers.google.com/health/setup"
          target="_blank"
          rel="noreferrer"
        >
          Google setup instructions <ArrowUpRight size={14} />
        </a>
      </div>
    </dialog>
  );
}
export default function App() {
  const [status, setStatus] = useState(null),
    [mode, setMode] = useState('demo'),
    [data, setData] = useState(null),
    [days, setDays] = useState(7),
    [end, setEnd] = useState(localDate()),
    [selected, setSelected] = useState(localDate()),
    [view, setView] = useState('Overview'),
    [setup, setSetup] = useState(new URLSearchParams(location.search).has('setup')),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      new URLSearchParams(location.search).has('authError')
        ? 'Google sign-in did not finish. Open connection setup and try again.'
        : '',
    ),
    [metric, setMetric] = useState('steps'),
    [notice, setNotice] = useState('');
  const request = useRef(0);
  const authIssue = useRef(new URLSearchParams(location.search).has('authError'));
  async function getStatus() {
    const s = await api('/api/status');
    setStatus(s);
    return s;
  }
  useEffect(() => {
    getStatus()
      .then((s) => {
        if (s.connected) setMode('live');
      })
      .catch((e) => setError(e.message));
    history.replaceState({}, '', location.pathname);
  }, []);
  const load = useCallback(
    async (refresh = false) => {
      const id = ++request.current;
      setBusy(true);
      if (!authIssue.current) setError('');
      try {
        const next =
          mode === 'demo'
            ? demoData(end, days)
            : await api(`/api/dashboard?end=${end}&days=${days}${refresh ? '&refresh=1' : ''}`);
        if (request.current === id) {
          setData(next);
          // Keep a sign-in error visible for the first load only.
          authIssue.current = false;
        }
      } catch (e) {
        if (request.current === id) {
          setData(null);
          setError(e.message);
        }
      } finally {
        if (request.current === id) setBusy(false);
      }
    },
    [mode, end, days],
  );
  useEffect(() => {
    setData(null);
    setSelected(end);
    load();
  }, [load, end]);
  const rows = data?.days || [];
  const day = rows.find((r) => r.date === selected) || {};
  const details = {
    steps: { label: 'Steps', unit: 'steps', color: '#242424' },
    sleepMinutes: { label: 'Sleep', unit: 'hours', color: '#242424' },
    restingHeartRate: {
      label: 'Resting heart rate',
      unit: 'bpm',
      color: '#242424',
    },
  };
  const chartKey =
    view === 'Sleep' ? 'sleepMinutes' : view === 'Heart health' ? 'restingHeartRate' : metric;
  const chart = details[chartKey];
  const average = mean(rows, chartKey);
  const ceiling = chartKey === 'steps' ? 4000 : chartKey === 'sleepMinutes' ? 120 : 20;
  const max =
    Math.ceil(
      Math.max(
        chartKey === 'steps' ? 10000 : chartKey === 'sleepMinutes' ? 480 : 80,
        ...rows.map((d) => d[chartKey] || 0),
      ) / ceiling,
    ) * ceiling;
  async function publish() {
    setBusy(true);
    setError('');
    try {
      await api('/api/cloud/connect', {});
      setNotice(
        'Google access is connected to the public page. The first update can take one minute.',
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function unpublish() {
    setBusy(true);
    setError('');
    try {
      await api('/api/cloud/disconnect', {});
      setNotice('Public health records and the cloud connection have been removed.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    try {
      const result = await api('/api/disconnect', {});
      await getStatus();
      setMode('demo');
      setNotice(
        result.revoked
          ? 'Google access removed. The dashboard now shows sample data.'
          : 'Local access removed. You can also remove access in your Google account settings.',
      );
    } catch (e) {
      setError(e.message);
    }
  }
  function shift(n) {
    const d = new Date(`${end}T12:00:00`);
    d.setDate(d.getDate() + n);
    const value = localDate(d);
    if (value <= localDate()) setEnd(value);
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="title" href="https://theoazriel.com/" aria-label="Theo Azriel home">
          <ink-mark class="site-mark" aria-hidden="true" data-ink-state="static">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="96" height="96" />
            <canvas width="192" height="192" />
          </ink-mark>
          <span>Theo Azriel</span>
        </a>
      </header>
      <div className="main-shell">
        <main>
          <div className="page-heading">
            <div>
              <h1>{view === 'Overview' ? 'Health' : view}</h1>
              <p>
                {view === 'Overview'
                  ? 'Movement, sleep, and daily measurements from my Fitbit Air.'
                  : view === 'Activity'
                    ? 'Steps and active minutes, day by day.'
                    : view === 'Sleep'
                      ? 'Sleep duration and stages through the night.'
                      : 'Resting heart rate and daily measurements.'}
              </p>
            </div>
            <button className="secondary sync" disabled={busy} onClick={() => load(true)}>
              <RefreshCw size={15} className={busy ? 'spin' : ''} />
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <nav className="health-nav" aria-label="Health views">
            {['Overview', 'Activity', 'Sleep', 'Heart health'].map((name) => (
              <button
                key={name}
                aria-pressed={view === name}
                className={view === name ? 'active' : ''}
                onClick={() => {
                  setView(name);
                  if (name === 'Activity') setMetric('steps');
                }}
              >
                {name}
              </button>
            ))}
          </nav>
          {mode === 'demo' && (
            <div className="connect-banner">
              <span className="banner-icon">
                <Link2 size={20} />
              </span>
              <div>
                <b>Connect your health records.</b>
                <p>You are viewing sample data. Connect your Fitbit Air to see your records.</p>
              </div>
              <button
                className="primary"
                onClick={() => (status?.connected ? setMode('live') : setSetup(true))}
              >
                {status?.connected ? 'Show my data' : 'Connect Google Health'}
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          {status?.publicPublishing && (
            <div className="connect-banner">
              <span className="banner-icon">
                <ArrowUpRight size={20} />
              </span>
              <div>
                <b>Share on theoazriel.com</b>
                <p>
                  Publish daily steps and active zone minutes after seven full days. Blood oxygen,
                  sleep, heart rate, HRV, and breathing rate stay private.
                </p>
              </div>
              <button className="primary" disabled={!status?.connected || busy} onClick={publish}>
                Publish my health data
              </button>
              <button className="secondary" disabled={busy} onClick={unpublish}>
                Remove public data
              </button>
            </div>
          )}
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="message" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice('')}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {data?.warnings?.length > 0 && (
            <div className="message error" role="status">
              {data.warnings.map((w) => (
                <p key={w.metric}>
                  {
                    {
                      zoneMinutes: 'Active zone minutes',
                      restingHeartRate: 'Resting heart rate',
                      hrv: 'Heart rate variability',
                      oxygen: 'Blood oxygen',
                      respiratoryRate: 'Breathing rate',
                      sleep: 'Sleep',
                      steps: 'Steps',
                    }[w.metric]
                  }
                  : {w.message}
                </p>
              ))}
            </div>
          )}
          <div className="period-row">
            <div className="period-title">
              <h2>{selected === localDate() ? 'Today' : `${dateLabel(selected)} daily record`}</h2>
              <span>
                {new Date(`${selected}T12:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
            </div>
            <div className="date-control">
              <button className="icon-button" aria-label="Previous day" onClick={() => shift(-1)}>
                <ChevronLeft size={16} />
              </button>
              <input
                type="date"
                aria-label="Last date in range"
                value={end}
                max={localDate()}
                onChange={(e) => {
                  // The max attribute limits the picker, not typed dates.
                  if (e.target.value && e.target.value <= localDate()) setEnd(e.target.value);
                }}
              />
              <button
                className="icon-button"
                aria-label="Next day"
                disabled={end >= localDate()}
                onClick={() => shift(1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <section className="metrics" aria-label="Daily health summary">
            <Metric
              icon={Footprints}
              title="Steps"
              value={format(day.steps)}
              unit="steps"
              values={rows.map((r) => r.steps)}
              color="#242424"
              note="Daily movement"
            />
            <Metric
              icon={Moon}
              title="Time asleep"
              value={duration(day.sleepMinutes)}
              unit=""
              values={rows.map((r) => r.sleepMinutes)}
              color="#242424"
              note="All sleep sessions for this date"
            />
            <Metric
              icon={Heart}
              title="Resting heart rate"
              value={format(day.restingHeartRate)}
              unit="bpm"
              values={rows.map((r) => r.restingHeartRate)}
              color="#242424"
              note="Daily resting measurement"
            />
            <Metric
              icon={Zap}
              title="Active zone minutes"
              value={format(day.zoneMinutes)}
              unit="min"
              values={rows.map((r) => r.zoneMinutes)}
              color="#242424"
              note="Intensity-weighted activity"
            />
          </section>
          <section className="goal-panel" aria-label="Daily step target">
            <div>
              <span>Daily step target</span>
              <span>{format(day.steps)} / 10,000</span>
            </div>
            {day.steps != null && (
              <progress
                max="10000"
                value={Math.min(day.steps, 10000)}
                aria-label="Steps towards daily target"
              />
            )}
            <p>
              {day.steps == null
                ? 'No step record for this date.'
                : day.steps >= 10000
                  ? 'Step target reached.'
                  : `${format(10000 - day.steps)} steps to the display target.`}
            </p>
          </section>
          <div className="dashboard-grid">
            <section className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>{chart.label} over time</h2>
                  <p>
                    {rows.length
                      ? `${dateLabel(rows[0].date)} – ${dateLabel(rows.at(-1).date)}`
                      : busy
                        ? 'Loading records'
                        : 'No records loaded'}
                  </p>
                </div>
                <div className="segmented" aria-label="Date range">
                  {[7, 14].map((n) => (
                    <button
                      key={n}
                      className={days === n ? 'active' : ''}
                      onClick={() => setDays(n)}
                    >
                      {n} days
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-toolbar">
                <div className="chart-total">
                  <strong>
                    {chartKey === 'sleepMinutes' ? duration(average) : format(average)}
                  </strong>
                  <span>
                    {chartKey === 'sleepMinutes' ? 'average sleep' : `${chart.unit} / day`}
                  </span>
                </div>
                <label className="chart-select">
                  <SlidersHorizontal size={14} />
                  <select
                    aria-label="Chart metric"
                    value={chartKey}
                    onChange={(e) => {
                      setMetric(e.target.value);
                      setView('Overview');
                    }}
                  >
                    {Object.entries(details).map(([key, v]) => (
                      <option key={key} value={key}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="bar-chart">
                <div className="y-axis">
                  {[1, 0.75, 0.5, 0.25, 0].map((n) => (
                    <span key={n}>
                      {chartKey === 'steps'
                        ? `${(max * n) / 1000}k`
                        : Math.round((max * n) / (chartKey === 'sleepMinutes' ? 60 : 1))}
                    </span>
                  ))}
                </div>
                <div className="plot">
                  <div className="grid-lines">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <i key={i} />
                    ))}
                  </div>
                  <div className="bars">
                    {rows.map((r) => (
                      <button
                        className={`bar-column ${selected === r.date ? 'selected' : ''}`}
                        key={r.date}
                        onClick={() => setSelected(r.date)}
                        aria-label={`${dateLabel(r.date)}: ${r[chartKey] == null ? 'No data' : chartKey === 'sleepMinutes' ? duration(r[chartKey]) : `${format(r[chartKey])} ${chart.unit}`}`}
                        aria-pressed={selected === r.date}
                      >
                        <span className="bar-space">
                          <span className="bar-value">
                            {chartKey === 'sleepMinutes'
                              ? duration(r[chartKey])
                              : format(r[chartKey])}
                          </span>
                          <span
                            className={`bar ${r[chartKey] == null ? 'missing' : ''}`}
                            style={{
                              height:
                                r[chartKey] == null
                                  ? '3px'
                                  : `${Math.max(1, (r[chartKey] / max) * 100)}%`,
                              background: chart.color,
                            }}
                          />
                        </span>
                        <span className="bar-label">
                          {days === 7
                            ? new Date(`${r.date}T12:00:00`).toLocaleDateString('en-GB', {
                                weekday: 'short',
                              })
                            : new Date(`${r.date}T12:00:00`).getDate()}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!rows.length && (
                    <div className="chart-empty">
                      {busy ? 'Loading your records…' : 'No data to display'}
                    </div>
                  )}
                </div>
              </div>
              <div className="chart-caption">
                <span>
                  <i style={{ background: chart.color }} />
                  {chart.label}
                </span>
                <span>Select a day to view its records</span>
              </div>
            </section>
            <section className="panel sleep-panel">
              <div className="panel-heading">
                <div className="icon-title">
                  <span>
                    <Moon size={17} />
                  </span>
                  <h2>Sleep stages</h2>
                </div>
                <span className="subtle">Main sleep · {dateLabel(selected)}</span>
              </div>
              <div className="sleep-summary">
                <strong>
                  {duration(
                    day.sleep?.summary?.minutesAsleep == null
                      ? null
                      : Number(day.sleep.summary.minutesAsleep),
                  )}
                </strong>
                <span>main session asleep</span>
              </div>
              <SleepChart sleep={day.sleep} />
            </section>
            <section className="panel vitals-panel">
              <div className="panel-heading">
                <h2>Daily measurements</h2>
                <Activity size={18} />
              </div>
              <p className="panel-description">Measurements from the selected date.</p>
              {[
                [Heart, 'Heart rate variability', 'hrv', 'ms', '#242424'],
                [Wind, 'Breathing rate', 'respiratoryRate', 'breaths/min', '#242424'],
                [Activity, 'Blood oxygen', 'oxygen', '%', '#242424'],
              ].map(([Icon, label, key, unit, color]) => (
                <div className="vital" key={key}>
                  <span className="vital-icon" style={{ color }}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <b>{label}</b>
                    <span>
                      {key === 'hrv'
                        ? 'Average during sleep'
                        : key === 'oxygen'
                          ? 'Average during sleep'
                          : 'Main sleep average'}
                    </span>
                  </div>
                  <strong>
                    {day[key] == null ? '—' : Number(day[key].toFixed(1))}
                    <small>{unit}</small>
                  </strong>
                </div>
              ))}
              <div className="vitals-note">
                <ShieldCheck size={14} />
                Values from the selected date
              </div>
            </section>
          </div>
          <footer>
            <span>
              <span className="footer-dot" />
              {mode === 'demo'
                ? 'Sample data · Preview only'
                : `Google Health · ${data?.fetchedAt ? `Fetched at ${new Date(data.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for data'}`}
            </span>
            <div>
              <button onClick={() => setSetup(true)}>Connection settings</button>
              {mode === 'live' && <button onClick={disconnect}>Disconnect account</button>}
              <a href="https://theoazriel.com/">Back to home</a>
            </div>
          </footer>
        </main>
      </div>
      {setup && <Setup status={status} onClose={() => setSetup(false)} onStatus={getStatus} />}
    </div>
  );
}
