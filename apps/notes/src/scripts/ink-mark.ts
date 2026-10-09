// An ink aperture: a silver rim, inward-moving folds, and a dark centre.
const vertexSource = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision highp float;
  varying vec2 uv;
  uniform sampler2D ink;
  uniform float time;
  uniform vec2 pointer;
  uniform float touch;
  uniform float beat;

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
    // A heartbeat swells the opening slightly.
    p /= 1.0 + beat * 0.045;
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
    rim *= 1.0 + beat * 0.6;
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
`;

// A heartbeat's shape: a strong beat, then a softer one a fifth of a second later.
export function heartbeat(seconds: number, bpm: number) {
  const phase = seconds % (60 / bpm);
  return Math.exp(-((phase / 0.07) ** 2)) + 0.5 * Math.exp(-(((phase - 0.22) / 0.06) ** 2));
}

class InkMark extends HTMLElement {
  private cleanup?: () => void;
  private leanTo?: (x: number, y: number) => void;
  private settle?: () => void;

  // Turn the opening toward a point, in the mark's own -1 to 1 space (y up).
  lean(x: number, y: number) {
    this.leanTo?.(x, y);
  }

  rest() {
    this.settle?.();
  }

  connectedCallback() {
    this.cleanup?.();
    const canvas = this.querySelector('canvas');
    const source = this.querySelector('img');
    if (!canvas || !source) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    let disposeRenderer: (() => void) | undefined;

    const configure = () => {
      disposeRenderer?.();
      disposeRenderer = undefined;
      this.removeAttribute('data-rendered');
      this.dataset.inkState = reduced.matches ? 'reduced-motion' : 'static';
      if (reduced.matches) return;

      const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        premultipliedAlpha: false,
      });
      if (!gl) return;

      const program = gl.createProgram();
      const buffer = gl.createBuffer();
      const texture = gl.createTexture();
      const shaders: WebGLShader[] = [];
      const listeners = new AbortController();
      let observer: IntersectionObserver | undefined;
      let resize: ResizeObserver | undefined;
      let frame = 0;
      let disposed = false;

      const dispose = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frame);
        listeners.abort();
        observer?.disconnect();
        resize?.disconnect();
        shaders.forEach((shader) => gl.deleteShader(shader));
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        this.removeAttribute('data-rendered');
        this.dataset.inkState = 'static';
        this.leanTo = undefined;
        this.settle = undefined;
      };
      disposeRenderer = dispose;

      try {
        if (!program || !buffer || !texture) throw new Error('WebGL allocation failed');
        const compile = (type: number, code: string) => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error('WebGL shader unavailable');
          shaders.push(shader);
          gl.shaderSource(shader, code);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error('Ink shader compilation failed');
          gl.attachShader(program, shader);
        };
        compile(gl.VERTEX_SHADER, vertexSource);
        compile(gl.FRAGMENT_SHADER, fragmentSource);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error('Ink shader linking failed');
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.uniform1i(gl.getUniformLocation(program, 'ink'), 0);

        const timeUniform = gl.getUniformLocation(program, 'time');
        const pointerUniform = gl.getUniformLocation(program, 'pointer');
        const touchUniform = gl.getUniformLocation(program, 'touch');
        const beatUniform = gl.getUniformLocation(program, 'beat');
        let ready = false;
        let visible = false;
        let pageHidden = false;
        let previous = 0;
        let elapsed = 0;
        let x = 0;
        let y = 0;
        let targetX = 0;
        let targetY = 0;
        let touch = 0;
        let targetTouch = 0;

        const draw = () => {
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform1f(timeUniform, elapsed);
          gl.uniform2f(pointerUniform, x, y);
          gl.uniform1f(touchUniform, touch);
          // data-bpm, when set, makes the portal beat at that pulse.
          const bpm = Number(this.dataset.bpm);
          gl.uniform1f(beatUniform, bpm >= 25 && bpm <= 200 ? heartbeat(elapsed, bpm) : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          if (!this.hasAttribute('data-rendered')) this.setAttribute('data-rendered', '');
        };
        const tick = (now: number) => {
          frame = requestAnimationFrame(tick);
          // At rest, this tiny mark only needs 30 draws per second.
          const interval = targetTouch || touch > 0.01 ? 1000 / 60 : 1000 / 30;
          if (previous && now - previous < interval - 1) return;
          const delta = previous ? Math.min((now - previous) / 1000, 0.06) : 0;
          previous = now;
          elapsed += delta;
          const ease = 1 - Math.exp(-delta * 7);
          x += (targetX - x) * ease;
          y += (targetY - y) * ease;
          touch += (targetTouch - touch) * ease;
          draw();
        };
        const sync = () => {
          cancelAnimationFrame(frame);
          previous = 0;
          if (disposed || !ready) return;
          if (!visible || document.hidden || pageHidden) {
            targetTouch = 0;
            this.dataset.inkState = 'paused';
            return;
          }
          this.dataset.inkState = 'animated';
          draw();
          frame = requestAnimationFrame(tick);
        };
        const upload = () => {
          if (disposed || !source.naturalWidth) return;
          try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            ready = true;
            sync();
          } catch {
            dispose();
          }
        };
        const options = { signal: listeners.signal };
        source.addEventListener('load', upload, options);
        source.addEventListener('error', dispose, options);
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
        const release = () => {
          targetTouch = 0;
        };
        this.leanTo = (toX, toY) => {
          targetX = Math.max(-1, Math.min(1, toX));
          targetY = Math.max(-1, Math.min(1, toY));
          targetTouch = 1;
        };
        this.settle = release;
        this.addEventListener('pointerleave', release, options);
        this.addEventListener('pointercancel', release, options);
        finePointer.addEventListener('change', release, options);
        document.addEventListener('visibilitychange', sync, options);
        window.addEventListener(
          'pagehide',
          () => {
            pageHidden = true;
            sync();
          },
          options,
        );
        window.addEventListener(
          'pageshow',
          () => {
            pageHidden = false;
            sync();
          },
          options,
        );
        canvas.addEventListener('webglcontextlost', dispose, options);

        resize = new ResizeObserver(() => {
          const ratio = Math.min(devicePixelRatio || 1, 2);
          canvas.width = Math.max(1, Math.round(this.clientWidth * ratio));
          canvas.height = Math.max(1, Math.round(this.clientHeight * ratio));
          sync();
        });
        observer = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          sync();
        });
        resize.observe(this);
        observer.observe(this);
        if (source.complete) upload();
      } catch {
        dispose();
      }
    };

    reduced.addEventListener('change', configure);
    configure();
    this.cleanup = () => {
      reduced.removeEventListener('change', configure);
      disposeRenderer?.();
    };
  }

  disconnectedCallback() {
    this.cleanup?.();
    this.cleanup = undefined;
  }
}

if (!customElements.get('ink-mark')) customElements.define('ink-mark', InkMark);
