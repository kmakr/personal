// Ink mark from the live theoazriel.com homepage. Copied on 2026-09-22.
var e = class extends HTMLElement {
  cleanup;
  connectedCallback() {
    this.cleanup?.();
    let e = this.querySelector(`canvas`),
      t = this.querySelector(`img`);
    if (!e || !t) return;
    let n = matchMedia(`(prefers-reduced-motion: reduce)`),
      r = matchMedia(`(hover: hover) and (pointer: fine)`),
      i,
      a = () => {
        if (
          (i?.(),
          (i = void 0),
          this.removeAttribute(`data-rendered`),
          (this.dataset.inkState = n.matches ? `reduced-motion` : `static`),
          n.matches)
        )
          return;
        let a = e.getContext(`webgl`, {
          alpha: !0,
          antialias: !1,
          depth: !1,
          premultipliedAlpha: !1,
        });
        if (!a) return;
        let o = a.createProgram(),
          s = a.createBuffer(),
          c = a.createTexture(),
          l = [],
          u = new AbortController(),
          d,
          f,
          p = 0,
          m = !1,
          h = () => {
            m ||
              ((m = !0),
              cancelAnimationFrame(p),
              u.abort(),
              d?.disconnect(),
              f?.disconnect(),
              l.forEach((e) => a.deleteShader(e)),
              a.deleteTexture(c),
              a.deleteBuffer(s),
              a.deleteProgram(o),
              this.removeAttribute(`data-rendered`),
              (this.dataset.inkState = `static`));
          };
        i = h;
        try {
          if (!o || !s || !c) throw Error(`WebGL allocation failed`);
          let n = (e, t) => {
            let n = a.createShader(e);
            if (!n) throw Error(`WebGL shader unavailable`);
            if (
              (l.push(n),
              a.shaderSource(n, t),
              a.compileShader(n),
              !a.getShaderParameter(n, a.COMPILE_STATUS))
            )
              throw Error(`Ink shader compilation failed`);
            a.attachShader(o, n);
          };
          if (
            (n(
              a.VERTEX_SHADER,
              `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`,
            ),
            n(
              a.FRAGMENT_SHADER,
              `
  precision highp float;
  varying vec2 uv;
  uniform sampler2D ink;
  uniform float time;
  uniform vec2 pointer;
  uniform float touch;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x),
      f.y
    );
  }

  float pigment(vec2 p) {
    float value = 0.0;
    float weight = 0.5;
    mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      value += noise(p) * weight;
      p = turn * p * 2.03 + 7.1;
      weight *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 p = uv * 2.0 - 1.0;
    p -= pointer * touch * 0.12;
    float t = time * 0.42;
    vec2 drift = vec2(t * 0.36, -t * 0.28);
    vec2 flow = vec2(
      pigment(p * 3.1 + drift),
      pigment(p * 3.1 - drift + 13.7)
    ) - 0.47;
    vec2 q = p + flow * (0.26 + touch * 0.16);
    float angle = atan(q.y, q.x);
    float pulse = sin(angle * 3.0 + t * 1.5) * 0.026;
    pulse += sin(angle * 5.0 - t * 1.2) * 0.018;
    float radius = length(q) + pulse;

    // The outside remains soft and fibrous, like wet ink on paper.
    float fibers = pigment(q * 11.0 + flow * 4.0 - drift * 1.7);
    float contour = radius + (fibers - 0.5) * 0.11;
    float core = 1.0 - smoothstep(0.66, 0.73, contour);
    float wash = 1.0 - smoothstep(0.69, 0.93, contour);
    wash *= 0.3 + pigment(q * 6.0 + drift) * 0.65;

    // Small dark eddies detach and rejoin the wash near the rim.
    float specks = 1.0 - smoothstep(0.022, 0.06, length(q - vec2(
      cos(t * 0.85 + 1.0), sin(t * 0.85 + 1.0)
    ) * (0.75 + 0.04 * sin(t * 2.1))));
    specks += 1.0 - smoothstep(0.014, 0.04, length(q - vec2(
      cos(-t * 0.65 + 3.6), sin(-t * 0.65 + 3.6)
    ) * 0.79));

    // A broken silver lip defines the opening; the folds flow into its centre.
    float aperture = 0.605 + 0.018 * sin(angle * 2.0 - t);
    float rim = exp(-pow((radius - aperture) / 0.027, 2.0));
    rim *= 0.58 + 0.42 * sin(angle * 2.0 + t * 1.4) * sin(angle * 2.0 + t * 1.4);
    float rimEcho = exp(-pow((radius - aperture - 0.057) / 0.012, 2.0));
    rimEcho *= 0.5 + 0.5 * sin(angle * 3.0 - t * 1.1);

    float tunnel = log(max(radius, 0.025)) * 14.0 + angle * 2.0 + t * 3.0;
    tunnel += pigment(q * 5.0 + drift) * 1.8;
    float folds = pow(0.5 + 0.5 * sin(tunnel), 14.0);
    float depth = smoothstep(0.10, 0.58, radius);
    float interior = 1.0 - smoothstep(0.53, 0.61, radius);
    folds *= depth * interior;
    float filaments = pow(0.5 + 0.5 * sin(angle * 9.0 - radius * 18.0 + t * 1.8), 8.0);
    filaments *= depth * interior * 0.055;

    // A faint remnant of the original brush stroke catches light on the rim.
    float twist = sin(t * 0.8) * 0.1 + touch * 0.15;
    mat2 rotate = mat2(cos(twist), -sin(twist), sin(twist), cos(twist));
    vec4 stamp = texture2D(ink, rotate * q / 0.86 * 0.5 + 0.5);
    float highlight = smoothstep(0.3, 0.8, stamp.r) * stamp.a * core;
    float light = 0.012 + depth * 0.045 + folds * 0.46 + filaments;
    light += rim * 0.78 + rimEcho * 0.29 + highlight * 0.16;
    vec3 color = mix(vec3(0.10), vec3(light), 1.0 - smoothstep(0.68, 0.75, radius));
    float alpha = max(core, max(wash * 0.64, specks * 0.68));
    vec2 frame = abs(uv * 2.0 - 1.0);
    alpha *= 1.0 - smoothstep(0.94, 1.0, max(frame.x, frame.y));
    gl_FragColor = vec4(color, alpha);
  }
`,
            ),
            a.linkProgram(o),
            !a.getProgramParameter(o, a.LINK_STATUS))
          )
            throw Error(`Ink shader linking failed`);
          (a.useProgram(o),
            a.bindBuffer(a.ARRAY_BUFFER, s),
            a.bufferData(a.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), a.STATIC_DRAW));
          let i = a.getAttribLocation(o, `position`);
          (a.enableVertexAttribArray(i),
            a.vertexAttribPointer(i, 2, a.FLOAT, !1, 0, 0),
            a.bindTexture(a.TEXTURE_2D, c),
            a.texParameteri(a.TEXTURE_2D, a.TEXTURE_MIN_FILTER, a.LINEAR),
            a.texParameteri(a.TEXTURE_2D, a.TEXTURE_MAG_FILTER, a.LINEAR),
            a.texParameteri(a.TEXTURE_2D, a.TEXTURE_WRAP_S, a.CLAMP_TO_EDGE),
            a.texParameteri(a.TEXTURE_2D, a.TEXTURE_WRAP_T, a.CLAMP_TO_EDGE),
            a.pixelStorei(a.UNPACK_FLIP_Y_WEBGL, !0),
            a.uniform1i(a.getUniformLocation(o, `ink`), 0));
          let g = a.getUniformLocation(o, `time`),
            _ = a.getUniformLocation(o, `pointer`),
            v = a.getUniformLocation(o, `touch`),
            y = !1,
            b = !1,
            x = !1,
            S = 0,
            C = 0,
            w = 0,
            T = 0,
            E = 0,
            D = 0,
            O = 0,
            k = 0,
            A = () => {
              (a.viewport(0, 0, e.width, e.height),
                a.uniform1f(g, C),
                a.uniform2f(_, w, T),
                a.uniform1f(v, O),
                a.drawArrays(a.TRIANGLES, 0, 3),
                this.hasAttribute(`data-rendered`) || this.setAttribute(`data-rendered`, ``));
            },
            j = (e) => {
              p = requestAnimationFrame(j);
              let t = k || O > 0.01 ? 1e3 / 60 : 1e3 / 30;
              if (S && e - S < t - 1) return;
              let n = S ? Math.min((e - S) / 1e3, 0.06) : 0;
              ((S = e), (C += n));
              let r = 1 - Math.exp(-n * 7);
              ((w += (E - w) * r), (T += (D - T) * r), (O += (k - O) * r), A());
            },
            M = () => {
              if ((cancelAnimationFrame(p), (S = 0), !m && y)) {
                if (!b || document.hidden || x) {
                  ((k = 0), (this.dataset.inkState = `paused`));
                  return;
                }
                ((this.dataset.inkState = `animated`), A(), (p = requestAnimationFrame(j)));
              }
            },
            N = () => {
              if (!m && t.naturalWidth)
                try {
                  (a.texImage2D(a.TEXTURE_2D, 0, a.RGBA, a.RGBA, a.UNSIGNED_BYTE, t),
                    (y = !0),
                    M());
                } catch {
                  h();
                }
            },
            P = { signal: u.signal };
          (t.addEventListener(`load`, N, P),
            t.addEventListener(`error`, h, P),
            this.addEventListener(
              `pointermove`,
              (e) => {
                if (!r.matches || e.pointerType === `touch`) return;
                let t = this.getBoundingClientRect();
                ((E = ((e.clientX - t.left) / t.width) * 2 - 1),
                  (D = 1 - ((e.clientY - t.top) / t.height) * 2),
                  (k = 1));
              },
              P,
            ));
          let F = () => {
            k = 0;
          };
          (this.addEventListener(`pointerleave`, F, P),
            this.addEventListener(`pointercancel`, F, P),
            r.addEventListener(`change`, F, P),
            document.addEventListener(`visibilitychange`, M, P),
            window.addEventListener(
              `pagehide`,
              () => {
                ((x = !0), M());
              },
              P,
            ),
            window.addEventListener(
              `pageshow`,
              () => {
                ((x = !1), M());
              },
              P,
            ),
            e.addEventListener(`webglcontextlost`, h, P),
            (f = new ResizeObserver(() => {
              let t = Math.min(devicePixelRatio || 1, 2);
              ((e.width = Math.max(1, Math.round(this.clientWidth * t))),
                (e.height = Math.max(1, Math.round(this.clientHeight * t))),
                M());
            })),
            (d = new IntersectionObserver(([e]) => {
              ((b = e.isIntersecting), M());
            })),
            f.observe(this),
            d.observe(this),
            t.complete && N());
        } catch {
          h();
        }
      };
    (n.addEventListener(`change`, a),
      a(),
      (this.cleanup = () => {
        (n.removeEventListener(`change`, a), i?.());
      }));
  }
  disconnectedCallback() {
    (this.cleanup?.(), (this.cleanup = void 0));
  }
};
customElements.get(`ink-mark`) || customElements.define(`ink-mark`, e);
