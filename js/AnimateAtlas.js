// =====================================================================
// V0.8.2 — Adobe Animate Texture Atlas (Animation.json + spritemap)
// Lector y dibujante en <canvas> para el Visualizador de personajes.
//
// Soporta los dos formatos que exporta Animate / Better Texture Atlas:
//   - claves completas: ANIMATION, SYMBOL_DICTIONARY.Symbols, TIMELINE,
//     LAYERS, Frames, elements, SYMBOL_Instance, ATLAS_SPRITE_instance,
//     Matrix3D {m00..m33}, Matrix [a,b,c,d,tx,ty], ...
//   - claves cortas (optimizado): AN, SD.S, TL, L, FR, E, SI, ASI, M3D, MX, ...
// Las reglas siguen a flixel-animate (el que usa V-Slice):
//   - las capas se dibujan de la última a la primera, las capas máscara (Clp)
//     y carpeta (Fld) no se dibujan;
//   - el frame de un símbolo Graphic = FF + (frame - inicio del keyframe),
//     con loop "LP", "PO" (una vez) o "SF" (frame fijo); un MovieClip se
//     dibuja en su frame 0;
//   - M3D se pasa a 2D con [m0, m1, m4, m5, m12, m13];
//   - un sprite "rotated" del spritemap se dibuja girado -90°.
// Las animaciones del personaje se buscan como en V-Slice: por "frame label"
// (animType "framelabel", el normal) o por nombre de símbolo ("symbol").
// Este módulo NO toca el audio ni el reloj de la canción.
// =====================================================================

const ATLAS_PROFUNDIDAD_MAX = 32;

function atlasNum(v, porDefecto) {
    const n = Number(v);
    return Number.isFinite(n) ? n : porDefecto;
}

function atlasEsAnimationJson(data) {
    return !!(data && typeof data === "object" && !Array.isArray(data) && (data.AN || data.ANIMATION));
}

function atlasEsSpritemapJson(data) {
    const atlas = data && typeof data === "object" ? data.ATLAS : null;
    return !!(atlas && Array.isArray(atlas.SPRITES));
}

// Spritemap: { imagen: "spritemap1.png", sprites: [{ name, x, y, w, h, rot }] }
function atlasLeerSpritemap(data) {
    if (!atlasEsSpritemapJson(data)) throw new Error("El JSON no es un spritemap de Animate (falta ATLAS.SPRITES).");
    const sprites = [];
    data.ATLAS.SPRITES.forEach((s) => {
        const sp = s && (s.SPRITE || s);
        if (!sp || sp.name === undefined) return;
        const w = atlasNum(sp.w, 0);
        const h = atlasNum(sp.h, 0);
        if (w <= 0 || h <= 0) return;
        sprites.push({ name: String(sp.name), x: atlasNum(sp.x, 0), y: atlasNum(sp.y, 0), w, h, rot: sp.rotated === true || sp.rotated === "true" });
    });
    const meta = data.meta && typeof data.meta === "object" ? data.meta : {};
    return { imagen: String(meta.image || ""), sprites };
}

// ---------------------------------------------------------------------
// Matrices 2D [a, b, c, d, tx, ty] (x' = a x + c y + tx ; y' = b x + d y + ty)
// ---------------------------------------------------------------------

const ATLAS_IDENTIDAD = [1, 0, 0, 1, 0, 0];

function atlasMatriz3Da2D(m) {
    const v = m.map((n) => atlasNum(n, 0));
    const perspectiva = v[3] !== 0 || v[7] !== 0 || v[11] !== 0 || (v[15] !== 1 && v[15] !== 0);
    if (!perspectiva) return [v[0], v[1], v[4], v[5], v[12], v[13]];
    // Igual que flixel-animate: se proyectan 3 puntos y se arma la afín.
    const z = v[15] || 1;
    const p = [[0, 0], [1, 0], [0, 1]].map(([x, y]) => {
        const zz = v[3] * x + v[7] * y + z;
        return [(v[0] * x + v[4] * y + v[12]) / zz, (v[1] * x + v[5] * y + v[13]) / zz];
    });
    return [p[1][0] - p[0][0], p[1][1] - p[0][1], p[2][0] - p[0][0], p[2][1] - p[0][1], p[0][0], p[0][1]];
}

function atlasMatrizDe(obj) {
    if (!obj || typeof obj !== "object") return ATLAS_IDENTIDAD.slice();
    const m2 = obj.MX ?? obj.Matrix;
    if (Array.isArray(m2) && m2.length >= 6) return m2.slice(0, 6).map((n, i) => atlasNum(n, i === 0 || i === 3 ? 1 : 0));
    if (m2 && typeof m2 === "object" && "a" in m2) return [m2.a, m2.b, m2.c, m2.d, m2.tx, m2.ty].map((n, i) => atlasNum(n, i === 0 || i === 3 ? 1 : 0));
    const m3 = obj.M3D ?? obj.Matrix3D;
    if (Array.isArray(m3) && m3.length >= 16) return atlasMatriz3Da2D(m3);
    if (m3 && typeof m3 === "object") {
        const k = ["m00", "m01", "m02", "m03", "m10", "m11", "m12", "m13", "m20", "m21", "m22", "m23", "m30", "m31", "m32", "m33"];
        return atlasMatriz3Da2D(k.map((n, i) => (n in m3 ? m3[n] : (i % 5 === 0 ? 1 : 0))));
    }
    const pos = obj.POS ?? obj.Position; // atlas viejo (2018)
    if (pos && typeof pos === "object") return [1, 0, 0, 1, atlasNum(pos.x, 0), atlasNum(pos.y, 0)];
    return ATLAS_IDENTIDAD.slice();
}

function atlasMultiplicar(p, e) {
    return [
        p[0] * e[0] + p[2] * e[1],
        p[1] * e[0] + p[3] * e[1],
        p[0] * e[2] + p[2] * e[3],
        p[1] * e[2] + p[3] * e[3],
        p[0] * e[4] + p[2] * e[5] + p[4],
        p[1] * e[4] + p[3] * e[5] + p[5]
    ];
}

function atlasAlphaDeColor(c) {
    if (!c || typeof c !== "object") return 1;
    const modo = String(c.M ?? c.mode ?? "").toLowerCase();
    if (!["ca", "alpha", "ad", "advanced"].includes(modo)) return 1;
    const am = atlasNum(c.AM ?? c.alphaMultiplier, 1);
    const ao = atlasNum(c.AO ?? c.AlphaOffset ?? c.alphaOffset, 0);
    return Math.max(0, Math.min(1, am + ao / 255));
}

// ---------------------------------------------------------------------
// Lectura de Animation.json
// ---------------------------------------------------------------------

function atlasLoop(valor) {
    const v = String(valor ?? "LP").toLowerCase();
    if (v === "po" || v === "playonce" || v === "play_once") return "once";
    if (v === "sf" || v === "singleframe" || v === "single_frame") return "single";
    return "loop";
}

function atlasElemento(e, usados) {
    if (!e || typeof e !== "object") return null;
    const si = e.SI ?? e.SYMBOL_Instance;
    if (si && typeof si === "object") {
        const st = String(si.ST ?? si.symbolType ?? "G").toLowerCase();
        const bm = si.BM ?? si.bitmap; // atlas viejo: el bitmap va dentro del símbolo
        const elem = {
            tipo: "simbolo",
            sn: String(si.SN ?? si.SYMBOL_name ?? ""),
            ff: Math.max(0, Math.floor(atlasNum(si.FF ?? si.firstFrame, 0))),
            lf: Math.floor(atlasNum(si.LF ?? si.lastFrame, -1)),
            loop: atlasLoop(si.LP ?? si.loop),
            clip: st === "mc" || st === "movieclip" || st === "b" || st === "button",
            m: atlasMatrizDe(si),
            alpha: atlasAlphaDeColor(si.C ?? si.color)
        };
        if (bm && typeof bm === "object" && (bm.N ?? bm.name) !== undefined) {
            elem.bitmap = { nombre: String(bm.N ?? bm.name), m: atlasMatrizDe(bm) };
            if (usados) usados.add(elem.bitmap.nombre);
        }
        return elem;
    }
    const asi = e.ASI ?? e.ATLAS_SPRITE_instance;
    if (asi && typeof asi === "object") {
        const nombre = String(asi.N ?? asi.name ?? "");
        if (usados) usados.add(nombre);
        return { tipo: "sprite", nombre, m: atlasMatrizDe(asi) };
    }
    return null;
}

function atlasTimeline(tl, nombre, usados) {
    const timeline = { nombre: String(nombre || ""), capas: [], frameCount: 0 };
    const capasJson = tl && typeof tl === "object" ? (tl.L ?? tl.LAYERS) : null;
    if (!Array.isArray(capasJson)) return timeline;
    capasJson.forEach((cj, indice) => {
        if (!cj || typeof cj !== "object") return;
        const tipo = String(cj.LT ?? cj.Layer_type ?? "").toLowerCase();
        const clippedBy = cj.Clpb ?? cj.Clipped_by;
        const capa = {
            nombre: String(cj.LN ?? cj.Layer_name ?? `Capa ${indice + 1}`),
            tipo: clippedBy != null ? "recortada" : (tipo === "clp" || tipo === "clipper" ? "mascara" : (tipo === "fld" || tipo === "folder" ? "carpeta" : "normal")),
            mascara: clippedBy != null ? String(clippedBy) : null,
            visible: true,
            frames: [],
            en: [] // índice de frame -> keyframe
        };
        if (capa.tipo === "mascara" || capa.tipo === "carpeta") capa.visible = false;
        const framesJson = cj.FR ?? cj.Frames;
        if (capa.tipo !== "carpeta" && Array.isArray(framesJson)) {
            let siguiente = 0;
            framesJson.forEach((fj) => {
                if (!fj || typeof fj !== "object") return;
                const inicio = Math.max(0, Math.floor(atlasNum(fj.I ?? fj.index, siguiente)));
                const duracion = Math.max(1, Math.floor(atlasNum(fj.DU ?? fj.duration, 1)));
                const elementos = (Array.isArray(fj.E ?? fj.elements) ? (fj.E ?? fj.elements) : [])
                    .map((e) => atlasElemento(e, usados)).filter(Boolean);
                const frame = { inicio, duracion, nombre: String(fj.N ?? fj.name ?? "").replace(/\s+$/, ""), elementos };
                const k = capa.frames.push(frame) - 1;
                for (let i = 0; i < duracion; i++) capa.en[inicio + i] = k;
                siguiente = inicio + duracion;
                timeline.frameCount = Math.max(timeline.frameCount, inicio + duracion);
            });
        }
        timeline.capas.push(capa);
    });
    // Una capa recortada sin su máscara arriba no se dibuja (igual que flixel-animate).
    timeline.capas.forEach((capa, i) => {
        if (capa.tipo !== "recortada") return;
        const tieneMascara = timeline.capas.slice(0, i).some((c) => c.tipo === "mascara" && c.nombre === capa.mascara);
        if (!tieneMascara) capa.visible = false;
    });
    return timeline;
}

// Devuelve el modelo del Animation.json (sin imágenes).
function atlasParsearAnimacion(data) {
    if (!atlasEsAnimationJson(data)) throw new Error("El JSON no es un Animation.json de Animate (falta \"AN\" / \"ANIMATION\").");
    const an = data.AN ?? data.ANIMATION;
    const usados = new Set();
    const simbolos = new Map();
    const sd = data.SD ? data.SD.S : (data.SYMBOL_DICTIONARY ? data.SYMBOL_DICTIONARY.Symbols : null);
    if (Array.isArray(sd)) {
        sd.forEach((s) => {
            if (!s || typeof s !== "object") return;
            const sn = String(s.SN ?? s.SYMBOL_name ?? "");
            if (!sn) return;
            simbolos.set(sn, atlasTimeline(s.TL ?? s.TIMELINE, sn, usados));
        });
    }
    const nombre = String(an.SN ?? an.SYMBOL_name ?? an.N ?? an.name ?? "");
    const principal = atlasTimeline(an.TL ?? an.TIMELINE, nombre, usados);
    const md = data.MD ?? data.metadata ?? {};
    const fps = atlasNum(md.FRT ?? md.framerate, 24) || 24;
    if (!principal.capas.length && !simbolos.size) throw new Error("El Animation.json no tiene capas ni símbolos.");
    return { nombre, principal, simbolos, fps, spritesUsados: usados, sprites: new Map() };
}

// Agrega las piezas de un spritemap (con su imagen ya cargada) al modelo.
function atlasAgregarSpritemap(modelo, spritemap, img) {
    spritemap.sprites.forEach((s) => {
        modelo.sprites.set(s.name, { img, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot });
    });
}

function atlasSpritesFaltantes(modelo, nombresDisponibles) {
    const faltan = [];
    modelo.spritesUsados.forEach((n) => { if (!nombresDisponibles.has(n)) faltan.push(n); });
    return faltan;
}

// ---------------------------------------------------------------------
// Animaciones (frame label / símbolo)
// ---------------------------------------------------------------------

function atlasEtiquetaEnTimeline(timeline, etiqueta) {
    const buscada = String(etiqueta).replace(/\s+$/, "");
    for (const capa of timeline.capas) {
        const encontrados = [];
        capa.frames.forEach((f) => {
            if (f.nombre === buscada) for (let i = 0; i < f.duracion; i++) encontrados.push(f.inicio + i);
        });
        if (encontrados.length) return encontrados;
    }
    return null;
}

function atlasEtiquetas(modelo) {
    const lista = [];
    modelo.principal.capas.forEach((c) => c.frames.forEach((f) => { if (f.nombre && !lista.includes(f.nombre)) lista.push(f.nombre); }));
    return lista;
}

// anim: { prefijo, indices: [], animType: "framelabel" | "symbol" }
// -> { timeline, frames: [índices de la timeline], via: "label" | "simbolo" } o null
function atlasBuscarAnimacion(modelo, anim) {
    const prefijo = String(anim.prefijo ?? "");
    if (!prefijo) return null;
    const porSimbolo = () => {
        const tl = modelo.simbolos.get(prefijo);
        if (!tl || tl.frameCount <= 0) return null;
        return { timeline: tl, frames: Array.from({ length: tl.frameCount }, (_, i) => i), via: "simbolo" };
    };
    const porEtiqueta = () => {
        let frames = atlasEtiquetaEnTimeline(modelo.principal, prefijo);
        if (frames) return { timeline: modelo.principal, frames, via: "label" };
        // Igual que flixel-animate con colecciones: se busca también en otras timelines.
        for (const tl of modelo.simbolos.values()) {
            frames = atlasEtiquetaEnTimeline(tl, prefijo);
            if (frames) return { timeline: tl, frames, via: "label" };
        }
        return null;
    };
    const tipo = String(anim.animType || "framelabel").toLowerCase();
    let r = tipo === "symbol" ? (porSimbolo() || porEtiqueta()) : (porEtiqueta() || porSimbolo());
    if (!r) return null;
    const indices = Array.isArray(anim.indices) ? anim.indices : [];
    if (indices.length) {
        const elegidos = indices.map((i) => r.frames[i]).filter((f) => f !== undefined);
        if (!elegidos.length) return null;
        r = Object.assign({}, r, { frames: elegidos });
    }
    return r;
}

// ---------------------------------------------------------------------
// Frame de un símbolo (FlxAnimate SymbolInstance.getFrameIndex)
// ---------------------------------------------------------------------

function atlasWrap(valor, min, max) {
    const rango = max - min + 1;
    if (rango <= 0) return min;
    if (valor < min) valor += rango * Math.floor((min - valor) / rango + 1);
    return min + ((valor - min) % rango);
}

function atlasIndiceSimbolo(el, frameCount, relativo) {
    if (el.clip) return 0;
    const ff = el.ff;
    let fi = ff + relativo;
    const ultimo = frameCount - 1;
    const hayUltimo = el.lf > -1;
    const envuelve = hayUltimo && el.lf < ff;
    const largo = (envuelve ? ultimo : (hayUltimo ? Math.min(el.lf, ultimo) : ultimo)) - ff + 1;
    const total = envuelve ? largo + (el.lf + 1) : largo;
    if (el.loop === "single") return ff;
    if (el.loop === "loop") {
        if (envuelve) fi = (((fi - ff) % total) + total) % total;
        else if (hayUltimo) return atlasWrap(fi, ff, Math.min(el.lf, ultimo));
        else return atlasWrap(fi, 0, ultimo);
    } else {
        fi = Math.min(fi - ff, total - 1);
    }
    if (fi < largo) return ff + fi;
    if (envuelve) return fi - largo;
    return -1 + (fi - largo);
}

// ---------------------------------------------------------------------
// Recorrido (dibujo y bounds comparten el mismo recorrido)
// ---------------------------------------------------------------------

// visitar(sprite, matriz, alpha) para cada pieza visible.
function atlasRecorrer(modelo, timeline, frame, matriz, alpha, visitar, profundidad) {
    if (!timeline || profundidad > ATLAS_PROFUNDIDAD_MAX || frame < 0) return;
    for (let i = timeline.capas.length - 1; i >= 0; i--) {
        const capa = timeline.capas[i];
        if (!capa.visible) continue;
        const k = capa.en[frame];
        if (k === undefined) continue;
        const kf = capa.frames[k];
        for (const el of kf.elementos) {
            const m = atlasMultiplicar(matriz, el.m);
            if (el.tipo === "sprite") {
                const sp = modelo.sprites.get(el.nombre);
                if (sp) visitar(sp, m, alpha);
                continue;
            }
            const a = alpha * (el.alpha ?? 1);
            if (a <= 0) continue;
            if (el.bitmap) {
                const sp = modelo.sprites.get(el.bitmap.nombre);
                if (sp) visitar(sp, atlasMultiplicar(m, el.bitmap.m), a);
            }
            const sub = modelo.simbolos.get(el.sn);
            if (!sub || sub.frameCount <= 0) continue;
            atlasRecorrer(modelo, sub, atlasIndiceSimbolo(el, sub.frameCount, frame - kf.inicio), m, a, visitar, profundidad + 1);
        }
    }
}

// Matriz local de la pieza: tamaño visible (girada -90° si viene "rotated").
function atlasMatrizPieza(sp) {
    // rotated: (x, y) del recorte -> (y, w - x)
    return sp.rot ? [0, -1, 1, 0, 0, sp.w] : ATLAS_IDENTIDAD;
}

function atlasBounds(modelo, timeline, frame) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    atlasRecorrer(modelo, timeline, frame, ATLAS_IDENTIDAD, 1, (sp, m) => {
        const t = atlasMultiplicar(m, atlasMatrizPieza(sp));
        [[0, 0], [sp.w, 0], [0, sp.h], [sp.w, sp.h]].forEach(([x, y]) => {
            const px = t[0] * x + t[2] * y + t[4];
            const py = t[1] * x + t[3] * y + t[5];
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
        });
    }, 0);
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// base: matriz [a,b,c,d,tx,ty] del lienzo (mundo -> canvas, ya con flip/escala/offsets).
function atlasDibujar(ctx, modelo, timeline, frame, base) {
    let piezas = 0;
    const alphaPrevio = ctx.globalAlpha;
    atlasRecorrer(modelo, timeline, frame, base, 1, (sp, m, alpha) => {
        const t = atlasMultiplicar(m, atlasMatrizPieza(sp));
        ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
        ctx.globalAlpha = alphaPrevio * alpha;
        ctx.drawImage(sp.img, sp.x, sp.y, sp.w, sp.h, 0, 0, sp.w, sp.h);
        piezas++;
    }, 0);
    ctx.globalAlpha = alphaPrevio;
    return piezas;
}

try {
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { atlasEsAnimationJson, atlasEsSpritemapJson, atlasLeerSpritemap, atlasParsearAnimacion, atlasAgregarSpritemap,
            atlasSpritesFaltantes, atlasBuscarAnimacion, atlasIndiceSimbolo, atlasBounds, atlasDibujar, atlasMatrizDe, atlasMultiplicar, atlasEtiquetas, atlasRecorrer };
    }
} catch (e) { }
