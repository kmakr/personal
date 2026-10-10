// The portal as ink in water: a drop falls in and unfurls in slow curls, as a
// soft grey wash with fine dark threads running through it. Nothing holds it
// to a round: the ink drifts out past the mark and thins into the paper.
// A fresh drop falls in now and then, each heartbeat sends out a ring of ink,
// a pointer moving nearby stirs it, scrolling sloshes it, a tap drops a bead
// of its own, and the current carries the ink toward whatever the portal turns to.
import { definePortal, noise, random, type Frame } from './portal-base';

// The canvas reaches into the open paper above and beside the mark, so the
// ink has room to wander, and stops just under the mark, so it never runs
// into the name below (16px down). All in the mark's widths.
const SPREAD = 2.8;
const LEFT = -0.3;
const TOP = 1.12 - SPREAD;
const MOST = 2400;

type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  // threads are fine and dark; the rest are the wash around them
  thread: boolean;
};

// The middle of the mark, in canvas pixels.
const originOf = (size: number) => ({
  x: ((0.5 - LEFT) / SPREAD) * size,
  y: ((0.5 - TOP) / SPREAD) * size,
});

function water(size: number, origin: { x: number; y: number }) {
  const next = random(17);
  const broad = noise(3);
  const eddy = noise(8);
  const motes: Mote[] = [];
  // Two layers that each keep their ink between frames: the wash, drawn at a
  // quarter size so scaling it up softens it into clouds, and the threads.
  const layer = (side: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    return canvas.getContext('2d')!;
  };
  const washLayer = layer(Math.round(size / 4));
  const threadLayer = layer(size);
  // Where the ink enters: the middle of the mark.
  const source = origin;
  let seep = 0;
  let clearing = 0;
  let lastBeat = -1;
  // The first drop falls at once; later ones every seven to twelve seconds.
  let nextDrop = 0;

  const add = (mote: Omit<Mote, 'age'>) => {
    if (motes.length < MOST) motes.push({ ...mote, age: 0 });
  };

  // A thin ring of ink moving outward, like a ripple or a pulse.
  const ring = (x: number, y: number, unit: number, count: number, speed: number) => {
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

  // A bead of ink landing: a dense core that plunges, and a ring that spreads.
  const drop = (x: number, y: number, unit: number, weight: number) => {
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

  // The curl of a noise field: flow that swirls without bunching up.
  const curl = (
    field: (x: number, y: number) => number,
    x: number,
    y: number,
    scale: number,
    t: number,
  ) => {
    const e = 0.6;
    // Two octaves at odd angles, so the lattice the noise is built on never
    // shows as straight runs of ink.
    const p = (u: number, v: number) => {
      const a = (u * 0.8 - v * 0.6) * scale + t * 0.05;
      const b = (u * 0.6 + v * 0.8) * scale - t * 0.035;
      const c = (u * 0.28 + v * 0.96) * scale * 2.1 + 31.7;
      const d = (v * 0.28 - u * 0.96) * scale * 2.1 - t * 0.04;
      return (field(a, b) + field(c, d) * 0.45) * 60;
    };
    return [(p(x, y + e) - p(x, y - e)) / (2 * e), -(p(x + e, y) - p(x - e, y)) / (2 * e)];
  };

  return {
    frame(f: Frame) {
      const { ctx, size, unit, time, delta, beat, touch, dark } = f;
      const step = Math.min(delta * 60, 3);

      // New ink: a drop now and then, a steady seep, a ring on each beat, and a
      // bead wherever the portal is tapped.
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
        // a slow current toward the open paper on the right
        mote.vx =
          mote.vx * drag +
          (ax * 1.4 + bx * 0.6) * 0.05 * unit * step +
          0.004 * unit * step +
          leanX * step;
        mote.vy =
          mote.vy * drag +
          (ay * 1.4 + by * 0.6) * 0.05 * unit * step +
          // the ink is a little lighter than the water, so it rises into the open paper
          -0.005 * unit * step +
          leanY * 0.4 * step;
        // Scrolling sloshes the water the other way, as if the bowl had moved.
        mote.vy -= scroll * 0.012;
        // A moving hand drags the water along and sets it turning around itself.
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
        // Ink that reaches the faded margins is gone, so none gathers along them.
        const margin = 28 * unit;
        const gone = nx < margin || ny < margin || nx > size - margin || ny > size - 8 * unit;
        if (gone || mote.age > mote.life) motes.splice(i, 1);
      }

      // Each layer slowly clears, so the ink keeps moving instead of piling
      // up, and thins away toward the far edge so it never meets one.
      // Clearing happens in steps of a tenth: a canvas keeps only 256 levels
      // of ink, and much smaller steps round away, leaving faint ghosts.
      clearing += step;
      const clear = clearing >= 5;
      if (clear) clearing -= 5;
      const settle = (layer: CanvasRenderingContext2D, rate: number) => {
        const side = layer.canvas.width;
        const k = side / size;
        layer.globalCompositeOperation = 'destination-out';
        if (clear) {
          layer.fillStyle = `rgba(0,0,0,${rate * 5})`;
          layer.fillRect(0, 0, side, side);
        }
        // Toward every edge the ink thins to nothing, soonest along the bottom,
        // which sits just under the mark.
        const edges: [number, number, number, number][] = [
          [0, 0, 0, 40 * unit * k],
          [0, side, 0, side - 12 * unit * k],
          [0, 0, 40 * unit * k, 0],
          [side, 0, side - 40 * unit * k, 0],
        ];
        for (const [x0, y0, x1, y1] of edges) {
          const fade = layer.createLinearGradient(x0, y0, x1, y1);
          fade.addColorStop(0, `rgba(0,0,0,${Math.min(1, 0.35 * step)})`);
          fade.addColorStop(1, 'rgba(0,0,0,0)');
          layer.fillStyle = fade;
          layer.fillRect(0, 0, side, side);
        }
        layer.globalCompositeOperation = 'source-over';
      };
      settle(washLayer, 0.02);
      settle(threadLayer, 0.03);

      // the wash: broad and pale, at a quarter size
      washLayer.save();
      washLayer.scale(0.25, 0.25);
      washLayer.lineCap = 'round';
      washLayer.strokeStyle = dark ? 'rgba(220,218,212,0.06)' : 'rgba(20,20,20,0.055)';
      washLayer.lineWidth = 5 * unit;
      washLayer.stroke(wash);
      washLayer.restore();
      // the threads: fine and dark
      threadLayer.lineCap = 'round';
      threadLayer.strokeStyle = dark ? 'rgba(226,224,218,0.13)' : 'rgba(20,20,20,0.11)';
      threadLayer.lineWidth = 1 * unit;
      threadLayer.stroke(threads);

      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(washLayer.canvas, 0, 0, size, size);
      ctx.drawImage(threadLayer.canvas, 0, 0);
    },
  };
}

definePortal((size) => water(size, originOf(size)), {
  spread: SPREAD,
  left: LEFT,
  top: TOP,
});
