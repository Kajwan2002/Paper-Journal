/** GLSL ES 1.00 — kept WebGL1-compatible for older iPhones. */

export const VERT = `
attribute vec2 a_uv;

uniform mat4  u_proj;
uniform float u_camDist;
uniform float u_w;        // half-page width in world units (spine at x=0)
uniform float u_h;        // page height in world units
uniform float u_theta;    // absolute rotation about the spine, 0 = flat right, PI = flat left
uniform float u_kappa;    // bend curvature (1/worldunit); 0 = flat
uniform float u_lift;     // extra peel of the leading edge toward the viewer
uniform float u_mode;     // 0 = leaf, 1 = contact shadow

varying vec2 v_uv;
varying vec3 v_normal;
varying vec3 v_world;

void main() {
  if (u_mode > 0.5) {
    // a flat quad spanning the whole spread, just under the leaf
    vec3 sp = vec3((a_uv.x * 2.0 - 1.0) * u_w, (a_uv.y - 0.5) * u_h, -0.004);
    sp.z -= u_camDist;
    v_uv = a_uv;
    v_normal = vec3(0.0, 0.0, 1.0);
    v_world = sp;
    gl_Position = u_proj * vec4(sp, 1.0);
    return;
  }

  float u = a_uv.x;              // 0 at spine, 1 at the free edge
  float s = u * u_w;             // arc length travelled from the spine

  float x, z, phi;
  if (u_kappa > 0.0006) {
    phi = s * u_kappa;
    x = sin(phi) / u_kappa;
    z = (1.0 - cos(phi)) / u_kappa;
  } else {
    phi = 0.0;
    x = s;
    z = 0.0;
  }
  z += u_lift * u * u;           // gentle quadratic peel

  vec3 p = vec3(x, (a_uv.y - 0.5) * u_h, z);
  vec3 n = vec3(-sin(phi), 0.0, cos(phi));

  // swing about the spine (world y-axis at x=0)
  float ct = cos(u_theta);
  float st = sin(u_theta);
  vec3 pr = vec3(p.x * ct - p.z * st, p.y, p.x * st + p.z * ct);
  vec3 nr = vec3(n.x * ct - n.z * st, n.y, n.x * st + n.z * ct);

  pr.z -= u_camDist;

  v_uv = a_uv;
  v_normal = nr;
  v_world = pr;
  gl_Position = u_proj * vec4(pr, 1.0);
}
`;

export const FRAG = `
precision highp float;

uniform sampler2D u_tex;
uniform vec3  u_lightDir;
uniform vec3  u_paper;       // bare paper colour, for the sheet's underside
uniform float u_mode;
uniform float u_shadow;      // strength for mode 1
uniform float u_shadowAt;    // -1..1 across the spread, where the shadow pools

varying vec2 v_uv;
varying vec3 v_normal;
varying vec3 v_world;

void main() {
  if (u_mode > 0.5) {
    float sx = v_uv.x * 2.0 - 1.0;
    float d = (sx - u_shadowAt) / 0.5;
    float g = exp(-d * d);
    gl_FragColor = vec4(0.0, 0.0, 0.0, g * u_shadow);
    return;
  }

  vec3 N = normalize(v_normal);
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 front = texture2D(u_tex, uv).rgb;

  // the sheet's underside: bare paper with a whisper of show-through
  vec3 tex = front;
  if (!gl_FrontFacing) {
    N = -N;
    float luma = dot(front, vec3(0.299, 0.587, 0.114));
    tex = u_paper * (0.93 + 0.07 * luma);
  }

  vec3 L = normalize(u_lightDir);
  vec3 V = normalize(-v_world);
  vec3 H = normalize(L + V);

  float ndl = max(dot(N, L), 0.0);
  float diff = 0.66 + 0.34 * ndl;
  float spec = pow(max(dot(N, H), 0.0), 15.0) * 0.14 * float(gl_FrontFacing);

  float gutter = mix(0.82, 1.0, smoothstep(0.0, 0.08, v_uv.x));

  vec3 col = tex * diff * gutter + spec * vec3(1.0, 0.95, 0.86);
  gl_FragColor = vec4(col, 1.0);
}
`;
