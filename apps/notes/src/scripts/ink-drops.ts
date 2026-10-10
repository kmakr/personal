// Ink drops on the paper of every page: a tap or click on empty paper lets a
// bead of ink fall there. It lands with a ragged edge and a few specks, bleeds
// a faint halo into the paper, and dries away. Drops sit under the text, like
// ink on the page itself; on the homepage the portal glances toward them.
type Leaning = { lean(x: number, y: number): void; rest(): void };

const SVG = 'http://www.w3.org/2000/svg';

function drops() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // The homepage's live portal can glance toward a drop; a note page's still
  // mark cannot, so it simply stays put.
  const mark = document.querySelector<Partial<Leaning> & Element>('ink-mark');
  const canLean = typeof mark?.lean === 'function' && typeof mark.rest === 'function';
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
    if (canLean && !document.querySelector('.ink-threads g')) {
      const portal = mark!.getBoundingClientRect();
      const dx = clientX - (portal.left + portal.width / 2);
      const dy = clientY - (portal.top + portal.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      mark!.lean!((dx / distance) * 0.7, (-dy / distance) * 0.7);
      setTimeout(() => !document.querySelector('.ink-threads g') && mark!.rest!(), 700);
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
