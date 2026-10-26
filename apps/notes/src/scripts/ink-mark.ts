// The portal as a digital symbiote: a mass of black goo drawn on a coarse
// pixel grid, the same colour as the name under it, with a few cells of hard
// highlight. Lobes churn slowly inside it, and tendrils lash out on their own
// now and then, curl, and pull back. A pointer nearby draws them toward it,
// as does whatever link the portal turns to. Each heartbeat swells it and
// jolts a few rows sideways; a tap sends a burst of tendrils at it; scrolling
// shoves it and tears rows out of line.
//
// It also wanders, like something that has got loose: it crawls after the
// pointer anywhere on the page, throwing legs ahead that grip the paper and
// dragging itself along them, and dark veins creep out across the paper
// behind it and fade. When the pointer leaves the window it crawls back home,
// where its legs twitch and veins still spread from it now and then.
import { definePortal, random, type Frame } from './portal-base';

// One cell of the grid, in CSS pixels.
const CELL = 4;
// How the slug crawls, in the mark's widths: its top speed, how far short of
// the pointer it stops so its tendrils can reach the rest, and how far apart
// the rounds of its trailing body sit.
const CRAWL = 0.6;
const SHORT = 0.35;
const SPACING = 0.12;
// The trailing body, head to tail, as radii of its rounds.
const BODY = [0.17, 0.16, 0.14, 0.11, 0.09];
// The legs it grips the paper with: how many, and how far a foot may trail
// before it lets go and grabs again further on, in the mark's widths.
const LEGS = 6;
const REACH = 0.6;
// The veins it leaves: how many at most, and each step of one, in the mark's widths.
const VEINS = 40;
const VEIN_STEP = 0.11;

// A round of goo, in the mark's widths from its middle.
type Lobe = { x: number; y: number; r: number };
type Tendril = { angle: number; born: number; life: number; length: number; curl: number };
// A foot, where it grips now and, while it is in the air, where it let go and
// where it will land; all in the mark's widths from the mark's middle.
type Leg = {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  lift: number;
};
// A vein: a wandering line on the paper, in the mark's widths from the
// mark's middle.
type Vein = { points: number[][]; born: number; life: number };

const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));

const rgb = (color: string, fallback: number[]) => {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return Number.isFinite(b) ? [r, g, b] : fallback;
};

// Moves a point toward another by at most a step.
function creep(point: { x: number; y: number }, x: number, y: number, step: number) {
  const dx = x - point.x;
  const dy = y - point.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= step) {
    point.x = x;
    point.y = y;
  } else {
    point.x += (dx / distance) * step;
    point.y += (dy / distance) * step;
  }
}

function symbiote(canvas: HTMLCanvasElement, mark: HTMLElement) {
  const next = random(3);
  // The grid: cells a whole number of canvas pixels wide, so they stay crisp.
  const unit = canvas.width / (canvas.clientWidth || 1);
  const width = mark.clientWidth * unit;
  const cell = Math.max(1, Math.round(CELL * unit));
  const nx = Math.ceil(canvas.width / cell);
  const ny = Math.ceil(canvas.height / cell);
  const grid = document.createElement('canvas');
  grid.width = nx;
  grid.height = ny;
  const gridCtx = grid.getContext('2d')!;
  const image = gridCtx.createImageData(nx, ny);
  const pixels = image.data;
  const field = new Float32Array(nx * ny);
  // The mark's width in cells.
  const span = width / cell;
  // The slug's head and the rounds of body trailing it, in the mark's widths
  // from the mark's middle, so they ride along when the page scrolls.
  const body = BODY.map(() => ({ x: 0, y: 0 }));
  const head = body[0];
  const legs: Leg[] = Array.from({ length: LEGS }, (_, k) => {
    const angle = (k / LEGS) * Math.PI * 2;
    const x = Math.cos(angle) * 0.35;
    const y = Math.sin(angle) * 0.35;
    return { x, y, fromX: x, fromY: y, toX: x, toY: y, lift: 1 };
  });
  const veins: Vein[] = [];
  let heading = 0;
  let moving = 0;
  let lastVein = { x: 0, y: 0 };
  const turning = Array.from({ length: 6 }, (_, k) => ({
    orbit: 0.15 + next() * 0.08,
    r: 0.08 + next() * 0.045,
    phase: (k / 6) * Math.PI * 2 + next(),
    speed: (0.25 + next() * 0.2) * (k % 2 ? -1 : 1),
  }));
  const tendrils: Tendril[] = [];
  // How far each row is torn sideways, in cells, while the signal glitches.
  const shift = new Int8Array(ny);
  let nextTendril = 0.4;
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
  // A vein wanders out from a point, now and then forking.
  const spread = (time: number, x: number, y: number, angle: number, steps: number) => {
    if (veins.length >= VEINS) return;
    const points = [[x, y]];
    let a = angle;
    for (let k = 0; k < steps; k++) {
      a += (next() - 0.5) * 1.1;
      x += Math.cos(a) * VEIN_STEP;
      y += Math.sin(a) * VEIN_STEP;
      points.push([x, y]);
      if (k > 1 && k < steps - 2 && next() < 0.18 && veins.length < VEINS - 1) {
        veins.push({
          points: [[x, y]],
          born: time + k * 0.12,
          life: 5 + next() * 3,
        });
        let bx = x;
        let by = y;
        let b = a + (next() < 0.5 ? 1 : -1) * (0.6 + next() * 0.5);
        for (let j = 0; j < steps - k - 1; j++) {
          b += (next() - 0.5) * 1.1;
          bx += Math.cos(b) * VEIN_STEP * 0.8;
          by += Math.sin(b) * VEIN_STEP * 0.8;
          veins[veins.length - 1].points.push([bx, by]);
        }
      }
    }
    veins.push({ points, born: time, life: 6 + next() * 3 });
  };
  const glitch = (time: number, tears: number, reach: number) => {
    glitchUntil = time + 0.18;
    shift.fill(0);
    for (let k = 0; k < tears; k++) {
      const row = Math.floor(next() * ny);
      const by = Math.round((next() - 0.5) * 2 * reach) || 1;
      // a few rows at a time, so each tear has some height
      const rows = 1 + Math.floor(next() * 3);
      for (let j = row; j < Math.min(ny, row + rows); j++) shift[j] = by;
    }
  };

  return {
    frame(f: Frame) {
      const { ctx, time, delta, beat, touch, dark } = f;
      const step = Math.min(delta * 60, 3);
      // The mark's middle, in cells.
      const ox = f.origin.x / cell;
      const oy = f.origin.y / cell;
      if (dark !== wasDark) {
        ink = rgb(getComputedStyle(mark).color, [20, 20, 20]);
        paper = rgb(
          getComputedStyle(document.body).backgroundColor,
          dark ? [20, 20, 19] : [255, 255, 255],
        );
        wasDark = dark;
      }

      // The head inches after the pointer in pulses, stopping a little short,
      // or crawls home; each round of body follows the one before it and,
      // left alone, slowly gathers back into it.
      const pointer = f.pointer && {
        x: (f.pointer.x / cell - ox) / span,
        y: (f.pointer.y / cell - oy) / span,
      };
      let goalX = 0;
      let goalY = 0;
      if (pointer) {
        const distance = Math.hypot(pointer.x - head.x, pointer.y - head.y);
        const stop = Math.max(0, distance - SHORT) / (distance || 1);
        goalX = head.x + (pointer.x - head.x) * stop;
        goalY = head.y + (pointer.y - head.y) * stop;
      }
      const inch = 0.25 + 0.75 * Math.max(0, Math.sin(time * 3.2)) ** 2;
      const wasX = head.x;
      const wasY = head.y;
      creep(head, goalX, goalY, CRAWL * inch * delta);
      const moved = Math.hypot(head.x - wasX, head.y - wasY);
      if (moved > 1e-5) heading = Math.atan2(head.y - wasY, head.x - wasX);
      moving += ((moved > 1e-5 ? 1 : 0) - moving) * Math.min(1, delta * 3);
      for (let k = 1; k < body.length; k++) {
        const ahead = body[k - 1];
        const round = body[k];
        const gap = Math.hypot(ahead.x - round.x, ahead.y - round.y);
        if (gap > SPACING) creep(round, ahead.x, ahead.y, gap - SPACING);
        creep(round, ahead.x, ahead.y, 0.06 * delta);
      }
      // Everything below is drawn around the head.
      const hx = ox + head.x * span;
      const hy = oy + head.y * span;

      // A foot that trails too far lets go and snaps forward to grab the
      // paper ahead; at rest the feet shift about it now and then.
      for (const [k, leg] of legs.entries()) {
        const far = Math.hypot(leg.x - head.x, leg.y - head.y) > REACH;
        if (leg.lift >= 1 && (far || (moving < 0.3 && next() < 0.003 * step))) {
          const ahead = moving > 0.3;
          const angle = ahead
            ? heading + (k - (LEGS - 1) / 2) * 0.42 + (next() - 0.5) * 0.4
            : (k / LEGS) * Math.PI * 2 + time * 0.2 + (next() - 0.5) * 0.6;
          const reach = ahead ? 0.45 + next() * 0.2 : 0.3 + next() * 0.15;
          leg.fromX = leg.x;
          leg.fromY = leg.y;
          leg.toX = head.x + Math.cos(angle) * reach;
          leg.toY = head.y + Math.sin(angle) * reach;
          leg.lift = 0;
        }
        if (leg.lift < 1) {
          leg.lift = Math.min(1, leg.lift + delta * 3.5);
          const e = 1 - (1 - leg.lift) ** 3;
          leg.x = leg.fromX + (leg.toX - leg.fromX) * e;
          leg.y = leg.fromY + (leg.toY - leg.fromY) * e;
        }
      }

      // Veins creep out behind it as it goes, and from it now and then at rest.
      const tail = body[body.length - 1];
      if (Math.hypot(head.x - lastVein.x, head.y - lastVein.y) > 0.18) {
        lastVein = { x: head.x, y: head.y };
        for (let k = 0; k < 2; k++) {
          spread(time, tail.x, tail.y, heading + Math.PI + (next() - 0.5) * 2.6, 8);
        }
      } else if (moving < 0.3 && next() < 0.008 * step) {
        spread(time, head.x, head.y, next() * Math.PI * 2, 6);
      }

      // Where the goo wants to reach: the pointer, else a link it turns to.
      let target: { angle: number; distance: number } | null = null;
      if (pointer) {
        const x = pointer.x - head.x;
        const y = pointer.y - head.y;
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
        const angle = Math.atan2(tap.y / cell - hy, tap.x / cell - hx);
        for (let k = 0; k < 3; k++) lash(time, angle + (k - 1) * 0.5, true);
        for (let k = 0; k < 3; k++) spread(time, head.x, head.y, angle + (k - 1) * 2.1, 7);
        glitch(time, 6, 3);
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
      // The trailing body shows only as it stretches out, so at rest it adds
      // nothing to the mass.
      for (let k = 1; k < body.length; k++) {
        const ahead = body[k - 1];
        const round = body[k];
        const stretch = clamp(Math.hypot(ahead.x - round.x, ahead.y - round.y) / SPACING, 0, 1);
        if (stretch > 0.05) {
          lobes.push({
            x: round.x - head.x + Math.sin(time * 2 + k) * 0.012,
            y: round.y - head.y + sag * 0.4,
            r: BODY[k] * stretch * (1 + 0.05 * Math.sin(time * 3.2 - k * 0.6)),
          });
        }
      }
      for (const [k, lobe] of turning.entries()) {
        const angle = lobe.phase + time * lobe.speed;
        const orbit = lobe.orbit * (1 + 0.3 * Math.sin(time * 0.5 + k));
        lobes.push({
          x: Math.cos(angle) * orbit + leanX,
          y: Math.sin(angle) * orbit + leanY + sag * (0.6 + k * 0.15),
          r: lobe.r * swell,
        });
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

      // Each leg as a thick, bending line out to its foot, which swells
      // where it grips.
      for (const [k, leg] of legs.entries()) {
        const dx = leg.x - head.x;
        const dy = leg.y - head.y;
        const length = Math.hypot(dx, dy) || 1;
        const bend =
          Math.sin(time * 2.5 + k) * 0.04 +
          (leg.lift < 1 ? Math.sin(leg.lift * Math.PI) * 0.12 : 0);
        const chain: number[][] = [];
        let px = 0;
        let py = 0;
        for (let j = 1; j <= 8; j++) {
          const q = j / 8;
          const off = Math.sin(q * Math.PI) * bend;
          const x = dx * q - (dy / length) * off;
          const y = dy * q + (dx / length) * off;
          chain.push([px, py, x, y, 0.09 - 0.065 * q]);
          px = x;
          py = y;
        }
        chains.push(chain);
        lobes.push({ x: dx, y: dy, r: leg.lift < 1 ? 0.025 : 0.055 });
      }

      // Each vein draws itself out over a second, then thins away.
      for (let i = veins.length - 1; i >= 0; i--) {
        const v = veins[i];
        const age = time - v.born;
        if (age > v.life) {
          veins.splice(i, 1);
          continue;
        }
        if (age < 0) continue;
        const shown = Math.max(2, Math.ceil(v.points.length * Math.min(1, age / 1.2)));
        const fade = 1 - Math.max(0, (age - v.life * 0.6) / (v.life * 0.4));
        const chain: number[][] = [];
        for (let j = 1; j < shown; j++) {
          const q = j / (v.points.length - 1);
          const [ax, ay] = v.points[j - 1];
          const [bx, by] = v.points[j];
          chain.push([
            ax - head.x,
            ay - head.y,
            bx - head.x,
            by - head.y,
            (0.045 - 0.025 * q) * fade,
          ]);
        }
        if (chain.length) chains.push(chain);
      }

      // The field, sampled at the middle of each cell; the goo is wherever it
      // adds up to one.
      // Only the cells around the goo are worked out; the rest of the page is
      // empty paper.
      const balls = lobes.map((l) => [hx + l.x * span, hy + l.y * span, (l.r * span) ** 2]);
      const segments = chains.map((chain) =>
        chain.map(([ax, ay, bx, by, r]) => {
          const vx = (bx - ax) * span;
          const vy = (by - ay) * span;
          return [
            hx + ax * span,
            hy + ay * span,
            vx,
            vy,
            vx * vx + vy * vy || 1e-6,
            (r * span) ** 2,
          ];
        }),
      );
      // Where each line can reach, so cells far from it skip it.
      const bounds = segments.map((chain) => {
        let reach = 0;
        let low = [Infinity, Infinity];
        let high = [-Infinity, -Infinity];
        for (const [ax, ay, vx, vy, , rr] of chain) {
          reach = Math.max(reach, Math.sqrt(rr) * 3 + 1);
          low = [Math.min(low[0], ax, ax + vx), Math.min(low[1], ay, ay + vy)];
          high = [Math.max(high[0], ax, ax + vx), Math.max(high[1], ay, ay + vy)];
        }
        return [low[0] - reach, high[0] + reach, low[1] - reach, high[1] + reach];
      });
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      const cover = (x: number, y: number) => {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      };
      for (const [bx, by] of balls) cover(bx, by);
      for (const chain of segments) for (const [ax, ay, vx, vy] of chain) cover(ax + vx, ay + vy);
      // Room for the edge of the mass, and for rows torn sideways.
      const margin = span * 0.45 + 4;
      const x0 = Math.max(1, Math.floor(left - margin));
      const x1 = Math.min(nx - 1, Math.ceil(right + margin));
      const y0 = Math.max(1, Math.floor(top - margin));
      const y1 = Math.min(ny - 1, Math.ceil(bottom + margin));
      field.fill(0);
      for (let y = y0 - 1; y <= y1; y++) {
        for (let x = x0 - 1; x <= x1; x++) {
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
          for (const [k, chain] of segments.entries()) {
            const [l, r, t, b] = bounds[k];
            if (X < l || X > r || Y < t || Y > b) continue;
            let most = 0;
            for (const [ax, ay, vx, vy, vv, rr] of chain) {
              const h = clamp(((X - ax) * vx + (Y - ay) * vy) / vv, 0, 1);
              const dx = X - ax - vx * h;
              const dy = Y - ay - vy * h;
              most = Math.max(most, rr / (dx * dx + dy * dy + 0.01));
            }
            sum += most;
          }
          field[x + y * nx] = sum;
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
      const wx = lightX / ll;
      const wy = lightY / ll;
      const wz = lz / ll + 1;
      const hl = Math.hypot(wx, wy, wz);
      const height = (v: number) => (v > 1 ? 1 - Math.exp(-(v - 1) * 1.4) : 0);
      const slope = span * 0.28;
      const toward = (amount: number) => ink.map((c, k) => c + (paper[k] - c) * amount);
      const mid = toward(0.35);
      const glint = toward(0.95);
      pixels.fill(0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = clamp(x - shift[y], x0, x1 - 1) + y * nx;
          if (field[at] <= 1) continue;
          const sx = -(height(field[at + 1]) - height(field[at - 1])) * slope;
          const sy = -(height(field[at + nx]) - height(field[at - nx])) * slope;
          const sl = Math.hypot(sx, sy, 1);
          const facing = Math.max(0, (sx * wx + sy * wy + wz) / (sl * hl));
          const gloss = facing ** 70 * 0.95 + facing ** 14 * 0.1;
          const tone = gloss > 0.45 ? glint : gloss > 0.12 ? mid : ink;
          const p = (x + y * nx) * 4;
          pixels[p] = tone[0];
          pixels[p + 1] = tone[1];
          pixels[p + 2] = tone[2];
          pixels[p + 3] = 255;
        }
      }
      gridCtx.putImageData(image, 0, 0);
      ctx.clearRect(0, 0, f.width, f.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(grid, 0, 0, nx * cell, ny * cell);
    },
  };
}

definePortal(symbiote, { page: true });
