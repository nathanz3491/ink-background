export const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// The header (version, precision, HAS_DERIV) is prepended per context.
export const FRAG = `
uniform vec2  u_res;
uniform float u_time;
uniform vec4  u_mask; // (calm start, calm end, floor amount, edge amount)
uniform vec3  u_paper;
uniform vec3  u_wash;
uniform vec3  u_body;
uniform vec3  u_deep;
uniform vec3  u_core;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),                 hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.02 + vec2(13.7, 9.1);
    a *= 0.5;
  }
  return s;
}

/* Iñigo Quilez-style double domain warp — this is what marbles the ink. */
float pattern(in vec2 p, in float t, out vec2 q, out vec2 r) {
  q = vec2(fbm(p + 0.150 * t * vec2(1.0, 0.6)),
           fbm(p + vec2(5.2, 1.3) - 0.120 * t * vec2(0.7, 1.0)));
  r = vec2(fbm(p + 3.6 * q + vec2(1.7, 9.2) + 0.100 * t * vec2(1.0, 0.8)),
           fbm(p + 3.6 * q + vec2(8.3, 2.8) - 0.090 * t * vec2(0.9, 1.0)));
  return fbm(p + 3.2 * r);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float mres = min(u_res.x, u_res.y);
  vec2 sp = (frag - 0.5 * u_res) / mres;   // centre origin

  vec2 q, r;
  float f = pattern(sp * 2.4, u_time, q, r);

  // Ink bands: faint halo -> body -> dried ink -> dark core.
  float halo = smoothstep(0.34, 0.58, f);
  float body = smoothstep(0.46, 0.74, f);
  float deep = smoothstep(0.58, 0.82, f);
  float core = smoothstep(0.66, 0.88, f);

  vec3 col = u_paper;
  col = mix(col, u_wash, halo * 0.55);
  col = mix(col, u_body, body * 0.90);
  col = mix(col, u_deep, deep * 0.75);
  col = mix(col, u_core, core * 0.85);

  // Marbled filaments where the two warp fields cross — interior detail.
  float fil = smoothstep(0.45, 0.05, abs(q.x - q.y));
  col = mix(col, vec3(1.0), fil * body * 0.10);

#ifdef HAS_DERIV
  // Wet-ink relief: light the field's gradient like a meniscus, plus a
  // specular glint.
  vec2 g = vec2(dFdx(f), dFdy(f)) * u_res.y;
  vec3 n = normalize(vec3(-g * 0.35, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.55, 0.72));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 28.0);
  float inkAmt = max(body, halo * 0.5);
  col *= mix(1.0, 0.72 + 0.50 * diff, inkAmt * 0.85);
  col += spec * inkAmt * 0.22;
#endif

  // Legibility mask: how strongly the ink shows, from the centre out.
  float edge = smoothstep(u_mask.x, u_mask.y, length(sp * vec2(1.0, 1.3)));
  col = mix(u_paper, col, mix(u_mask.z, u_mask.w, edge));

  // Paper grain, animated faintly so flats never band.
  float gn = hash(frag + vec2(fract(u_time) * 61.7, fract(u_time * 0.7) * 47.3));
  col += (gn - 0.5) * 0.014;

  gl_FragColor = vec4(col, 1.0);
}
`;
