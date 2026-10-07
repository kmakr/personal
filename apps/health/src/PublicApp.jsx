import React, { useEffect, useState } from 'react';
import { Footprints, Zap, RefreshCw } from 'lucide-react';

const format = (value) => (value == null ? '—' : Math.round(value).toLocaleString('en-GB'));
const date = (value) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
export default function PublicApp() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [selected, setSelected] = useState(null);
  const [metric, setMetric] = useState('steps');
  async function load() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/health/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('Weekly activity is temporarily unavailable.');
      const next = await response.json();
      if (next.policy?.version !== 2 || !Array.isArray(next.weeks)) {
        throw new Error('Weekly activity is temporarily unavailable.');
      }
      setData(next);
    } catch (e) {
      setData(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    document.title = 'Health | Theo Azriel';
    load();
  }, []);
  const weeks = data?.weeks || [];
  const week = weeks.find((row) => row.start === selected) || weeks.at(-1);
  const max = Math.max(1, ...weeks.map((row) => row[metric] || 0));
  const hasData = weeks.some((row) => row.steps != null || row.zoneMinutes != null);
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
      <main>
        <div className="page-heading">
          <div>
            <h1>Health</h1>
            <p>A weekly view of my movement.</p>
          </div>
          <button className="secondary sync" disabled={busy} onClick={load}>
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            {busy ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <p className="sharing-note">
          Steps and active zone minutes, Monday to Sunday. Each week is shared after a seven-day
          delay. Dates use Hong Kong time.
        </p>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {!busy && !error && !hasData && (
          <p className="message" role="status">
            No complete weekly totals are available yet. No sample data is shown.
          </p>
        )}
        {week && (
          <>
            <section className="weekly-summary" aria-label="Selected week">
              <h2>
                {date(week.start)} – {date(week.end)}
              </h2>
              <div className="metrics">
                <article className="metric">
                  <div className="metric-name">
                    <Footprints size={17} />
                    Steps
                  </div>
                  <div className="metric-body">
                    <strong>{format(week.steps)}</strong>
                  </div>
                  <p className="fine">Weekly total</p>
                </article>
                <article className="metric">
                  <div className="metric-name">
                    <Zap size={17} />
                    Active zone minutes
                  </div>
                  <div className="metric-body">
                    <strong>{format(week.zoneMinutes)}</strong>
                  </div>
                  <p className="fine">Weekly total · weighted by intensity</p>
                </article>
              </div>
            </section>
            <section className="weekly-history" aria-label="Weekly activity history">
              <h2>Over the weeks</h2>
              <nav className="health-nav" aria-label="Activity measurement">
                <button
                  className={metric === 'steps' ? 'active' : ''}
                  aria-pressed={metric === 'steps'}
                  onClick={() => setMetric('steps')}
                >
                  Steps
                </button>
                <button
                  className={metric === 'zoneMinutes' ? 'active' : ''}
                  aria-pressed={metric === 'zoneMinutes'}
                  onClick={() => setMetric('zoneMinutes')}
                >
                  Active zone minutes
                </button>
              </nav>
              <ol className="week-list">
                {[...weeks].reverse().map((row) => (
                  <li key={row.start}>
                    <button
                      className={row.start === week.start ? 'selected-week' : ''}
                      aria-pressed={row.start === week.start}
                      onClick={() => setSelected(row.start)}
                    >
                      <span className="week-label">
                        {date(row.start)} – {date(row.end)}
                      </span>
                      <span className="week-value">{format(row[metric])}</span>
                      <span className="week-track" aria-hidden="true">
                        <span style={{ width: `${((row[metric] || 0) / max) * 100}%` }} />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="fine">
                A dash means that a complete total is not available. Each total needs seven days of
                recorded values.
              </p>
            </section>
          </>
        )}
        <footer className="public-footer">
          <p>
            Only weekly activity is shared. Daily records, sleep, and health measurements are
            private.
          </p>
          <a href="https://theoazriel.com/">Back to home ↗</a>
        </footer>
      </main>
    </div>
  );
}
