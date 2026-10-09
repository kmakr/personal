import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, Play, Sprout, Footprints, Zap } from 'lucide-react';

import { stepTrend, trendSentence } from './trend.js';
import { seasonWeeks } from './season.js';
import { arrivals, msUntilHongKongMidnight, untilText } from './midnight.js';

const count = (value) => (value == null ? '—' : Math.round(value).toLocaleString('en-GB'));
const date = (value, long = false) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(long ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
const weekday = (value) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const plural = (value, word) => `${value} ${word}${value === 1 ? '' : 's'}`;
const addDays = (value, amount) => {
  const next = new Date(`${value}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
};
const hasValue = (row) => row && [row.steps, row.zoneMinutes].some((value) => value != null);

// A small copy of the homepage portal: smoky haze, an ink core, and two bright
// folds turning inward. The page-level ink-edge filter roughens the outlines.
function Portal({ cx = 0, cy = 0, r }) {
  return (
    <g className="portal" filter="url(#ink-edge)">
      <circle className="portal-haze" cx={cx} cy={cy} r={r * 1.35} filter="url(#ink-haze)" />
      <circle className="portal-core" cx={cx} cy={cy} r={r} />
      <circle className="portal-fold" cx={cx + r * 0.08} cy={cy - r * 0.05} r={r * 0.66} />
      <circle className="portal-fold inner" cx={cx - r * 0.1} cy={cy + r * 0.06} r={r * 0.32} />
    </g>
  );
}

// wind: 0 to 1, how hard this plant sways; null keeps it still.
// arriving: the day just became public, so it falls in as a seed first.
function Plant({ row, maxSteps, maxMinutes, index, wind = null, arriving = false }) {
  const height = row.steps == null ? 28 : row.steps === 0 ? 0 : 18 + (row.steps / maxSteps) * 89;
  const tip = 132 - height;
  const leaves = row.zoneMinutes == null ? 0 : Math.ceil((row.zoneMinutes / maxMinutes) * 6);
  return (
    <svg
      className="garden-plant"
      viewBox="0 0 48 152"
      aria-hidden="true"
      style={{
        '--grow-delay': arriving ? '1100ms' : `${index * 25}ms`,
        ...(wind != null && {
          '--sway': `${0.6 + wind * 4.4}deg`,
          '--sway-time': `${3.6 - wind * 1.4}s`,
          // Each plant lags its neighbour, so a gust rolls along the row.
          '--sway-delay': `${-index * 0.35}s`,
        }),
      }}
    >
      <path className="plant-ground" d="M15 136 Q24 133 33 136" />
      {arriving && (
        <g className="plant-seed">
          <Portal cx={24} cy={131} r={3.2} />
        </g>
      )}
      <g className="plant-growth">
        <g className={wind != null ? 'plant-sway' : undefined}>
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
              <circle className="plant-head" r="4" />
              {/* Only the moth's flower opens into the portal. */}
              <g className="plant-portal">
                <Portal r={5} />
              </g>
            </g>
          )}
          {row.steps === 0 && <circle className="plant-zero" cx="24" cy="131" r="3" />}
          {row.steps == null && <circle className="plant-missing" cx="24" cy={tip} r="3" />}
        </g>
      </g>
    </svg>
  );
}

// The moth's resting tilt, and the point it rotates around (its centre).
const MOTH_REST = -8;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mothTransform = (x, y, angle) => `translate(${x - 13}px, ${y - 24}px) rotate(${angle}deg)`;

// A flight from one point to another as keyframes: an arc that lifts above both
// ends, a bob from each wing beat, and a bank into the direction of travel that
// eases back to the resting tilt on landing. Equal ends make a small hop.
function flightPath(from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = 28 + distance * 0.3;
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  const steps = 36;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const raw = i / steps;
    const t = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
    const u = 1 - t;
    const x = u * u * from.x + 2 * u * t * control.x + t * t * to.x;
    const y = u * u * from.y + 2 * u * t * control.y + t * t * to.y;
    const dx = 2 * u * (control.x - from.x) + 2 * t * (to.x - control.x);
    const dy = 2 * u * (control.y - from.y) + 2 * t * (to.y - control.y);
    // Head stays up; the body leans toward horizontal travel, up to 40 degrees.
    const bank = Math.max(-40, Math.min(40, (Math.atan2(dx, Math.abs(dy) + 1) * 180) / Math.PI));
    const settle = Math.min(1, Math.max(0, (raw - 0.8) / 0.2));
    const bob = Math.sin(raw * Math.PI * 9) * 2.5 * (1 - settle);
    return {
      transform: mothTransform(x, y + bob, bank * (1 - settle) + MOTH_REST * settle),
      offset: raw,
    };
  });
}

function Moth({ plot, day, maxSteps, animation, breath }) {
  const insect = useRef(null);
  // Where the moth is now, so the next flight starts from it.
  const perch = useRef(null);
  useEffect(() => {
    const parent = plot.current;
    const target = parent?.querySelector(`[data-date="${day?.date}"] .garden-plant`);
    const moth = insect.current;
    if (!parent || !target || !moth) return;
    function place(fly) {
      const box = target.getBoundingClientRect();
      const garden = parent.getBoundingClientRect();
      const scale = Math.min(box.width / 48, box.height / 152);
      const height =
        day.steps == null ? 28 : day.steps === 0 ? 0 : 18 + (day.steps / maxSteps) * 89;
      // Land beside the flower head, so the moth never hides the flower.
      const side = day.steps > 0 ? 14 : 0;
      // The moth is about 24px tall, so +10 centres it on the head.
      const to = {
        x: box.left - garden.left + box.width / 2 + side,
        y:
          box.top -
          garden.top +
          (box.height - 152 * scale) / 2 +
          (132 - height) * scale +
          (side ? 10 : 0),
      };
      // The first flight comes in from beyond the top right of the garden.
      const from = perch.current || { x: garden.width + 30, y: -40 };
      perch.current = to;
      moth.getAnimations().forEach((running) => running.cancel());
      moth.style.transform = mothTransform(to.x, to.y, MOTH_REST);
      moth.style.opacity = '1';
      if (!fly || reducedMotion()) {
        moth.dataset.state = 'landed';
        return;
      }
      moth.dataset.state = 'flying';
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const flight = moth.animate(flightPath(from, to), {
        duration: Math.min(1500, 650 + distance * 1.4),
      });
      flight.onfinish = () => (moth.dataset.state = 'landed');
    }
    place(true);
    // A resize moves the flower, so the moth follows without flying. The
    // observer also reports once on start; that is not a resize.
    let width = parent.clientWidth;
    const observer = new ResizeObserver(() => {
      if (parent.clientWidth === width) return;
      width = parent.clientWidth;
      place(false);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [plot, day, maxSteps, animation]);
  if (!day) return null;
  return (
    <span
      ref={insect}
      className="garden-moth"
      aria-hidden="true"
      // One wing breath per real breath: 15 breaths a minute is a 4 second cycle.
      style={breath ? { '--breath': `${60 / breath}s` } : undefined}
    >
      {/* Each wing is a small portal, so the moth reads as made of the same ink. */}
      <svg viewBox="0 0 32 28">
        <g className="moth-sway">
          <g className="moth-wing left">
            <Portal cx={12} cy={20.5} r={3.2} />
            <Portal cx={9.5} cy={12} r={6.2} />
          </g>
          <g className="moth-wing right">
            <Portal cx={20} cy={20.5} r={3.2} />
            <Portal cx={22.5} cy={12} r={6.2} />
          </g>
          <path className="moth-body" d="M16 8 L16 23" />
          <path className="moth-antennae" d="M16 8 Q14.5 1 10 -0.5 M16 8 Q17.5 1 22 -0.5" />
        </g>
      </svg>
    </span>
  );
}

// Weekly totals as one plant per Monday-to-Sunday week. The API leaves a total
// empty unless all seven days were recorded, so a dotted stem marks a short week.
function Season({ weeks }) {
  const maxSteps = Math.max(1, ...weeks.map((week) => week.steps || 0));
  const maxMinutes = Math.max(1, ...weeks.map((week) => week.zoneMinutes || 0));
  const best = weeks.reduce(
    (a, week) => (week.steps != null && (!a || week.steps > a.steps) ? week : a),
    null,
  );
  return (
    <section className="season" aria-labelledby="season-title">
      <h2 id="season-title">
        <Sprout size={18} /> Week by week
      </h2>
      <p className="garden-help">
        Each plant is one Monday-to-Sunday week. Shapes compare weeks with each other.
      </p>
      <ol className="season-bed">
        {weeks.map((week, i) => (
          <li
            key={week.start}
            aria-label={`Week of ${date(week.start, true)}: ${week.steps == null ? 'no complete step total' : `${count(week.steps)} steps`}, ${week.zoneMinutes == null ? 'no complete active minutes total' : `${count(week.zoneMinutes)} active zone minutes`}`}
          >
            <Plant row={week} maxSteps={maxSteps} maxMinutes={maxMinutes} index={i} />
            <span className="season-date" aria-hidden="true">
              {date(week.start)}
            </span>
          </li>
        ))}
      </ol>
      <p className="garden-help">
        A dotted stem means a day is missing, so the week has no step total. No leaves means no
        complete active minutes total.
      </p>
      {best && (
        <p className="garden-highlight">
          <Sprout size={17} />
          <span>
            The strongest week:{' '}
            <strong>
              {date(best.start)} – {date(best.end)}
            </strong>
            , with <strong>{count(best.steps)} steps</strong>, about{' '}
            {count(Math.round(best.steps / 700) * 100)} a day.
          </span>
        </p>
      )}
    </section>
  );
}

export default function PublicApp() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const plot = useRef(null);
  const [animation, setAnimation] = useState(0);
  // The day that most recently became public while the page was open.
  const [arriving, setArriving] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const shown = useRef(null);
  // quiet: a background check at midnight; a failure keeps the page as it is.
  async function load(refresh = false, quiet = false) {
    setBusy(true);
    if (!quiet) setError('');
    try {
      // The feed may be up to five minutes old. A retry skips the browser copy.
      const response = await fetch('/health/api/dashboard', refresh ? { cache: 'no-cache' } : {});
      if (!response.ok) throw new Error('The activity page could not load.');
      const next = await response.json();
      // Version 4 lacks the weekly breathing rate. The edge cache can still serve it
      // for five minutes after a deploy, so accept both.
      if (![4, 5].includes(next.policy?.version) || !Array.isArray(next.days))
        throw new Error('The activity page could not load.');
      const added = arrivals(shown.current?.days, next.days);
      if (added.length) setArriving(added.at(-1));
      shown.current = next;
      setData(next);
      setNow(Date.now());
      return next;
    } catch (e) {
      if (!quiet) setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    document.title = 'Health | Theo Azriel';
    load();
    const clock = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(clock);
  }, []);
  const lastShared = data?.days.at(-1)?.date;
  // At midnight Hong Kong time the next day becomes public. The Worker's edge
  // cache can serve the old feed for up to five minutes after that, so ask
  // once a minute until the new day appears, for up to eight minutes.
  useEffect(() => {
    if (!lastShared) return;
    let timer;
    let attempts = 0;
    async function check() {
      const next = await load(true, true);
      if (next?.days.at(-1)?.date === lastShared && ++attempts < 8)
        timer = setTimeout(check, 60000);
    }
    timer = setTimeout(check, msUntilHongKongMidnight() + 15000);
    return () => clearTimeout(timer);
  }, [lastShared]);
  const allDays = data?.days || [];
  const firstRecord = allDays.findIndex(hasValue);
  // The garden is the last seven shared days. Days before the first record stay
  // in it as dotted stems rather than being skipped.
  const rows = allDays.slice(-7);
  // The moth rests on the newest recorded day; the plants are not selectable.
  const day = rows.findLast(hasValue) || rows.at(-1);
  const maxSteps = Math.max(1, ...rows.map((row) => row.steps || 0));
  const maxMinutes = Math.max(1, ...rows.map((row) => row.zoneMinutes || 0));
  const stepDays = rows.filter((row) => row.steps != null);
  const minuteDays = rows.filter((row) => row.zoneMinutes != null);
  const totalSteps = stepDays.reduce((sum, row) => sum + row.steps, 0);
  const totalMinutes = minuteDays.reduce((sum, row) => sum + row.zoneMinutes, 0);
  // Each day is shared seven full days after it ends, so day D appears on D + 8.
  const sharedThrough = allDays.at(-1)?.date;
  const trend = trendSentence(stepTrend(allDays));
  const season = seasonWeeks(data?.weeks, allDays[firstRecord]?.date);
  // The moth breathes at the newest weekly average breathing rate, if one is public.
  const breathWeek = data?.weeks?.findLast((week) => week.breathingRate != null);
  const best = stepDays.reduce((a, row) => (!a || row.steps > a.steps ? row : a), null);
  return (
    <div className="app-shell public-health garden-page">
      <svg className="ink-defs" aria-hidden="true" focusable="false">
        <filter id="ink-edge" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
        <filter id="ink-haze" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
      </svg>
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
        <h1>Health</h1>
        <p className="garden-intro">
          A garden of my daily movement, with a little room to breathe. Real Fitbit records, shared
          seven days later.
        </p>
        {trend && <p className="garden-trend">{trend}</p>}
        {sharedThrough && (
          <p className="garden-status">
            Shared through {date(sharedThrough, true)}. {date(addDays(sharedThrough, 1))} drops in
            as a seed at midnight Hong Kong time, {untilText(msUntilHongKongMidnight(now))}.
          </p>
        )}
        {error && (
          <p className="message error" role="alert">
            {error}{' '}
            <button className="retry" disabled={busy} onClick={() => load(true)}>
              <RefreshCw size={13} className={busy ? 'spin' : ''} /> Try again
            </button>
          </p>
        )}
        {busy && !data && (
          <div className="garden-loading" aria-busy="true">
            <p>Loading the garden…</p>
          </div>
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
              <p className="garden-range">
                {date(rows[0].date)} – {date(rows.at(-1).date, true)}
              </p>
              <div className="garden-plot" ref={plot}>
                <ol
                  className="garden-bed seven-days"
                  // Only "Grow again" replays every plant. A day arriving at
                  // midnight mounts just its own plant; the rest stay grown.
                  key={animation}
                  aria-label="The last seven shared days"
                >
                  {rows.map((row, i) => (
                    <li
                      className={`garden-day ${row.date === day?.date ? 'visited' : ''}`}
                      data-date={row.date}
                      key={row.date}
                      aria-label={`${date(row.date, true)}: ${row.steps == null ? 'steps unavailable' : `${count(row.steps)} steps`}, ${row.zoneMinutes == null ? 'active minutes unavailable' : `${count(row.zoneMinutes)} active zone minutes`}`}
                    >
                      <Plant
                        row={row}
                        maxSteps={maxSteps}
                        maxMinutes={maxMinutes}
                        index={i}
                        wind={row.zoneMinutes == null ? null : row.zoneMinutes / maxMinutes}
                        arriving={row.date === arriving}
                      />
                      <span className="garden-day-number">{Number(row.date.slice(-2))}</span>
                      <span className="garden-day-name">{weekday(row.date)}</span>
                    </li>
                  ))}
                </ol>
                <Moth
                  plot={plot}
                  day={day}
                  maxSteps={maxSteps}
                  animation={animation}
                  breath={breathWeek?.breathingRate}
                />
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
                Shapes compare the seven days. Plants sway more on days with more active minutes. A
                dotted stem means no step record. The moth rests on the newest day.
              </p>
              {breathWeek && (
                <p className="garden-help">
                  The moth breathes at my average breathing rate for the week of{' '}
                  {date(breathWeek.start)}: {breathWeek.breathingRate} breaths a minute.
                </p>
              )}
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
                  </dl>
                </div>
              )}
            </section>
            {/* With one recorded day the selected-day panel already says all of this. */}
            {(stepDays.length > 1 || minuteDays.length > 1) && (
              <section className="garden-summary" aria-label="Period summary">
                <h2>A few things this garden says</h2>
                <div className="garden-facts">
                  <article>
                    <span className="fact-value">{stepDays.length ? count(totalSteps) : '—'}</span>
                    <h3>steps in these 7 days</h3>
                    <p>
                      {stepDays.length} of {plural(rows.length, 'day')} recorded
                    </p>
                  </article>
                  <article>
                    <span className="fact-value">
                      {minuteDays.length ? count(totalMinutes) : '—'}
                      <small> min</small>
                    </span>
                    <h3>active zone minutes</h3>
                    <p>
                      {minuteDays.length} of {plural(rows.length, 'day')} recorded
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
            )}
            {/* One complete week has nothing to compare against yet. */}
            {season.length > 1 && <Season weeks={season} />}
            <details className="daily-records">
              <summary>
                See the daily records <span>{plural(rows.length, 'day')}</span>
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
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((row) => (
                      <tr key={row.date}>
                        <th scope="row">{date(row.date)}</th>
                        <td>{count(row.steps)}</td>
                        <td>{count(row.zoneMinutes)}</td>
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
            Public: daily steps and active zone minutes, and my breathing rate as one whole-number
            average per complete week. Each day appears after seven full days. Dates use Hong Kong
            time.
          </p>
          <p>
            Blood oxygen, sleep, heart rate, HRV, and daily breathing rates stay private. The garden
            shows the last seven shared days. It is a picture of recorded movement, not a health
            score.
          </p>
          <a href="https://theoazriel.com/">Back to home</a>
        </footer>
      </main>
    </div>
  );
}
