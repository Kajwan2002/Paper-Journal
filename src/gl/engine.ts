import { perspective } from "@/gl/mat4";
import { FRAG, VERT } from "@/gl/shaders";

/** A framework-agnostic WebGL engine that turns one leaf of paper on an
 *  open two-page spread.
 *
 *  The leaf is a real deforming mesh: it bends around a cylinder whose
 *  curvature peaks mid-turn, swings about the spine, catches a moving
 *  highlight and drops a soft shadow on the spread beneath. It always
 *  comes to rest exactly over the facing page — it never blinks out.
 *
 *  `render(t, dir)` is the whole per-frame API. `t` goes 0 → 1 (0 = the
 *  leaf resting on its start side, 1 = folded flat onto the other side).
 *  `dir` +1 turns the right page leftward (forward in time); -1 lifts the
 *  left page rightward (back in time). */

const NX = 80;
const NY = 8;
const CAM_DIST = 2.6;
const KAPPA_MAX = 1.15;
const LIFT_MAX = 0.11;
const SHADOW_MAX = 0.4;
const LIGHT_DIR = new Float32Array([-0.3, 0.5, 0.8]);

type Tex = TexImageSource;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

export class PageTurnGL {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private idxCount: number;
  private tex: WebGLTexture;
  private proj = perspective(1, 1, 0.1, 100);
  private w = 0.72;
  private dead = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl =
      canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
        depth: true,
      }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    this.prog = prog;
    gl.useProgram(prog);

    for (const name of [
      "u_proj",
      "u_camDist",
      "u_w",
      "u_h",
      "u_theta",
      "u_kappa",
      "u_lift",
      "u_tex",
      "u_lightDir",
      "u_paper",
      "u_mode",
      "u_shadow",
      "u_shadowAt",
    ]) {
      this.loc[name] = gl.getUniformLocation(prog, name);
    }
    const aUV = gl.getAttribLocation(prog, "a_uv");

    const uv: number[] = [];
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) uv.push(i / NX, j / NY);
    }
    const idx: number[] = [];
    const stride = NX + 1;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * stride + i;
        idx.push(a, a + 1, a + stride + 1, a, a + stride + 1, a + stride);
      }
    }
    this.idxCount = idx.length;

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(idx),
      gl.STATIC_DRAW,
    );

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([242, 240, 230, 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.uniform1i(this.loc.u_tex, 0);
    gl.uniform3fv(this.loc.u_lightDir, LIGHT_DIR);
    gl.uniform3f(this.loc.u_paper, 0.95, 0.94, 0.9);
    gl.uniform1f(this.loc.u_camDist, CAM_DIST);
    gl.uniform1f(this.loc.u_h, 1);

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  }

  setLeaf(src: Tex): void {
    if (this.dead) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  /** bare paper colour (0-1 rgb) for the sheet's underside */
  setPaper(r: number, g: number, b: number): void {
    if (this.dead) return;
    this.gl.useProgram(this.prog);
    this.gl.uniform3f(this.loc.u_paper, r, g, b);
  }

  /** `pageW`/`pageH` are the CSS size of one page of the spread; the canvas
   *  spans the whole spread plus headroom for the arc. */
  resize(
    canvasCssW: number,
    canvasCssH: number,
    pageW: number,
    pageH: number,
    dpr: number,
  ): void {
    if (this.dead) return;
    const gl = this.gl;
    const cw = Math.max(1, Math.round(canvasCssW * dpr));
    const ch = Math.max(1, Math.round(canvasCssH * dpr));
    (gl.canvas as HTMLCanvasElement).width = cw;
    (gl.canvas as HTMLCanvasElement).height = ch;
    gl.viewport(0, 0, cw, ch);

    this.w = pageW / pageH; // world half-width, page height == 1
    const fitW = (2 * pageW) / canvasCssW;
    const m00 = (fitW * CAM_DIST) / this.w;
    const m11 = m00 * (canvasCssW / canvasCssH);
    this.proj = perspective(m00, m11, 0.1, 100);
  }

  render(t: number, dir: 1 | -1): void {
    if (this.dead) return;
    const gl = this.gl;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const a = dir > 0 ? tc * Math.PI : (1 - tc) * Math.PI;
    const arc = Math.sin(a);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.u_proj, false, this.proj);
    gl.uniform1f(this.loc.u_w, this.w);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1 — contact shadow across the spread (flat, no depth write)
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.uniform1f(this.loc.u_mode, 1);
    gl.uniform1f(this.loc.u_shadow, SHADOW_MAX * arc);
    gl.uniform1f(this.loc.u_shadowAt, Math.cos(a) * 0.7);
    gl.drawElements(gl.TRIANGLES, this.idxCount, gl.UNSIGNED_SHORT, 0);

    // 2 — the turning leaf
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.uniform1f(this.loc.u_mode, 0);
    gl.uniform1f(this.loc.u_theta, a);
    gl.uniform1f(this.loc.u_kappa, KAPPA_MAX * Math.pow(arc, 0.85));
    gl.uniform1f(this.loc.u_lift, LIFT_MAX * arc);
    gl.drawElements(gl.TRIANGLES, this.idxCount, gl.UNSIGNED_SHORT, 0);
  }

  clear(): void {
    if (this.dead) return;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  dispose(): void {
    this.dead = true;
    this.gl.deleteTexture(this.tex);
    this.gl.deleteProgram(this.prog);
  }
}
