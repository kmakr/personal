type Polygon = Array<[number, number]>;

const vertexSource = `
  attribute vec2 position;
  attribute vec2 centre;
  attribute vec2 velocity;
  attribute vec3 spin;
  attribute float delay;
  attribute vec2 edgeNormal;
  attribute float edge;
  uniform vec2 viewport;
  uniform float time;
  varying vec3 normal;
  varying vec2 surface;
  varying float rim;
  varying float alpha;
  void main() {
    float t = max(0.0, time - delay);
    vec3 a = spin * t;
    vec3 c = cos(a), s = sin(a);
    mat3 rx = mat3(1,0,0, 0,c.x,s.x, 0,-s.x,c.x);
    mat3 ry = mat3(c.y,0,-s.y, 0,1,0, s.y,0,c.y);
    mat3 rz = mat3(c.z,s.z,0, -s.z,c.z,0, 0,0,1);
    mat3 rotation = rz * ry * rx;
    vec3 local = rotation * vec3(position - centre, 0.0);
    float perspective = 1000.0 / max(200.0, 1000.0 - local.z - 40.0 * t);
    vec2 point = local.xy * perspective + centre + velocity * t;
    point.y += viewport.y * 1.4 * t * t;
    gl_Position = vec4(point.x / viewport.x * 2.0 - 1.0, 1.0 - point.y / viewport.y * 2.0, 0.0, 1.0);
    normal = rotation * normalize(vec3(edgeNormal * edge * 0.7, 1.0));
    surface = position / viewport;
    rim = edge;
    alpha = 1.0 - smoothstep(0.72, 1.15, t);
  }
`;
const fragmentSource = `
  precision mediump float;
  varying vec3 normal;
  varying vec2 surface;
  varying float rim;
  varying float alpha;
  void main() {
    vec3 n = normalize(normal);
    vec3 light = normalize(vec3(-0.45,-0.65,1.0));
    float reflection = pow(max(dot(n, light),0.0),18.0);
    float grazing = pow(1.0-abs(n.z),3.0);
    float stripe = exp(-pow((surface.x*0.6 + surface.y*0.8-0.5)/0.17,2.0));
    vec3 color = mix(vec3(0.73,0.83,0.86),vec3(0.98,1.0,1.0),reflection + stripe * 0.35);
    float opacity = 0.13 + stripe * 0.10 + reflection * 0.21 + grazing * 0.30;
    // A narrow dark edge next to the white bevel gives the piece thickness.
    if (rim > 1.5) { color=vec3(0.24,0.38,0.42); opacity=0.26; }
    else if (rim > 0.5) { color=vec3(0.92,0.99,1.0); opacity=0.62+reflection*0.28; }
    gl_FragColor = vec4(color*opacity*alpha,opacity*alpha);
  }
`;

// One buffer, one draw per frame. No DOM nodes or backdrop filters per piece.
export function createGlassShatter(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
  });
  if (!gl) return null;
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const shaders: WebGLShader[] = [];
  let frame = 0,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    canvas.width = 1;
    canvas.height = 1;
  };
  try {
    program = gl.createProgram();
    buffer = gl.createBuffer();
    if (!program || !buffer) throw new Error('Glass renderer allocation failed');
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Glass shader allocation failed');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('Glass shader compilation failed');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Glass shader linking failed');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = 13 * 4;
    for (const [name, count, offset] of [
      ['position', 2, 0],
      ['centre', 2, 2],
      ['velocity', 2, 4],
      ['spin', 3, 6],
      ['delay', 1, 9],
      ['edgeNormal', 2, 10],
      ['edge', 1, 12],
    ] as const) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, count, gl.FLOAT, false, stride, offset * 4);
    }
    const viewport = gl.getUniformLocation(program, 'viewport');
    const time = gl.getUniformLocation(program, 'time');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    return {
      dispose,
      play(
        polygons: Polygon[],
        width: number,
        height: number,
        hit: { x: number; y: number },
        complete: () => void,
      ) {
        if (disposed) {
          complete();
          return;
        }
        // Keep the framebuffer below 2 million pixels on large/retina screens.
        const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(2_000_000 / (width * height)));
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(viewport, width, height);
        const vertices: number[] = [];
        let seed = 719;
        const random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        for (const polygon of polygons) {
          const cx = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length,
            cy = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
          const vx = (cx - hit.x * width) * (0.08 + random() * 0.14),
            vy = -30 - random() * 90;
          const rx = (random() - 0.5) * 1.75,
            ry = (random() - 0.5) * 2.1,
            rz = (random() - 0.5) * 1.48;
          const delay =
            (Math.hypot(cx - hit.x * width, cy - hit.y * height) / Math.max(width, height)) * 0.11 +
            random() * 0.045;
          const vertex = (p: number[], nx = 0, ny = 0, edge = 0) =>
            vertices.push(p[0], p[1], cx, cy, vx, vy, rx, ry, rz, delay, nx, ny, edge);
          for (let i = 1; i < polygon.length - 1; i++) {
            vertex(polygon[0]);
            vertex(polygon[i]);
            vertex(polygon[i + 1]);
          }
          for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i],
              b = polygon[(i + 1) % polygon.length];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (length < 0.01) continue;
            const nx = -(b[1] - a[1]) / length,
              ny = (b[0] - a[0]) / length;
            for (const [offset, thickness, edge] of [
              [-0.65, 0.55, 2],
              [0.1, 0.85, 1],
            ]) {
              const p = [a[0] + nx * offset, a[1] + ny * offset],
                q = [b[0] + nx * offset, b[1] + ny * offset];
              const r = [b[0] + nx * (offset + thickness), b[1] + ny * (offset + thickness)],
                s = [a[0] + nx * (offset + thickness), a[1] + ny * (offset + thickness)];
              for (const point of [p, q, r, p, r, s]) vertex(point, nx, ny, edge);
            }
          }
        }
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        const count = vertices.length / 13,
          start = performance.now();
        const draw = (now: number) => {
          if (disposed) return;
          const elapsed = (now - start) / 1000;
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1f(time, elapsed);
          gl.drawArrays(gl.TRIANGLES, 0, count);
          if (elapsed < 1.32) frame = requestAnimationFrame(draw);
          else complete();
        };
        // Draw the intact pieces before the original layer is hidden.
        draw(start);
      },
    };
  } catch {
    dispose();
    return null;
  }
}
