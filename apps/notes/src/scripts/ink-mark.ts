// The portal as a digital symbiote: a mass of black goo drawn on a coarse
// pixel grid, the same colour as the name under it, with a few cells of hard
// highlight. Lobes churn slowly inside it, and tendrils lash out on their own
// now and then, curl, and pull back. A pointer nearby draws them toward it,
// as does whatever link the portal turns to. Each heartbeat swells it and
// jolts a few rows sideways; a drop falls in now and then; a tap sends a burst
// of tendrils at it; scrolling shoves it and tears rows out of line.
import { definePortal, random, type Frame } from './portal-base';

// The canvas reaches past the mark on every side so the tendrils have room,
// and stops just under the mark, short of the name (16px down).
// All in the mark's widths.
const SPREAD = 1.6;
const LEFT = -0.3;
const TOP = -0.45;
// One cell of the grid, in CSS pixels.
const CELL = 4;
// How far the canvas reaches from the mark's middle, in the mark's widths.
const ROOM = { left: 0.8, right: 0.8, up: 0.95, down: 0.65 };

// A round of goo, in the mark's widths from its middle.
type Lobe = { x: number; y: number; r: number };
type Bead = Lobe & { vy: number };
type Tendril = { angle: number; born: number; life: number; length: number; curl: number };

const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));

const rgb = (color: string, fallback: number[]) => {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return Number.isFinite(b) ? [r, g, b] : fallback;
};

// How far a tendril can reach at an angle and still stay on the canvas.
function room(angle: number) {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const across = x > 0 ? ROOM.right / x : x < 0 ? ROOM.left / -x : Infinity;
  const along = y > 0 ? ROOM.down / y : y < 0 ? ROOM.up / -y : Infinity;
  return Math.min(across, along) - 0.1;
}

function symbiote(size: number, mark: HTMLElement) {
  const next = random(3);
  const width = size / SPREAD;
  // The grid: cells a whole number of canvas pixels wide, so they stay crisp.
  const unit = size / (mark.clientWidth * SPREAD || 1);
  const cell = Math.max(1, Math.round(CELL * unit));
  const n = Math.ceil(size / cell);
  const grid = document.createElement('canvas');
  grid.width = grid.height = n;
  const gridCtx = grid.getContext('2d')!;
  const image = gridCtx.createImageData(n, n);
  const pixels = image.data;
  const field = new Float32Array(n * n);
  // The mark's middle, in cells, and the mark's width in cells.
  const ox = ((0.5 - LEFT) / SPREAD) * n;
  const oy = ((0.5 - TOP) / SPREAD) * n;
  const span = width / cell;
  const turning = Array.from({ length: 6 }, (_, k) => ({
    orbit: 0.15 + next() * 0.08,
    r: 0.08 + next() * 0.045,
    phase: (k / 6) * Math.PI * 2 + next(),
    speed: (0.25 + next() * 0.2) * (k % 2 ? -1 : 1),
  }));
  const tendrils: Tendril[] = [];
  const beads: Bead[] = [];
  // How far each row is torn sideways, in cells, while the signal glitches.
  const shift = new Int8Array(n);
  let nextTendril = 0.4;
  let nextDrop = 2;
  let glitchUntil = -1;
  let lastBeat = -1;
  let sag = 0;
  let sagSpeed = 0;
  let lightX = -0.55;
  let lightY = -0.65;
  let ink = [20, 20, 20];
  let paper = [255, 255, 255];
  let wasDark: boolean | undefined;

  const lash = (time: number, angle: number, quick: boolean) => {
    if (tendrils.length >= 6) return;
    tendrils.push({
      angle,
      born: time,
      life: quick ? 0.9 + next() * 0.5 : 1.4 + next(),
      length: 0.4 + next() * 0.25,
      curl: (next() - 0.5) * 2.4,
    });
  };
  const glitch = (time: number, tears: number, reach: number) => {
    glitchUntil = time + 0.18;
    shift.fill(0);
    for (let k = 0; k < tears; k++) {
      const row = Math.floor(next() * n);
      const by = Math.round((next() - 0.5) * 2 * reach) || 1;
      // a few rows at a time, so each tear has some height
      const rows = 1 + Math.floor(next() * 3);
      for (let j = row; j < Math.min(n, row + rows); j++) shift[j] = by;
    }
  };

  return {
    frame(f: Frame) {
      const { ctx, time, delta, beat, touch, dark } = f;
      const step = Math.min(delta * 60, 3);
      if (dark !== wasDark) {
        ink = rgb(getComputedStyle(mark).color, [20, 20, 20]);
        paper = rgb(
          getComputedStyle(document.body).backgroundColor,
          dark ? [20, 20, 19] : [255, 255, 255],
        );
        wasDark = dark;
      }

      // Where the goo wants to reach: the pointer, else a link it turns to.
      let target: { angle: number; distance: number } | null = null;
      if (f.pointer) {
        const x = (f.pointer.x / cell - ox) / span;
        const y = (f.pointer.y / cell - oy) / span;
        const distance = Math.hypot(x, y);
        if (distance < 1.3) target = { angle: Math.atan2(y, x), distance };
      } else if (touch > 0.3) {
        target = { angle: Math.atan2(-f.y, f.x), distance: 0.7 };
      }

      if (time >= nextTendril) {
        lash(time, target ? target.angle + (next() - 0.5) * 0.7 : next() * Math.PI * 2, !!target);
        nextTendril = time + (target ? 0.18 : 0.5 + next() * 0.7);
      }
      for (const tap of f.taps) {
        const angle = Math.atan2(tap.y / cell - oy, tap.x / cell - ox);
        for (let k = 0; k < 3; k++) lash(time, angle + (k - 1) * 0.5, true);
        glitch(time, 6, 3);
      }
      if (time >= nextDrop) {
        beads.push({ x: (next() - 0.5) * 0.12, y: -0.88, r: 0.06, vy: 0 });
        nextDrop = time + 8 + next() * 6;
      }
      if (beat > 0.8 && time - lastBeat > 0.3) {
        lastBeat = time;
        glitch(time, 2, 1);
      }
      // Now and then the signal tears on its own.
      if (time > glitchUntil + 2 && next() < 0.004 * step) glitch(time, 5, 3);

      // Scrolling shoves the mass, a heavy spring pulls it back, and a hard
      // shove tears rows.
      const shove = clamp(f.scroll / width, -0.3, 0.3);
      sagSpeed += shove * 0.06;
      sagSpeed += -sag * 0.012 * step - sagSpeed * 0.06 * step;
      sag = clamp(sag + sagSpeed * step, -0.12, 0.12);
      if (Math.abs(shove) > 0.05 && time > glitchUntil) glitch(time, 4, 2);

      const swell = 1 + beat * 0.05;
      const leanX = target ? Math.cos(target.angle) * 0.06 : 0;
      const leanY = target ? Math.sin(target.angle) * 0.06 : 0;
      const lobes: Lobe[] = [{ x: 0, y: sag * 0.3, r: 0.16 * swell }];
      for (const [k, lobe] of turning.entries()) {
        const angle = lobe.phase + time * lobe.speed;
        const orbit = lobe.orbit * (1 + 0.3 * Math.sin(time * 0.5 + k));
        lobes.push({
          x: Math.cos(angle) * orbit + leanX,
          y: Math.sin(angle) * orbit + leanY + sag * (0.6 + k * 0.15),
          r: lobe.r * swell,
        });
      }
      for (let i = beads.length - 1; i >= 0; i--) {
        const b = beads[i];
        b.vy += 0.0009 * step;
        b.y += b.vy * step;
        if (b.y > -0.16) {
          sagSpeed += b.vy * 0.4;
          glitch(time, 3, 2);
          beads.splice(i, 1);
        } else lobes.push(b);
      }

      // Each tendril as a chain of tapering capsules along a curling line,
      // shooting out and pulling back over its life.
      const chains: number[][][] = [];
      for (let i = tendrils.length - 1; i >= 0; i--) {
        const t = tendrils[i];
        const age = (time - t.born) / t.life;
        if (age > 1) {
          tendrils.splice(i, 1);
          continue;
        }
        const out = Math.sin(Math.PI * age) ** 0.55;
        let length = t.length;
        if (target) {
          t.angle +=
            Math.atan2(Math.sin(target.angle - t.angle), Math.cos(target.angle - t.angle)) * 0.08;
          length = clamp(target.distance - 0.05, 0.15, 0.75);
        }
        length = Math.min(length, room(t.angle) - 0.1);
        const dx = Math.cos(t.angle);
        const dy = Math.sin(t.angle);
        const chain: number[][] = [];
        let px = 0;
        let py = 0;
        for (let k = 0; k <= 12; k++) {
          const q = k / 12;
          const along = 0.1 + q * length * out;
          const off = t.curl * Math.sin(q * 3.2 + time * 5) * q * 0.11 * out;
          const x = dx * along - dy * off;
          const y = dy * along + dx * off;
          const r = (0.085 * (1 - q) ** 1.2 + 0.014) * (0.45 + 0.55 * out);
          if (k) chain.push([px, py, x, y, r]);
          px = x;
          py = y;
        }
        chains.push(chain);
      }

      // The field, sampled at the middle of each cell; the goo is wherever it
      // adds up to one.
      const balls = lobes.map((l) => [ox + l.x * span, oy + l.y * span, (l.r * span) ** 2]);
      const segments = chains.map((chain) =>
        chain.map(([ax, ay, bx, by, r]) => {
          const vx = (bx - ax) * span;
          const vy = (by - ay) * span;
          return [
            ox + ax * span,
            oy + ay * span,
            vx,
            vy,
            vx * vx + vy * vy || 1e-6,
            (r * span) ** 2,
          ];
        }),
      );
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const X = x + 0.5;
          const Y = y + 0.5;
          let sum = 0;
          for (const [bx, by, rr] of balls) {
            const dx = X - bx;
            const dy = Y - by;
            sum += rr / (dx * dx + dy * dy + 0.01);
          }
          // A tendril counts once, by its nearest capsule, so its joints
          // don't bead.
          for (const chain of segments) {
            let most = 0;
            for (const [ax, ay, vx, vy, vv, rr] of chain) {
              const h = clamp(((X - ax) * vx + (Y - ay) * vy) / vv, 0, 1);
              const dx = X - ax - vx * h;
              const dy = Y - ay - vy * h;
              most = Math.max(most, rr / (dx * dx + dy * dy + 0.01));
            }
            sum += most;
          }
          field[x + y * n] = sum;
        }
      }

      if (time > glitchUntil) shift.fill(0);

      // Shade it in three tones: the ink, a mid tone, and a hard glint where
      // the surface faces the light, which swings round toward the pointer.
      const wantX = target ? clamp(Math.cos(target.angle), -0.9, 0.9) : -0.55;
      const wantY = target ? clamp(Math.sin(target.angle), -0.9, 0.9) : -0.65;
      lightX += (wantX - lightX) * Math.min(1, 0.06 * step);
      lightY += (wantY - lightY) * Math.min(1, 0.06 * step);
      const lz = 0.75;
      const ll = Math.hypot(lightX, lightY, lz);
      // the half-way vector between the light and the eye, which looks straight on
      const hx = lightX / ll;
      const hy = lightY / ll;
      const hz = lz / ll + 1;
      const hl = Math.hypot(hx, hy, hz);
      const height = (v: number) => (v > 1 ? 1 - Math.exp(-(v - 1) * 1.4) : 0);
      const slope = span * 0.28;
      const toward = (amount: number) => ink.map((c, k) => c + (paper[k] - c) * amount);
      const mid = toward(0.35);
      const glint = toward(0.95);
      pixels.fill(0);
      for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
          const at = clamp(x - shift[y], 1, n - 2) + y * n;
          if (field[at] <= 1) continue;
          const nx = -(height(field[at + 1]) - height(field[at - 1])) * slope;
          const ny = -(height(field[at + n]) - height(field[at - n])) * slope;
          const nl = Math.hypot(nx, ny, 1);
          const facing = Math.max(0, (nx * hx + ny * hy + hz) / (nl * hl));
          const gloss = facing ** 70 * 0.95 + facing ** 14 * 0.1;
          const tone = gloss > 0.45 ? glint : gloss > 0.12 ? mid : ink;
          const p = (x + y * n) * 4;
          pixels[p] = tone[0];
          pixels[p + 1] = tone[1];
          pixels[p + 2] = tone[2];
          pixels[p + 3] = 255;
        }
      }
      gridCtx.putImageData(image, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(grid, 0, 0, n * cell, n * cell);
    },
  };
}

definePortal(symbiote, { spread: SPREAD, left: LEFT, top: TOP });
