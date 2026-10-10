// The homepage's live touches: the portal beats at my resting heart rate,
// hovering a link turns its ink toward it, and each project shows a small
// preview of itself. Ink drops come from ink-drops.ts.
import './ink-drops';
type InkMark = HTMLElement & { lean(x: number, y: number): void; rest(): void };
type Day = {
  date: string;
  steps?: number | null;
  zoneMinutes?: number | null;
  restingHeartRate?: number | null;
};

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mark = document.querySelector<InkMark>('.home ink-mark');
const home = document.querySelector<HTMLElement>('main.home');

// The public health feed, read once for the pulse and the Health preview.
const feed: Promise<Day[] | null> = fetch('/health/api/dashboard')
  .then((response) => (response.ok ? response.json() : null))
  .then((body: { days?: Day[] } | null) => body?.days ?? null)
  .catch(() => null);

// --- The pulse ---------------------------------------------------------------

async function pulse() {
  const line = document.querySelector<HTMLElement>('.pulse-line');
  if (!mark || !line || reduced.matches) return;
  const days = await feed;
  const day = days?.findLast((row) => row.restingHeartRate != null);
  // Without the feed the portal simply doesn't beat.
  if (!day?.restingHeartRate) return;
  mark.dataset.bpm = String(day.restingHeartRate);
  const date = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  line.querySelector('.bpm')!.textContent = String(day.restingHeartRate);
  line.querySelector('.bpm-date')!.textContent = date;
  line.hidden = false;
}

// --- Project previews ----------------------------------------------------------

const canHover = matchMedia('(hover: hover) and (pointer: fine)');
// Matches the stylesheet: previews sit in the right margin of wide screens.
const showsPreviews = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 56rem)');

// The last seven days as plants: stem height for steps, a leaf pair for every
// fifteen active minutes (at most three), as in the Health garden.
async function healthPreview() {
  const peek = document.querySelector<HTMLElement>('.peek-health');
  if (!peek) return;
  const week = ((await feed) ?? []).slice(-7);
  if (!week.some((day) => day.steps)) return;
  const most = Math.max(...week.map((day) => day.steps || 0));
  const plants = week
    .map((day, i) => {
      const x = 7 + i * 11.7;
      if (!day.steps) return `<circle class="plant" style="--i:${i}" cx="${x}" cy="47" r="1" />`;
      const top = 47 - (8 + (day.steps / most) * 34);
      const pairs = Math.min(3, Math.round((day.zoneMinutes || 0) / 15));
      const leaves = Array.from({ length: pairs }, (_, k) => {
        const y = 44 - ((k + 1) * (47 - top)) / (pairs + 1.5);
        const side = k % 2 ? 1 : -1;
        return `<ellipse cx="${x + side * 2.6}" cy="${y}" rx="2.6" ry="1.1" transform="rotate(${side * -30} ${x + side * 2.6} ${y})" stroke="none" />`;
      }).join('');
      return `<g class="plant" style="--i:${i}"><path d="M${x} 47 L${x} ${top}" stroke-width="1.2" />${leaves}<circle cx="${x}" cy="${top}" r="1.5" stroke="none" /></g>`;
    })
    .join('');
  peek.innerHTML = `<svg viewBox="0 0 84 52"><path class="ground" d="M0 47.5 H84" />${plants}</svg>`;
  peek.dataset.ready = '';
}

// One print from the Gallery, a different one each visit.
async function galleryPreview() {
  const peek = document.querySelector<HTMLElement>('.peek-gallery');
  const image = peek?.querySelector('img');
  if (!peek || !image || !showsPreviews.matches) return;
  try {
    const origin = 'https://gallery.theoazriel.com';
    const response = await fetch(`${origin}/preview.json`);
    if (!response.ok) return;
    const { frames } = (await response.json()) as { frames: { src: string; roll: string }[] };
    if (!frames?.length) return;
    const frame = frames[Math.floor(Math.random() * frames.length)];
    image.addEventListener('load', () => (peek.dataset.ready = ''), { once: true });
    image.src = `${origin}/${frame.src}`;
  } catch {
    // The row simply stays without a print.
  }
}

// --- Glances ------------------------------------------------------------------

// Hovering or focusing a link turns the portal toward it, and the current in
// its water carries the ink that way.
function glances() {
  if (!mark || !home || reduced.matches) return;
  let current: Element | null = null;
  const turn = (target: Element) => {
    current = target;
    const portal = mark.getBoundingClientRect();
    const item = target.getBoundingClientRect();
    const dx = item.left + 20 - (portal.left + portal.width / 2);
    const dy = item.top + item.height / 2 - (portal.top + portal.height / 2);
    const distance = Math.hypot(dx, dy) || 1;
    mark.lean((dx / distance) * 0.9, (-dy / distance) * 0.9);
  };
  const release = (target: Element) => {
    if (current !== target) return;
    current = null;
    mark.rest();
  };
  const links = home.querySelectorAll<HTMLElement>('a.item, a.now-playing');
  for (const link of links) {
    link.addEventListener('pointerenter', () => canHover.matches && turn(link));
    link.addEventListener('pointerleave', () => release(link));
    link.addEventListener('focus', () => link.matches(':focus-visible') && turn(link));
    link.addEventListener('blur', () => release(link));
  }
}

pulse();
glances();
healthPreview();
galleryPreview();
