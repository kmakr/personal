import React, { useEffect, useState } from 'react';
import { RefreshCw, ArrowLeft, ArrowRight, Play, Sprout, Footprints, Zap } from 'lucide-react';

const count = (value) => (value == null ? '—' : Math.round(value).toLocaleString('en-GB'));
const percent = (value) => (value == null ? '—' : `${value.toFixed(1)}%`);
const date = (value, long = false) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(long ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
const weekday = (value) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const hasValue = (row) =>
  row && [row.steps, row.zoneMinutes, row.oxygen].some((value) => value != null);

function Plant({ row, maxSteps, maxMinutes, index }) {
  const height = row.steps == null ? 28 : row.steps === 0 ? 0 : 18 + (row.steps / maxSteps) * 89;
  const tip = 132 - height;
  const leaves = row.zoneMinutes == null ? 0 : Math.ceil((row.zoneMinutes / maxMinutes) * 6);
  return (
    <svg
      className="garden-plant"
      viewBox="0 0 48 152"
      aria-hidden="true"
      style={{ '--grow-delay': `${index * 25}ms` }}
    >
      <path className="plant-ground" d="M15 136 Q24 133 33 136" />
      <g className="plant-growth">
        {height > 0 && (
          <path
            className={`plant-stem ${row.steps == null ? 'unrecorded' : ''}`}
            d={`M24 134 Q${index % 2 ? 16 : 32} ${tip + height / 2} 24 ${tip}`}
          />
        )}
        {Array.from({ length: leaves }, (_, i) => {
          const y = 122 - (i * Math.max(height - 15, 24)) / 6;
          return (
            <path
              className="plant-leaf"
              key={i}
              d={
                i % 2
                  ? `M24 ${y} Q39 ${y + 1} 40 ${y - 13} Q27 ${y - 14} 24 ${y}`
                  : `M24 ${y} Q9 ${y + 1} 8 ${y - 13} Q21 ${y - 14} 24 ${y}`
              }
            />
          );
        })}
        {row.steps != null && row.steps > 0 && (
          <g className="plant-flower" transform={`translate(24 ${tip})`}>
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <ellipse key={angle} cx="0" cy="-5" rx="2.9" ry="5" transform={`rotate(${angle})`} />
            ))}
            <circle r="2.5" />
          </g>
        )}
        {row.steps === 0 && <circle className="plant-zero" cx="24" cy="131" r="3" />}
        {row.steps == null && <circle className="plant-missing" cx="24" cy={tip} r="3" />}
      </g>
    </svg>
  );
}

function OxygenChart({ rows, selected, onSelect }) {
  const known = rows.filter((row) => row.oxygen != null);
  if (!known.length)
    return (
      <div className="oxygen-empty">
        <span aria-hidden="true">O₂</span>
        <div>
          <h3>No oxygen readings in this period</h3>
          <p>
            The chart will appear when Google supplies a daily average. Missing readings are not
            zero.
          </p>
        </div>
      </div>
    );
  const x = (i) => 30 + i * (530 / Math.max(1, rows.length - 1));
  const y = (value) => 126 - value * 1.05;
  return (
    <>
      <svg
        className="oxygen-chart"
        viewBox="0 0 580 154"
        role="img"
        aria-label="Daily blood oxygen averages. Scale: zero to one hundred percent. Gaps mean no reading."
      >
        {[0, 50, 100].map((value) => (
          <g key={value}>
            <line x1="30" x2="560" y1={y(value)} y2={y(value)} />
            <text x="0" y={y(value) + 3}>
              {value}
            </text>
          </g>
        ))}
        {rows.map((row, i) => (
          <g key={row.date}>
            {row.oxygen != null && i > 0 && rows[i - 1].oxygen != null && (
              <line
                className="oxygen-trace"
                x1={x(i - 1)}
                y1={y(rows[i - 1].oxygen)}
                x2={x(i)}
                y2={y(row.oxygen)}
              />
            )}
            {row.oxygen != null && (
              <circle
                className={row.date === selected ? 'oxygen-point selected' : 'oxygen-point'}
                cx={x(i)}
                cy={y(row.oxygen)}
                r={row.date === selected ? 5 : 3}
              />
            )}
          </g>
        ))}
        <text x="30" y="149">
          {date(rows[0].date)}
        </text>
        <text x="560" y="149" textAnchor="end">
          {date(rows.at(-1).date)}
        </text>
      </svg>
      <div className="oxygen-reading-list" aria-label="Select an oxygen reading">
        {known.map((row) => (
          <button
            key={row.date}
            aria-pressed={row.date === selected}
            onClick={() => onSelect(row.date)}
          >
            <span>{date(row.date)}</span>
            <strong>{percent(row.oxygen)}</strong>
          </button>
        ))}
      </div>
    </>
  );
}

export default function PublicApp() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [selected, setSelected] = useState(null);
  const [length, setLength] = useState(14);
  const [offset, setOffset] = useState(0);
  const [animation, setAnimation] = useState(0);
  async function load() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/health/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('The activity page could not load. Try Refresh.');
      const next = await response.json();
      if (next.policy?.version !== 3 || !Array.isArray(next.days))
        throw new Error('The activity page could not load. Try Refresh.');
      setData(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    document.title = 'Health | Theo Azriel';
    load();
  }, []);
  const days = data?.days || [];
  const end = Math.max(0, days.length - offset);
  const rows = days.slice(Math.max(0, end - length), end);
  const day = rows.find((row) => row.date === selected) || rows.findLast(hasValue) || rows.at(-1);
  const maxSteps = Math.max(1, ...rows.map((row) => row.steps || 0));
  const maxMinutes = Math.max(1, ...rows.map((row) => row.zoneMinutes || 0));
  const stepDays = rows.filter((row) => row.steps != null);
  const minuteDays = rows.filter((row) => row.zoneMinutes != null);
  const totalSteps = stepDays.reduce((sum, row) => sum + row.steps, 0);
  const totalMinutes = minuteDays.reduce((sum, row) => sum + row.zoneMinutes, 0);
  const best = stepDays.reduce((a, row) => (!a || row.steps > a.steps ? row : a), null);
  function move(amount) {
    setOffset((value) => Math.max(0, Math.min(Math.max(0, days.length - length), value + amount)));
    setSelected(null);
    setAnimation((value) => value + 1);
  }
  return (
    <div className="app-shell public-health garden-page">
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
            <p>Small days. A growing picture.</p>
          </div>
          <button
            className="secondary sync"
            disabled={busy}
            onClick={load}
            aria-label="Refresh health data"
          >
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            <span>{busy ? 'Loading…' : 'Refresh'}</span>
          </button>
        </div>
        <p className="garden-intro">
          A garden of my daily movement, with a little room to breathe. Real Fitbit records, shared
          seven days later.
        </p>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <section className="movement-garden" aria-label="Daily movement garden">
              <div className="garden-heading">
                <h2>
                  <Sprout size={18} /> The movement garden
                </h2>
                <button
                  className="garden-replay"
                  onClick={() => setAnimation((value) => value + 1)}
                >
                  <Play size={12} /> Grow again
                </button>
              </div>
              <div className="garden-toolbar">
                <div className="garden-ranges" aria-label="Number of days">
                  {[7, 14, 28].map((value) => (
                    <button
                      key={value}
                      aria-pressed={length === value}
                      onClick={() => {
                        setLength(value);
                        setOffset(0);
                        setSelected(null);
                        setAnimation((n) => n + 1);
                      }}
                    >
                      {value} days
                    </button>
                  ))}
                </div>
                <div className="garden-paging">
                  <button
                    aria-label="Previous period"
                    disabled={offset + length >= days.length}
                    onClick={() => move(length)}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span>
                    {date(rows[0].date)} – {date(rows.at(-1).date)}
                  </span>
                  <button
                    aria-label="Next period"
                    disabled={offset === 0}
                    onClick={() => move(-length)}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
              <div
                className={`garden-bed ${length === 7 ? 'seven-days' : ''}`}
                key={`${animation}-${rows[0].date}`}
              >
                {rows.map((row, i) => (
                  <button
                    className={`garden-day ${row.date === day?.date ? 'selected' : ''}`}
                    key={row.date}
                    aria-pressed={row.date === day?.date}
                    aria-label={`${date(row.date, true)}: ${row.steps == null ? 'steps unavailable' : `${count(row.steps)} steps`}, ${row.zoneMinutes == null ? 'active minutes unavailable' : `${count(row.zoneMinutes)} active zone minutes`}, ${row.oxygen == null ? 'oxygen unavailable' : `${percent(row.oxygen)} blood oxygen`}`}
                    onClick={() => setSelected(row.date)}
                  >
                    <Plant row={row} maxSteps={maxSteps} maxMinutes={maxMinutes} index={i} />
                    <span className="garden-day-number">{Number(row.date.slice(-2))}</span>
                    <span className="garden-day-name">{weekday(row.date)}</span>
                  </button>
                ))}
              </div>
              <div className="garden-key">
                <span>
                  <i className="key-stem" /> Taller stems = more steps
                </span>
                <span>
                  <i className="key-leaf" /> More leaves = more active minutes
                </span>
              </div>
              <p className="garden-help">
                Select a day to see its numbers. Shapes compare days within this view. A dotted stem
                means no step record.
              </p>
              {day && (
                <div className="selected-day-panel" aria-live="polite" aria-atomic="true">
                  <div className="selected-day-heading">
                    <strong>
                      {weekday(day.date)}, {date(day.date, true)}
                    </strong>
                    <span>{hasValue(day) ? 'Recorded day' : 'No records for this day'}</span>
                  </div>
                  <dl className="daily-values">
                    <div>
                      <dt>
                        <Footprints size={14} /> Steps
                      </dt>
                      <dd>{count(day.steps)}</dd>
                    </div>
                    <div>
                      <dt>
                        <Zap size={14} /> Active zone minutes
                      </dt>
                      <dd>
                        {count(day.zoneMinutes)}
                        <small> min</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Blood oxygen</dt>
                      <dd>{percent(day.oxygen)}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </section>
            <section className="garden-summary" aria-label="Period summary">
              <h2>A few things this garden says</h2>
              <div className="garden-facts">
                <article>
                  <span className="fact-value">{stepDays.length ? count(totalSteps) : '—'}</span>
                  <h3>steps in this view</h3>
                  <p>
                    {stepDays.length} of {rows.length} days recorded
                  </p>
                </article>
                <article>
                  <span className="fact-value">
                    {minuteDays.length ? count(totalMinutes) : '—'}
                    <small> min</small>
                  </span>
                  <h3>active zone minutes</h3>
                  <p>
                    {minuteDays.length} of {rows.length} days recorded
                  </p>
                </article>
              </div>
              {best && (
                <p className="garden-highlight">
                  <Sprout size={17} />
                  <span>
                    The tallest stem: <strong>{date(best.date)}</strong>, with{' '}
                    <strong>{count(best.steps)} steps</strong>.
                  </span>
                </p>
              )}
              {(stepDays.length < rows.length || minuteDays.length < rows.length) && (
                <p className="garden-help">
                  These sums include recorded days only. Missing days are not counted as zero.
                </p>
              )}
            </section>
            <section className="oxygen-section" aria-label="Blood oxygen history">
              <div className="oxygen-heading">
                <div>
                  <h2>Blood oxygen</h2>
                  <p>Daily average · SpO₂</p>
                </div>
                <span className="oxygen-symbol" aria-hidden="true">
                  O₂
                </span>
              </div>
              <OxygenChart rows={rows} selected={day?.date} onSelect={setSelected} />
              <p className="oxygen-note">
                The daily average supplied by Google, usually measured during sleep. The chart uses
                a 0–100% scale.{' '}
                <a
                  href="https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints#DailyOxygenSaturation"
                  target="_blank"
                  rel="noreferrer"
                >
                  About this measurement ↗
                </a>
              </p>
            </section>
            <details className="daily-records">
              <summary>
                See the daily records <span>{rows.length} days</span>
              </summary>
              <div className="daily-table-wrap">
                <table>
                  <caption>
                    Daily records for {date(rows[0].date)} to {date(rows.at(-1).date, true)}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Steps</th>
                      <th scope="col">Active min</th>
                      <th scope="col">SpO₂</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((row) => (
                      <tr key={row.date}>
                        <th scope="row">{date(row.date)}</th>
                        <td>{count(row.steps)}</td>
                        <td>{count(row.zoneMinutes)}</td>
                        <td>{percent(row.oxygen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="garden-help">
                Active zone minutes are weighted by intensity. A dash means no recorded value.
              </p>
            </details>
          </>
        )}
        <footer className="public-footer">
          <p>
            Public: daily steps, active zone minutes, and average blood oxygen. Each day appears
            after seven full days. Dates use Hong Kong time.
          </p>
          <p>
            Sleep, heart rate, HRV, and breathing rate stay private. Up to 84 days are shown. The
            garden is a picture of recorded movement, not a health score.
          </p>
          <a href="https://theoazriel.com/">Back to home ↗</a>
        </footer>
      </main>
    </div>
  );
}
