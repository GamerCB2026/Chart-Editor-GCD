// =====================================================================
// V0.8.2 "Event Update" — WINDOWS > Visualizar personajes
// Dos ventanas (Opponent y Player) que se abren y cierran juntas, se mueven
// arrastrando su barra y se redimensionan desde la esquina.
//
// "Importar personaje" pide primero el Personaje.json (V-Slice o Psych) y,
// según su "renderType", los archivos del dibujo:
//   - sparrow ............ Personaje.xml + Personaje.png (como antes)
//   - multisparrow ....... el XML + PNG principal y luego los pares extra
//                          que piden las animaciones con su propio assetPath
//   - animateatlas ....... Animation.json + spritemap1.json + spritemap1.png
//                          (uno o varios spritemaps) — js/AnimateAtlas.js
//   - multianimateatlas .. el atlas principal y luego los atlas / sparrow
//                          extra de las animaciones con otro assetPath
// También se pueden elegir varios archivos a la vez (se ordenan solos).
//
// El dibujo usa un <canvas> por ventana con su propio requestAnimationFrame.
// Este módulo SOLO LEE el reloj de la canción (getMasterSongTime / isPlaying):
// nunca toca el audio, el scroll ni hace seek.
// =====================================================================

const VENTANAS_PERSONAJES = ["char-window-opponent", "char-window-player"];
const LADOS_PERSONAJE = ["opponent", "player"];
const DIRECCIONES_CANTO = ["singLEFT", "singDOWN", "singUP", "singRIGHT"]; // orden de carriles
const NOMBRE_LADO = { opponent: "Opponent", player: "Player" };
const ACCEPT_PERSONAJE = {
    json: ".json,.xml,.png,.astc,.ktx,.ktx2,application/json,text/xml,image/png",
    xml: ".xml,text/xml,application/xml",
    png: ".png,.astc,.ktx,.ktx2,image/png",
    atlas: ".json,.png,.astc,.ktx,.ktx2,application/json,image/png",
    extra: ".json,.xml,.png,.astc,.ktx,.ktx2,application/json,text/xml,application/xml,image/png"
};
// Pasos de cada flujo (índice 1 = JSON). PASOS_IMPORTAR se conserva (sparrow).
const PASOS_FLUJO = {
    sparrow: [null,
        { tipo: "json", titulo: "JSON", texto: "Paso 1/3: JSON del personaje" },
        { tipo: "xml", titulo: "XML", texto: "Paso 2/3: XML (atlas Sparrow)" },
        { tipo: "png", titulo: "PNG", texto: "Paso 3/3: PNG (hoja de sprites)" }],
    multisparrow: [null,
        { tipo: "json", titulo: "JSON", texto: "Paso 1/4: JSON del personaje" },
        { tipo: "xml", titulo: "XML", texto: "Paso 2/4: XML principal (Sparrow)" },
        { tipo: "png", titulo: "PNG", texto: "Paso 3/4: PNG principal" },
        { tipo: "extra", titulo: "EXTRA", texto: "Paso 4/4: XML + PNG extra (multisparrow)" }],
    atlas: [null,
        { tipo: "json", titulo: "JSON", texto: "Paso 1/2: JSON del personaje" },
        { tipo: "atlas", titulo: "ATLAS", texto: "Paso 2/2: Animate Atlas (Animation.json + spritemap)" }],
    multiatlas: [null,
        { tipo: "json", titulo: "JSON", texto: "Paso 1/3: JSON del personaje" },
        { tipo: "atlas", titulo: "ATLAS", texto: "Paso 2/3: Animate Atlas principal" },
        { tipo: "extra", titulo: "EXTRA", texto: "Paso 3/3: Atlas extra (multianimateatlas)" }]
};
PASOS_FLUJO.sparrow.forEach((p) => { if (p) p.accept = ACCEPT_PERSONAJE[p.tipo]; });
Object.values(PASOS_FLUJO).forEach((lista) => lista.forEach((p) => { if (p) p.accept = ACCEPT_PERSONAJE[p.tipo]; }));
const PASOS_IMPORTAR = PASOS_FLUJO.sparrow;
const RENDER_TYPES_PERSONAJE = ["sparrow", "multisparrow", "animateatlas", "multianimateatlas"];

function pasosImportacion(imp) {
    return PASOS_FLUJO[(imp && imp.flujo) || "sparrow"] || PASOS_IMPORTAR;
}

function pasoActualImportacion(imp) {
    const pasos = pasosImportacion(imp);
    return pasos[Math.min(pasos.length - 1, Math.max(1, imp ? imp.paso : 1))];
}

let visualizarPersonajesActivo = false;

function crearEstadoLadoPersonaje() {
    return {
        personaje: null,      // personaje listo para dibujar
        importacion: null,    // importación en curso (pasos 1-3)
        anim: null,           // nombre de la animación actual
        animTiempo: 0,        // segundos desde que empezó la animación actual
        cantando: false,
        terminando: false,    // reproduciendo un "-end"
        holdTimer: 0,
        sostenerHasta: -1,    // fin del sustain (tiempo de canción)
        hasDanced: false,
        ultimoIndiceBaile: null,
        previewHasta: 0,
        flipUsuario: false,
        vista: null,
        dibujoClave: ""
    };
}

const personajesGCD = {
    opponent: crearEstadoLadoPersonaje(),
    player: crearEstadoLadoPersonaje()
};

function ventanasPersonajesAbiertas() {
    return visualizarPersonajesActivo;
}

// ---------------------------------------------------------------------
// Ventanas: abrir / cerrar / mover / redimensionar
// ---------------------------------------------------------------------

function limitarVentanaPersonajeAlViewport(ventana) {
    if (!ventana) return;
    const margen = 4;
    // Si la ventana es más grande que la pantalla (tras redimensionar), se ajusta.
    if (ventana.offsetWidth > window.innerWidth - margen * 2) ventana.style.width = `${Math.max(150, window.innerWidth - margen * 2)}px`;
    if (ventana.offsetHeight > window.innerHeight - margen * 2) ventana.style.height = `${Math.max(130, window.innerHeight - margen * 2)}px`;
    const ancho = ventana.offsetWidth || 250;
    const alto = ventana.offsetHeight || 280;
    const maxX = Math.max(margen, window.innerWidth - ancho - margen);
    const maxY = Math.max(margen, window.innerHeight - alto - margen);
    const x = Math.min(maxX, Math.max(margen, parseFloat(ventana.style.left) || 0));
    const y = Math.min(maxY, Math.max(margen, parseFloat(ventana.style.top) || 0));
    ventana.style.left = `${x}px`;
    ventana.style.top = `${y}px`;
}

function posicionInicialVentanasPersonajes() {
    const opp = document.getElementById("char-window-opponent");
    const ply = document.getElementById("char-window-player");
    if (!opp || !ply) return;
    const ancho = opp.offsetWidth || 250;
    const centro = window.innerWidth / 2;
    const separacion = 12;
    const top = Math.min(90, Math.max(40, window.innerHeight * 0.12));
    if (!opp.dataset.posicionada) {
        opp.style.left = `${centro - ancho - separacion}px`;
        opp.style.top = `${top}px`;
        opp.dataset.posicionada = "1";
    }
    if (!ply.dataset.posicionada) {
        ply.style.left = `${centro + separacion}px`;
        ply.style.top = `${top}px`;
        ply.dataset.posicionada = "1";
    }
    limitarVentanaPersonajeAlViewport(opp);
    limitarVentanaPersonajeAlViewport(ply);
}

function abrirVisualizarPersonajes() {
    visualizarPersonajesActivo = true;
    VENTANAS_PERSONAJES.forEach((id) => {
        const v = document.getElementById(id);
        if (!v) return;
        v.classList.add("active");
        v.setAttribute("aria-hidden", "false");
    });
    posicionInicialVentanasPersonajes();
    actualizarMenuVisualizarPersonajes();
    LADOS_PERSONAJE.forEach((lado) => { ajustarCanvasPersonaje(lado); personajesGCD[lado].dibujoClave = ""; });
    iniciarBuclePersonajes();
}

// Cerrar una cierra las dos.
function cerrarVisualizarPersonajes() {
    visualizarPersonajesActivo = false;
    VENTANAS_PERSONAJES.forEach((id) => {
        const v = document.getElementById(id);
        if (!v) return;
        v.classList.remove("active");
        v.setAttribute("aria-hidden", "true");
    });
    actualizarMenuVisualizarPersonajes();
    detenerBuclePersonajes();
}

function alternarVisualizarPersonajes() {
    document.getElementById("menu-windows-wrapper")?.classList.remove("open");
    if (visualizarPersonajesActivo) cerrarVisualizarPersonajes();
    else abrirVisualizarPersonajes();
}

function actualizarMenuVisualizarPersonajes() {
    const item = document.getElementById("menu-item-visualizar-personajes");
    if (item) item.classList.toggle("checked", visualizarPersonajesActivo);
}

function hacerVentanaPersonajeMovible(id) {
    const ventana = document.getElementById(id);
    const cabecera = ventana?.querySelector(".char-preview-header");
    if (!ventana || !cabecera) return;
    let arrastrando = false;
    let offsetX = 0;
    let offsetY = 0;
    const traerAlFrente = () => {
        VENTANAS_PERSONAJES.forEach((otra) => document.getElementById(otra)?.classList.remove("on-top"));
        ventana.classList.add("on-top");
    };
    ventana.addEventListener("pointerdown", traerAlFrente);
    cabecera.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const rect = ventana.getBoundingClientRect();
        arrastrando = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        ventana.classList.add("dragging");
        traerAlFrente();
        try { cabecera.setPointerCapture(event.pointerId); } catch (e) { }
        event.preventDefault();
    });
    cabecera.addEventListener("pointermove", (event) => {
        if (!arrastrando) return;
        ventana.style.left = `${event.clientX - offsetX}px`;
        ventana.style.top = `${event.clientY - offsetY}px`;
        limitarVentanaPersonajeAlViewport(ventana);
    });
    const soltar = () => {
        arrastrando = false;
        ventana.classList.remove("dragging");
    };
    cabecera.addEventListener("pointerup", soltar);
    cabecera.addEventListener("pointercancel", soltar);
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

function avisoPersonaje(mensaje) {
    if (typeof mostrarToastGCD === "function") mostrarToastGCD(mensaje);
}

function numeroSeguro(valor, porDefecto) {
    const n = parseFloat(valor);
    return Number.isFinite(n) ? n : porDefecto;
}

function parOffsets(valor) {
    if (Array.isArray(valor)) return [numeroSeguro(valor[0], 0), numeroSeguro(valor[1], 0)];
    if (valor && typeof valor === "object") return [numeroSeguro(valor.x, 0), numeroSeguro(valor.y, 0)];
    return [0, 0];
}

function extensionArchivo(nombre) {
    const m = /\.([a-z0-9]+)$/i.exec(String(nombre || ""));
    return m ? m[1].toLowerCase() : "";
}

function tipoArchivoPersonaje(archivo) {
    const ext = extensionArchivo(archivo.name);
    if (ext === "json") return "json";
    if (ext === "xml") return "xml";
    if (["png", "webp", "jpg", "jpeg", "astc", "ktx", "ktx2"].includes(ext)) return "png";
    const mime = String(archivo.type || "");
    if (mime.includes("json")) return "json";
    if (mime.includes("xml")) return "xml";
    if (mime.startsWith("image/")) return "png";
    return "";
}

function escaparHTMLPersonaje(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}


// ---------------------------------------------------------------------
// Lectura de archivos: JSON (V-Slice / Psych), XML Sparrow, PNG y Animate Atlas
// ---------------------------------------------------------------------

// "shared:characters/bf-death" -> "characters/bf-death"
function rutaBaseFuente(ruta) {
    return String(ruta || "").trim().replace(/^[a-z0-9_-]+:(?!\/)/i, "").replace(/\\/g, "/").replace(/\.(xml|png|astc|ktx2?|json)$/i, "").replace(/\/+$/, "");
}

function claveFuente(ruta) {
    return rutaBaseFuente(ruta).toLowerCase();
}

function nombreCortoFuente(ruta) {
    const r = rutaBaseFuente(ruta);
    return r.split("/").filter(Boolean).pop() || r;
}

// Devuelve una descripción normalizada del personaje o lanza Error con mensaje en español.
function normalizarJsonPersonaje(data, nombreArchivo) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("El JSON no describe un personaje de FNF.");
    }
    const anims = Array.isArray(data.animations) ? data.animations : null;
    if (!anims || anims.length === 0) {
        throw new Error("El JSON no tiene \"animations\". ¿Es el .json del personaje?");
    }
    const nombreBase = String(nombreArchivo || "personaje").replace(/\.[^.]+$/, "");

    // V0.8.2n: Codename Engine (.xml, convertido en clasificarArchivosPersonaje).
    if (data.__formatoGCD === "codename") {
        const lista = anims.map((a) => ({
            nombre: a.name, prefijo: a.anim, indices: a.indices, fps: numeroSeguro(a.fps, 24), loop: !!a.loop,
            offsets: [numeroSeguro(a.x, 0), numeroSeguro(a.y, 0)], flipX: false, assetPath: null, renderType: null, animType: "symbol"
        })).filter((a) => a.nombre && a.prefijo);
        if (!lista.length) throw new Error("El XML de Codename no tiene <anim> con name y anim.");
        const sprite = String(data.sprite || nombreBase);
        return {
            formato: "codename",
            nombre: String(data.nombre || nombreBase),
            renderType: "sparrow",
            imagen: sprite.includes("/") ? sprite : "characters/" + sprite,
            imagenes: [sprite.includes("/") ? sprite : "characters/" + sprite],
            escala: numeroSeguro(data.scale, 1) || 1,
            flipX: !!data.flipX,
            isPixel: data.antialiasing === false,
            danceEvery: lista.some((a) => a.nombre === "danceLeft") ? 1 : 2,
            singTime: numeroSeguro(data.holdTime, 4),
            animInicial: "idle",
            offsetsEscalados: false, // Codename: offsets en píxeles de pantalla
            animaciones: lista
        };
    }

    // V0.8.2n: Kade Engine (1.8): "asset" en lugar de "assetPath"/"image", offsets en píxeles.
    const esKade = typeof data.asset === "string" && !("assetPath" in data) && !("image" in data) && !anims.some((a) => a && typeof a === "object" && "anim" in a);
    if (esKade) {
        const lista = anims.filter((a) => a && typeof a === "object" && a.name).map((a) => ({
            nombre: String(a.name),
            prefijo: String(a.prefix ?? a.name),
            indices: Array.isArray(a.frameIndices) ? a.frameIndices.map((n) => parseInt(n, 10)).filter(Number.isFinite) : [],
            fps: numeroSeguro(a.frameRate, 24),
            loop: !!a.looped,
            offsets: parOffsets(a.offsets),
            flipX: !!a.flipX,
            assetPath: null, renderType: null, animType: "symbol"
        }));
        if (!lista.length) throw new Error("Las animaciones del JSON de Kade no tienen \"name\".");
        return {
            formato: "kade",
            nombre: String(data.name || nombreBase),
            renderType: data.usePackerAtlas ? "packer" : "sparrow",
            imagen: String(data.asset || ""),
            imagenes: [String(data.asset || "")],
            escala: numeroSeguro(data.scale, 1) || 1,
            flipX: !!data.flipX,
            isPixel: data.antialiasing === false,
            danceEvery: lista.some((a) => a.nombre === "danceLeft") ? 1 : 2,
            singTime: numeroSeguro(data.holdLength, 4),
            animInicial: String(data.startingAnim || "idle"),
            offsetsEscalados: false,
            animaciones: lista
        };
    }

    const esPsych = anims.some((a) => a && typeof a === "object" && "anim" in a) || (typeof data.image === "string" && !("renderType" in data));

    if (esPsych) {
        const lista = anims.filter((a) => a && typeof a === "object" && (a.anim || a.name)).map((a) => ({
            nombre: String(a.anim || a.name),
            prefijo: String(a.name ?? a.anim ?? ""),
            indices: Array.isArray(a.indices) ? a.indices.map((n) => parseInt(n, 10)).filter(Number.isFinite) : [],
            fps: numeroSeguro(a.fps, 24),
            loop: !!a.loop,
            offsets: parOffsets(a.offsets),
            flipX: false,
            assetPath: null,
            renderType: null,
            animType: "symbol" // Psych usa addBySymbol en los atlas
        }));
        const tieneDanceLeft = lista.some((a) => a.nombre === "danceLeft");
        // Psych 0.7+: "image" puede traer varias hojas separadas por comas (multiatlas).
        const imagenes = String(data.image || "").split(",").map((s) => s.trim()).filter(Boolean);
        return {
            formato: "psych",
            nombre: nombreBase,
            renderType: imagenes.length > 1 ? "multisparrow" : "sparrow",
            imagen: imagenes[0] || "",
            imagenes,
            escala: numeroSeguro(data.scale, 1) || 1,
            flipX: !!data.flip_x,
            isPixel: !!data.no_antialiasing,
            danceEvery: tieneDanceLeft ? 1 : 2,
            singTime: numeroSeguro(data.sing_duration, 4),
            animInicial: "idle",
            offsetsEscalados: false, // Psych: offsets en píxeles de pantalla
            animaciones: lista
        };
    }

    const renderType = String(data.renderType || "sparrow").toLowerCase();
    const lista = anims.filter((a) => a && typeof a === "object" && a.name).map((a) => ({
        nombre: String(a.name),
        prefijo: String(a.prefix ?? a.name),
        indices: Array.isArray(a.frameIndices) ? a.frameIndices.map((n) => parseInt(n, 10)).filter(Number.isFinite) : [],
        fps: numeroSeguro(a.frameRate, 24),
        loop: !!a.looped,
        offsets: parOffsets(a.offsets),
        flipX: !!a.flipX,
        assetPath: typeof a.assetPath === "string" && a.assetPath.trim() ? a.assetPath.trim() : null,
        renderType: typeof a.renderType === "string" ? a.renderType.toLowerCase() : null,
        animType: typeof a.animType === "string" ? a.animType.toLowerCase() : "framelabel"
    }));
    if (lista.length === 0) throw new Error("Las animaciones del JSON no tienen \"name\".");
    return {
        formato: "vslice",
        nombre: String(data.name || nombreBase),
        renderType,
        imagen: String(data.assetPath || ""),
        imagenes: [String(data.assetPath || "")],
        escala: numeroSeguro(data.scale, 1) || 1,
        flipX: !!data.flipX,
        isPixel: !!data.isPixel,
        danceEvery: numeroSeguro(data.danceEvery, 1),
        singTime: numeroSeguro(data.singTime, 8),
        animInicial: String(data.startingAnimation || "idle"),
        offsetsEscalados: true, // V-Slice: offsets * scale (Bopper.getScreenPosition)
        animaciones: lista
    };
}

// Fuentes de dibujo del personaje: la principal (assetPath / image) y las extra
// que piden las animaciones con su propio assetPath (multisparrow / multianimateatlas).
function fuentesDePersonaje(desc) {
    const rt = desc.renderType;
    const principalEsAtlas = rt === "animateatlas" || rt === "multianimateatlas";
    const multi = rt === "multisparrow" || rt === "multianimateatlas";
    const fuentes = [];
    const agregar = (ruta, tipo, principal) => {
        const clave = claveFuente(ruta) || (principal ? "__principal" : "");
        if (!clave) return null;
        let f = fuentes.find((x) => x.clave === clave);
        if (!f) {
            f = { clave, ruta: String(ruta || ""), nombre: nombreCortoFuente(ruta) || desc.nombre, tipo, principal: !!principal };
            fuentes.push(f);
        }
        return f;
    };
    const principal = agregar((desc.imagenes && desc.imagenes[0]) || desc.imagen, principalEsAtlas ? "atlas" : "sparrow", true);
    (desc.imagenes || []).slice(1).forEach((r) => agregar(r, "sparrow", false));
    desc.animaciones.forEach((a) => {
        a.fuente = principal.clave;
        if (!multi || !a.assetPath) return;
        const tipo = a.renderType
            ? (a.renderType.includes("atlas") ? "atlas" : "sparrow")
            : (rt === "multisparrow" ? "sparrow" : "atlas");
        const f = agregar(a.assetPath, tipo, false);
        if (f) a.fuente = f.clave;
    });
    return fuentes;
}

function nuevosDatosFuente(tipo) {
    return tipo === "atlas" ? { animacion: null, spritemaps: [], pngs: [] } : { xml: null, png: null };
}

function prepararFuentesImport(imp, desc) {
    imp.desc = desc;
    imp.fuentes = fuentesDePersonaje(desc);
    imp.datos = {};
    imp.fuentes.forEach((f) => { imp.datos[f.clave] = nuevosDatosFuente(f.tipo); });
    recalcularFlujoImport(imp);
}

function recalcularFlujoImport(imp) {
    const principal = imp.fuentes[0];
    const varias = imp.fuentes.length > 1;
    imp.flujo = principal.tipo === "atlas" ? (varias ? "multiatlas" : "atlas") : (varias ? "multisparrow" : "sparrow");
}

function animacionesDeFuente(imp, fuente) {
    const propias = imp.desc.animaciones.filter((a) => a.fuente === fuente.clave);
    return propias.length ? propias : imp.desc.animaciones;
}

function leerAtlasSparrow(texto) {
    let doc;
    try {
        doc = new DOMParser().parseFromString(texto, "text/xml");
    } catch (e) {
        throw new Error("No se pudo leer el XML.");
    }
    if (!doc || doc.getElementsByTagName("parsererror").length) {
        throw new Error("El XML no es válido (está dañado o no es un XML).");
    }
    const nodos = Array.from(doc.getElementsByTagName("SubTexture"));
    if (nodos.length === 0) {
        throw new Error("El XML no tiene SubTexture: no es un atlas Sparrow.");
    }
    const frames = [];
    nodos.forEach((n, orden) => {
        const nombre = n.getAttribute("name") || "";
        const x = numeroSeguro(n.getAttribute("x"), 0);
        const y = numeroSeguro(n.getAttribute("y"), 0);
        const w = numeroSeguro(n.getAttribute("width"), 0);
        const h = numeroSeguro(n.getAttribute("height"), 0);
        if (w <= 0 || h <= 0) return;
        const rot = n.getAttribute("rotated") === "true";
        // Tamaño visible (rotated = guardado girado 90° en el atlas).
        const dw = rot ? h : w;
        const dh = rot ? w : h;
        const recortado = n.hasAttribute("frameX");
        const offX = recortado ? -numeroSeguro(n.getAttribute("frameX"), 0) : 0;
        const offY = recortado ? -numeroSeguro(n.getAttribute("frameY"), 0) : 0;
        let fw = recortado ? numeroSeguro(n.getAttribute("frameWidth"), dw) : dw;
        let fh = recortado ? numeroSeguro(n.getAttribute("frameHeight"), dh) : dh;
        if (fw <= 0) fw = dw;
        if (fh <= 0) fh = dh;
        const m = /(\d+)(?:\.(?:png|astc))?$/i.exec(nombre);
        frames.push({ nombre, x, y, w, h, rot, dw, dh, offX, offY, fw, fh, num: m ? parseInt(m[1], 10) : -1, orden });
    });
    if (frames.length === 0) throw new Error("Los SubTexture del XML no tienen tamaño.");
    const raiz = doc.documentElement;
    return { frames, imagePath: raiz ? (raiz.getAttribute("imagePath") || "") : "" };
}

// Frames de una animación: SubTextures cuyo nombre empieza con el prefijo,
// ordenados por su número final (como addByPrefix / addByIndices de Flixel).
function framesDeAnimacion(atlas, anim) {
    const coinciden = atlas.frames.filter((f) => f.nombre.startsWith(anim.prefijo));
    coinciden.sort((a, b) => (a.num - b.num) || (a.orden - b.orden));
    if (!anim.indices.length) return coinciden;
    const resultado = [];
    anim.indices.forEach((i) => {
        const porNumero = coinciden.find((f) => f.num === i);
        const frame = porNumero || coinciden[i];
        if (frame) resultado.push(frame);
    });
    return resultado;
}

function cargarImagenPersonaje(archivo) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(archivo);
        const img = new Image();
        img.onload = () => {
            if (!img.naturalWidth || !img.naturalHeight) {
                URL.revokeObjectURL(url);
                reject(new Error("La imagen está vacía."));
                return;
            }
            resolve({ img, url });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("No se pudo abrir la imagen. ¿Es un .png válido?"));
        };
        img.src = url;
    });
}


// Une JSON + recursos de cada fuente en un personaje listo para dibujar.
// recursos[clave] = { tipo: "sparrow", atlas, img } | { tipo: "atlas", modelo }
function construirPersonaje(desc, recursos) {
    const animaciones = new Map();
    const faltantes = [];
    const factor = desc.offsetsEscalados ? desc.escala : 1;
    // Los frames Sparrow de todas las hojas juntas (V-Slice combina las hojas de un multisparrow).
    const combinados = { frames: [] };
    Object.keys(recursos).forEach((clave) => {
        const r = recursos[clave];
        if (r.tipo !== "sparrow") return;
        const desde = combinados.frames.length;
        r.conImg = { frames: r.atlas.frames.map((f) => Object.assign({}, f, { img: r.img, orden: desde + f.orden })) };
        combinados.frames.push(...r.conImg.frames);
    });
    desc.animaciones.forEach((a) => {
        const r = recursos[a.fuente];
        const base = {
            nombre: a.nombre,
            fps: a.fps > 0 ? a.fps : 24,
            loop: a.loop,
            off: [a.offsets[0] * factor, a.offsets[1] * factor],
            flipX: a.flipX
        };
        if (r && r.tipo === "atlas") {
            const hallada = atlasBuscarAnimacion(r.modelo, a);
            if (hallada && hallada.frames.length) {
                animaciones.set(a.nombre, Object.assign(base, { tipo: "atlas", modelo: r.modelo, timeline: hallada.timeline, frames: hallada.frames, bounds: [] }));
                return;
            }
        } else if (r && r.tipo === "sparrow") {
            let frames = framesDeAnimacion(r.conImg, a);
            if (!frames.length) frames = framesDeAnimacion(combinados, a);
            if (frames.length) {
                animaciones.set(a.nombre, Object.assign(base, { tipo: "sparrow", frames }));
                return;
            }
        }
        faltantes.push(a.nombre);
    });
    const principal = Object.values(recursos).find((r) => r.tipo === "sparrow") || null;
    const tipos = new Set(Object.values(recursos).map((r) => r.tipo));
    const personaje = {
        nombre: desc.nombre,
        formato: desc.formato,
        renderType: desc.renderType,
        render: tipos.size > 1 ? "mixto" : (tipos.has("atlas") ? "atlas" : "sparrow"),
        escala: desc.escala,
        flipX: desc.flipX,
        isPixel: desc.isPixel,
        danceEvery: desc.danceEvery,
        singTime: desc.singTime > 0 ? desc.singTime : 4,
        animInicial: desc.animInicial,
        animaciones,
        faltantes,
        img: principal ? principal.img : null,
        url: null,
        urls: [],
        ejeAtlas: 0
    };
    // Eje del espejo para las animaciones de atlas: centro del idle (fijo para todas).
    if (animaciones.size) {
        let minX = Infinity, maxX = -Infinity;
        animacionesDeAjuste(personaje).forEach((n) => {
            const an = animaciones.get(n);
            if (!an || an.tipo !== "atlas") return;
            an.frames.forEach((f, i) => {
                const b = boundsFrameAtlas(an, i);
                if (b) { minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); }
            });
        });
        if (Number.isFinite(minX)) personaje.ejeAtlas = (minX + maxX) / 2;
    }
    return personaje;
}

function boundsFrameAtlas(anim, i) {
    if (anim.bounds[i] === undefined) anim.bounds[i] = atlasBounds(anim.modelo, anim.timeline, anim.frames[i]) || null;
    return anim.bounds[i];
}

// ---------------------------------------------------------------------
// Importación paso a paso
// ---------------------------------------------------------------------

function importarPersonaje(lado) {
    const estado = personajesGCD[lado];
    if (!estado) return;
    if (!visualizarPersonajesActivo) abrirVisualizarPersonajes();
    if (!estado.importacion) {
        estado.importacion = { paso: 1, flujo: "sparrow", desc: null, jsonNombre: "", xmlNombre: "", pngNombre: "", fuentes: [], datos: {}, error: "", aviso: "" };
    }
    actualizarPasosImportacionUI(lado);
    avisoPersonaje(`${NOMBRE_LADO[lado]}: ${pasoActualImportacion(estado.importacion).texto}`);
    abrirSelectorPasoPersonaje(lado);
}

// Mantiene el nombre anterior para no romper enlaces viejos.
function importarPersonajePrueba(lado) {
    importarPersonaje(lado);
}

function abrirSelectorPasoPersonaje(lado, claveFuenteDestino) {
    const estado = personajesGCD[lado];
    const input = document.getElementById(`char-file-${lado}`);
    if (!estado?.importacion || !input) return;
    const paso = pasoActualImportacion(estado.importacion);
    let accept = paso.accept;
    if (claveFuenteDestino) {
        const f = estado.importacion.fuentes.find((x) => x.clave === claveFuenteDestino);
        accept = f && f.tipo === "atlas" ? ACCEPT_PERSONAJE.atlas : ".xml,.png,.astc,.ktx,.ktx2,text/xml,application/xml,image/png";
    }
    input.accept = accept;
    input.multiple = true;
    input.dataset.destino = claveFuenteDestino || "";
    input.value = "";
    try { input.click(); } catch (e) { }
}

// Botón "Elegir" de una fila de la lista de extras.
function elegirArchivosFuentePersonaje(lado, indice) {
    const imp = personajesGCD[lado]?.importacion;
    const f = imp && imp.fuentes[indice];
    if (f) abrirSelectorPasoPersonaje(lado, f.clave);
}

function cancelarImportacionPersonaje(lado, silencioso) {
    const estado = personajesGCD[lado];
    if (!estado?.importacion) return;
    estado.importacion = null;
    actualizarPasosImportacionUI(lado);
    if (!silencioso) avisoPersonaje(`${NOMBRE_LADO[lado]}: importación cancelada`);
}

// Codename Engine: data/characters/<id>.xml
//   <character sprite=".." scale="1" flipX="true" holdTime="4" antialiasing="false">
//     <anim name="idle" anim="Dad idle dance" fps="24" loop="false" x="0" y="0" indices="0..13"/>
function leerXmlPersonajeCodename(texto, nombreArchivo) {
    const doc = new DOMParser().parseFromString(String(texto || "").replace(/^\uFEFF/, ""), "text/xml");
    if (!doc || doc.getElementsByTagName("parsererror").length) return null;
    const raiz = doc.documentElement;
    if (!raiz || raiz.nodeName.toLowerCase() !== "character") return null;
    const bool = (v, def) => (v === null || v === undefined || v === "" ? def : String(v).toLowerCase() === "true");
    const indices = (txt) => {
        const out = [];
        String(txt || "").split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => {
            const m = /^(-?\d+)\s*\.\.\s*(-?\d+)$/.exec(t);
            if (m) {
                const a = parseInt(m[1], 10), b = parseInt(m[2], 10), paso = a <= b ? 1 : -1;
                for (let i = a; paso > 0 ? i <= b : i >= b; i += paso) out.push(i);
            } else if (Number.isFinite(parseInt(t, 10))) out.push(parseInt(t, 10));
        });
        return out;
    };
    const animations = Array.from(raiz.getElementsByTagName("anim")).map((n) => ({
        name: n.getAttribute("name") || "",
        anim: n.getAttribute("anim") || n.getAttribute("name") || "",
        fps: parseFloat(n.getAttribute("fps")) || 24,
        loop: bool(n.getAttribute("loop"), false),
        x: parseFloat(n.getAttribute("x")) || 0,
        y: parseFloat(n.getAttribute("y")) || 0,
        indices: indices(n.getAttribute("indices"))
    }));
    const base = String(nombreArchivo || "personaje").replace(/\.[^.]+$/, "");
    return {
        __formatoGCD: "codename",
        nombre: base,
        sprite: raiz.getAttribute("sprite") || base,
        scale: parseFloat(raiz.getAttribute("scale")) || 1,
        flipX: bool(raiz.getAttribute("flipX"), false),
        holdTime: parseFloat(raiz.getAttribute("holdTime")) || 4,
        antialiasing: bool(raiz.getAttribute("antialiasing"), true),
        animations
    };
}

async function clasificarArchivosPersonaje(archivos, tipoPaso) {
    const salida = [];
    for (const file of archivos) {
        let tipo = tipoArchivoPersonaje(file);
        // Un archivo sin extensión conocida se toma como el del paso actual.
        if (!tipo) tipo = tipoPaso === "xml" ? "xml" : (tipoPaso === "png" ? "png" : "json");
        const e = { file, tipo, nombre: file.name || "archivo", base: String(file.name || "").replace(/\.[^.]+$/, "").toLowerCase(), clase: tipo };
        if (tipo === "xml") {
            // V0.8.2n: el .xml de personaje de Codename Engine (<character>) no es un atlas Sparrow.
            try {
                const datos = leerXmlPersonajeCodename(await file.text(), file.name);
                if (datos) { e.data = datos; e.clase = "personaje"; }
            } catch (err) { /* no es Codename: se usa como XML Sparrow */ }
        }
        if (tipo === "json") {
            try {
                const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
                e.data = data;
                if (atlasEsAnimationJson(data)) e.clase = "animation";
                else if (atlasEsSpritemapJson(data)) e.clase = "spritemap";
                else if (data && typeof data === "object" && !Array.isArray(data) && (Array.isArray(data.animations) || (data.character && typeof data.character === "object" && Array.isArray(data.character.animations)))) e.clase = "personaje";
                else e.clase = "json";
            } catch (err) {
                e.clase = "invalido";
            }
        }
        salida.push(e);
    }
    return salida;
}

function esArchivoDeAtlas(e) {
    return e.clase === "animation" || e.clase === "spritemap";
}

function elegirPorNombre(lista, fuente) {
    if (!lista.length) return null;
    const buscado = String(fuente.nombre || "").toLowerCase();
    return lista.find((e) => e.base === buscado) || lista[0];
}

// Estado de una fuente durante la importación.
function estadoFuenteImport(imp, f) {
    const d = imp.datos[f.clave];
    if (!d) return { completa: false, usable: false, faltanPiezas: 0 };
    if (f.tipo === "sparrow") {
        const ok = !!(d.xml && d.png);
        return { completa: ok, usable: ok, faltanPiezas: 0 };
    }
    const conPng = d.spritemaps.filter((s) => s.png);
    let faltan = 0;
    if (d.animacion && conPng.length) {
        const nombres = new Set();
        conPng.forEach((s) => s.sm.sprites.forEach((p) => nombres.add(p.name)));
        faltan = atlasSpritesFaltantes(d.animacion.modelo, nombres).length;
    }
    return {
        completa: !!d.animacion && d.spritemaps.length > 0 && conPng.length === d.spritemaps.length && faltan === 0,
        usable: !!d.animacion && conPng.length > 0,
        faltanPiezas: faltan
    };
}

function emparejarPngsAtlas(d) {
    d.spritemaps.forEach((s) => {
        if (s.png) return;
        const esperado = String(s.sm.imagen || "").split("/").pop().toLowerCase();
        const sinExt = (x) => x.replace(/\.(png|astc|ktx2?|webp|jpe?g)$/i, ""); // spritemap1.png ↔ spritemap1.astc
        const baseJson = s.nombre.replace(/\.[^.]+$/, "").toLowerCase();
        const i = d.pngs.findIndex((p) => {
            const n = String(p.name || "").toLowerCase();
            return (esperado && (n === esperado || sinExt(n) === sinExt(esperado))) || n.replace(/\.[^.]+$/, "") === baseJson;
        });
        if (i >= 0) s.png = d.pngs.splice(i, 1)[0];
    });
    const sinPng = d.spritemaps.filter((s) => !s.png);
    if (sinPng.length === 1 && d.pngs.length === 1) sinPng[0].png = d.pngs.shift();
}

function absorberAtlasFuente(imp, fuente, entradas) {
    const d = imp.datos[fuente.clave];
    const anims = entradas.filter((e) => e.clase === "animation");
    if (anims.length > 1) throw new Error("Elegiste más de un Animation.json. Elige los archivos de un atlas a la vez.");
    if (anims.length) {
        const modelo = atlasParsearAnimacion(anims[0].data);
        const propias = animacionesDeFuente(imp, fuente);
        if (!propias.some((a) => atlasBuscarAnimacion(modelo, a))) {
            throw new Error(`Ninguna animación del JSON coincide con las etiquetas o símbolos de "${anims[0].nombre}". ¿Es el atlas de este personaje?`);
        }
        d.animacion = { nombre: anims[0].nombre, modelo };
    }
    entradas.filter((e) => e.clase === "spritemap").forEach((e) => {
        const sm = atlasLeerSpritemap(e.data);
        const i = d.spritemaps.findIndex((s) => s.nombre.toLowerCase() === e.nombre.toLowerCase());
        const reg = { nombre: e.nombre, sm, png: i >= 0 ? d.spritemaps[i].png : null };
        if (i >= 0) d.spritemaps[i] = reg;
        else d.spritemaps.push(reg);
    });
    entradas.filter((e) => e.tipo === "png").forEach((e) => d.pngs.push(e.file));
    emparejarPngsAtlas(d);
}

async function asignarXmlSparrow(imp, fuente, entrada) {
    const atlas = leerAtlasSparrow(await entrada.file.text());
    const usadas = animacionesDeFuente(imp, fuente).filter((a) => framesDeAnimacion(atlas, a).length > 0);
    if (usadas.length === 0) {
        throw new Error(`Ninguna animación del JSON coincide con los nombres del XML "${entrada.nombre}". ¿Es el XML de este personaje?`);
    }
    imp.datos[fuente.clave].xml = { nombre: entrada.nombre, atlas };
}

// Reparte los archivos de la lista de extras (multisparrow / multianimateatlas).
// Devuelve los archivos que no se usaron.
async function absorberExtras(imp, entradas, claveDestino) {
    const extras = imp.fuentes.slice(1);
    const invalido = entradas.find((e) => e.clase === "invalido");
    if (invalido) throw new Error(`"${invalido.nombre}" no es un JSON válido.`);
    if (claveDestino) {
        const f = extras.find((x) => x.clave === claveDestino);
        if (!f) return entradas;
        if (f.tipo === "sparrow") {
            const xml = entradas.find((e) => e.tipo === "xml");
            const png = entradas.find((e) => e.tipo === "png");
            if (!xml && !png) throw new Error(`Para "${f.nombre}" elige su .xml y su .png.`);
            if (xml) await asignarXmlSparrow(imp, f, xml);
            if (png) imp.datos[f.clave].png = png.file;
            return entradas.filter((e) => e !== xml && e !== png);
        }
        const delAtlas = entradas.filter((e) => esArchivoDeAtlas(e) || e.tipo === "png");
        if (!delAtlas.length) throw new Error(`Para "${f.nombre}" elige su Animation.json, el spritemap .json y su .png.`);
        absorberAtlasFuente(imp, f, delAtlas);
        return entradas.filter((e) => !delAtlas.includes(e));
    }
    const sinUsar = [];
    for (const e of entradas) {
        if (e.tipo === "xml" || e.tipo === "png") {
            const f = extras.find((x) => x.tipo === "sparrow" && x.nombre.toLowerCase() === e.base);
            if (f) {
                if (e.tipo === "xml") await asignarXmlSparrow(imp, f, e);
                else imp.datos[f.clave].png = e.file;
                continue;
            }
        }
        sinUsar.push(e);
    }
    const delAtlas = sinUsar.filter(esArchivoDeAtlas);
    if (delAtlas.length) {
        const pendientes = extras.filter((f) => f.tipo === "atlas" && !estadoFuenteImport(imp, f).completa);
        const anims = delAtlas.filter((e) => e.clase === "animation");
        if (anims.length > 1) throw new Error("Elegiste varios Animation.json a la vez: usa el botón «Elegir» de cada atlas.");
        let destino = null;
        if (anims.length === 1) {
            const modelo = atlasParsearAnimacion(anims[0].data);
            let mejor = 0;
            extras.filter((f) => f.tipo === "atlas").forEach((f) => {
                const n = imp.desc.animaciones.filter((a) => a.fuente === f.clave && atlasBuscarAnimacion(modelo, a)).length;
                if (n > mejor) { mejor = n; destino = f; }
            });
            if (!destino) throw new Error(`"${anims[0].nombre}" no tiene las animaciones de ningún atlas extra.`);
        } else if (pendientes.length === 1) {
            destino = pendientes[0];
        }
        if (!destino) throw new Error("No se sabe a qué atlas van esos archivos: usa el botón «Elegir» de su fila.");
        const pngs = sinUsar.filter((e) => e.tipo === "png");
        absorberAtlasFuente(imp, destino, delAtlas.concat(pngs));
        return sinUsar.filter((e) => !delAtlas.includes(e) && !pngs.includes(e));
    }
    // Sueltos sin nombre conocido: si solo hay un hueco posible, se usa.
    const restantes = [];
    for (const e of sinUsar) {
        if (e.tipo === "xml") {
            const huecos = extras.filter((f) => f.tipo === "sparrow" && !imp.datos[f.clave].xml);
            if (huecos.length === 1) { await asignarXmlSparrow(imp, huecos[0], e); continue; }
        } else if (e.tipo === "png") {
            const huecos = extras.filter((f) => f.tipo === "sparrow" && !imp.datos[f.clave].png);
            const huecosAtlas = extras.filter((f) => f.tipo === "atlas" && imp.datos[f.clave].spritemaps.some((s) => !s.png));
            if (huecos.length === 1 && !huecosAtlas.length) { imp.datos[huecos[0].clave].png = e.file; continue; }
            if (huecosAtlas.length === 1 && !huecos.length) {
                const d = imp.datos[huecosAtlas[0].clave];
                d.pngs.push(e.file);
                emparejarPngsAtlas(d);
                continue;
            }
        }
        restantes.push(e);
    }
    return restantes;
}

// Reparte los archivos según el paso. Devuelve { avanzo, absorbio, listo, sinUsar }.
async function asignarArchivosImport(imp, entradas, claveDestino) {
    let avanzo = false;
    let absorbio = false;
    let pend = entradas.slice();
    for (let vuelta = 0; vuelta < 8; vuelta++) {
        const paso = pasoActualImportacion(imp);
        const principal = imp.fuentes[0];
        const datos = imp.datos[principal.clave];
        if (paso.tipo === "xml") {
            // Psych no dice si es atlas: si llegan archivos de Animate, se cambia de flujo.
            if (imp.desc.formato === "psych" && !pend.some((e) => e.tipo === "xml") && pend.some(esArchivoDeAtlas)) {
                principal.tipo = "atlas";
                imp.datos[principal.clave] = nuevosDatosFuente("atlas");
                recalcularFlujoImport(imp);
                imp.paso = 2;
                continue;
            }
            const xml = elegirPorNombre(pend.filter((e) => e.tipo === "xml"), principal);
            if (!xml) {
                if (pend.some(esArchivoDeAtlas)) throw new Error(`Este personaje es "${imp.desc.renderType}": aquí va el XML + PNG, no un Animate Atlas.`);
                break;
            }
            await asignarXmlSparrow(imp, principal, xml);
            imp.xmlNombre = xml.nombre;
            imp.paso++;
            avanzo = true;
            pend = pend.filter((e) => e !== xml);
            continue;
        }
        if (paso.tipo === "png") {
            const png = elegirPorNombre(pend.filter((e) => e.tipo === "png"), principal);
            if (!png) break;
            datos.png = png.file;
            imp.pngNombre = png.nombre;
            pend = pend.filter((e) => e !== png);
            avanzo = true;
            if (imp.flujo === "sparrow") return { avanzo, absorbio, listo: true, sinUsar: pend };
            imp.paso++;
            continue;
        }
        if (paso.tipo === "atlas") {
            const invalido = pend.find((e) => e.clase === "invalido");
            if (invalido) throw new Error(`"${invalido.nombre}" no es un JSON válido.`);
            const delAtlas = pend.filter((e) => esArchivoDeAtlas(e) || e.tipo === "png");
            if (!delAtlas.length) {
                if (pend.some((e) => e.tipo === "xml")) throw new Error(`Este personaje es "${imp.desc.renderType}": aquí va el Animate Atlas (Animation.json + spritemap), no un XML.`);
                break;
            }
            // multianimateatlas: si llegan varios Animation.json juntos, el del principal va primero.
            const anims = delAtlas.filter((e) => e.clase === "animation");
            let paraPrincipal = delAtlas;
            if (anims.length > 1 && imp.flujo === "multiatlas") {
                const propio = anims.find((e) => {
                    try {
                        const m = atlasParsearAnimacion(e.data);
                        return imp.desc.animaciones.some((a) => a.fuente === principal.clave && atlasBuscarAnimacion(m, a));
                    } catch (err) { return false; }
                });
                if (!propio) throw new Error("Ninguno de los Animation.json tiene las animaciones del atlas principal.");
                paraPrincipal = [propio].concat(delAtlas.filter((e) => e.clase !== "animation"));
            }
            absorberAtlasFuente(imp, principal, paraPrincipal);
            absorbio = true;
            pend = pend.filter((e) => !paraPrincipal.includes(e));
            if (estadoFuenteImport(imp, principal).completa) {
                avanzo = true;
                if (imp.flujo === "atlas") return { avanzo, absorbio, listo: true, sinUsar: pend };
                imp.paso++;
                continue;
            }
            break;
        }
        if (paso.tipo === "extra") {
            if (!pend.length) break;
            pend = await absorberExtras(imp, pend, claveDestino);
            absorbio = true;
            if (imp.fuentes.slice(1).every((f) => estadoFuenteImport(imp, f).completa)) return { avanzo, absorbio, listo: true, sinUsar: pend };
            break;
        }
        break;
    }
    return { avanzo, absorbio, listo: false, sinUsar: pend };
}

async function procesarArchivosPersonaje(lado, archivos, claveDestino) {
    const estado = personajesGCD[lado];
    const imp = estado?.importacion;
    if (!imp || !archivos.length) return;
    imp.error = "";
    imp.aviso = "";
    let avanzo = false;
    try {
        const entradas = await clasificarArchivosPersonaje(archivos, pasoActualImportacion(imp).tipo);
        if (estado.importacion !== imp) return;
        let pendientes = entradas;
        if (imp.paso === 1) {
            const pj = entradas.find((e) => e.clase === "personaje");
            if (!pj) {
                const invalido = entradas.find((e) => e.clase === "invalido");
                if (invalido) throw new Error(`"${invalido.nombre}" no es un JSON válido.`);
                const delAtlas = entradas.find(esArchivoDeAtlas);
                if (delAtlas) throw new Error(`"${delAtlas.nombre}" es parte de un Animate Atlas. Primero elige el .json del personaje.`);
                const otro = entradas.find((e) => e.clase === "json");
                if (otro) normalizarJsonPersonaje(otro.data, otro.nombre); // lanza el motivo
                throw new Error("En este paso falta el archivo del personaje (.json de V-Slice / Psych / Kade o .xml de Codename).");
            }
            let data = pj.data;
            // Psych guarda a veces el personaje dentro de { "character": {...} }
            if (data && data.character && typeof data.character === "object" && !data.animations) data = data.character;
            const desc = normalizarJsonPersonaje(data, pj.nombre);
            if (!RENDER_TYPES_PERSONAJE.includes(desc.renderType)) {
                throw new Error(`Este personaje usa renderType "${desc.renderType}". Se soporta "sparrow", "multisparrow", "animateatlas" y "multianimateatlas".`);
            }
            prepararFuentesImport(imp, desc);
            imp.jsonNombre = pj.nombre;
            imp.paso = 2;
            avanzo = true;
            pendientes = entradas.filter((e) => e !== pj);
        }
        const r = await asignarArchivosImport(imp, pendientes, claveDestino);
        if (estado.importacion !== imp) return;
        if (r.sinUsar && r.sinUsar.length && (r.absorbio || r.avanzo || avanzo)) {
            imp.aviso = `Sin usar: ${r.sinUsar.map((e) => e.nombre).slice(0, 3).join(", ")}${r.sinUsar.length > 3 ? "…" : ""}`;
        }
        if (r.listo) {
            await finalizarImportacionPersonaje(lado, imp);
            return;
        }
        if (!avanzo && !r.avanzo && !r.absorbio) {
            const pedido = pasoActualImportacion(imp);
            const ext = { xml: ".xml", png: ".png", json: ".json", atlas: "del atlas (Animation.json / spritemap)", extra: ".xml / .png / atlas" }[pedido.tipo];
            throw new Error(`En este paso falta el archivo ${ext}.`);
        }
    } catch (err) {
        if (estado.importacion !== imp) return;
        imp.error = err && err.message ? err.message : "No se pudo leer el archivo.";
        actualizarPasosImportacionUI(lado);
        avisoPersonaje(imp.error);
        return;
    }
    actualizarPasosImportacionUI(lado);
    avisoPersonaje(`${NOMBRE_LADO[lado]}: ${imp.aviso && !avanzo ? imp.aviso : pasoActualImportacion(imp).texto}`);
}

// "Omitir faltantes": arma el personaje con lo que ya hay.
function omitirFaltantesPersonaje(lado) {
    const imp = personajesGCD[lado]?.importacion;
    if (!imp || !imp.desc) return;
    finalizarImportacionPersonaje(lado, imp);
}

async function finalizarImportacionPersonaje(lado, imp) {
    const estado = personajesGCD[lado];
    const urls = [];
    try {
        const principal = imp.fuentes[0];
        if (!estadoFuenteImport(imp, principal).usable) {
            throw new Error(principal.tipo === "atlas"
                ? "Falta el atlas principal: elige su Animation.json, el spritemap .json y su .png."
                : "Falta el XML + PNG principal.");
        }
        const recursos = {};
        const guardables = []; // V0.8.2n-2: para "Guardar personaje" (IndexedDB, con imágenes)
        let imagenChica = false;
        for (const f of imp.fuentes) {
            if (!estadoFuenteImport(imp, f).usable) continue;
            const d = imp.datos[f.clave];
            if (f.tipo === "sparrow") {
                const imagen = await cargarImagenPersonaje(d.png);
                urls.push(imagen.url);
                recursos[f.clave] = { tipo: "sparrow", atlas: d.xml.atlas, img: imagen.img };
                guardables.push({ clave: f.clave, tipo: "sparrow", atlas: d.xml.atlas, png: d.png });
                if (f.principal) {
                    let maxX = 0, maxY = 0;
                    d.xml.atlas.frames.forEach((fr) => { maxX = Math.max(maxX, fr.x + fr.w); maxY = Math.max(maxY, fr.y + fr.h); });
                    imagenChica = maxX > imagen.img.naturalWidth + 1 || maxY > imagen.img.naturalHeight + 1;
                }
            } else {
                const modelo = d.animacion.modelo;
                let copiaModelo = null;
                try { const { sprites, ...resto } = modelo; copiaModelo = structuredClone(resto); } catch (e) { copiaModelo = null; }
                guardables.push({ clave: f.clave, tipo: "atlas", modelo: copiaModelo, spritemaps: d.spritemaps.filter((x) => x.png).map((x) => ({ sm: x.sm, png: x.png })) });
                modelo.sprites = new Map();
                for (const s of d.spritemaps) {
                    if (!s.png) continue;
                    const imagen = await cargarImagenPersonaje(s.png);
                    urls.push(imagen.url);
                    atlasAgregarSpritemap(modelo, s.sm, imagen.img);
                }
                recursos[f.clave] = { tipo: "atlas", modelo };
            }
        }
        if (estado.importacion !== imp) { urls.forEach((u) => URL.revokeObjectURL(u)); return; } // cancelada mientras cargaba
        const personaje = construirPersonaje(imp.desc, recursos);
        personaje.desc = imp.desc; // V0.8.2n: para "Guardar personaje"
        personaje.guardables = guardables;
        personaje.urls = urls;
        personaje.url = urls[0] || null;
        if (personaje.animaciones.size === 0) throw new Error("No se pudo armar ninguna animación.");
        estado.importacion = null;
        asignarPersonaje(lado, personaje);
        actualizarPasosImportacionUI(lado);
        let mensaje = `${NOMBRE_LADO[lado]}: "${personaje.nombre}" cargado (${personaje.animaciones.size} animaciones)`;
        if (imagenChica) mensaje += ". Ojo: el PNG es más chico que el XML";
        else if (personaje.faltantes.length) mensaje += `. Sin frames: ${personaje.faltantes.slice(0, 3).join(", ")}${personaje.faltantes.length > 3 ? "…" : ""}`;
        avisoPersonaje(mensaje);
    } catch (err) {
        urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { } });
        if (estado.importacion !== imp) return;
        imp.error = err && err.message ? err.message : "No se pudo armar el personaje.";
        actualizarPasosImportacionUI(lado);
        avisoPersonaje(imp.error);
    }
}

function actualizarPasosImportacionUI(lado) {
    const caja = document.getElementById(`char-steps-${lado}`);
    const ventana = document.getElementById(`char-window-${lado}`);
    if (!caja) return;
    const imp = personajesGCD[lado].importacion;
    ventana?.classList.toggle("importing", !!imp);
    if (!imp) {
        caja.hidden = true;
        caja.classList.remove("lista");
        caja.innerHTML = "";
        return;
    }
    const pasos = pasosImportacion(imp);
    const paso = pasoActualImportacion(imp);
    const nombres = { 1: imp.jsonNombre, 2: imp.xmlNombre, 3: imp.pngNombre };
    const pills = pasos.map((p, n) => {
        if (!p) return "";
        const clase = n < imp.paso ? "done" : (n === imp.paso ? "current" : "");
        const icono = n < imp.paso ? '<i class="fa-solid fa-check"></i>' : `${n}`;
        const titulo = imp.flujo.includes("sparrow") && nombres[n] ? ` title="${escaparHTMLPersonaje(nombres[n])}"` : "";
        return `<span class="char-step-pill ${clase}" data-paso="${n}"${titulo}>${icono} ${p.titulo}</span>`;
    }).join("");
    let detalle = "";
    let lista = "";
    if (imp.paso === 1) {
        detalle = "Puedes elegir todos los archivos a la vez.";
    } else if (paso.tipo === "xml") {
        detalle = `JSON: ${escaparHTMLPersonaje(imp.jsonNombre)}`;
    } else if (paso.tipo === "png") {
        detalle = `XML: ${escaparHTMLPersonaje(imp.xmlNombre)}`;
    } else if (paso.tipo === "atlas") {
        const f = imp.fuentes[0];
        const d = imp.datos[f.clave];
        const est = estadoFuenteImport(imp, f);
        detalle = `JSON: ${escaparHTMLPersonaje(imp.jsonNombre)} · atlas «${escaparHTMLPersonaje(f.ruta || f.nombre)}»`;
        const filas = [];
        filas.push(`<li class="${d.animacion ? "ok" : "falta"}"><i class="fa-solid ${d.animacion ? "fa-check" : "fa-circle-dot"}"></i> Animation.json${d.animacion ? ` <small>${escaparHTMLPersonaje(d.animacion.nombre)}</small>` : ""}</li>`);
        if (!d.spritemaps.length) {
            filas.push(`<li class="falta"><i class="fa-solid fa-circle-dot"></i> spritemap .json + .png</li>`);
        }
        d.spritemaps.forEach((s) => {
            filas.push(`<li class="ok"><i class="fa-solid fa-check"></i> ${escaparHTMLPersonaje(s.nombre)}</li>`);
            const esperado = String(s.sm.imagen || "").split("/").pop() || s.nombre.replace(/\.json$/i, ".png");
            filas.push(`<li class="${s.png ? "ok" : "falta"}"><i class="fa-solid ${s.png ? "fa-check" : "fa-circle-dot"}"></i> ${escaparHTMLPersonaje(s.png ? s.png.name : esperado)}</li>`);
        });
        if (est.faltanPiezas) filas.push(`<li class="falta"><i class="fa-solid fa-triangle-exclamation"></i> Faltan ${est.faltanPiezas} piezas: ¿otro spritemap?</li>`);
        lista = `<ul class="char-atlas-checklist">${filas.join("")}</ul>`;
    } else if (paso.tipo === "extra") {
        detalle = "Estas animaciones usan otros archivos. Elige todos a la vez (se emparejan por nombre) o fila por fila.";
        const filas = imp.fuentes.slice(1).map((f, i) => {
            const est = estadoFuenteImport(imp, f);
            const d = imp.datos[f.clave];
            let piezas;
            if (f.tipo === "sparrow") {
                piezas = `${d.xml ? "✓" : "·"} ${escaparHTMLPersonaje(f.nombre)}.xml &nbsp; ${d.png ? "✓" : "·"} ${escaparHTMLPersonaje(f.nombre)}.png`;
            } else {
                const conPng = d.spritemaps.filter((s) => s.png).length;
                piezas = `${d.animacion ? "✓" : "·"} Animation.json &nbsp; ${d.spritemaps.length && conPng === d.spritemaps.length ? "✓" : "·"} spritemap (${conPng}/${d.spritemaps.length || "?"})`;
            }
            const anims = imp.desc.animaciones.filter((a) => a.fuente === f.clave).map((a) => a.nombre);
            return `<li class="char-fuente ${est.completa ? "ok" : "falta"}" data-fuente="${escaparHTMLPersonaje(f.clave)}" title="${escaparHTMLPersonaje(anims.join(", "))}">
                <span class="char-fuente-nombre"><i class="fa-solid ${est.completa ? "fa-check" : "fa-circle-dot"}"></i> ${escaparHTMLPersonaje(f.ruta || f.nombre)} <small>${f.tipo === "atlas" ? "Atlas" : "Sparrow"} · ${anims.length} anim.</small></span>
                <span class="char-fuente-piezas">${piezas}</span>
                <button type="button" class="char-fuente-pick" onclick="elegirArchivosFuentePersonaje('${lado}', ${i + 1})">Elegir</button>
            </li>`;
        }).join("");
        lista = `<ul class="char-fuentes-lista">${filas}</ul>`;
    }
    const multiPaso = paso.tipo === "atlas" || paso.tipo === "extra";
    const etiquetaElegir = multiPaso || imp.paso === 1 ? "Elegir archivos" : `Elegir ${paso.titulo}`;
    const puedeOmitir = imp.desc && imp.fuentes.length && (paso.tipo === "extra" || (paso.tipo === "atlas" && estadoFuenteImport(imp, imp.fuentes[0]).usable));
    caja.classList.toggle("lista", !!lista);
    caja.innerHTML = `
        <div class="char-steps-pills">${pills}</div>
        <div class="char-steps-msg">${escaparHTMLPersonaje(paso.texto)}</div>
        <div class="char-steps-hint">${detalle}</div>
        ${lista}
        ${imp.aviso ? `<div class="char-steps-hint aviso">${escaparHTMLPersonaje(imp.aviso)}</div>` : ""}
        ${imp.error ? `<div class="char-steps-error"><i class="fa-solid fa-triangle-exclamation"></i> ${escaparHTMLPersonaje(imp.error)}</div>` : ""}
        <div class="char-steps-actions">
            <button type="button" class="char-steps-pick" onclick="abrirSelectorPasoPersonaje('${lado}')"><i class="fa-solid fa-folder-open"></i> ${etiquetaElegir}</button>
            ${puedeOmitir ? `<button type="button" class="char-steps-skip" onclick="omitirFaltantesPersonaje('${lado}')">Omitir faltantes</button>` : ""}
            <button type="button" class="char-steps-cancel" onclick="cancelarImportacionPersonaje('${lado}')">Cancelar</button>
        </div>`;
    caja.hidden = false;
}
// ---------------------------------------------------------------------
// Personaje cargado: asignar / quitar / voltear / probar animación
// ---------------------------------------------------------------------

function liberarPersonaje(personaje) {
    if (!personaje) return;
    const urls = personaje.urls && personaje.urls.length ? personaje.urls : (personaje.url ? [personaje.url] : []);
    urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { } });
    personaje.urls = [];
    personaje.url = null;
}

function nombreAnimacionCorrecto(personaje, nombre) {
    let actual = nombre;
    while (actual) {
        if (personaje.animaciones.has(actual)) return actual;
        const guion = actual.lastIndexOf("-");
        if (guion <= 0) break;
        actual = actual.substring(0, guion);
    }
    return null;
}

function reproducirAnimPersonaje(estado, nombre, forzar) {
    const p = estado.personaje;
    if (!p) return false;
    const real = nombreAnimacionCorrecto(p, nombre);
    if (!real) return false;
    if (!forzar && estado.anim === real && !animacionTerminada(estado)) return true;
    estado.anim = real;
    estado.animTiempo = 0;
    return true;
}

function animacionActual(estado) {
    return estado.personaje ? estado.personaje.animaciones.get(estado.anim) : null;
}

function animacionTerminada(estado) {
    const a = animacionActual(estado);
    if (!a) return true;
    if (a.loop) return false;
    return estado.animTiempo * a.fps >= a.frames.length;
}

function indiceFrameActual(estado) {
    const a = animacionActual(estado);
    if (!a || !a.frames.length) return 0;
    const i = Math.floor(estado.animTiempo * a.fps + 1e-6);
    return a.loop ? i % a.frames.length : Math.min(a.frames.length - 1, i);
}

function bailarPersonaje(estado, forzar) {
    const p = estado.personaje;
    if (!p) return;
    if (p.animaciones.has("danceLeft") && p.animaciones.has("danceRight")) {
        reproducirAnimPersonaje(estado, estado.hasDanced ? "danceRight" : "danceLeft", forzar);
        estado.hasDanced = !estado.hasDanced;
    } else if (p.animaciones.has("idle")) {
        reproducirAnimPersonaje(estado, "idle", forzar);
    } else if (p.animaciones.has(p.animInicial)) {
        reproducirAnimPersonaje(estado, p.animInicial, forzar);
    } else {
        reproducirAnimPersonaje(estado, p.animaciones.keys().next().value, forzar);
    }
}

function animacionesDeAjuste(p) {
    const lista = [];
    if (p.animaciones.has("idle")) lista.push("idle");
    if (p.animaciones.has("danceLeft")) lista.push("danceLeft");
    if (p.animaciones.has("danceRight")) lista.push("danceRight");
    if (!lista.length && p.animaciones.has(p.animInicial)) lista.push(p.animInicial);
    if (!lista.length) lista.push(p.animaciones.keys().next().value);
    return lista;
}

function asignarPersonaje(lado, personaje) {
    const estado = personajesGCD[lado];
    liberarPersonaje(estado.personaje);
    Object.assign(estado, crearEstadoLadoPersonaje());
    // Psych: flipX = flip_x != isPlayer (el lado Player invierte el flip_x del JSON).
    if (["psych", "codename", "kade"].includes(personaje.formato) && lado === "player") personaje.flipX = !personaje.flipX; // Codename y Kade igual que Psych
    estado.personaje = personaje;
    // Animación inicial (startingAnimation) y luego baile.
    if (!reproducirAnimPersonaje(estado, personaje.animInicial, true)) bailarPersonaje(estado, true);
    actualizarUIPersonaje(lado);
    ajustarCanvasPersonaje(lado);
    iniciarBuclePersonajes();
}

function quitarPersonaje(lado) {
    const estado = personajesGCD[lado];
    if (!estado) return;
    const nombre = estado.personaje?.nombre;
    liberarPersonaje(estado.personaje);
    const importacion = estado.importacion;
    Object.assign(estado, crearEstadoLadoPersonaje(), { importacion });
    actualizarUIPersonaje(lado);
    limpiarCanvasPersonaje(lado);
    if (nombre) avisoPersonaje(`${NOMBRE_LADO[lado]}: "${nombre}" quitado`);
}

function voltearPersonaje(lado) {
    const estado = personajesGCD[lado];
    if (!estado?.personaje) return;
    estado.flipUsuario = !estado.flipUsuario;
    calcularVistaPersonaje(lado);
    estado.dibujoClave = "";
    document.getElementById(`char-window-${lado}`)?.classList.toggle("flipped", estado.flipUsuario);
}

function probarAnimacionPersonaje(lado, nombre) {
    const estado = personajesGCD[lado];
    const select = document.getElementById(`char-anim-select-${lado}`);
    if (select) { select.value = ""; select.blur(); }
    if (!estado?.personaje || !nombre) return;
    if (!reproducirAnimPersonaje(estado, nombre, true)) return;
    const a = animacionActual(estado);
    const duracion = a ? (a.loop ? 2 : a.frames.length / a.fps) : 1;
    estado.cantando = false;
    estado.terminando = false;
    estado.previewHasta = performance.now() + Math.max(0.6, duracion + 0.35) * 1000;
}

function actualizarUIPersonaje(lado) {
    const estado = personajesGCD[lado];
    const p = estado.personaje;
    const ventana = document.getElementById(`char-window-${lado}`);
    const nombre = document.getElementById(`char-name-${lado}`);
    const select = document.getElementById(`char-anim-select-${lado}`);
    const etiqueta = ventana?.querySelector(".char-import-label");
    ventana?.classList.toggle("has-char", !!p);
    ventana?.classList.toggle("flipped", !!(p && estado.flipUsuario));
    ventana?.classList.toggle("pixel", !!(p && p.isPixel));
    if (nombre) nombre.textContent = p ? p.nombre : "";
    if (etiqueta) etiqueta.textContent = p ? "Cambiar" : "Importar personaje";
    if (select) {
        select.innerHTML = "";
        if (p) {
            const opcion = document.createElement("option");
            opcion.value = "";
            opcion.textContent = "Probar animación…";
            select.appendChild(opcion);
            p.animaciones.forEach((a, n) => {
                const o = document.createElement("option");
                o.value = n;
                o.textContent = n;
                select.appendChild(o);
            });
        }
    }
    const label = document.getElementById(`char-anim-${lado}`);
    if (label && !p) label.textContent = "";
}


// ---------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------

// Rectángulo (en unidades de pantalla con la escala del JSON) donde cae un frame.
function rectFramePersonaje(p, anim, frame, flip) {
    const s = p.escala;
    const rx = flip ? (frame.fw - frame.offX - frame.dw) : frame.offX;
    const ry = frame.offY;
    return {
        x: rx * s - anim.off[0],
        y: ry * s - anim.off[1],
        w: frame.dw * s,
        h: frame.dh * s
    };
}

// Lo mismo para un frame de Animate Atlas (límites de las piezas de ese frame).
// El espejo se hace sobre el eje fijo del personaje (centro del idle).
function rectFrameAtlas(p, anim, i, flip) {
    const b = boundsFrameAtlas(anim, i);
    if (!b) return null;
    const s = p.escala;
    const x0 = flip ? 2 * p.ejeAtlas - b.maxX : b.minX;
    return {
        x: x0 * s - anim.off[0],
        y: b.minY * s - anim.off[1],
        w: (b.maxX - b.minX) * s,
        h: (b.maxY - b.minY) * s
    };
}

function flipEfectivo(estado, anim) {
    return !!(estado.personaje.flipX ^ (anim && anim.flipX) ^ estado.flipUsuario);
}

function calcularVistaPersonaje(lado) {
    const estado = personajesGCD[lado];
    const p = estado.personaje;
    const canvas = document.getElementById(`char-canvas-${lado}`);
    if (!p || !canvas) { estado.vista = null; return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const sumar = (r) => {
        if (!r) return;
        minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    };
    animacionesDeAjuste(p).forEach((nombre) => {
        const a = p.animaciones.get(nombre);
        if (!a) return;
        const flip = flipEfectivo(estado, a);
        if (a.tipo === "atlas") a.frames.forEach((f, i) => sumar(rectFrameAtlas(p, a, i, flip)));
        else a.frames.forEach((f) => sumar(rectFramePersonaje(p, a, f, flip)));
    });
    if (!Number.isFinite(minX)) { estado.vista = null; return; }
    const ancho = canvas.clientWidth || 1;
    const alto = canvas.clientHeight || 1;
    const margenX = 10;
    const margenArriba = 20; // deja sitio a la etiqueta de animación
    const margenAbajo = 10;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const ajuste = Math.max(0.01, Math.min((ancho - margenX * 2) / bw, (alto - margenArriba - margenAbajo) / bh));
    estado.vista = {
        ajuste,
        x: ancho / 2 - (minX + bw / 2) * ajuste,
        y: alto - margenAbajo - maxY * ajuste,
        pies: alto - margenAbajo,
        anchoPies: bw * ajuste
    };
}

function ajustarCanvasPersonaje(lado) {
    const canvas = document.getElementById(`char-canvas-${lado}`);
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr));
    const h = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    calcularVistaPersonaje(lado);
    personajesGCD[lado].dibujoClave = "";
}

function limpiarCanvasPersonaje(lado) {
    const canvas = document.getElementById(`char-canvas-${lado}`);
    const ctx = canvas?.getContext("2d");
    if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function dibujarPersonaje(lado) {
    const estado = personajesGCD[lado];
    const p = estado.personaje;
    const canvas = document.getElementById(`char-canvas-${lado}`);
    if (!p || !canvas || !canvas.clientWidth) return;
    if (!estado.vista) calcularVistaPersonaje(lado);
    const vista = estado.vista;
    const anim = animacionActual(estado);
    if (!vista || !anim) return;
    const indice = indiceFrameActual(estado);
    const clave = `${estado.anim}|${indice}|${canvas.width}x${canvas.height}|${estado.flipUsuario}`;
    if (clave === estado.dibujoClave) return; // nada cambió: no redibujar
    estado.dibujoClave = clave;

    const frame = anim.frames[indice];
    const ctx = canvas.getContext("2d");
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sombra en los pies
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(canvas.clientWidth / 2, vista.pies - 2, Math.max(12, vista.anchoPies * 0.32), 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (frame === undefined || frame === null) return; // en atlas el frame puede ser 0
    const flip = flipEfectivo(estado, anim);
    const k = dpr * vista.ajuste;
    const s = p.escala;
    ctx.imageSmoothingEnabled = !p.isPixel;
    if (anim.tipo === "atlas") {
        // Mundo -> canvas, y atlas -> mundo (escala, espejo sobre el eje y offsets).
        const base = atlasMultiplicar([k, 0, 0, k, vista.x * dpr, vista.y * dpr],
            [flip ? -s : s, 0, 0, s, (flip ? 2 * p.ejeAtlas * s : 0) - anim.off[0], -anim.off[1]]);
        atlasDibujar(ctx, anim.modelo, anim.timeline, frame, base);
    } else {
        const r = rectFramePersonaje(p, anim, frame, flip);
        // Mundo -> canvas: (vista.x + X * ajuste) * dpr
        ctx.setTransform(k, 0, 0, k, vista.x * dpr, vista.y * dpr);
        ctx.translate(r.x + (flip ? r.w : 0), r.y);
        ctx.scale(flip ? -s : s, s);
        if (frame.rot) {
            // Guardado girado 90° en sentido horario: se dibuja girando -90°.
            ctx.translate(0, frame.dh);
            ctx.rotate(-Math.PI / 2);
        }
        ctx.drawImage(frame.img || p.img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const label = document.getElementById(`char-anim-${lado}`);
    if (label && label.textContent !== estado.anim) label.textContent = estado.anim;
}
// ---------------------------------------------------------------------
// Bucle de animación (independiente del de playback)
// ---------------------------------------------------------------------

let buclePersonajesId = null;
let buclePersonajesUltimo = 0;
let relojLibrePersonajes = 0;
let personajesEstabanReproduciendo = false;
let ultimoTiempoCancionPersonajes = 0;

function hayPersonajesCargados() {
    return LADOS_PERSONAJE.some((lado) => !!personajesGCD[lado].personaje);
}

function iniciarBuclePersonajes() {
    if (buclePersonajesId !== null) return;
    if (!visualizarPersonajesActivo || !hayPersonajesCargados()) return;
    buclePersonajesUltimo = performance.now();
    buclePersonajesId = requestAnimationFrame(tickPersonajes);
}

function detenerBuclePersonajes() {
    if (buclePersonajesId !== null) cancelAnimationFrame(buclePersonajesId);
    buclePersonajesId = null;
}

function bpmPersonajes() {
    const bpm = typeof currentChartData !== "undefined" && currentChartData ? parseFloat(currentChartData.bpm) : NaN;
    return Number.isFinite(bpm) && bpm > 0 ? bpm : 100;
}

function cancionSonando() {
    return typeof isPlaying !== "undefined" && isPlaying && typeof getMasterSongTime === "function";
}

function tickPersonajes(ahora) {
    buclePersonajesId = null;
    if (!visualizarPersonajesActivo || !hayPersonajesCargados()) return;
    try {
        const dt = Math.min(0.1, Math.max(0, (ahora - buclePersonajesUltimo) / 1000));
        buclePersonajesUltimo = ahora;
        const sonando = cancionSonando();
        const duracionBeat = 60 / bpmPersonajes();
        const duracionStep = duracionBeat / 4;
        let t;
        if (sonando) {
            t = getMasterSongTime();
        } else {
            relojLibrePersonajes += dt;
            t = relojLibrePersonajes;
        }
        // Al pausar / reproducir / saltar en la canción: volver al idle.
        const salto = sonando && Math.abs(t - ultimoTiempoCancionPersonajes) > 0.75;
        if (sonando !== personajesEstabanReproduciendo || salto) {
            if (!sonando) { relojLibrePersonajes = 0; t = 0; }
            LADOS_PERSONAJE.forEach((lado) => {
                const e = personajesGCD[lado];
                if (!e.personaje) return;
                e.cantando = false;
                e.terminando = false;
                e.holdTimer = 0;
                e.sostenerHasta = -1;
                e.previewHasta = 0;
                e.ultimoIndiceBaile = e.personaje.danceEvery > 0 ? Math.floor(t / (e.personaje.danceEvery * duracionBeat) + 1e-6) : null;
                bailarPersonaje(e, true);
            });
        }
        personajesEstabanReproduciendo = sonando;
        if (sonando) ultimoTiempoCancionPersonajes = t;

        LADOS_PERSONAJE.forEach((lado) => {
            const e = personajesGCD[lado];
            const p = e.personaje;
            if (!p) return;
            e.animTiempo += dt;
            // "-hold": tras terminar la animación se encadena su versión -hold si existe.
            if (animacionTerminada(e) && e.anim && !e.anim.endsWith("-hold") && p.animaciones.has(`${e.anim}-hold`)) {
                reproducirAnimPersonaje(e, `${e.anim}-hold`, true);
            }
            if (e.cantando) {
                if (sonando && t < e.sostenerHasta) e.holdTimer = 0; // sustain en curso
                else e.holdTimer += dt;
                if (e.holdTimer > p.singTime * duracionStep) {
                    e.cantando = false;
                    e.holdTimer = 0;
                    let base = e.anim || "";
                    if (base.endsWith("-hold")) base = base.slice(0, -5);
                    if (p.animaciones.has(`${base}-end`)) {
                        reproducirAnimPersonaje(e, `${base}-end`, true);
                        e.terminando = true;
                    } else {
                        bailarPersonaje(e, true);
                        e.ultimoIndiceBaile = p.danceEvery > 0 ? Math.floor(t / (p.danceEvery * duracionBeat) + 1e-6) : null;
                    }
                }
            } else if (e.terminando) {
                if (animacionTerminada(e)) {
                    e.terminando = false;
                    bailarPersonaje(e, true);
                }
            } else if (e.previewHasta > ahora) {
                // Probando una animación desde la lista.
            } else {
                if (e.previewHasta) {
                    e.previewHasta = 0;
                    bailarPersonaje(e, true);
                }
                if (p.danceEvery > 0) {
                    const indice = Math.floor(t / (p.danceEvery * duracionBeat) + 1e-6);
                    if (e.ultimoIndiceBaile === null) {
                        // Recién cargado: deja terminar la startingAnimation.
                        e.ultimoIndiceBaile = indice;
                        if (animacionTerminada(e)) bailarPersonaje(e, true);
                    } else if (indice !== e.ultimoIndiceBaile) {
                        e.ultimoIndiceBaile = indice;
                        bailarPersonaje(e, true);
                    }
                }
            }
            dibujarPersonaje(lado);
        });
    } catch (err) {
        console.warn("[Visualizar personajes]", err);
    }
    buclePersonajesId = requestAnimationFrame(tickPersonajes);
}

// Llamado desde actualizarPlaybackFiel (charter.js), en el mismo punto donde
// suenan los hitsounds, con el intervalo de tiempo (desde, hasta] de este frame.
// No depende de las casillas de hitsound.
function notificarNotasPersonajes(desde, hasta) {
    if (!visualizarPersonajesActivo || !hayPersonajesCargados()) return;
    if (typeof currentChartData === "undefined" || !currentChartData || !currentChartData.notes) return;
    if (!(hasta > desde)) return;
    const duracionStep = 60 / bpmPersonajes() / 4;
    const elegida = { opponent: null, player: null };
    const notas = currentChartData.notes;
    for (const key in notas) {
        const guion = key.indexOf("-");
        const f = parseInt(key, 10);
        const c = parseInt(key.slice(guion + 1), 10);
        if (!Number.isFinite(f) || !Number.isFinite(c)) continue;
        const tiempoNota = (f + (Number(notas[key] && notas[key].off) || 0)) * duracionStep; // V0.8.2k Modo Libre
        if (tiempoNota <= desde || tiempoNota > hasta) continue;
        const lado = c >= 4 ? "opponent" : "player"; // 0-3 jugador, 4-7 oponente
        if (!personajesGCD[lado].personaje) continue;
        if (!elegida[lado] || tiempoNota >= elegida[lado].t) {
            const len = Math.max(0, parseFloat(notas[key] && notas[key].len) || 0);
            elegida[lado] = { t: tiempoNota, dir: ((c % 4) + 4) % 4, fin: tiempoNota + len * duracionStep };
        }
    }
    LADOS_PERSONAJE.forEach((lado) => {
        const n = elegida[lado];
        if (n) cantarPersonaje(lado, n.dir, n.fin);
    });
}

function cantarPersonaje(lado, direccion, sostenerHasta) {
    const e = personajesGCD[lado];
    if (!e?.personaje) return false;
    if (!reproducirAnimPersonaje(e, DIRECCIONES_CANTO[direccion] || "singLEFT", true)) return false;
    e.cantando = true;
    e.terminando = false;
    e.holdTimer = 0;
    e.previewHasta = 0;
    e.sostenerHasta = Number.isFinite(sostenerHasta) ? sostenerHasta : -1;
    return true;
}

// Estado legible (útil para depurar desde la consola).
function estadoVisualizadorPersonaje(lado) {
    const e = personajesGCD[lado];
    if (!e) return null;
    return {
        personaje: e.personaje ? e.personaje.nombre : null,
        formato: e.personaje ? e.personaje.formato : null,
        animaciones: e.personaje ? Array.from(e.personaje.animaciones.keys()) : [],
        anim: e.anim,
        frame: indiceFrameActual(e),
        cantando: e.cantando,
        paso: e.importacion ? e.importacion.paso : 0,
        error: e.importacion ? e.importacion.error : "",
        render: e.personaje ? e.personaje.render : null,
        renderType: e.personaje ? e.personaje.renderType : null,
        faltantes: e.personaje ? e.personaje.faltantes.slice() : [],
        flujo: e.importacion ? e.importacion.flujo : null,
        pasoTipo: e.importacion ? pasoActualImportacion(e.importacion).tipo : null,
        fuentes: e.importacion && e.importacion.desc ? e.importacion.fuentes.map((f) => Object.assign({ clave: f.clave, ruta: f.ruta, tipo: f.tipo }, estadoFuenteImport(e.importacion, f))) : []
    };
}

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------

function prepararVentanaPersonaje(lado) {
    const input = document.getElementById(`char-file-${lado}`);
    if (input) {
        input.addEventListener("change", () => {
            const archivos = Array.from(input.files || []);
            const destino = input.dataset.destino || "";
            input.value = "";
            input.dataset.destino = "";
            if (archivos.length) procesarArchivosPersonaje(lado, archivos, destino);
        });
        // Si se cierra el selector sin elegir, la ventana sigue mostrando el paso
        // actual con "Elegir" y "Cancelar" (no se pierde lo ya cargado).
    }
    const cuerpo = document.getElementById(`char-body-${lado}`);
    if (cuerpo && typeof ResizeObserver === "function") {
        new ResizeObserver(() => ajustarCanvasPersonaje(lado)).observe(cuerpo);
    }
    actualizarUIPersonaje(lado);
}

window.addEventListener("load", () => {
    VENTANAS_PERSONAJES.forEach(hacerVentanaPersonajeMovible);
    LADOS_PERSONAJE.forEach(prepararVentanaPersonaje);
});

window.addEventListener("resize", () => {
    if (!visualizarPersonajesActivo) return;
    VENTANAS_PERSONAJES.forEach((id) => limitarVentanaPersonajeAlViewport(document.getElementById(id)));
});
