import { createGlassShatter } from './glass-shatter';

type Point = [number, number];
type Polygon = Point[];
type Impact = { x: number; y: number; seed: number };

// Convex partitions are both the fracture map and the final pieces. New cracks
// stop at existing boundaries, instead of drawing unrelated lines over a mesh.
function area(p: Polygon) {
  return (
    Math.abs(
      p.reduce((sum, a, i) => {
        const b = p[(i + 1) % p.length];
        return sum + a[0] * b[1] - b[0] * a[1];
      }, 0),
    ) / 2
  );
}
function centre(p: Polygon): Point {
  return [p.reduce((s, v) => s + v[0], 0) / p.length, p.reduce((s, v) => s + v[1], 0) / p.length];
}
function split(p: Polygon, nx: number, ny: number, offset: number): Polygon[] {
  const sides: Polygon[] = [[], []];
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    const da = a[0] * nx + a[1] * ny - offset;
    const db = b[0] * nx + b[1] * ny - offset;
    if (da >= -0.0001) sides[0].push(a);
    if (da <= 0.0001) sides[1].push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      const v: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      sides[0].push(v);
      sides[1].push(v);
    }
  }
  if (sides.some((s) => s.length < 3 || area(s) < 5)) return [p];
  return sides;
}

class GlassIntro extends HTMLElement {
  private cleanup?: () => void;
  connectedCallback() {
    this.cleanup?.();
    const canvas = this.querySelector<HTMLCanvasElement>('.cracks')!;
    const ctx = canvas.getContext('2d');
    const shatterCanvas = this.querySelector<HTMLCanvasElement>('.shatter')!;
    const main = document.querySelector('main');
    if (!ctx || !main) return;
    const counter = this.querySelector('.count')!;
    const strikeButton = this.querySelector<HTMLButtonElement>('.strike')!;
    const skipButton = this.querySelector<HTMLButtonElement>('.skip')!;
    const abort = new AbortController();
    const options = { signal: abort.signal };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const oldOverflow = document.body.style.overflow;
    const oldInert = main.inert;
    const oldFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let width = innerWidth,
      height = innerHeight,
      ratio = 1,
      done = false;
    let timer = 0,
      restored = false,
      lastStrike = -Infinity;
    let mesh: Polygon[] = [];
    const impacts: Impact[] = [];
    let seed = 71;
    let renderer: ReturnType<typeof createGlassShatter> = null;
    let prepareTimer = 0;
    const prepare = () => {
      if (!restored && !renderer && !reduced.matches) renderer = createGlassShatter(shatterCanvas);
    };
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const path = (p: Polygon) => {
      ctx.beginPath();
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    const fracture = (impact: Impact, index: number) => {
      seed = impact.seed;
      const x = impact.x * width,
        y = impact.y * height;
      const reach = index === 0 ? Infinity : Math.max(width, height) * 0.68;
      const phase = random() * Math.PI;
      let budget = 96 - mesh.length;
      const cut = (polygon: Polygon, nx: number, ny: number, offset: number) => {
        if (budget <= 0) return [polygon];
        const result = split(polygon, nx, ny, offset);
        budget -= result.length - 1;
        return result;
      };
      for (let ray = 0; ray < (index === 0 ? 6 : 4); ray++) {
        const angle = phase + ((ray + random() * 0.45) * Math.PI) / (index === 0 ? 6 : 4);
        const nx = Math.cos(angle),
          ny = Math.sin(angle);
        mesh = mesh.flatMap((p) => {
          const c = centre(p);
          if (budget <= 0 || Math.hypot(c[0] - x, c[1] - y) > reach || area(p) < 120) return [p];
          return cut(p, nx, ny, x * nx + y * ny);
        });
      }
      // Small crushed pieces at impact, larger irregular pieces farther away.
      for (const radius of [13, 38, 115, 290]) {
        mesh = mesh.flatMap((p) => {
          const c = centre(p),
            dx = c[0] - x,
            dy = c[1] - y,
            length = Math.hypot(dx, dy);
          if (length < 1 || budget <= 0 || area(p) < 80) return [p];
          const nx = dx / length,
            ny = dy / length;
          const distances = p.map((v) => (v[0] - x) * nx + (v[1] - y) * ny);
          const r = radius * (0.72 + random() * 0.58);
          if (Math.min(...distances) > r || Math.max(...distances) < r) return [p];
          return cut(p, nx, ny, x * nx + y * ny + r);
        });
      }
    };
    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      if (!impacts.length) return;
      seed = 719;
      mesh.forEach((p) => {
        path(p);
        const c = centre(p);
        const sheen = ctx.createLinearGradient(c[0] - 120, c[1] - 80, c[0] + 150, c[1] + 190);
        sheen.addColorStop(0, `rgba(255,255,255,${0.035 + random() * 0.11})`);
        sheen.addColorStop(0.48, 'rgba(255,255,255,0)');
        sheen.addColorStop(1, `rgba(69,109,116,${random() * 0.035})`);
        ctx.fillStyle = sheen;
        ctx.fill();
        ctx.strokeStyle = 'rgba(36,66,72,0.12)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(25,48,56,0.40)';
        ctx.lineWidth = 0.55;
        ctx.stroke();
        ctx.save();
        ctx.translate(-0.65, -0.8);
        path(p);
        ctx.strokeStyle = 'rgba(255,255,255,0.90)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      });
      // Fine splinters and tiny conchoidal chips surround each impact.
      impacts.forEach((impact) => {
        seed = impact.seed;
        const x = impact.x * width,
          y = impact.y * height;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, 23);
        halo.addColorStop(0, 'rgba(245,253,255,.65)');
        halo.addColorStop(0.3, 'rgba(245,253,255,.20)');
        halo.addColorStop(1, 'rgba(245,253,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(x - 23, y - 23, 46, 46);
        for (let i = 0; i < 70; i++) {
          const a = random() * Math.PI * 2,
            r = random() ** 2 * 32,
            len = 2 + random() * 15;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          ctx.lineTo(x + Math.cos(a + 0.04) * (r + len), y + Math.sin(a + 0.04) * (r + len));
          ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,.9)' : 'rgba(30,65,75,.5)';
          ctx.lineWidth = 0.35 + random() * 0.55;
          ctx.stroke();
        }
      });
    };
    const resize = () => {
      if (done) return;
      width = innerWidth;
      height = innerHeight;
      ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      mesh = [
        [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ],
      ];
      impacts.forEach(fracture);
      paint();
    };
    const release = () => {
      if (restored) return;
      restored = true;
      this.hidden = true;
      document.body.style.overflow = oldOverflow;
      main.inert = oldInert;
      clearTimeout(prepareTimer);
      renderer?.dispose();
      renderer = null;
      if (this.contains(document.activeElement)) {
        if (oldFocus && oldFocus !== document.body && oldFocus.isConnected)
          oldFocus.focus({ preventScroll: true });
        else {
          main.setAttribute('tabindex', '-1');
          main.focus({ preventScroll: true });
          main.removeAttribute('tabindex');
        }
      }
    };
    const breakGlass = () => {
      if (reduced.matches) {
        release();
        return;
      }
      prepare();
      if (!renderer) {
        release();
        return;
      }
      // The sheet uses one stationary blur. Falling pieces share one WebGL draw.
      renderer.play(mesh, width, height, impacts[impacts.length - 1], release);
      this.setAttribute('data-breaking', '');
      timer = window.setTimeout(release, 1500);
    };
    const strike = (x: number, y: number) => {
      const now = performance.now();
      if (done || now - lastStrike < 100) return;
      lastStrike = now;
      const impact = {
        x: x / width,
        y: y / height,
        seed: (Math.floor(now) % 100000) + impacts.length * 7919,
      };
      impacts.push(impact);
      fracture(impact, impacts.length - 1);
      paint();
      counter.textContent =
        impacts.length === 1
          ? '2 taps to enter'
          : impacts.length === 2
            ? '1 tap to enter'
            : 'Glass broken';
      if (impacts.length === 3) {
        done = true;
        timer = window.setTimeout(breakGlass, reduced.matches ? 0 : 110);
      }
    };
    const skip = () => {
      done = true;
      clearTimeout(timer);
      release();
    };
    this.addEventListener(
      'click',
      (event: MouseEvent) => {
        const target = event.target as Element;
        if (target.closest('.skip')) {
          skip();
          return;
        }
        if (target.closest('.strike'))
          strike(width * (0.35 + Math.random() * 0.3), height * (0.3 + Math.random() * 0.3));
        else strike(event.clientX, event.clientY);
      },
      options,
    );
    this.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          skip();
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          (document.activeElement === strikeButton ? skipButton : strikeButton).focus();
        }
      },
      options,
    );
    reduced.addEventListener(
      'change',
      () => {
        if (reduced.matches && done) skip();
      },
      options,
    );
    window.addEventListener(
      'resize',
      () => {
        if (done) skip();
        else resize();
      },
      options,
    );
    resize();
    this.removeAttribute('data-breaking');
    this.hidden = false;
    document.body.style.overflow = 'hidden';
    main.inert = true;
    strikeButton.focus({ preventScroll: true });
    prepareTimer = window.setTimeout(prepare, 150);
    this.cleanup = () => {
      abort.abort();
      clearTimeout(timer);
      release();
    };
  }
  disconnectedCallback() {
    this.cleanup?.();
  }
}
if (!customElements.get('glass-intro')) customElements.define('glass-intro', GlassIntro);
