import { FRAG, VERT } from "./shader";

/**
 * A puddle of ink marbling in paper-coloured water, drawn by one fullscreen
 * WebGL pass: 5-octave fbm, double domain warping (the marbling) and
 * derivative-based wet-ink relief with specular glints. It drifts on its own
 * and reacts to nothing — no pointer, no scroll.
 *
 * Frame pacing measures the display rather than guessing: the refresh interval
 * is estimated from requestAnimationFrame, and the ink renders every Nth
 * refresh to land near 60fps (60Hz → every frame, 120/144Hz → every other).
 * Only sustained missed refreshes step the resolution down, and sustained
 * smooth running steps it back up. No work happens while the tab is hidden or
 * the canvas is off-screen; prefers-reduced-motion gets one still frame.
 */

/** The five colours the ink is mixed from. Any CSS colour, including `var(--token)`. */
export interface InkColors {
  /** The water, and everything the ink has not reached. */
  paper: string;
  /** The faint halo at the ink's edge. */
  wash: string;
  /** The ink itself. */
  body: string;
  /** Ink that has dried darker. */
  deep: string;
  /** The darkest centres. */
  core: string;
}

/** The palettes the ink was designed in (the Meridian design system's tokens). */
export const PALETTES = {
  light: { paper: "#faf6ef", wash: "#f5e6cc", body: "#a05e1c", deep: "#703f0f", core: "#2e2620" },
  dark: { paper: "#1b1410", wash: "rgb(220 167 95 / 0.15)", body: "#dca75f", deep: "#f0c68d", core: "#f3eadb" },
} satisfies Record<string, InkColors>;

/**
 * How close the ink comes to the centre. `calm` keeps the middle as plain
 * paper with a faint texture at the edges, for text to sit on; `full` is ink
 * everywhere, for nothing to sit on.
 */
export type InkPresence = "calm" | "full";

/** (mask start, mask end, floor, edge) for the shader's legibility mask. */
const PRESENCE: Record<InkPresence, [number, number, number, number]> = {
  calm: [0.72, 1.5, 0.03, 0.3],
  full: [0.0, 0.001, 0.9, 0.9],
};

export interface InkOptions {
  /** Colours to use; any left out come from `PALETTES.light`. */
  colors?: Partial<InkColors>;
  /** Defaults to `calm`. */
  presence?: InkPresence;
  /** Draw one still frame instead of animating. Reduced-motion users always get one. */
  still?: boolean;
}

export interface Ink {
  /** False when WebGL is unavailable or the shader would not compile; the canvas is left untouched. */
  readonly supported: boolean;
  setColors(colors: Partial<InkColors>): void;
  setPresence(presence: InkPresence): void;
  /** Stop drawing and remove every listener. The canvas can be reused afterwards. */
  destroy(): void;
}

/** Resolution rungs the adaptive loop moves between. */
const LADDER = [1, 0.8, 0.65, 0.5, 0.35];
/** At most this many pixels per frame (a 4K screen at DPR 1), whatever the display. */
const PIXEL_BUDGET = 8_300_000;
/** The frame rate the stride aims for. */
const TARGET_FPS = 60;
/** The field looks richest around this moment of the swirl; it opens here, not on t=0's thin field. */
const TIME_SEED = 17.0;

const SLOTS = ["paper", "wash", "body", "deep", "core"] as const;

type RGB = [number, number, number];

/**
 * Each colour → 0–1 RGB. A hidden element beside the canvas computes it, so
 * `var(--token)` resolves in the canvas's own scope; a 1×1 2D canvas then
 * paints it over the paper, so translucent colours come out as they look.
 */
function resolveColors(near: Element, colors: InkColors): Record<(typeof SLOTS)[number], RGB> {
  const probe = document.createElement("span");
  probe.style.display = "none";
  (near.parentElement ?? document.body).appendChild(probe);
  const computed = (value: string, fallback: string) => {
    probe.style.color = "";
    probe.style.color = value;
    if (!probe.style.color) probe.style.color = fallback;
    return getComputedStyle(probe).color;
  };
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const paint = (value: string, under: string): RGB => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = under;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255];
  };
  const paper = computed(colors.paper, PALETTES.light.paper);
  const out = Object.fromEntries(
    SLOTS.map((slot) => [slot, paint(computed(colors[slot], PALETTES.light[slot]), paper)]),
  ) as Record<(typeof SLOTS)[number], RGB>;
  probe.remove();
  return out;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader: ${log}`);
  }
  return shader;
}

function link(gl: WebGLRenderingContext, vert: string, frag: string) {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
  // The fullscreen triangle is read from attribute 0.
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    prog,
    u: (name: string) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
      return cache.get(name)!;
    },
  };
}

const unsupported: Ink = { supported: false, setColors() {}, setPresence() {}, destroy() {} };

/**
 * Draw the ink into `canvas`, sized to the canvas's own box (style it to fill
 * whatever it should cover). Returns a handle to change colours or presence
 * and to stop.
 */
export function createInk(canvas: HTMLCanvasElement, options: InkOptions = {}): Ink {
  const opts: WebGLContextAttributes = {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  };
  const gl2 = canvas.getContext("webgl2", opts) as WebGL2RenderingContext | null;
  const gl = (gl2 ?? canvas.getContext("webgl", opts)) as WebGLRenderingContext | null;
  if (!gl || gl.isContextLost()) return unsupported;

  // Derivatives (the relief) need GLSL ES 3.00 under WebGL2, and the
  // OES_standard_derivatives extension under WebGL1. Bridge both.
  const precision = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  let vertHeader = "";
  let fragHeader = precision;
  if (gl2) {
    vertHeader = "#version 300 es\n#define attribute in\n";
    fragHeader = "#version 300 es\n" + precision + "out vec4 _fragColor;\n#define gl_FragColor _fragColor\n#define HAS_DERIV 1\n";
  } else if (gl.getExtension("OES_standard_derivatives")) {
    fragHeader = "#extension GL_OES_standard_derivatives : enable\n" + precision + "#define HAS_DERIV 1\n";
  }

  let ink: ReturnType<typeof link>;
  try {
    ink = link(gl, vertHeader + VERT, fragHeader + FRAG);
  } catch (error) {
    console.warn("[ink-background] shader unavailable:", error);
    return unsupported;
  }

  // One fullscreen triangle on attribute 0.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(ink.prog);

  let colors: InkColors = { ...PALETTES.light, ...options.colors };
  const applyColors = () => {
    const rgb = resolveColors(canvas, colors);
    for (const slot of SLOTS) gl.uniform3f(ink.u(`u_${slot}`), ...rgb[slot]);
  };
  const applyPresence = (presence: InkPresence) => gl.uniform4f(ink.u("u_mask"), ...PRESENCE[presence]);
  applyColors();
  applyPresence(options.presence ?? "calm");

  // ---- state -------------------------------------------------------------
  let rung = 0;
  let raf = 0;
  let hidden = document.visibilityState === "hidden";
  let inView = true;
  let lost = false;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isStill = () => options.still === true || motionQuery.matches;
  let still = isStill();

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fullW = Math.max(1, canvas.clientWidth * dpr);
    const fullH = Math.max(1, canvas.clientHeight * dpr);
    const scale = Math.min(1, Math.sqrt(PIXEL_BUDGET / (fullW * fullH))) * LADDER[rung];
    const w = Math.max(1, Math.round(fullW * scale));
    const h = Math.max(1, Math.round(fullH * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.dataset.rung = String(rung);
  };

  const draw = (t: number) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(ink.u("u_res"), canvas.width, canvas.height);
    gl.uniform1f(ink.u("u_time"), t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const stillFrame = () => {
    resize();
    draw(TIME_SEED);
  };

  // ---- pacing ----------------------------------------------------------------
  // The refresh interval is the 20th percentile of recent rAF gaps: the
  // display's own beat, unaffected by the occasional missed frame.
  const gaps: number[] = [];
  let refresh = 1000 / 60;
  let stride = 1;
  let prevRaf = 0;
  let beat = 0;
  let renderedLast = false;
  let judgeAfter = 0;
  let win = { frames: 0, misses: 0 };
  let bad = 0;
  let good = 0;
  let ceiling = 0; // the best rung known to be sustainable
  let upgradedAt = -Infinity;
  let fpsCount = 0;
  let fpsSince = 0;

  const settle = (now: number, ms: number) => {
    judgeAfter = now + ms;
    win = { frames: 0, misses: 0 };
    bad = 0;
    good = 0;
  };

  const judge = (now: number) => {
    const ratio = win.misses / win.frames;
    win = { frames: 0, misses: 0 };
    if (ratio > 0.3) {
      good = 0;
      if (++bad >= 2 && rung < LADDER.length - 1) {
        // Failing right after stepping up means that rung is too much: never climb to it again.
        if (now - upgradedAt < 15_000) ceiling = rung + 1;
        rung++;
        resize();
        settle(now, 1500);
      }
    } else if (ratio < 0.05) {
      bad = 0;
      if (++good >= 3 && rung > ceiling) {
        rung--;
        upgradedAt = now;
        resize();
        settle(now, 1500);
      }
    } else {
      bad = 0;
      good = 0;
    }
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (hidden || !inView || lost) {
      prevRaf = 0;
      renderedLast = false;
      return;
    }
    const gap = prevRaf ? now - prevRaf : 0;
    prevRaf = now;

    if (gap > 200) {
      // A stall (tab switch, heavy navigation) says nothing about the GPU.
      settle(now, 1000);
      renderedLast = false;
    } else if (gap > 0) {
      gaps.push(gap);
      if (gaps.length > 90) gaps.shift();
      if (gaps.length >= 30 && gaps.length % 15 === 0) {
        const sorted = [...gaps].sort((a, b) => a - b);
        refresh = sorted[Math.floor(sorted.length * 0.2)];
        stride = Math.max(1, Math.round(1000 / TARGET_FPS / refresh));
        canvas.dataset.stride = String(stride);
      }
      // Did the frame just rendered make the next refresh?
      if (renderedLast && now > judgeAfter) {
        win.frames++;
        if (gap > refresh * 1.6) win.misses++;
        if (win.frames >= 90) judge(now);
      }
    }

    renderedLast = false;
    if (beat++ % stride !== 0) return;
    draw(TIME_SEED + ((now / 1000) % 3600));
    renderedLast = true;

    fpsCount++;
    if (now - fpsSince >= 1000) {
      canvas.dataset.fps = String(Math.round((fpsCount * 1000) / (now - fpsSince)));
      fpsCount = 0;
      fpsSince = now;
    }
  };

  const start = () => {
    cancelAnimationFrame(raf);
    if (still) stillFrame();
    else {
      prevRaf = 0;
      raf = requestAnimationFrame(tick);
    }
  };

  // ---- events ----------------------------------------------------------------
  const onVis = () => {
    hidden = document.visibilityState === "hidden";
    settle(performance.now(), 1000);
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    canvas.style.visibility = "hidden";
  };
  const onMotion = () => {
    still = isStill();
    start();
  };
  // Colours given as var(--token) follow a theme switch: re-read them when the
  // root's class, data-theme or style changes, or the system scheme flips.
  const onTheme = () => {
    applyColors();
    if (still) stillFrame();
  };
  const themeWatch = new MutationObserver(onTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener("change", onTheme);
  motionQuery.addEventListener("change", onMotion);

  const sizeWatch = new ResizeObserver(() => {
    resize();
    settle(performance.now(), 1000);
    if (still) stillFrame();
  });
  sizeWatch.observe(canvas);
  const viewWatch = new IntersectionObserver((entries) => {
    inView = entries[0]?.isIntersecting ?? true;
  });
  viewWatch.observe(canvas);
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("webglcontextlost", onLost);

  resize();
  // Page load makes the opening seconds janky; judge after them.
  settle(performance.now(), 3000);
  start();

  let destroyed = false;
  return {
    supported: true,
    setColors(next) {
      if (destroyed) return;
      colors = { ...PALETTES.light, ...next };
      onTheme();
    },
    setPresence(presence) {
      if (destroyed) return;
      applyPresence(presence);
      if (still) stillFrame();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
      sizeWatch.disconnect();
      viewWatch.disconnect();
      schemeQuery.removeEventListener("change", onTheme);
      motionQuery.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(ink.prog);
      gl.deleteBuffer(buf);
      // Shrink the drawing buffer so its framebuffers free now, not at GC. Not
      // loseContext(): a remount reuses this canvas, and getContext() would
      // hand back the same lost context, killing the ink for good.
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
