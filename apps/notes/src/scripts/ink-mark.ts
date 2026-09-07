// A small black liquid pool above the homepage title.
const vertexSource = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// A shallow liquid surface with reflected area lights and damped capillary waves.
const fragmentSource = `
  precision highp float;
  varying vec2 uv;
  uniform float time;
  uniform vec2 pointer;
  uniform float touch;
  uniform vec3 ripple;

  float edge(vec2 p) {
    float a = atan(p.y, p.x);
    return length(p) / (0.76 + 0.018 * sin(a * 3.0) + 0.012 * cos(a * 5.0));
  }
  float heightAt(vec2 p) {
    float r = edge(p);
    float dome = 0.13 * sqrt(max(0.0, 1.0 - r * r));
    float d = length(p - pointer * 0.65);
    float dent = -0.035 * touch * exp(-d * d * 18.0);
    float age = max(0.0, time - ripple.z);
    float distance = length(p - ripple.xy * 0.65);
    float wave = 0.009 * sin(distance * 32.0 - age * 15.0);
    wave *= exp(-age * 3.5) * exp(-pow((distance - age * 0.8) * 3.0, 2.0));
    float idle = 0.0012 * sin(p.x * 5.0 + time * 0.65) * cos(p.y * 4.0 - time * 0.5);
    return dome + (dent + wave + idle) * (1.0 - smoothstep(0.65, 1.0, r));
  }
  float softbox(vec3 ray, vec2 centre, vec2 size, float softness) {
    vec2 q = ray.xy / max(0.15, ray.z) - centre;
    vec2 d = abs(q) - size;
    return (1.0 - smoothstep(-softness, softness, max(d.x, d.y))) * smoothstep(0.0, 0.3, ray.z);
  }
  void main() {
    vec2 p = (uv * 2.0 - 1.0) * vec2(1.0, 1.13);
    float r = edge(p);
    float shadow = exp(-pow(edge(p - vec2(0.018, -0.055)) / 0.98, 8.0)) * 0.20;
    float mask = 1.0 - smoothstep(0.988, 1.012, r);
    float e = 0.003;
    vec3 n = normalize(vec3(
      (heightAt(p - vec2(e, 0.0)) - heightAt(p + vec2(e, 0.0))) / (2.0 * e),
      (heightAt(p - vec2(0.0, e)) - heightAt(p + vec2(0.0, e))) / (2.0 * e),
      1.0
    ));
    vec3 view = normalize(vec3(0.0, -0.35, 2.5));
    vec3 ray = reflect(-view, n);
    float fresnel = 0.045 + 0.955 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
    float broad = softbox(ray, vec2(-0.32, 0.52), vec2(0.40, 0.16), 0.20);
    float strip = softbox(ray, vec2(0.85, 0.15), vec2(0.06, 0.65), 0.10);
    vec3 color = vec3(0.019, 0.022, 0.026);
    color += vec3(0.78, 0.82, 0.86) * broad * 0.68;
    color += vec3(0.65) * strip * 0.34;
    color += fresnel * 0.38;
    float alpha = mask + shadow * (1.0 - mask);
    gl_FragColor = vec4(color * mask / max(alpha, 0.001), alpha);
  }
`;

class InkMark extends HTMLElement {
  private cleanup?: () => void;

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
      let suspension: MutationObserver | undefined;
      let frame = 0;
      let disposed = false;

      const dispose = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frame);
        listeners.abort();
        observer?.disconnect();
        resize?.disconnect();
        suspension?.disconnect();
        shaders.forEach((shader) => gl.deleteShader(shader));
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        this.removeAttribute('data-rendered');
        this.dataset.inkState = 'static';
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
        const rippleUniform = gl.getUniformLocation(program, 'ripple');
        let rippleX = 0;
        let rippleY = 0;
        let rippleTime = -10;
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
          gl.uniform3f(rippleUniform, rippleX, rippleY, rippleTime);
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
          if (!visible || document.hidden || pageHidden || this.closest('[inert]')) {
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
            if (elapsed - rippleTime > 0.22) {
              rippleX = targetX;
              rippleY = targetY;
              rippleTime = elapsed;
            }
            targetTouch = 1;
          },
          options,
        );
        const release = () => {
          targetTouch = 0;
        };
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
        const main = this.closest('main');
        if (main) {
          suspension = new MutationObserver(sync);
          suspension.observe(main, { attributes: true, attributeFilter: ['inert'] });
        }
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
