// Ink mark from the live theoazriel.com homepage (apps/notes/src/scripts/ink-mark.ts
// and portal-base.ts), bundled on 2026-10-10.
// ../notes/src/scripts/portal-base.ts
function heartbeat(seconds, bpm) {
  const phase = seconds % (60 / bpm);
  return Math.exp(-((phase / 0.07) ** 2)) + 0.5 * Math.exp(-(((phase - 0.22) / 0.06) ** 2));
}
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise(seed) {
  const next = random(seed);
  const lattice = Float32Array.from({ length: 256 * 256 }, next);
  const at = (x, y) => lattice[(x & 255) + ((y & 255) << 8)];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function definePortal(
  paint,
  { spread = 1, left = -(spread - 1) / 2, top = -(spread - 1) / 2 } = {},
) {
  class Portal extends HTMLElement {
    cleanup;
    leanTo;
    settle;
    lean(x, y) {
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
      let painter;
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
      let pointer = null;
      let lastScroll = scrollY;
      let taps = [];
      const centre = () => ({
        x: ((0.5 - left) / spread) * canvas.width,
        y: ((0.5 - top) / spread) * canvas.height,
      });
      const toCanvas = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: ((clientX - rect.left) / rect.width) * canvas.width,
          y: ((clientY - rect.top) / rect.height) * canvas.height,
        };
      };
      const draw = (delta) => {
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
        if (pointer) pointer = { ...pointer, vx: pointer.vx * 0.6, vy: pointer.vy * 0.6 };
        if (!this.hasAttribute('data-rendered')) this.setAttribute('data-rendered', '');
      };
      const tick = (now) => {
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
      const stillFrame = () => ({
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
      this.addEventListener(
        'pointermove',
        (event) => {
          if (!finePointer.matches || event.pointerType === 'touch') return;
          const rect = this.getBoundingClientRect();
          targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          targetY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
          targetTouch = 1;
        },
        options,
      );
      addEventListener(
        'pointermove',
        (event) => {
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
        (event) => taps.push(toCanvas(event.clientX, event.clientY)),
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

// ../notes/src/scripts/ink-mark.ts
var SPREAD = 2.8;
var LEFT = -0.3;
var TOP = 1.12 - SPREAD;
var MOST = 2400;
var originOf = (size) => ({
  x: ((0.5 - LEFT) / SPREAD) * size,
  y: ((0.5 - TOP) / SPREAD) * size,
});
function water(size, origin) {
  const next = random(17);
  const broad = noise(3);
  const eddy = noise(8);
  const motes = [];
  const layer = (side) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    return canvas.getContext('2d');
  };
  const washLayer = layer(Math.round(size / 4));
  const threadLayer = layer(size);
  const source = origin;
  let seep = 0;
  let clearing = 0;
  let lastBeat = -1;
  let nextDrop = 0;
  const add = (mote) => {
    if (motes.length < MOST) motes.push({ ...mote, age: 0 });
  };
  const ring = (x, y, unit, count, speed) => {
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + next() * 0.1;
      add({
        x: x + Math.cos(angle) * 3 * unit,
        y: y + Math.sin(angle) * 3 * unit,
        vx: Math.cos(angle) * speed * unit,
        vy: Math.sin(angle) * speed * unit,
        life: 50 + next() * 40,
        thread: true,
      });
    }
  };
  const drop = (x, y, unit, weight) => {
    for (let k = 0; k < 220 * weight; k++) {
      const angle = next() * Math.PI * 2;
      const push = next() * 1.6 * unit;
      add({
        x: x + (next() - 0.5) * 4 * unit,
        y: y + (next() - 0.5) * 4 * unit,
        vx: Math.cos(angle) * push,
        vy: Math.sin(angle) * push + 1.4 * unit * next(),
        life: 160 + next() * 340,
        thread: next() < 0.45,
      });
    }
    ring(x, y, unit, 70 * weight, 1.5);
  };
  const curl = (field, x, y, scale, t) => {
    const e = 0.6;
    const p = (u, v) => {
      const a = (u * 0.8 - v * 0.6) * scale + t * 0.05;
      const b = (u * 0.6 + v * 0.8) * scale - t * 0.035;
      const c = (u * 0.28 + v * 0.96) * scale * 2.1 + 31.7;
      const d = (v * 0.28 - u * 0.96) * scale * 2.1 - t * 0.04;
      return (field(a, b) + field(c, d) * 0.45) * 60;
    };
    return [(p(x, y + e) - p(x, y - e)) / (2 * e), -(p(x + e, y) - p(x - e, y)) / (2 * e)];
  };
  return {
    frame(f) {
      const { ctx, size: size2, unit, time, delta, beat, touch, dark } = f;
      const step = Math.min(delta * 60, 3);
      if (time >= nextDrop) {
        const first = nextDrop === 0;
        drop(source.x + (next() - 0.5) * 10 * unit, source.y - 14 * unit, unit, first ? 1.2 : 0.7);
        nextDrop = time + 7 + next() * 5;
      }
      seep += 1.6 * step;
      for (; seep >= 1; seep--) {
        add({
          x: source.x + (next() - 0.5) * 8 * unit,
          y: source.y + (next() - 0.5) * 6 * unit,
          vx: (next() - 0.5) * 0.4 * unit,
          vy: 0.3 * unit,
          life: 160 + next() * 300,
          thread: next() < 0.35,
        });
      }
      if (beat > 0.8 && time - lastBeat > 0.3) {
        ring(source.x, source.y, unit, 46, 0.9);
        lastBeat = time;
      }
      for (const tap of f.taps) drop(tap.x, tap.y, unit, 0.9);
      const drag = Math.pow(0.955, step);
      const leanX = f.x * touch * 0.03 * unit;
      const leanY = -f.y * touch * 0.03 * unit;
      const scroll = Math.max(-40, Math.min(40, f.scroll));
      const hand = f.pointer;
      const reach = 30 * unit;
      const s = 1 / unit;
      const wash = new Path2D();
      const threads = new Path2D();
      for (let i = motes.length - 1; i >= 0; i--) {
        const mote = motes[i];
        const [ax, ay] = curl(broad, mote.x * s, mote.y * s, 0.016, time);
        const [bx, by] = curl(eddy, mote.x * s, mote.y * s, 0.05, time);
        mote.vx =
          mote.vx * drag +
          (ax * 1.4 + bx * 0.6) * 0.05 * unit * step +
          0.004 * unit * step +
          leanX * step;
        mote.vy =
          mote.vy * drag +
          (ay * 1.4 + by * 0.6) * 0.05 * unit * step +
          -0.005 * unit * step +
          leanY * 0.4 * step;
        mote.vy -= scroll * 0.012;
        if (hand) {
          const dx = mote.x - hand.x;
          const dy = mote.y - hand.y;
          const d = Math.hypot(dx, dy);
          if (d < reach) {
            const pull = (1 - d / reach) ** 2;
            const speed = Math.min(Math.hypot(hand.vx, hand.vy), 30 * unit);
            mote.vx += (hand.vx * 0.05 + (-dy / (d + 1)) * speed * 0.04) * pull;
            mote.vy += (hand.vy * 0.05 + (dx / (d + 1)) * speed * 0.04) * pull;
          }
        }
        const nx = mote.x + mote.vx * step;
        const ny = mote.y + mote.vy * step;
        const path = mote.thread ? threads : wash;
        path.moveTo(mote.x, mote.y);
        path.lineTo(nx, ny);
        mote.x = nx;
        mote.y = ny;
        mote.age += step;
        const margin = 28 * unit;
        const gone = nx < margin || ny < margin || nx > size2 - margin || ny > size2 - 8 * unit;
        if (gone || mote.age > mote.life) motes.splice(i, 1);
      }
      clearing += step;
      const clear = clearing >= 5;
      if (clear) clearing -= 5;
      const settle = (layer2, rate) => {
        const side = layer2.canvas.width;
        const k = side / size2;
        layer2.globalCompositeOperation = 'destination-out';
        if (clear) {
          layer2.fillStyle = `rgba(0,0,0,${rate * 5})`;
          layer2.fillRect(0, 0, side, side);
        }
        const edges = [
          [0, 0, 0, 40 * unit * k],
          [0, side, 0, side - 12 * unit * k],
          [0, 0, 40 * unit * k, 0],
          [side, 0, side - 40 * unit * k, 0],
        ];
        for (const [x0, y0, x1, y1] of edges) {
          const fade = layer2.createLinearGradient(x0, y0, x1, y1);
          fade.addColorStop(0, `rgba(0,0,0,${Math.min(1, 0.35 * step)})`);
          fade.addColorStop(1, 'rgba(0,0,0,0)');
          layer2.fillStyle = fade;
          layer2.fillRect(0, 0, side, side);
        }
        layer2.globalCompositeOperation = 'source-over';
      };
      settle(washLayer, 0.02);
      settle(threadLayer, 0.03);
      washLayer.save();
      washLayer.scale(0.25, 0.25);
      washLayer.lineCap = 'round';
      washLayer.strokeStyle = dark ? 'rgba(220,218,212,0.06)' : 'rgba(20,20,20,0.055)';
      washLayer.lineWidth = 5 * unit;
      washLayer.stroke(wash);
      washLayer.restore();
      threadLayer.lineCap = 'round';
      threadLayer.strokeStyle = dark ? 'rgba(226,224,218,0.13)' : 'rgba(20,20,20,0.11)';
      threadLayer.lineWidth = 1 * unit;
      threadLayer.stroke(threads);
      ctx.clearRect(0, 0, size2, size2);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(washLayer.canvas, 0, 0, size2, size2);
      ctx.drawImage(threadLayer.canvas, 0, 0);
    },
  };
}
definePortal((size) => water(size, originOf(size)), {
  spread: SPREAD,
  left: LEFT,
  top: TOP,
});
