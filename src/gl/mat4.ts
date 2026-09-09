/** The one matrix we need: a perspective projection, column-major, for a
 *  camera at the origin looking down -z. */

export function perspective(
  m00: number,
  m11: number,
  near: number,
  far: number,
): Float32Array {
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    m00, 0,   0,                    0,
    0,   m11, 0,                    0,
    0,   0,   (far + near) * nf,   -1,
    0,   0,   2 * far * near * nf,  0,
  ]);
}
