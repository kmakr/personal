// The shared body of a 2D portal: sizing, the draw loop, pausing when unseen,
// the heartbeat, turning toward a point, and the hand's effect on it (a
// pointer moving nearby, a tap, the page scrolling). Each portal supplies a
// painter that draws one frame; this registers it as <ink-mark> with the same
// lean() and rest() the homepage's threads and ink drops already call.
export type Frame = {
  ctx: CanvasRenderingContext2D;
  size: number;
  // Canvas pixels per CSS pixel of the mark, so painters can size things alike
  // on any screen.
  unit: number;
  // The middle of the mark, in canvas pixels.
  origin: { x: number; y: number };
  time: number;
  delta: number;
  beat: number;
  // Where the portal is turned, in its own -1 to 1 space (y up), and how much.
  x: number;
  y: number;
  touch: number;
  // A fine pointer near the portal, in canvas pixels, and how fast it moved.
  pointer: { x: number; y: number; vx: number; vy: number } | null;
  // How far the page scrolled since the last frame, in canvas pixels.
  scroll: number;
  // Taps on the portal since the last frame, in canvas pixels.
  taps: { x: number; y: number }[];
  dark: boolean;
};
export type Painter = { frame(frame: Frame): void };

// A heartbeat's shape: a strong beat, then a softer one a fifth of a second later.
export function heartbeat(seconds: number, bpm: number) {
  const phase = seconds % (60 / bpm);
  return Math.exp(-((phase / 0.07) ** 2)) + 0.5 * Math.exp(-(((phase - 0.22) / 0.06) ** 2));
}

// Seeded random, so a seed redraws the same shape for everyone.
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise over a wrapping 256 by 256 lattice.
export function noise(seed: number) {
  const next = random(seed);
  const lattice = Float32Array.from({ length: 256 * 256 }, next);
  const at = (x: number, y: number) => lattice[(x & 255) + ((y & 255) << 8)];
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    // quintic easing keeps the noise's slope smooth across lattice lines
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// left, top: where the canvas starts, in the mark's widths from its top left
// corner (centred on the mark unless given).
// spread: how many times the mark's width the canvas covers, so a portal can
// draw beyond its own box (the canvas sits centred on the mark, under the text).
export function definePortal(
  paint: (size: number, mark: HTMLElement) => Painter,
  {
    spread = 1,
    left = -(spread - 1) / 2,
    top = -(spread - 1) / 2,
  }: { spread?: number; left?: number; top?: number } = {},
) {
  class Portal extends HTMLElement {
    private cleanup?: () => void;
    private leanTo?: (x: number, y: number) => void;
    private settle?: () => void;

    lean(x: number, y: number) {
      this.leanTo?.(x, y);
    }

    rest() {
      this.settle?.();
    }

    connectedCallback() {
      this.cleanup?.();
      const canvas = this.querySelector('canvas');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      if (spread !== 1) {
        Object.assign(canvas.style, {
          inset: 'auto',
          left: `${left * 100}%`,
          top: `${top * 100}%`,
          background: 'none',
          width: `${spread * 100}%`,
          height: `${spread * 100}%`,
          zIndex: '-1',
        });
      }
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
      const darkPaper = matchMedia('(prefers-color-scheme: dark)');
      const listeners = new AbortController();
      const options = { signal: listeners.signal };
      let painter: Painter | undefined;
      let frame = 0;
      let previous = 0;
      let elapsed = 0;
      let visible = false;
      let x = 0;
      let y = 0;
      let touch = 0;
      let targetX = 0;
      let targetY = 0;
      let targetTouch = 0;
      let pointer: Frame['pointer'] = null;
      let lastScroll = scrollY;
      let taps: Frame['taps'] = [];

      const centre = () => ({
        x: ((0.5 - left) / spread) * canvas.width,
        y: ((0.5 - top) / spread) * canvas.height,
      });
      // A point on the page, in canvas pixels.
      const toCanvas = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: ((clientX - rect.left) / rect.width) * canvas.width,
          y: ((clientY - rect.top) / rect.height) * canvas.height,
        };
      };

      const draw = (delta: number) => {
        if (!painter) return;
        const bpm = Number(this.dataset.bpm);
        const scroll =
          ((scrollY - lastScroll) * canvas.width) / canvas.getBoundingClientRect().width;
        lastScroll = scrollY;
        painter.frame({
          ctx,
          size: canvas.width,
          unit: canvas.width / (this.clientWidth * spread),
          origin: centre(),
          time: elapsed,
          delta,
          beat: bpm >= 25 && bpm <= 200 && !reduced ? heartbeat(elapsed, bpm) : 0,
          x,
          y,
          touch,
          pointer,
          scroll: Number.isFinite(scroll) ? scroll : 0,
          taps,
          dark: darkPaper.matches,
        });
        taps = [];
        // The pointer's speed is spent once it has been felt.
        if (pointer) pointer = { ...pointer, vx: pointer.vx * 0.6, vy: pointer.vy * 0.6 };
        if (!this.hasAttribute('data-rendered')) this.setAttribute('data-rendered', '');
      };
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        const delta = previous ? Math.min((now - previous) / 1000, 0.06) : 1 / 60;
        previous = now;
        elapsed += delta;
        const ease = 1 - Math.exp(-delta * 6);
        x += (targetX - x) * ease;
        y += (targetY - y) * ease;
        touch += (targetTouch - touch) * ease;
        draw(delta);
      };
      const sync = () => {
        cancelAnimationFrame(frame);
        previous = 0;
        lastScroll = scrollY;
        if (reduced || !visible || document.hidden) return;
        frame = requestAnimationFrame(tick);
      };
      const stillFrame = (): Frame => ({
        ctx,
        size: canvas.width,
        unit: canvas.width / (this.clientWidth * spread),
        origin: centre(),
        time: elapsed,
        delta: 1 / 60,
        beat: 0,
        x: 0,
        y: 0,
        touch: 0,
        pointer: null,
        scroll: 0,
        taps: [],
        dark: darkPaper.matches,
      });
      const resize = new ResizeObserver(() => {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        canvas.width = canvas.height = Math.max(1, Math.round(this.clientWidth * spread * ratio));
        painter = paint(canvas.width, this);
        // Without motion the portal settles once, as a still drawing.
        if (reduced) {
          for (let i = 0; i < 360; i++) {
            elapsed += 1 / 60;
            painter.frame(stillFrame());
          }
          this.setAttribute('data-rendered', '');
        }
        sync();
      });
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        sync();
      });
      resize.observe(this);
      observer.observe(this);
      document.addEventListener('visibilitychange', sync, options);

      // Turning toward the pointer over the mark itself.
      this.addEventListener(
        'pointermove',
        (event: PointerEvent) => {
          if (!finePointer.matches || event.pointerType === 'touch') return;
          const rect = this.getBoundingClientRect();
          targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          targetY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
          targetTouch = 1;
        },
        options,
      );
      // A pointer anywhere over the canvas's reach stirs the water.
      addEventListener(
        'pointermove',
        (event: PointerEvent) => {
          if (!finePointer.matches || event.pointerType === 'touch') return;
          const point = toCanvas(event.clientX, event.clientY);
          const inside =
            point.x > -20 &&
            point.y > -20 &&
            point.x < canvas.width + 20 &&
            point.y < canvas.height + 20;
          pointer = inside
            ? {
                ...point,
                vx: pointer ? point.x - pointer.x : 0,
                vy: pointer ? point.y - pointer.y : 0,
              }
            : null;
        },
        options,
      );
      this.addEventListener(
        'click',
        (event: MouseEvent) => taps.push(toCanvas(event.clientX, event.clientY)),
        options,
      );
      const release = () => (targetTouch = 0);
      this.addEventListener('pointerleave', release, options);
      this.leanTo = (toX, toY) => {
        targetX = Math.max(-1, Math.min(1, toX));
        targetY = Math.max(-1, Math.min(1, toY));
        targetTouch = 1;
      };
      this.settle = release;
      this.cleanup = () => {
        cancelAnimationFrame(frame);
        listeners.abort();
        resize.disconnect();
        observer.disconnect();
      };
    }

    disconnectedCallback() {
      this.cleanup?.();
      this.cleanup = undefined;
    }
  }
  if (!customElements.get('ink-mark')) customElements.define('ink-mark', Portal);
}
