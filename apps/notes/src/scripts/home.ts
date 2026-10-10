// The homepage's live touches: the portal beats at my resting heart rate,
// hovering a link draws an ink thread from the portal down to it, each
// project shows a small preview of itself, and the paper takes ink drops.
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

const SVG = 'http://www.w3.org/2000/svg';
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

// --- Ink threads ---------------------------------------------------------------

function threads() {
  if (!mark || !home || reduced.matches) return;
  const layer = document.createElementNS(SVG, 'svg');
  layer.classList.add('ink-threads');
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `
    <filter id="thread-ink" x="-20%" y="-5%" width="140%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
      <feDisplacementMap in="SourceGraphic" scale="2.2" />
    </filter>`;
  home.prepend(layer);
  let current: { target: Element; group: SVGGElement } | null = null;

  const fade = (group: SVGGElement) => {
    group
      .animate(
        [
          { opacity: 1, strokeWidth: 1.3 },
          { opacity: 0, strokeWidth: 3 },
        ],
        { duration: 600, easing: 'ease-out', fill: 'forwards' },
      )
      .finished.then(
        () => group.remove(),
        () => group.remove(),
      );
  };

  const draw = (target: Element) => {
    if (current?.target === target) return;
    if (current) fade(current.group);
    const box = home.getBoundingClientRect();
    const portal = mark.getBoundingClientRect();
    const item = target.getBoundingClientRect();
    // From the lower left of the opening straight out into the left margin, down
    // the margin, then curling in to the link, so it never crosses the text.
    const radius = portal.width * 0.33;
    const sx = portal.left + portal.width / 2 - box.left - radius * 0.6;
    const sy = portal.top + portal.height / 2 - box.top + radius * 0.55;
    // Just outside the list highlight's edge (12px), and never off the screen.
    const margin = Math.max(-24, 6 - box.left);
    // List items have padding before their text; the Spotify cover starts at the edge.
    const tx = item.left - box.left + (target.matches('.item') ? 6 : -6);
    const ty = item.top - box.top + Math.min(item.height / 2, 22);
    const group = document.createElementNS(SVG, 'g');
    group.setAttribute('filter', 'url(#thread-ink)');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute(
      'd',
      `M${sx} ${sy} Q${margin} ${sy + 2}, ${margin} ${sy + 34} L${margin} ${ty - 30} Q${margin} ${ty}, ${tx} ${ty}`,
    );
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('cx', String(tx));
    dot.setAttribute('cy', String(ty));
    dot.setAttribute('r', '2.2');
    group.append(path, dot);
    layer.append(group);
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: Math.min(700, 260 + length * 0.9),
      easing: 'cubic-bezier(.3,.6,.2,1)',
      fill: 'both',
    });
    dot.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      delay: Math.min(620, 200 + length * 0.9),
      fill: 'both',
    });
    // The opening turns toward the link.
    const dx = item.left + 20 - (portal.left + portal.width / 2);
    const dy = item.top + item.height / 2 - (portal.top + portal.height / 2);
    const distance = Math.hypot(dx, dy) || 1;
    mark.lean((dx / distance) * 0.9, (-dy / distance) * 0.9);
    current = { target, group };
  };

  const release = (target: Element) => {
    if (current?.target !== target) return;
    fade(current.group);
    current = null;
    mark.rest();
  };

  const links = home.querySelectorAll<HTMLElement>('a.item, a.now-playing');
  for (const link of links) {
    link.addEventListener('pointerenter', () => canHover.matches && draw(link));
    link.addEventListener('pointerleave', () => release(link));
    link.addEventListener('focus', () => link.matches(':focus-visible') && draw(link));
    link.addEventListener('blur', () => release(link));
  }
  // Positions change on resize; drop the thread rather than leave it misplaced.
  addEventListener('resize', () => current && release(current.target));
}

// --- Ink drops -----------------------------------------------------------------

// A tap or click on empty paper lets a bead of ink fall there. It lands with a
// ragged edge and a few specks, bleeds a faint halo into the paper, and dries
// away; the portal glances toward it. Drops sit under the text, like ink on
// the page itself.
function drops() {
  if (reduced.matches) return;
  const paper = document.createElement('div');
  paper.className = 'ink-drops';
  paper.setAttribute('aria-hidden', 'true');
  document.body.append(paper);
  const size = 140;
  const half = size / 2;
  let start: { x: number; y: number; time: number } | null = null;

  const drop = (pageX: number, pageY: number, clientX: number, clientY: number) => {
    if (paper.childElementCount >= 12) return;
    // The layer covers the whole document, which grows as content loads.
    paper.style.height = `${document.documentElement.scrollHeight}px`;
    const radius = 9 + Math.random() * 7;
    const seed = Math.floor(Math.random() * 10000);
    const id = `ink-drop-${seed}`;
    const specks = Array.from({ length: Math.floor(Math.random() * 4) }, () => {
      const angle = Math.random() * Math.PI * 2;
      const reach = radius * (1.5 + Math.random() * 1.3);
      const x = half + Math.cos(angle) * reach;
      const y = half + Math.sin(angle) * reach;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.7 + Math.random() * 1.5).toFixed(1)}" />`;
    }).join('');
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.style.left = `${pageX - half}px`;
    svg.style.top = `${pageY - half}px`;
    svg.innerHTML = `
      <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed}" result="grain" />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale="${(radius * 0.8).toFixed(1)}" />
      </filter>
      <g filter="url(#${id})">
        <circle class="halo" cx="${half}" cy="${half}" r="${(radius * 1.7).toFixed(1)}" />
        <g class="bead"><circle cx="${half}" cy="${half}" r="${radius.toFixed(1)}" />${specks}</g>
      </g>`;
    paper.append(svg);
    const origin = `${half}px ${half}px`;
    const halo = svg.querySelector<SVGElement>('.halo')!;
    const bead = svg.querySelector<SVGElement>('.bead')!;
    halo.style.transformOrigin = bead.style.transformOrigin = origin;
    // The bead lands fast and spreads a little; the halo keeps bleeding outward.
    bead.animate(
      [
        { transform: 'scale(0.15)' },
        { transform: 'scale(1.08)', offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
    );
    halo.animate(
      [
        { transform: 'scale(0.5)', opacity: 0.18 },
        { transform: 'scale(1.7)', opacity: 0 },
      ],
      { duration: 3200, easing: 'cubic-bezier(.1,.6,.3,1)', fill: 'both' },
    );
    svg
      .animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], {
        duration: 3400,
        easing: 'ease-in',
        fill: 'both',
      })
      .finished.then(
        () => svg.remove(),
        () => svg.remove(),
      );
    // The portal glances toward the drop, unless a thread already holds it.
    if (mark && !document.querySelector('.ink-threads g')) {
      const portal = mark.getBoundingClientRect();
      const dx = clientX - (portal.left + portal.width / 2);
      const dy = clientY - (portal.top + portal.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      mark.lean((dx / distance) * 0.7, (-dy / distance) * 0.7);
      setTimeout(() => !document.querySelector('.ink-threads g') && mark.rest(), 700);
    }
  };

  // A tap, not a scroll or a drag: the pointer lifts close to where it went down.
  addEventListener('pointerdown', (event) => {
    const target = event.target as Element;
    const interactive = target.closest('a, button, input, textarea, select, label, summary');
    start =
      event.isPrimary && event.button === 0 && !interactive
        ? { x: event.clientX, y: event.clientY, time: event.timeStamp }
        : null;
  });
  addEventListener('pointerup', (event) => {
    if (!start || !event.isPrimary) return;
    const still = Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8;
    const quick = event.timeStamp - start.time < 500;
    start = null;
    if (!still || !quick || getSelection()?.toString()) return;
    drop(event.pageX, event.pageY, event.clientX, event.clientY);
  });
  addEventListener('pointercancel', () => (start = null));
}

pulse();
threads();
drops();
healthPreview();
galleryPreview();
