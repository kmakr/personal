// The portal as one solid mass of ink: flat, matte, the same black as the
// name under it, with no wash or smoke. A few lobes turn slowly inside it so
// its outline never quite settles. Now and then a drop falls in and the mass
// shudders; each heartbeat swells it; the current leans it toward whatever
// the portal turns to; a pointer nearby draws a bead out of it, a tap flicks
// one off, and scrolling sets it wobbling like something heavy and wet.
import { definePortal, random, type Frame } from './portal-base';

// The canvas reaches a little past the mark on every side so the ink can lean
// and drip, and stops just under the mark, short of the name (16px down).
// All in the mark's widths.
const SPREAD = 1.6;
const LEFT = -0.3;
const TOP = -0.45;

// A round of ink in the field, in the mark's widths from its middle.
type Lobe = { x: number; y: number; r: number };
// Ink away from the mass: a falling drop, a flicked bead. It springs home.
type Bead = Lobe & { vx: number; vy: number; age: number; falling: boolean };

const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));

// The colour the name is set in, so the mark and the wordmark are one ink.
function inkOf(mark: HTMLElement) {
  const [r, g, b] = (getComputedStyle(mark).color.match(/[\d.]+/g) ?? []).map(Number);
  return Number.isFinite(b) ? [r, g, b] : [17, 17, 17];
}

function mass(size: number, mark: HTMLElement) {
  const next = random(23);
  // Canvas pixels per mark width, and the middle of the mark.
  const width = size / SPREAD;
  const ox = ((0.5 - LEFT) / SPREAD) * size;
  const oy = ((0.5 - TOP) / SPREAD) * size;
  const image = new ImageData(size, size);
  const pixels = image.data;
  // The lobes that turn inside the mass, each on its own slow loop.
  const turning = Array.from({ length: 6 }, (_, k) => ({
    orbit: 0.17 + next() * 0.09,
    r: 0.085 + next() * 0.05,
    phase: (k / 6) * Math.PI * 2 + next(),
    speed: (0.12 + next() * 0.1) * (k % 2 ? -1 : 1),
    wobble: 0.6 + next() * 0.8,
  }));
  const beads: Bead[] = [];
  let reach = 0;
  let reachX = 0;
  let reachY = 0;
  // How far the mass hangs below where it should sit, and how fast it moves.
  let sag = 0;
  let sagSpeed = 0;
  let shudder = 0;
  // The first drop falls soon after the page opens; later ones every eight to
  // fourteen seconds.
  let nextDrop = 1.2;
  let ink = inkOf(mark);
  let wasDark: boolean | undefined;

  const bead = (x: number, y: number, r: number, falling: boolean) =>
    beads.push({ x, y, r, vx: 0, vy: 0, age: 0, falling });

  return {
    frame(f: Frame) {
      const { ctx, time, delta, beat, touch, dark } = f;
      const step = Math.min(delta * 60, 3);
      if (dark !== wasDark) {
        ink = inkOf(mark);
        wasDark = dark;
      }

      if (time >= nextDrop) {
        bead((next() - 0.5) * 0.12, -0.88, 0.055, true);
        nextDrop = time + 8 + next() * 6;
      }
      for (const tap of f.taps) {
        const x = (tap.x - ox) / width;
        const y = (tap.y - oy) / width;
        const d = Math.hypot(x, y) || 1;
        // A tap flicks a bead off the mass, away from where it landed.
        bead((x / d) * 0.2, (y / d) * 0.2, 0.07, false);
        const flicked = beads[beads.length - 1];
        flicked.vx = (x / d) * 0.03;
        flicked.vy = (y / d) * 0.03;
        shudder = Math.min(1, shudder + 0.5);
      }

      // Scrolling shoves the mass; a heavy spring pulls it back.
      sagSpeed += clamp(f.scroll / width, -0.3, 0.3) * 0.06;
      sagSpeed += -sag * 0.012 * step - sagSpeed * 0.06 * step;
      sag = clamp(sag + sagSpeed * step, -0.12, 0.12);
      shudder *= Math.pow(0.97, step);

      // Leaning toward whatever the portal turns to.
      const leanX = f.x * touch * 0.1;
      const leanY = -f.y * touch * 0.1;
      const swell = 1 + beat * 0.045;
      const lobes: Lobe[] = [{ x: leanX * 0.4, y: leanY * 0.4 + sag * 0.3, r: 0.17 * swell }];
      for (const [k, lobe] of turning.entries()) {
        const angle = lobe.phase + time * lobe.speed;
        const shake = 1 + shudder * 0.6 * Math.sin(time * 9 + k * 2.1);
        const orbit = lobe.orbit * (1 + 0.3 * Math.sin(time * 0.3 * lobe.wobble + k)) * shake;
        lobes.push({
          x: Math.cos(angle) * orbit + leanX * (1 + k * 0.15),
          y: Math.sin(angle) * orbit + leanY * (1 + k * 0.15) + sag * (0.6 + k * 0.15),
          r: lobe.r * swell,
        });
      }

      // A pointer nearby draws a bead of ink out toward itself.
      let wantReach = 0;
      if (f.pointer) {
        const x = (f.pointer.x - ox) / width;
        const y = (f.pointer.y - oy) / width;
        const d = Math.hypot(x, y);
        if (d < 0.9 && d > 0.05) {
          wantReach = 1 - d / 0.9;
          const out = Math.min(d, 0.34);
          reachX = (x / d) * out;
          reachY = (y / d) * out;
        }
      }
      reach += (wantReach - reach) * (1 - Math.pow(0.9, step));
      if (reach > 0.01) lobes.push({ x: reachX * reach, y: reachY * reach, r: 0.08 * reach });

      // Beads fall or spring home, and melt into the mass once they arrive.
      for (let i = beads.length - 1; i >= 0; i--) {
        const b = beads[i];
        b.age += step;
        if (b.falling) {
          b.vy += 0.0009 * step;
        } else {
          b.vx += -b.x * 0.004 * step;
          b.vy += -b.y * 0.004 * step;
          b.vx *= Math.pow(0.93, step);
          b.vy *= Math.pow(0.93, step);
        }
        b.x += b.vx * step;
        b.y += b.vy * step;
        const home = Math.hypot(b.x, b.y);
        if (home < 0.16) {
          if (b.falling) {
            shudder = Math.min(1, shudder + 0.8);
            sagSpeed += b.vy * 0.4;
          }
          beads.splice(i, 1);
          continue;
        }
        if (b.age > 600) beads.splice(i, 1);
        else lobes.push(b);
      }

      // The ink is wherever the lobes' pull adds up to one, with an edge a
      // pixel and a bit wide, so it reads as cut cleanly from the paper.
      let left = size;
      let top = size;
      let right = 0;
      let bottom = 0;
      const fields = lobes.map((lobe) => {
        const x = ox + lobe.x * width;
        const y = oy + lobe.y * width;
        const r = lobe.r * width;
        // A lobe's pull falls below a tenth of the threshold beyond three radii.
        left = Math.min(left, x - r * 3);
        top = Math.min(top, y - r * 3);
        right = Math.max(right, x + r * 3);
        bottom = Math.max(bottom, y + r * 3);
        return { x, y, rr: r * r };
      });
      const x0 = clamp(Math.floor(left), 0, size);
      const y0 = clamp(Math.floor(top), 0, size);
      const x1 = clamp(Math.ceil(right), 0, size);
      const y1 = clamp(Math.ceil(bottom), 0, size);
      // How far the field climbs per pixel at the edge of a middling lobe.
      const sharp = width * 0.12;
      const [red, green, blue] = ink;
      pixels.fill(0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          let field = 0;
          for (const lobe of fields) {
            const dx = x + 0.5 - lobe.x;
            const dy = y + 0.5 - lobe.y;
            field += lobe.rr / (dx * dx + dy * dy + 0.01);
          }
          const alpha = clamp(0.5 + (field - 1) * sharp, 0, 1);
          if (alpha === 0) continue;
          const at = (x + y * size) * 4;
          pixels[at] = red;
          pixels[at + 1] = green;
          pixels[at + 2] = blue;
          pixels[at + 3] = alpha * 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    },
  };
}

definePortal(mass, { spread: SPREAD, left: LEFT, top: TOP });
