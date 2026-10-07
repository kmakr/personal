import React, { useEffect, useState } from 'react';
import { RefreshCw, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const format = (value) => (value == null ? '—' : Math.round(value).toLocaleString('en-GB'));
const date = (value, year = false) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
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
  const available = weeks.filter((row) => row.steps != null || row.zoneMinutes != null);
  const week = available.find((row) => row.start === selected) || available.at(-1);
  const stepWeeks = weeks.filter((row) => row.steps != null);
  const previous = week && weeks[weeks.findIndex((row) => row.start === week.start) - 1];
  const change =
    week?.steps != null && previous?.steps > 0
      ? ((week.steps - previous.steps) / previous.steps) * 100
      : null;
  const best = stepWeeks.length ? Math.max(...stepWeeks.map((row) => row.steps)) : null;
  const total = stepWeeks.reduce((sum, row) => sum + row.steps, 0);
  const milestone = Math.max(25000, Math.ceil((week?.steps || 0) / 25000) * 25000);
  const dots = Math.floor(((week?.steps || 0) / milestone) * 100);
  const chartWeeks = weeks.filter((row) => available.length && row.start >= available[0].start);
  const max = Math.max(1, ...chartWeeks.map((row) => row[metric] || 0));
  return (
    <div className="app-shell public-health">
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
            <p>A little more movement. Week by week.</p>
          </div>
          <button
            className="secondary sync"
            disabled={busy}
            onClick={load}
            aria-label="Refresh activity"
          >
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            <span>{busy ? 'Loading…' : 'Refresh'}</span>
          </button>
        </div>
        <p className="activity-intro">
          An activity journal, measured in steps and active minutes. Shared slowly, with a seven-day
          delay.
        </p>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {!busy && !error && !week && (
          <p className="message" role="status">
            No complete weeks yet. The first recorded week will appear here after the sharing delay.
          </p>
        )}
        {week && (
          <>
            <section className="movement-story" aria-label="Selected week">
              <div className="story-date">
                <span>
                  {date(week.start)} – {date(week.end, true)}
                </span>
                <span>
                  {week.start === available.at(-1)?.start
                    ? 'Latest available week'
                    : 'From the archive'}
                </span>
              </div>
              <div className="movement-hero">
                <div className="movement-number">
                  <strong>{format(week.steps)}</strong>
                  <span>steps in one week</span>
                  {change != null && (
                    <p className="week-change">
                      {change >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      {Math.abs(change).toFixed(1)}% {change >= 0 ? 'more' : 'fewer'} than the week
                      before
                    </p>
                  )}
                  {week.steps != null && best === week.steps && stepWeeks.length > 1 && (
                    <span className="record-label">Best week in this view</span>
                  )}
                </div>
                <div className="step-art" aria-hidden="true">
                  {Array.from({ length: 100 }, (_, i) => (
                    <i className={i < dots ? 'filled' : ''} key={i} />
                  ))}
                </div>
              </div>
              {week.steps != null ? (
                <div className="milestone-line">
                  <span>
                    {format(milestone - week.steps)} steps{' '}
                    {week.steps === milestone ? 'left — milestone reached' : 'from'}{' '}
                    {format(milestone)}
                  </span>
                  <span>A step milestone, just for fun.</span>
                </div>
              ) : (
                <p className="fine">This week does not have seven recorded step totals.</p>
              )}
              <dl className="movement-details">
                <div>
                  <dt>Average per day</dt>
                  <dd>
                    {format(week.steps == null ? null : week.steps / 7)} <small>steps</small>
                  </dd>
                  <p>Calculated from the weekly total</p>
                </div>
                <div>
                  <dt>Active zone minutes</dt>
                  <dd>
                    {format(week.zoneMinutes)} <small>min</small>
                  </dd>
                  <p>
                    {week.zoneMinutes == null
                      ? 'Seven recorded days are not available'
                      : 'Weekly total, weighted by intensity'}
                  </p>
                </div>
              </dl>
            </section>
            <section className="activity-archive" aria-label="Weekly activity history">
              <div className="archive-heading">
                <h2>The bigger picture</h2>
                <span>
                  {available.length} recorded {available.length === 1 ? 'week' : 'weeks'}
                </span>
              </div>
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
              <div className="weekly-bars" style={{ '--weeks': chartWeeks.length }}>
                {chartWeeks.map((row) => (
                  <button
                    key={row.start}
                    className={row.start === week.start ? 'chosen' : ''}
                    aria-pressed={row.start === week.start}
                    disabled={row.steps == null && row.zoneMinutes == null}
                    aria-label={`${date(row.start, true)} to ${date(row.end, true)}: ${row[metric] == null ? 'no complete total' : `${format(row[metric])} ${metric === 'steps' ? 'steps' : 'active zone minutes'}`}`}
                    onClick={() => setSelected(row.start)}
                  >
                    <span className="activity-week-value">
                      {row[metric] == null
                        ? '—'
                        : metric === 'steps' && row[metric] >= 1000
                          ? `${(row[metric] / 1000).toFixed(1)}k`
                          : format(row[metric])}
                    </span>
                    <span className="activity-week-space">
                      <span
                        className={row[metric] == null ? 'empty-bar' : 'activity-bar'}
                        style={{ height: `${Math.max(2, ((row[metric] || 0) / max) * 100)}%` }}
                      />
                    </span>
                    <span className="activity-week-date">{date(row.start)}</span>
                  </button>
                ))}
              </div>
              <p className="fine chart-help">
                Select a week to explore it. A dash means a complete total is not available.
              </p>
              {stepWeeks.length > 0 && (
                <div className="archive-total">
                  <strong>{format(total)}</strong>
                  <p>
                    steps across {stepWeeks.length} complete{' '}
                    {stepWeeks.length === 1 ? 'week' : 'weeks'}
                    <br />
                    <span>
                      {stepWeeks.length > 1
                        ? `Best week: ${format(best)} steps`
                        : 'More weeks will make the story grow.'}
                    </span>
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        <footer className="public-footer">
          <p>
            From my Fitbit. Weeks run Monday to Sunday, in Hong Kong time. The view covers up to 12
            weeks; each total needs seven recorded days.
          </p>
          <p>
            Only weekly steps and active zone minutes are public. Daily records, sleep, and health
            measurements stay private. Missing data is never counted as zero.
          </p>
          <a href="https://theoazriel.com/">Back to home ↗</a>
        </footer>
      </main>
    </div>
  );
}
