// Ink drops on the paper of every page: a tap or click on empty paper lets a
// bead of ink fall there. It lands with a ragged edge and a few specks, bleeds
// a faint halo into the paper, and dries away. Drops sit under the text, like
// ink on the page itself; on the homepage the portal glances toward them.
//
// The homepage keeps its ink: each drop dries to a faint stain that later
// visitors see too, the newest strongest, until it fades out after a week.
type Leaning = { lean(x: number, y: number): void; rest(): void };
type Stain = { x: number; y: number; seed: number; hours: number };

const SVG = 'http://www.w3.org/2000/svg';
const SIZE = 140;
const HALF = SIZE / 2;

// A small seeded generator, so a stored seed redraws the same drop for everyone.
function random(seed: number) {
  let state = seed + 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One drop's shape: a ragged bead, a few specks thrown clear, and a halo.
function dropShape(seed: number, left: number, top: number) {
  const next = random(seed);
  const radius = 9 + next() * 7;
  const id = `ink-drop-${seed}-${Math.round(left)}-${Math.round(top)}`;
  const specks = Array.from({ length: Math.floor(next() * 4) }, () => {
    const angle = next() * Math.PI * 2;
    const reach = radius * (1.5 + next() * 1.3);
    const x = HALF + Math.cos(angle) * reach;
    const y = HALF + Math.sin(angle) * reach;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.7 + next() * 1.5).toFixed(1)}" />`;
  }).join('');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.style.left = `${left - HALF}px`;
  svg.style.top = `${top - HALF}px`;
  svg.innerHTML = `
    <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed}" result="grain" />
      <feDisplacementMap in="SourceGraphic" in2="grain" scale="${(radius * 0.8).toFixed(1)}" />
    </filter>
    <g filter="url(#${id})">
      <circle class="halo" cx="${HALF}" cy="${HALF}" r="${(radius * 1.7).toFixed(1)}" />
      <g class="bead"><circle cx="${HALF}" cy="${HALF}" r="${radius.toFixed(1)}" />${specks}</g>
    </g>`;
  return svg;
}

// A dried drop: the newest at full strength, a week-old one barely there.
const stainOpacity = (hours: number) => 0.13 * (1 - Math.min(hours, 168) / 240);

// The middle of the page, which drops are measured across from.
const middle = () => document.documentElement.clientWidth / 2;

function drops() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // The homepage's live portal can glance toward a drop; a note page's still
  // mark cannot, so it simply stays put.
  const mark = document.querySelector<Partial<Leaning> & Element>('ink-mark');
  const canLean = typeof mark?.lean === 'function' && typeof mark.rest === 'function';
  const shared = document.querySelector('main.home') !== null;
  const paper = document.createElement('div');
  paper.className = 'ink-drops';
  paper.setAttribute('aria-hidden', 'true');
  document.body.append(paper);
  let start: { x: number; y: number; time: number } | null = null;
  // The layer covers the whole document, which grows as content loads.
  const cover = () => (paper.style.height = `${document.documentElement.scrollHeight}px`);

  if (shared) {
    fetch('/api/ink-drops')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { drops?: Stain[] } | null) => {
        cover();
        const width = document.documentElement.clientWidth;
        // Oldest first, so newer ink lies over older.
        for (const stain of (body?.drops ?? []).slice().reverse()) {
          const left = middle() + stain.x;
          if (left < 8 || left > width - 8) continue;
          const svg = dropShape(stain.seed, left, stain.y);
          svg.querySelector('.halo')!.remove();
          svg.style.opacity = String(stainOpacity(stain.hours));
          paper.prepend(svg);
        }
      })
      .catch(() => {
        // The paper is simply clean.
      });
  }

  const drop = (pageX: number, pageY: number, clientX: number, clientY: number) => {
    if (paper.querySelectorAll('.live').length >= 12) return;
    cover();
    const seed = Math.floor(Math.random() * 10000);
    const svg = dropShape(seed, pageX, pageY);
    svg.classList.add('live');
    paper.append(svg);
    const origin = `${HALF}px ${HALF}px`;
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
    // On the homepage the drop dries to a stain and stays; elsewhere it dries away.
    const dried = shared ? stainOpacity(0) : 0;
    svg
      .animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: dried }], {
        duration: 3400,
        easing: 'ease-in',
        fill: 'both',
      })
      .finished.then(
        () => {
          if (!shared) return svg.remove();
          halo.remove();
          svg.classList.remove('live');
        },
        () => svg.remove(),
      );
    if (shared) {
      fetch('/api/ink-drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: Math.round(pageX - middle()), y: Math.round(pageY), seed }),
      }).catch(() => {
        // It still dries here; it just isn't kept for the next visitor.
      });
    }
    // The portal glances toward the drop.
    if (canLean) {
      const portal = mark!.getBoundingClientRect();
      const dx = clientX - (portal.left + portal.width / 2);
      const dy = clientY - (portal.top + portal.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      mark!.lean!((dx / distance) * 0.7, (-dy / distance) * 0.7);
      setTimeout(() => mark!.rest!(), 700);
    }
  };

  // A tap, not a scroll or a drag: the pointer lifts close to where it went down.
  addEventListener('pointerdown', (event) => {
    const target = event.target as Element;
    // Only empty paper takes ink: not links or controls, and not the words,
    // pictures, or code someone is reading.
    const taken = target.closest(
      'a, button, input, textarea, select, label, summary, p, h1, h2, h3, h4, li, blockquote, pre, figure, img, table',
    );
    start =
      event.isPrimary && event.button === 0 && !taken
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

drops();
