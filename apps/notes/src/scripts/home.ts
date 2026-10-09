// The homepage's live touches: the portal beats at my resting heart rate, and
// hovering a link draws an ink thread from the portal down to it.
type InkMark = HTMLElement & { lean(x: number, y: number): void; rest(): void };
type Day = { date: string; restingHeartRate?: number | null };

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mark = document.querySelector<InkMark>('.home ink-mark');
const home = document.querySelector<HTMLElement>('main.home');

// --- The pulse ---------------------------------------------------------------

async function pulse() {
  const line = document.querySelector<HTMLElement>('.pulse-line');
  if (!mark || !line || reduced.matches) return;
  try {
    const response = await fetch('/health/api/dashboard');
    if (!response.ok) return;
    const { days } = (await response.json()) as { days: Day[] };
    const day = days.findLast((row) => row.restingHeartRate != null);
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
  } catch {
    // Without the feed the portal simply doesn't beat.
  }
}

// --- Ink threads ---------------------------------------------------------------

const SVG = 'http://www.w3.org/2000/svg';

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
    const margin = -16;
    const tx = item.left - box.left + 8;
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
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  for (const link of links) {
    link.addEventListener('pointerenter', () => finePointer.matches && draw(link));
    link.addEventListener('pointerleave', () => release(link));
    link.addEventListener('focus', () => link.matches(':focus-visible') && draw(link));
    link.addEventListener('blur', () => release(link));
  }
  // Positions change on resize; drop the thread rather than leave it misplaced.
  addEventListener('resize', () => current && release(current.target));
}

pulse();
threads();
