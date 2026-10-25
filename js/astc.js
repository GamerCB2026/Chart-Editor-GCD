/* =====================================================================
   astc.js — texturas ASTC (.astc, y .ktx / .ktx2 con formato ASTC) como en los
   ports móviles de FNF (V-Slice móvil / Psych móvil). El navegador no puede
   mostrar ASTC en <img>: aquí se decodifica a un <canvas> que el resto del
   juego usa igual que una imagen PNG cargada (naturalWidth / naturalHeight).

   · Rápido (si existe): WebGL2 + WEBGL_compressed_texture_astc (GPUs de móvil):
     la GPU decodifica y se lee con readPixels. La primera vez se compara con el
     decodificador por software; si difiere en más de 1 nivel se desactiva.
   · Siempre: decodificador por software (perfil LDR 2D, todos los tamaños de
     bloque 4x4…12x12, bloques void-extent, 1–4 particiones, plano doble,
     perfil lineal o sRGB) en Web Workers (varios a la vez, por franjas), o en
     el hilo principal por partes si no hay Workers.
   · Sin soporte: ASTC HDR (esos bloques salen magenta, como el error de la
     especificación) y texturas 3D (de un .astc 3D con bloques Nx M x1 solo se
     muestra la primera capa).

   Decodificador escrito desde cero a partir de la especificación pública
   "Khronos Data Format Specification 1.3 — ASTC Compressed Texture Image
   Formats" (sin código copiado de terceros).
   ?astc=sw fuerza software (Workers) · ?astc=main software sin Workers · ?astc=gpu fuerza WebGL.
   ===================================================================== */
'use strict';

/* Núcleo independiente (se ejecuta igual en el hilo principal y dentro de los Workers) */
function ASTC_CORE() {
  'use strict';
  /* niveles de cuantización ISE 0..20 → [trits, quints, bits] (rangos 2,3,4,5,6,8,10,12,16,20,24,32,40,48,64,80,96,128,160,192,256) */
  const RANGES = [[0,0,1],[1,0,0],[0,0,2],[0,1,0],[1,0,1],[0,0,3],[0,1,1],[1,0,2],[0,0,4],[0,1,2],[1,0,3],[0,0,5],[0,1,3],[1,0,4],[0,0,6],[0,1,4],[1,0,5],[0,0,7],[0,1,5],[1,0,6],[0,0,8]];
  const iseBits = (n, l) => { const r = RANGES[l]; return r[2] * n + (r[0] ? Math.floor((8 * n + 4) / 5) : r[1] ? Math.floor((7 * n + 2) / 3) : 0); };
  const bit = (v, i) => (v >> i) & 1;

  /* tablas trit (8 bits → 5 trits) y quint (7 bits → 3 quints) */
  const TRITS = new Uint8Array(256 * 5), QUINTS = new Uint8Array(128 * 3);
  for (let T = 0; T < 256; T++) {
    let C, t0, t1, t2, t3, t4;
    if (((T >> 2) & 7) === 7) { C = (((T >> 5) & 7) << 2) | (T & 3); t4 = t3 = 2; }
    else { C = T & 0x1F; if (((T >> 5) & 3) === 3) { t4 = 2; t3 = bit(T, 7); } else { t4 = bit(T, 7); t3 = (T >> 5) & 3; } }
    if ((C & 3) === 3) { t2 = 2; t1 = bit(C, 4); t0 = (bit(C, 3) << 1) | (bit(C, 2) & (bit(C, 3) ^ 1)); }
    else if (((C >> 2) & 3) === 3) { t2 = 2; t1 = 2; t0 = C & 3; }
    else { t2 = bit(C, 4); t1 = (C >> 2) & 3; t0 = (bit(C, 1) << 1) | (bit(C, 0) & (bit(C, 1) ^ 1)); }
    TRITS[T * 5] = t0; TRITS[T * 5 + 1] = t1; TRITS[T * 5 + 2] = t2; TRITS[T * 5 + 3] = t3; TRITS[T * 5 + 4] = t4;
  }
  for (let Q = 0; Q < 128; Q++) {
    let C, q0, q1, q2;
    if (((Q >> 1) & 3) === 3 && ((Q >> 5) & 3) === 0) {
      q2 = (bit(Q, 0) << 2) | ((bit(Q, 4) & (bit(Q, 0) ^ 1)) << 1) | (bit(Q, 3) & (bit(Q, 0) ^ 1)); q1 = q0 = 4;
    } else {
      if (((Q >> 1) & 3) === 3) { q2 = 4; C = (((Q >> 3) & 3) << 3) | ((~(Q >> 5) & 3) << 1) | (Q & 1); }
      else { q2 = (Q >> 5) & 3; C = Q & 0x1F; }
      if ((C & 7) === 5) { q1 = 4; q0 = (C >> 3) & 3; } else { q1 = (C >> 3) & 3; q0 = C & 7; }
    }
    QUINTS[Q * 3] = q0; QUINTS[Q * 3 + 1] = q1; QUINTS[Q * 3 + 2] = q2;
  }

  /* des-cuantización de colores (0..255) y pesos (0..64) */
  const pat = (s, m) => { let v = 0; for (let i = 0; i < s.length; i++) { v <<= 1; const ch = s.charCodeAt(i); if (ch !== 48) v |= (m >> (ch - 97)) & 1; } return v; };
  const rep = (v, b, to) => { let r = 0, s = to; while (s > 0) { s -= b; r |= s >= 0 ? v << s : v >> -s; } return r; };
  const CB_T = { 1: ['000000000', 204], 2: ['b000b0bb0', 93], 3: ['cb000cbcb', 44], 4: ['dcb000dcb', 22], 5: ['edcb000ed', 11], 6: ['fedcb000f', 5] };
  const CB_Q = { 1: ['000000000', 113], 2: ['b0000bb00', 54], 3: ['cb0000cbc', 26], 4: ['dcb0000dc', 13], 5: ['edcb0000e', 6] };
  const WB_T = { 1: ['0000000', 50], 2: ['b000b0b', 23], 3: ['cb000cb', 11] };
  const WB_Q = { 1: ['0000000', 28], 2: ['b0000b0', 13] };
  const levelSize = l => { const r = RANGES[l]; return (r[0] ? 3 : r[1] ? 5 : 1) << r[2]; };
  const CUNQ = [], WUNQ = [];
  for (let l = 0; l <= 20; l++) {
    const [t, q, b] = RANGES[l], n = levelSize(l), cu = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      if (!t && !q) { cu[v] = rep(v, b, 8); continue; }
      if (b === 0) { cu[v] = Math.round(v * 255 / (n - 1)); continue; }   // rangos 3 y 5: no se usan para colores
      const D = v >> b, m = v & ((1 << b) - 1), A = (m & 1) ? 0x1FF : 0, [ps, C] = (t ? CB_T : CB_Q)[b];
      let T = D * C + pat(ps, m); T ^= A; cu[v] = (A & 0x80) | (T >> 2);
    }
    CUNQ.push(cu);
    if (l > 11) continue;
    const wu = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      let T;
      if (!t && !q) T = rep(v, b, 6);
      else if (b === 0) T = t ? [0, 32, 63][v] : [0, 16, 32, 47, 63][v];
      else { const D = v >> b, m = v & ((1 << b) - 1), A = (m & 1) ? 0x7F : 0, [ps, C] = (t ? WB_T : WB_Q)[b]; T = D * C + pat(ps, m); T ^= A; T = (A & 0x20) | (T >> 2); }
      wu[v] = T > 32 ? T + 1 : T;
    }
    WUNQ.push(wu);
  }

  /* lectura de bits (bloque de 128 bits en 4 palabras little-endian) */
  const gb = (w, pos, n) => {
    if (n <= 0 || pos >= 128) return 0;
    const i = pos >>> 5, s = pos & 31; let v = w[i] >>> s;
    if (s + n > 32 && i < 3) v |= w[i + 1] << (32 - s);
    return n >= 32 ? v >>> 0 : v & ((1 << n) - 1);
  };
  const rev32 = x => { x = ((x >>> 1) & 0x55555555) | ((x & 0x55555555) << 1); x = ((x >>> 2) & 0x33333333) | ((x & 0x33333333) << 2);
    x = ((x >>> 4) & 0x0F0F0F0F) | ((x & 0x0F0F0F0F) << 4); x = ((x >>> 8) & 0x00FF00FF) | ((x & 0x00FF00FF) << 8); return ((x >>> 16) | (x << 16)) >>> 0; };

  /* Integer Sequence Encoding: n valores de nivel l desde el bit start; los bits >= limit cuentan como 0 */
  function decodeISE(w, start, limit, n, l, out) {
    const r = RANGES[l], b = r[2]; let p = start;
    const g = k => { const pos = p; p += k; if (k <= 0 || pos >= limit) return 0; return gb(w, pos, pos + k > limit ? limit - pos : k); };
    if (r[0]) {
      for (let i = 0; i < n; i += 5) {
        const m0 = g(b); let T = g(2); const m1 = g(b); T |= g(2) << 2; const m2 = g(b); T |= g(1) << 4;
        const m3 = g(b); T |= g(2) << 5; const m4 = g(b); T |= g(1) << 7;
        const ms = [m0, m1, m2, m3, m4], o = T * 5;
        for (let j = 0; j < 5 && i + j < n; j++) out[i + j] = (TRITS[o + j] << b) | ms[j];
      }
    } else if (r[1]) {
      for (let i = 0; i < n; i += 3) {
        const m0 = g(b); let Q = g(3); const m1 = g(b); Q |= g(2) << 3; const m2 = g(b); Q |= g(2) << 5;
        const ms = [m0, m1, m2], o = Q * 3;
        for (let j = 0; j < 3 && i + j < n; j++) out[i + j] = (QUINTS[o + j] << b) | ms[j];
      }
    } else for (let i = 0; i < n; i++) out[i] = g(b);
  }

  /* modo de bloque 2D → { xw, yw, dual, wl (nivel de pesos), wbits } o null (reservado / no válido) */
  function blockMode(mode, bw, bh) {
    let R = (mode >> 4) & 1, H = (mode >> 9) & 1, D = (mode >> 10) & 1;
    const A = (mode >> 5) & 3; let xw = 0, yw = 0;
    if ((mode & 3) !== 0) {
      R |= (mode & 3) << 1; let B = (mode >> 7) & 3;
      switch ((mode >> 2) & 3) {
        case 0: xw = B + 4; yw = A + 2; break;
        case 1: xw = B + 8; yw = A + 2; break;
        case 2: xw = A + 2; yw = B + 8; break;
        default: B &= 1; if (mode & 0x100) { xw = B + 2; yw = A + 2; } else { xw = A + 2; yw = B + 6; }
      }
    } else {
      R |= ((mode >> 2) & 3) << 1; if (((mode >> 2) & 3) === 0) return null;
      const B = (mode >> 9) & 3;
      switch ((mode >> 7) & 3) {
        case 0: xw = 12; yw = A + 2; break;
        case 1: xw = A + 2; yw = 12; break;
        case 2: xw = A + 6; yw = B + 6; D = 0; H = 0; break;
        default: if (A === 0) { xw = 6; yw = 10; } else if (A === 1) { xw = 10; yw = 6; } else return null;
      }
    }
    const cnt = xw * yw * (D + 1), wl = R - 2 + 6 * H;
    if (wl < 0 || wl > 11 || xw > bw || yw > bh || cnt > 64) return null;
    const wbits = iseBits(cnt, wl);
    if (wbits < 24 || wbits > 96) return null;
    return { xw, yw, dual: !!D, wl, wbits, cnt };
  }

  /* tabla de interpolación de la rejilla de pesos → texeles */
  function infill(bw, bh, xw, yw) {
    const n = bw * bh, idx = new Int32Array(n * 4), f = new Int32Array(n * 4), cnt = xw * yw;
    const Ds = Math.floor((1024 + (bw >> 1)) / (bw - 1)), Dt = Math.floor((1024 + (bh >> 1)) / (bh - 1));
    for (let t = 0; t < bh; t++) for (let s = 0; s < bw; s++) {
      const gs = (Ds * s * (xw - 1) + 32) >> 6, gt = (Dt * t * (yw - 1) + 32) >> 6;
      const js = gs >> 4, fs = gs & 15, jt = gt >> 4, ft = gt & 15, v0 = js + jt * xw;
      const w11 = (fs * ft + 8) >> 4, w10 = ft - w11, w01 = fs - w11, w00 = 16 - fs - ft + w11, k = (t * bw + s) * 4;
      idx[k] = Math.min(v0, cnt - 1); idx[k + 1] = Math.min(v0 + 1, cnt - 1); idx[k + 2] = Math.min(v0 + xw, cnt - 1); idx[k + 3] = Math.min(v0 + xw + 1, cnt - 1);
      f[k] = w00; f[k + 1] = w01; f[k + 2] = w10; f[k + 3] = w11;
    }
    return { idx, f };
  }

  /* función de partición de la especificación (hash52 + select_partition) */
  function hash52(p) {
    p ^= p >>> 15; p = Math.imul(p, 0xEEDE0891); p ^= p >>> 5; p = (p + (p << 16)) | 0;
    p ^= p >>> 7; p ^= p >>> 3; p ^= p << 6; p ^= p >>> 17; return p >>> 0;
  }
  function selectPartition(seed, x, y, z, count, small) {
    if (small) { x <<= 1; y <<= 1; z <<= 1; }
    seed += (count - 1) * 1024;
    const rnum = hash52(seed);
    let s1 = rnum & 0xF, s2 = (rnum >>> 4) & 0xF, s3 = (rnum >>> 8) & 0xF, s4 = (rnum >>> 12) & 0xF, s5 = (rnum >>> 16) & 0xF, s6 = (rnum >>> 20) & 0xF,
      s7 = (rnum >>> 24) & 0xF, s8 = (rnum >>> 28) & 0xF, s9 = (rnum >>> 18) & 0xF, s10 = (rnum >>> 22) & 0xF, s11 = (rnum >>> 26) & 0xF, s12 = ((rnum >>> 30) | (rnum << 2)) & 0xF;
    s1 *= s1; s2 *= s2; s3 *= s3; s4 *= s4; s5 *= s5; s6 *= s6; s7 *= s7; s8 *= s8; s9 *= s9; s10 *= s10; s11 *= s11; s12 *= s12;
    let sh1, sh2;
    if (seed & 1) { sh1 = (seed & 2) ? 4 : 5; sh2 = count === 3 ? 6 : 5; } else { sh1 = count === 3 ? 6 : 5; sh2 = (seed & 2) ? 4 : 5; }
    const sh3 = (seed & 0x10) ? sh1 : sh2;
    s1 >>= sh1; s2 >>= sh2; s3 >>= sh1; s4 >>= sh2; s5 >>= sh1; s6 >>= sh2; s7 >>= sh1; s8 >>= sh2; s9 >>= sh3; s10 >>= sh3; s11 >>= sh3; s12 >>= sh3;
    let a = (s1 * x + s2 * y + s11 * z + (rnum >>> 14)) & 0x3F, b = (s3 * x + s4 * y + s12 * z + (rnum >>> 10)) & 0x3F,
      c = (s5 * x + s6 * y + s9 * z + (rnum >>> 6)) & 0x3F, d = (s7 * x + s8 * y + s10 * z + (rnum >>> 2)) & 0x3F;
    if (count < 4) d = 0; if (count < 3) c = 0;
    if (a >= b && a >= c && a >= d) return 0; if (b >= c && b >= d) return 1; if (c >= d) return 2; return 3;
  }

  /* extremos de color (modos LDR 0,1,4,5,6,8,9,10,12,13); false = modo HDR */
  const cl = v => v < 0 ? 0 : v > 255 ? 255 : v;
  function endpoints(cem, v, k, E, o) {
    let v0 = v[k], v1 = v[k + 1], v2 = v[k + 2], v3 = v[k + 3], v4 = v[k + 4], v5 = v[k + 5], v6 = v[k + 6], v7 = v[k + 7];
    const set = (r0, g0, b0, a0, r1, g1, b1, a1) => { E[o] = cl(r0); E[o + 1] = cl(g0); E[o + 2] = cl(b0); E[o + 3] = cl(a0); E[o + 4] = cl(r1); E[o + 5] = cl(g1); E[o + 6] = cl(b1); E[o + 7] = cl(a1); };
    const bts = (a, b) => { b >>= 1; b |= a & 0x80; a >>= 1; a &= 0x3F; if (a & 0x20) a -= 0x40; return [a, b]; };
    switch (cem) {
      case 0: set(v0, v0, v0, 255, v1, v1, v1, 255); return true;
      case 1: { const L0 = (v0 >> 2) | (v1 & 0xC0), L1 = Math.min(L0 + (v1 & 0x3F), 255); set(L0, L0, L0, 255, L1, L1, L1, 255); return true; }
      case 4: set(v0, v0, v0, v2, v1, v1, v1, v3); return true;
      case 5: { [v1, v0] = bts(v1, v0); [v3, v2] = bts(v3, v2); set(v0, v0, v0, v2, v0 + v1, v0 + v1, v0 + v1, v2 + v3); return true; }
      case 6: set((v0 * v3) >> 8, (v1 * v3) >> 8, (v2 * v3) >> 8, 255, v0, v1, v2, 255); return true;
      case 10: set((v0 * v3) >> 8, (v1 * v3) >> 8, (v2 * v3) >> 8, v4, v0, v1, v2, v5); return true;
      case 8: case 12: {
        if (cem === 8) { v6 = v7 = 255; }
        if (v1 + v3 + v5 >= v0 + v2 + v4) set(v0, v2, v4, v6, v1, v3, v5, v7);
        else set((v1 + v5) >> 1, (v3 + v5) >> 1, v5, v7, (v0 + v4) >> 1, (v2 + v4) >> 1, v4, v6);
        return true;
      }
      case 9: case 13: {
        [v1, v0] = bts(v1, v0); [v3, v2] = bts(v3, v2); [v5, v4] = bts(v5, v4);
        if (cem === 13) [v7, v6] = bts(v7, v6); else { v6 = 255; v7 = 0; }
        if (v1 + v3 + v5 >= 0) set(v0, v2, v4, v6, v0 + v1, v2 + v3, v4 + v5, v6 + v7);
        else { const r = v0 + v1, g = v2 + v3, b = v4 + v5; set((r + b) >> 1, (g + b) >> 1, b, v6 + v7, (v0 + v4) >> 1, (v2 + v4) >> 1, v4, v6); }
        return true;
      }
      default: return false;
    }
  }

  /* contexto por tamaño de bloque (cachés de modos, rejillas y particiones) */
  function makeCtx(bw, bh, srgb) {
    return { bw, bh, n: bw * bh, srgb: !!srgb, modes: new Array(2048), inf: new Map(), parts: new Map(),
      w: new Uint32Array(4), rw: new Uint32Array(4), q: new Int32Array(64), pw0: new Int32Array(144), pw1: new Int32Array(144),
      cv: new Int32Array(32), E: new Int32Array(32), cem: [0, 0, 0, 0], hdr: 0, err: 0 };
  }
  function partTable(cx, seed, count) {
    const key = count * 1024 + seed; let t = cx.parts.get(key);
    if (!t) { t = new Uint8Array(cx.n); const small = cx.n < 31; for (let y = 0; y < cx.bh; y++) for (let x = 0; x < cx.bw; x++) t[y * cx.bw + x] = selectPartition(seed, x, y, 0, count, small); cx.parts.set(key, t); }
    return t;
  }
  /* v3.3.0: un bloque que no se puede decodificar (HDR o no válido) ya no sale magenta: queda transparente y se
     cuenta (cx.hdr / cx.err); el juego muestra un aviso claro y prueba la PNG si existe */
  function errorBlock(cx, out, stride, x0, y0, mw, mh, hdr) {
    if (hdr) cx.hdr++; else cx.err++;
    for (let t = 0; t < mh; t++) for (let s = 0; s < mw; s++) { const o = (y0 + t) * stride + (x0 + s) * 4; out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; }
  }

  /* decodifica un bloque (16 bytes en d[off]) a RGBA8 en out (stride en bytes), texeles visibles mw x mh */
  function decodeBlock(cx, d, off, out, stride, x0, y0, mw, mh) {
    const w = cx.w;
    for (let i = 0; i < 4; i++) w[i] = (d[off + i * 4] | (d[off + i * 4 + 1] << 8) | (d[off + i * 4 + 2] << 16) | (d[off + i * 4 + 3] << 24)) >>> 0;
    const mode = w[0] & 0x7FF;
    if ((mode & 0x1FF) === 0x1FC) {   // void-extent: un solo color
      if (mode & 0x200) return errorBlock(cx, out, stride, x0, y0, mw, mh, true);   // HDR
      const c = [w[2] & 0xFFFF, w[2] >>> 16, w[3] & 0xFFFF, w[3] >>> 16].map(v => v >> 8);
      for (let t = 0; t < mh; t++) for (let s = 0; s < mw; s++) { const o = (y0 + t) * stride + (x0 + s) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3]; }
      return;
    }
    let bm = cx.modes[mode];
    if (bm === undefined) bm = cx.modes[mode] = blockMode(mode, cx.bw, cx.bh);
    if (!bm) return errorBlock(cx, out, stride, x0, y0, mw, mh);
    const parts = ((w[0] >>> 11) & 3) + 1;
    if (parts === 4 && bm.dual) return errorBlock(cx, out, stride, x0, y0, mw, mh);
    // CEM
    const cem = cx.cem; let below = 128 - bm.wbits, colorStart;
    if (parts === 1) { cem[0] = gb(w, 13, 4); colorStart = 17; }
    else {
      colorStart = 29;
      const sel = gb(w, 23, 2);
      if (sel === 0) { const c = gb(w, 25, 4); for (let i = 0; i < parts; i++) cem[i] = c; }
      else {
        const extra = 3 * parts - 4; below -= extra;
        const enc = gb(w, 25, 4) | (gb(w, below, extra) << 4), base = sel - 1;
        for (let i = 0; i < parts; i++) cem[i] = ((((enc >> i) & 1) + base) << 2) | ((enc >> (parts + 2 * i)) & 3);
      }
    }
    let ccs = -1;
    if (bm.dual) { below -= 2; ccs = gb(w, below, 2); }
    let nv = 0; for (let i = 0; i < parts; i++) nv += ((cem[i] >> 2) + 1) * 2;
    if (nv > 18) return errorBlock(cx, out, stride, x0, y0, mw, mh);
    const cbits = below - colorStart; let cl = -1;
    for (let l = 20; l >= 4; l--) if (iseBits(nv, l) <= cbits) { cl = l; break; }
    if (cl < 0) return errorBlock(cx, out, stride, x0, y0, mw, mh);
    const cv = cx.cv;
    decodeISE(w, colorStart, colorStart + iseBits(nv, cl), nv, cl, cv);
    const cu = CUNQ[cl]; for (let i = 0; i < nv; i++) cv[i] = cu[cv[i]];
    const E = cx.E; let k = 0;
    for (let p = 0; p < parts; p++) {
      if (!endpoints(cem[p], cv, k, E, p * 8)) return errorBlock(cx, out, stride, x0, y0, mw, mh, true);   // modos de color HDR (2, 3, 7, 11, 14, 15)
      k += ((cem[p] >> 2) + 1) * 2;
    }
    // 8 bits → 16 bits (lineal: replicar; sRGB: |0x80)
    for (let i = 0; i < parts * 8; i++) E[i] = cx.srgb ? (E[i] << 8) | 0x80 : E[i] * 257;
    // pesos (bits invertidos desde el final del bloque)
    const rw = cx.rw; rw[0] = rev32(w[3]); rw[1] = rev32(w[2]); rw[2] = rev32(w[1]); rw[3] = rev32(w[0]);
    const q = cx.q; decodeISE(rw, 0, bm.wbits, bm.cnt, bm.wl, q);
    const wu = WUNQ[bm.wl]; for (let i = 0; i < bm.cnt; i++) q[i] = wu[q[i]];
    const ik = bm.xw * 16 + bm.yw; let inf = cx.inf.get(ik); if (!inf) { inf = infill(cx.bw, cx.bh, bm.xw, bm.yw); cx.inf.set(ik, inf); }
    const { idx, f } = inf, pw0 = cx.pw0, pw1 = cx.pw1, n = cx.n, dual = bm.dual;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      if (dual) {
        pw0[i] = (q[idx[j] * 2] * f[j] + q[idx[j + 1] * 2] * f[j + 1] + q[idx[j + 2] * 2] * f[j + 2] + q[idx[j + 3] * 2] * f[j + 3] + 8) >> 4;
        pw1[i] = (q[idx[j] * 2 + 1] * f[j] + q[idx[j + 1] * 2 + 1] * f[j + 1] + q[idx[j + 2] * 2 + 1] * f[j + 2] + q[idx[j + 3] * 2 + 1] * f[j + 3] + 8) >> 4;
      } else pw0[i] = (q[idx[j]] * f[j] + q[idx[j + 1]] * f[j + 1] + q[idx[j + 2]] * f[j + 2] + q[idx[j + 3]] * f[j + 3] + 8) >> 4;
    }
    const pt = parts > 1 ? partTable(cx, gb(w, 13, 10), parts) : null, bw = cx.bw;
    for (let t = 0; t < mh; t++) {
      let o = (y0 + t) * stride + x0 * 4;
      for (let s = 0; s < mw; s++, o += 4) {
        const i = t * bw + s, e = pt ? pt[i] * 8 : 0, a = pw0[i];
        for (let c = 0; c < 4; c++) {
          const wt = c === ccs ? pw1[i] : a;
          out[o + c] = ((E[e + c] * (64 - wt) + E[e + 4 + c] * wt + 32) >> 6) >> 8;
        }
      }
    }
  }

  /* decodifica las filas de bloques [by0, by1) → RGBA (width x filas visibles) */
  function decodeRows(d, off, bw, bh, width, height, by0, by1, srgb, cx) {
    cx = cx && cx.bw === bw && cx.bh === bh && cx.srgb === !!srgb ? cx : makeCtx(bw, bh, srgb);
    cx.hdr = 0; cx.err = 0;
    const nbx = Math.ceil(width / bw), y0 = by0 * bh, y1 = Math.min(height, by1 * bh), stride = width * 4;
    const out = new Uint8ClampedArray(stride * (y1 - y0));
    for (let by = by0; by < by1; by++) {
      const ty = by * bh - y0, mh = Math.min(bh, y1 - by * bh);
      for (let bx = 0; bx < nbx; bx++) decodeBlock(cx, d, off + (by * nbx + bx) * 16, out, stride, bx * bw, ty, Math.min(bw, width - bx * bw), mh);
    }
    return { data: out, rows: y1 - y0, cx, hdr: cx.hdr, err: cx.err };
  }

  /* revisión rápida (sin decodificar los texeles): cuántos bloques son HDR. Sirve para subir la textura
     comprimida directo a la GPU sabiendo que no tiene bloques que la GPU (perfil LDR) mostraría mal */
  const HDR_CEM = [0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1];
  function scanHdr(d, off, nblocks) {
    let hdr = 0; const w = new Uint32Array(4);
    for (let b = 0; b < nblocks; b++) {
      const o = off + b * 16;
      for (let i = 0; i < 4; i++) w[i] = (d[o + i * 4] | (d[o + i * 4 + 1] << 8) | (d[o + i * 4 + 2] << 16) | (d[o + i * 4 + 3] << 24)) >>> 0;
      const mode = w[0] & 0x7FF;
      if ((mode & 0x1FF) === 0x1FC) { if (mode & 0x200) hdr++; continue; }
      const parts = ((w[0] >>> 11) & 3) + 1;
      if (parts === 1) { if (HDR_CEM[gb(w, 13, 4)]) hdr++; continue; }
      const sel = gb(w, 23, 2);
      if (sel === 0) { if (HDR_CEM[gb(w, 25, 4)]) hdr++; continue; }
      // CEM por partición: se necesita el tamaño de la rejilla de pesos (block mode) → se omite el detalle:
      // clase base (sel-1) + bit por partición; HDR si algún CEM cae en la lista
      const bm = blockMode(mode, 12, 12); if (!bm) continue;
      let below = 128 - bm.wbits; const extra = 3 * parts - 4; below -= extra;
      const enc = gb(w, 25, 4) | (gb(w, below, extra) << 4), base = sel - 1;
      for (let i = 0; i < parts; i++) { const c = ((((enc >> i) & 1) + base) << 2) | ((enc >> (parts + 2 * i)) & 3); if (HDR_CEM[c]) { hdr++; break; } }
    }
    return hdr;
  }

  /* contenedores: .astc (cabecera de 16 bytes), KTX 1.1 y KTX 2.0 (sin supercompresión) */
  const FOOT = [[4,4],[5,4],[5,5],[6,5],[6,6],[8,5],[8,6],[8,8],[10,5],[10,6],[10,8],[10,10],[12,10],[12,12]];
  function sniff(b) {
    if (b.length >= 4 && b[0] === 0x13 && b[1] === 0xAB && b[2] === 0xA1 && b[3] === 0x5C) return 'astc';
    if (b.length >= 12 && b[0] === 0xAB && b[1] === 0x4B && b[2] === 0x54 && b[3] === 0x58 && b[4] === 0x20) return b[5] === 0x32 ? 'ktx2' : 'ktx';
    return null;
  }
  /* pares clave/valor de KTX 1 y KTX 2 (p. ej. KTXorientation "S=r,T=d") */
  function keyValues(b, off, len, le) {
    const out = {}, dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let p = off;
    const end = Math.min(b.length, off + len);
    while (p + 4 <= end) {
      const n = dv.getUint32(p, le); p += 4; if (!n || p + n > end) break;
      const raw = b.subarray(p, p + n), z = raw.indexOf(0);
      if (z > 0) { const k = String.fromCharCode(...raw.subarray(0, z)), v = String.fromCharCode(...raw.subarray(z + 1)).replace(/\0+$/, ''); out[k] = v; }
      p += n + ((4 - (n % 4)) % 4);
    }
    return out;
  }
  /* T=u: la primera fila guardada es la de ABAJO (convención de OpenGL) → hay que voltear */
  const flipFrom = kv => /T\s*=\s*u/i.test(kv.KTXorientation || '');
  function parse(buf) {
    const b = new Uint8Array(buf), kind = sniff(b), dv = new DataView(buf);
    if (!kind) throw new Error('no es ASTC/KTX');
    if (kind === 'astc') {
      if (b.length < 16) throw new Error('archivo .astc corto');
      const bw = b[4], bh = b[5], bd = b[6], u24 = o => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
      const width = u24(7), height = u24(10), depth = u24(13);
      if (bd > 1) throw new Error(`ASTC 3D (bloque ${bw}x${bh}x${bd}) no soportado: exporta la textura en 2D`);
      if (bw < 4 || bh < 4 || bw > 12 || bh > 12 || !FOOT.some(f => f[0] === bw && f[1] === bh)) throw new Error(`tamaño de bloque ${bw}x${bh} no válido`);
      return { kind, width, height, depth, bw, bh, offset: 16, srgb: false, flipY: false };
    }
    if (kind === 'ktx') {
      const le = dv.getUint32(12, true) === 0x04030201, u = o => dv.getUint32(o, le);
      const fmt = u(28), width = u(36), height = Math.max(1, u(40)), depth = u(44), kvLen = u(60);
      let fi = -1, srgb = false;
      if (fmt >= 0x93B0 && fmt <= 0x93BD) fi = fmt - 0x93B0; else if (fmt >= 0x93D0 && fmt <= 0x93DD) { fi = fmt - 0x93D0; srgb = true; }
      if (fi < 0) throw new Error('KTX sin formato ASTC 2D (glInternalFormat 0x' + fmt.toString(16) + '): usa astcenc o toktx con ASTC');
      if (depth > 1) throw new Error('KTX 3D no soportado');
      const kv = keyValues(b, 64, kvLen, le);
      return { kind, width, height, depth: 1, bw: FOOT[fi][0], bh: FOOT[fi][1], offset: 64 + kvLen + 4, srgb, flipY: flipFrom(kv) };
    }
    const vk = dv.getUint32(12, true), width = dv.getUint32(20, true), height = Math.max(1, dv.getUint32(24, true)), depth = dv.getUint32(28, true), sc = dv.getUint32(44, true);
    if (vk >= 1000066000 && vk <= 1000066013) throw new Error('KTX2 con ASTC HDR (SFLOAT) no soportado: vuelve a exportar en LDR (astcenc -cl / -cs)');
    if (vk < 157 || vk > 184) throw new Error('KTX2 sin formato ASTC LDR (vkFormat ' + vk + ')');
    if (sc !== 0) throw new Error('KTX2 supercomprimido (' + (sc === 1 ? 'BasisLZ' : sc === 2 ? 'zstd' : 'esquema ' + sc) + ') no soportado: exporta sin supercompresión');
    if (depth > 1) throw new Error('KTX2 3D no soportado');
    const fi = (vk - 157) >> 1, kv = keyValues(b, dv.getUint32(56, true), dv.getUint32(60, true), true);
    return { kind, width, height, depth: 1, bw: FOOT[fi][0], bh: FOOT[fi][1], offset: Number(dv.getBigUint64(80, true)), srgb: ((vk - 157) & 1) === 1, flipY: flipFrom(kv) };
  }
  return { parse, sniff, decodeRows, scanHdr, FOOT, _t: { CUNQ, WUNQ, TRITS, QUINTS, blockMode, selectPartition } };
}

/* ---------- integración con el juego ----------
   v3.3.0: el resultado ya no es un <canvas> (putImageData en un lienzo enorme lo sacaba de la GPU y cada
   frame se volvía a subir → lag). Ahora se devuelve RGBA y js/texturas.js lo convierte en ImageBitmap
   (o lo sube comprimido directo a la GPU si el renderizador WebGL tiene WEBGL_compressed_texture_astc). */
const ASTC_ACCEPT = '.astc,.ktx,.ktx2';   // para los selectores de archivos
const ASTC = (() => {
  const core = ASTC_CORE();
  const stats = { n: 0, ms: 0, px: 0, gpu: 0, sw: 0, direct: 0, workers: 0, errors: [], last: null, notices: [] };
  const mode = (typeof params !== 'undefined' && params.get('astc')) || '';

  /* ---- Workers (código del núcleo + mensaje) ---- */
  let pool = null;
  function getPool() {
    if (pool !== null) return pool;
    pool = [];
    if (mode === 'main' || typeof Worker === 'undefined') return pool;
    try {
      const src = `const C=(${ASTC_CORE.toString()})();let cx=null;onmessage=e=>{const m=e.data;try{if(m.op==='scan'){postMessage({id:m.id,hdr:C.scanHdr(new Uint8Array(m.buf),0,m.n)});return;}const r=C.decodeRows(new Uint8Array(m.buf),0,m.bw,m.bh,m.width,m.height,0,m.nby,m.srgb,cx);cx=r.cx;postMessage({id:m.id,data:r.data,rows:r.rows,hdr:r.hdr,err:r.err},[r.data.buffer]);}catch(err){postMessage({id:m.id,error:String(err&&err.message||err)});}};`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
      for (let i = 0; i < n; i++) { const wk = new Worker(url); wk.busy = 0; wk.jobs = new Map(); wk.onmessage = e => { const j = wk.jobs.get(e.data.id); wk.jobs.delete(e.data.id); wk.busy--; if (j) (e.data.error ? j.bad(new Error(e.data.error)) : j.ok(e.data)); };
        wk.onerror = e => { e.preventDefault && e.preventDefault(); for (const j of wk.jobs.values()) j.bad(new Error('worker')); wk.jobs.clear(); wk.dead = true; }; pool.push(wk); }
      stats.workers = n;
    } catch (e) { pool = []; }
    return pool;
  }
  let jobId = 0;
  function runJob(msg, transfer) {
    const live = getPool().filter(w => !w.dead);
    if (!live.length) return Promise.reject(new Error('sin workers'));
    const wk = live.reduce((a, b) => (b.busy < a.busy ? b : a));
    return new Promise((ok, bad) => { const id = ++jobId; wk.busy++; wk.jobs.set(id, { ok, bad }); wk.postMessage(Object.assign(msg, { id }), transfer || []); });
  }
  const yieldTask = () => new Promise(ok => setTimeout(ok, 0));

  /* ---- hilo principal por partes (sin Workers): franjas de ~6 ms y se cede el hilo ---- */
  async function decodeMain(info, u8, out, acc) {
    const nby = Math.ceil(info.height / info.bh); let cx = null, by = 0, n = 1;
    while (by < nby) {
      const t0 = performance.now(), end = Math.min(nby, by + n);
      const r = core.decodeRows(u8, info.offset, info.bw, info.bh, info.width, info.height, by, end, info.srgb, cx); cx = r.cx;
      out.set(r.data, by * info.bh * info.width * 4); acc.hdr += r.hdr; acc.err += r.err;
      const dt = performance.now() - t0; n = Math.max(1, Math.floor((end - by) * 6 / Math.max(dt, 0.5))); by = end;
      if (by < nby) await yieldTask();
    }
  }
  async function decodeSoftware(info, buf, out, acc) {
    const nbx = Math.ceil(info.width / info.bw), nby = Math.ceil(info.height / info.bh), bytesRow = nbx * 16;
    const live = getPool().filter(w => !w.dead);
    if (!live.length) return decodeMain(info, new Uint8Array(buf), out, acc);
    // franjas: varias por worker para repartir la carga (las imágenes grandes van en paralelo)
    const px = info.width * info.height, parts = px < 300000 ? 1 : Math.min(nby, live.length * 3);
    const per = Math.ceil(nby / parts), jobs = [];
    for (let by = 0; by < nby; by += per) {
      const n = Math.min(per, nby - by), y = by * info.bh;
      const slice = buf.slice(info.offset + by * bytesRow, info.offset + (by + n) * bytesRow);
      // cada franja llega en su propia tarea (no se bloquea un frame copiando todo de golpe)
      jobs.push(runJob({ buf: slice, bw: info.bw, bh: info.bh, width: info.width, height: Math.min(info.height - y, n * info.bh), nby: n, srgb: info.srgb }, [slice])
        .then(r => { out.set(r.data, y * info.width * 4); acc.hdr += r.hdr; acc.err += r.err; }));
    }
    try { await Promise.all(jobs); }
    catch (e) { console.warn('[ASTC] worker falló, se decodifica en el hilo principal', e); for (const w of pool) w.dead = true; acc.hdr = acc.err = 0; return decodeMain(info, new Uint8Array(buf), out, acc); }
  }

  /* ---- GPU (WebGL2 + WEBGL_compressed_texture_astc) → readPixels: solo con la pantalla de carga ---- */
  let gpu = null;
  function getGpu() {
    if (gpu !== null) return gpu;
    gpu = false;
    if (mode === 'sw' || mode === 'main') return gpu;
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false });
      const ext = gl && gl.getExtension('WEBGL_compressed_texture_astc');
      if (!ext || (ext.getSupportedProfiles && !ext.getSupportedProfiles().includes('ldr'))) return gpu;
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;uniform highp sampler2D t;out vec4 o;void main(){o=texelFetch(t,ivec2(gl_FragCoord.xy),0);}'));
      gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return gpu;
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      // GPU emulada por CPU (SwiftShader): los Workers son más rápidos y exactos → solo con ?astc=gpu
      const dbg = gl.getExtension('WEBGL_debug_renderer_info'), renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      if (/swiftshader|llvmpipe|software/i.test(renderer) && mode !== 'gpu') return gpu;
      gpu = { gl, pr, renderer, max: Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)), verified: false };
    } catch (e) { gpu = false; }
    return gpu;
  }
  function decodeGpu(info, buf) {
    const g = getGpu(); if (!g || info.width > g.max || info.height > g.max) return null;
    const { gl } = g, fi = core.FOOT.findIndex(f => f[0] === info.bw && f[1] === info.bh); if (fi < 0) return null;
    const size = Math.ceil(info.width / info.bw) * Math.ceil(info.height / info.bh) * 16;
    const tex = gl.createTexture(), rt = gl.createTexture(), fb = gl.createFramebuffer();
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.compressedTexImage2D(gl.TEXTURE_2D, 0, 0x93B0 + fi, info.width, info.height, 0, new Uint8Array(buf, info.offset, size));
      gl.bindTexture(gl.TEXTURE_2D, rt); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, info.width, info.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
      gl.viewport(0, 0, info.width, info.height); gl.useProgram(g.pr);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gl.getUniformLocation(g.pr, 't'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Uint8ClampedArray(info.width * info.height * 4);
      gl.readPixels(0, 0, info.width, info.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (gl.getError() !== gl.NO_ERROR) return null;
      return px;
    } catch (e) { return null; }
    finally { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(tex); gl.deleteTexture(rt); }
  }

  /* volteo vertical por partes (KTXorientation T=u) */
  async function flipRows(out, w, h) {
    const row = w * 4, tmp = new Uint8ClampedArray(row);
    for (let y = 0; y < h >> 1; y++) {
      const a = y * row, b = (h - 1 - y) * row;
      tmp.set(out.subarray(a, a + row)); out.copyWithin(a, b, b + row); out.set(tmp, b);
      if ((y & 511) === 511) await yieldTask();
    }
  }
  function checkSize(buf, info) {
    if (!info.width || !info.height) throw new Error('tamaño 0');
    const need = info.offset + Math.ceil(info.width / info.bw) * Math.ceil(info.height / info.bh) * 16;
    if (buf.byteLength < need) throw new Error(`datos incompletos (${buf.byteLength} de ${need} bytes)`);
  }
  const hdrMsg = (name, n) => `${name}: ${n} bloque(s) ASTC HDR — el navegador no muestra HDR; vuelve a exportarla en LDR (astcenc -cl o -cs)`;
  const fail = (name, e) => {
    stats.errors.push(`${name}: ${e.message}`); console.warn('[ASTC]', name, e.message);
    if (typeof AssetLog !== 'undefined') AssetLog.set('astc-error', false, `ASTC sin mostrar (se usa la PNG si existe): ${stats.errors.slice(-3).join(' · ')}`);
  };
  const note = msg => { if (!stats.notices.includes(msg)) { stats.notices.push(msg); if (typeof toast === 'function') setTimeout(() => toast('⚠ ' + msg, 6000), 0); } };
  function logStats() {
    if (typeof AssetLog === 'undefined') return;
    AssetLog.set('astc', true, `ASTC: ${stats.n} textura(s) · ${stats.direct ? stats.direct + ' subida(s) comprimida(s) directo a la GPU (sin decodificar), ' : ''}${stats.gpu ? stats.gpu + ' por GPU, ' : ''}${stats.sw} por software${stats.workers ? ' (' + stats.workers + ' workers)' : ''} · ${Math.round(stats.ms)} ms sumando cada una`);
  }

  /* ArrayBuffer → { data RGBA (sin premultiplicar), width, height, via }. Lanza error si es HDR / no válido */
  async function decode(buf, name, opts = {}) {
    const t0 = performance.now(), info = core.parse(buf); checkSize(buf, info);
    const out = new Uint8ClampedArray(info.width * info.height * 4), acc = { hdr: 0, err: 0 };
    let via = 'software';
    // la lectura desde la GPU (readPixels) bloquea el hilo: solo mientras se ve la pantalla de carga
    const px = opts.force === 'sw' || !(opts.allowGpu || mode === 'gpu') ? null : decodeGpu(info, buf);
    if (px) {
      let ok = gpu.verified;
      if (!ok) {   // primera vez: comparar unas filas con el software (diferencia ≤ 1)
        const nb = Math.min(Math.ceil(info.height / info.bh), 2), r = core.decodeRows(new Uint8Array(buf), info.offset, info.bw, info.bh, info.width, info.height, 0, nb, info.srgb);
        let md = 0; for (let i = 0; i < r.data.length; i++) { const d = Math.abs(r.data[i] - px[i]); if (d > md) md = d; }
        ok = gpu.verified = md <= 1 && !r.hdr;
        if (!ok) { console.warn('[ASTC] la GPU no coincide con el decodificador (dif ' + md + '): se usa software'); gpu = false; }
      }
      if (ok) { out.set(px); via = 'GPU'; acc.hdr = core.scanHdr(new Uint8Array(buf), info.offset, Math.ceil(info.width / info.bw) * Math.ceil(info.height / info.bh)); }
    }
    if (via !== 'GPU') await decodeSoftware(info, buf, out, acc);
    if (acc.hdr) { const m = hdrMsg(name, acc.hdr); note(m); throw new Error(m); }
    if (acc.err) note(`${name}: ${acc.err} bloque(s) ASTC dañados o no válidos (se ven transparentes)`);
    if (info.flipY) await flipRows(out, info.width, info.height);
    const ms = performance.now() - t0;
    stats.n++; stats.ms += ms; stats.px += info.width * info.height; via === 'GPU' ? stats.gpu++ : stats.sw++;
    stats.last = { name, w: info.width, h: info.height, block: `${info.bw}x${info.bh}`, kind: info.kind, ms: Math.round(ms), via };
    logStats();
    return { data: out, width: info.width, height: info.height, via, info, ms };
  }
  /* ¿se puede subir comprimida tal cual? (revisión de bloques HDR en un worker) */
  async function hdrBlocks(buf, info) {
    const n = Math.ceil(info.width / info.bw) * Math.ceil(info.height / info.bh), slice = buf.slice(info.offset, info.offset + n * 16);
    try { return (await runJob({ op: 'scan', buf: slice, n }, [slice])).hdr; } catch (e) { return core.scanHdr(new Uint8Array(buf), info.offset, n); }
  }
  async function headOf(blob) { return new Uint8Array(await blob.slice(0, 16).arrayBuffer()); }
  return {
    core, stats, fail, note, hdrMsg, logStats, hdrBlocks,
    EXT: /\.(astc|ktx2?)$/i,
    isName: n => /\.(astc|ktx2?)$/i.test(String(n || '')),
    sniff: u8 => core.sniff(u8),
    parse: buf => { const info = core.parse(buf); checkSize(buf, info); return info; },
    async isBlob(blob) { try { return !!core.sniff(await headOf(blob)); } catch (e) { return false; } },
    decode,
    /* pruebas: RGBA exacto (sin premultiplicar) */
    async decodeRaw(buf, force) { const r = await decode(buf, 'prueba', { force, allowGpu: force === 'gpu' }); return { data: r.data, width: r.width, height: r.height, via: r.via, ms: r.ms }; },
    countDirect() { stats.direct++; stats.n++; logStats(); },
  };
})();
