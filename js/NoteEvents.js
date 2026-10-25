// =====================================================================
// V0.8.2 "Event Update" — WINDOWS > Evento de Notas
// Notas personalizadas de V-Slice (NoteKind). Idea de la comunidad
// (NeonExplorer).
//
//  · Importar: 1) .hxc del NoteKind (obligatorio)
//              2) .json del NoteStyle (opcional, se puede omitir)
//              3) .xml (Sparrow) y 4) .png de las notas (solo si hay JSON)
//    También se pueden elegir varios archivos a la vez.
//  · Del .hxc se lee: super("kind", "Descripción", "noteStyleId", params).
//  · Cada nota guarda { len, kind, params: [{ name, value }] } y se exporta
//    al .fnfc como "k" y "p": [{ "n", "v" }] (NoteParamData de V-Slice).
//  · En la grilla: con JSON+XML+PNG la flecha usa el sprite del NoteStyle;
//    sin JSON se ve la flecha normal con la marca noteassets/EventNote.png.
//  · Las definiciones importadas se guardan en IndexedDB (sobreviven al
//    recargar). Este módulo nunca toca el audio, el scroll ni hace seek.
//  · V0.8.2h: note kinds predeterminados (los del editor oficial: Default,
//    Custom, Week 5/7 y Blazin'), disponibles sin importar nada.
// =====================================================================

const NK_DB_NAME = "fnf_gcd_notekinds";
const NK_STORE = "kinds";
const NK_BADGE_SRC = "noteassets/EventNote.png";
const NK_DIRECCIONES = ["left", "down", "up", "right"]; // carril % 4
const NK_PREFIJOS_POR_DEFECTO = {
    left: ["purple0", "noteLeft"],
    down: ["blue0", "noteDown"],
    up: ["green0", "noteUp"],
    right: ["red0", "noteRight"]
};
const NK_PASOS = [
    null,
    { tipo: "hxc", titulo: "HXC", texto: "Paso 1: elige el .hxc del NoteKind", accept: ".hxc,.hx,.hscript,.txt,.json,.xml,.png,.astc" },
    { tipo: "json", titulo: "JSON", texto: "Paso 2: .json del NoteStyle (opcional)", accept: ".json,application/json,.xml,.png,.astc" },
    { tipo: "xml", titulo: "XML", texto: "Paso 3: .xml (Sparrow) de las notas", accept: ".xml,text/xml,application/xml,.png,.astc" },
    { tipo: "png", titulo: "PNG", texto: "Paso 4: .png de las notas", accept: ".png,.astc,.ktx,.ktx2,image/png" }
];

// V0.8.2h: note kinds predeterminados, en el mismo orden y con los mismos nombres
// que el desplegable del Chart Editor oficial (ids de FunkinCrew/funkin.assets:
// preload/scripts/notekinds/hehPrettyGood.hxc, mom.hxc, ugh.hxc y blazin.hxc).
// Ninguno tiene parámetros. Default = sin kind; Custom = kind escrito a mano.
const NK_ID_DEFAULT = "";
const NK_ID_CUSTOM = "~CUSTOM~";
const NK_CUSTOM_STORAGE = "fnf_gcd_custom_note_kind";
const NK_PREDETERMINADOS = [
    { id: NK_ID_DEFAULT, nombre: "Default" },
    { id: NK_ID_CUSTOM, nombre: "Custom" },
    { id: "hehPrettyGood", nombre: "Heh, Pretty Good (Week 7)", script: "hehPrettyGood.hxc" },
    { id: "mom", nombre: "Mom Sings (Week 5)", script: "mom.hxc" },
    { id: "ugh", nombre: "Ugh (Week 7)", script: "ugh.hxc" },
    { id: "weekend-1-blockhigh", nombre: "Block High (Blazin')" },
    { id: "weekend-1-blocklow", nombre: "Block Low (Blazin')" },
    { id: "weekend-1-blockspin", nombre: "Block High (Spin) (Blazin')" },
    { id: "weekend-1-darnelluppercut", nombre: "Darnell Uppercut (Blazin')" },
    { id: "weekend-1-darnelluppercutprep", nombre: "Darnell Uppercut (Prep) (Blazin')" },
    { id: "weekend-1-dodgelow", nombre: "Dodge Low (Blazin')" },
    { id: "weekend-1-dodgespin", nombre: "Dodge High (Spin) (Blazin')" },
    { id: "weekend-1-fakeout", nombre: "Fakeout (Blazin')" },
    { id: "weekend-1-hithigh", nombre: "Hit High (Blazin')" },
    { id: "weekend-1-hitlow", nombre: "Hit Low (Blazin')" },
    { id: "weekend-1-hitspin", nombre: "Hit High (Spin) (Blazin')" },
    { id: "weekend-1-idle", nombre: "Idle (Blazin')" },
    { id: "weekend-1-picouppercut", nombre: "Pico Uppercut (Blazin')" },
    { id: "weekend-1-picouppercutprep", nombre: "Pico Uppercut (Prep) (Blazin')" },
    { id: "weekend-1-punchhigh", nombre: "Punch High (Blazin')" },
    { id: "weekend-1-punchhighblocked", nombre: "Punch High (Block) (Blazin')" },
    { id: "weekend-1-punchhighdodged", nombre: "Punch High (Dodge) (Blazin')" },
    { id: "weekend-1-punchhighspin", nombre: "Punch High (Spin) (Blazin')" },
    { id: "weekend-1-punchlow", nombre: "Punch Low (Blazin')" },
    { id: "weekend-1-punchlowblocked", nombre: "Punch Low (Block) (Blazin')" },
    { id: "weekend-1-punchlowdodged", nombre: "Punch Low (Dodge) (Blazin')" },
    // En blazin.hxc oficial este kind tiene la descripción "Punch High (Spin) (Blazin')"
    // (error del juego, por eso el editor oficial lo muestra repetido).
    { id: "weekend-1-punchlowspin", nombre: "Punch Low (Spin) (Blazin')", nota: "En el editor oficial aparece como \"Punch High (Spin) (Blazin')\" por un error de blazin.hxc." },
    { id: "weekend-1-reversefakeout", nombre: "Fakeout (Reverse) (Blazin')" },
    { id: "weekend-1-taunt", nombre: "Taunt (If Fakeout) (Blazin')" },
    { id: "weekend-1-tauntforce", nombre: "Taunt (Forced) (Blazin')" }
];
const nkDefsPredeterminadas = {}; // id -> definición (sin parámetros)

let noteKindsGCD = {};          // id -> definición importada
let noteKindActivo = null;      // id que se aplica a las flechas nuevas
let nkCustomActivo = false;     // el kind activo viene de Custom (texto escrito)
let nkContadorCss = 0;
let nkBadgeEstado = "desconocido"; // desconocido | cargando | ok | falta
const noteEventsUI = { vista: "inicio", editando: null, importacion: null, busqueda: "" };
const _nkGuardadoTimers = {};

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function nkEscapar(texto) {
    return String(texto == null ? "" : texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function nkToast(mensaje) {
    if (typeof mostrarToastGCD === "function") mostrarToastGCD(mensaje);
}

function nkEsKindReal(kind) {
    if (kind === null || kind === undefined) return false;
    const k = String(kind).trim();
    return k !== "" && k.toLowerCase() !== "normal";
}

function nkExtension(nombre) {
    const m = /\.([a-z0-9]+)$/i.exec(String(nombre || ""));
    return m ? m[1].toLowerCase() : "";
}

function nkTipoArchivo(archivo) {
    const ext = nkExtension(archivo && archivo.name);
    if (["hxc", "hx", "hscript"].includes(ext)) return "hxc";
    if (ext === "json") return "json";
    if (ext === "xml") return "xml";
    if (["png", "webp", "jpg", "jpeg", "astc", "ktx", "ktx2"].includes(ext)) return "png";
    const mime = String((archivo && archivo.type) || "");
    if (mime.includes("json")) return "json";
    if (mime.includes("xml")) return "xml";
    if (mime.startsWith("image/")) return "png";
    return "";
}

function nkEscRe(texto) {
    return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nkClonar(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v));
}

// Definición de un kind: la importada (si hay) o la predeterminada.
function nkObtenerDef(id) {
    if (id === null || id === undefined) return null;
    const k = String(id);
    return noteKindsGCD[k] || nkDefsPredeterminadas[k] || null;
}

function nkEsPredeterminado(id) {
    return id !== null && id !== undefined && NK_PREDETERMINADOS.some((x) => x.id === String(id));
}

function nkInfoPredeterminado(id) {
    return NK_PREDETERMINADOS.find((x) => x.id === String(id)) || null;
}

function nkCustomTexto() {
    if (typeof noteEventsUI.custom !== "string") {
        let v = "";
        try { v = localStorage.getItem(NK_CUSTOM_STORAGE) || ""; } catch (e) { }
        noteEventsUI.custom = v;
    }
    return noteEventsUI.custom;
}

function nkGuardarCustomTexto(texto) {
    noteEventsUI.custom = String(texto == null ? "" : texto);
    try { localStorage.setItem(NK_CUSTOM_STORAGE, noteEventsUI.custom); } catch (e) { }
}

function nkCustomKindValido() {
    const k = nkCustomTexto().trim();
    return nkEsKindReal(k) && k !== NK_ID_CUSTOM ? k : "";
}

// ---------------------------------------------------------------------
// Lectura del .hxc (NoteKind de V-Slice). Formato real, según el código
// de Funkin (source/funkin/play/notes/notekind/NoteKind.hx):
//   super(noteKind, description, ?noteStyleId, ?params, ?noanim, ?suffix)
//   params: Array<NoteKindParam> = [{ name, description, type, ?data }]
//   type:   NoteKindParamType.STRING | INT | FLOAT  ('String' | 'Int' | 'Float')
//   data:   { ?min, ?max, ?step, ?precision, ?defaultValue }
// En el chart cada nota guarda p: [{ n: name, v: value }] (NoteParamData).
// Se usa un mini tokenizador + parser de literales Haxe (no regex):
// soporta varias clases por archivo, variables/constantes, push(),
// objetos multilínea, comentarios, comas finales y strings con { , }.
// ---------------------------------------------------------------------
const NK_TIPOS_PARAM = { string: "STRING", int: "INT", integer: "INT", float: "FLOAT", number: "FLOAT", bool: "BOOL", boolean: "BOOL", enum: "ENUM" };
const NK_PUNTUACION = ["...", "=>", "==", "!=", "<=", ">=", "&&", "||", "->", "+=", "-=", "*=", "/=", "??", "?.", "++", "--"];

function nkTokenizar(src) {
    const toks = [];
    const n = src.length;
    let i = 0;
    while (i < n) {
        const ch = src[i];
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") { i++; continue; }
        if (ch === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
        if (ch === "/" && src[i + 1] === "*") { const fin = src.indexOf("*/", i + 2); i = fin < 0 ? n : fin + 2; continue; }
        if (ch === "#") { // preprocesador (#if x, #elseif (a || b), #else, #end): se ignora
            const m = /^#([A-Za-z_]\w*)/.exec(src.slice(i, i + 40));
            if (m) {
                i += m[0].length;
                if (m[1] === "if" || m[1] === "elseif") {
                    while (i < n && (src[i] === " " || src[i] === "\t")) i++;
                    if (src[i] === "!") i++;
                    if (src[i] === "(") {
                        let prof = 0;
                        for (; i < n; i++) { if (src[i] === "(") prof++; else if (src[i] === ")" && --prof === 0) { i++; break; } }
                    } else {
                        while (i < n && /[\w.]/.test(src[i])) i++;
                    }
                }
                continue;
            }
        }
        if (ch === '"' || ch === "'") {
            let v = "", j = i + 1;
            while (j < n && src[j] !== ch) {
                if (src[j] === "\\" && j + 1 < n) {
                    const e = src[j + 1];
                    if (e === "n") v += "\n";
                    else if (e === "t") v += "\t";
                    else if (e === "r") v += "\r";
                    else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 2, j + 6))) { v += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 4; }
                    else v += e;
                    j += 2;
                    continue;
                }
                v += src[j++];
            }
            toks.push({ k: "str", v, p: i });
            i = j + 1;
            continue;
        }
        const resto = src.slice(i, i + 64);
        const num = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.(?!\.)\d*)?(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)/.exec(resto);
        if (num && (/\d/.test(ch) || (ch === "." && /\d/.test(src[i + 1] || "")))) {
            toks.push({ k: "num", v: /^0x/i.test(num[0]) ? parseInt(num[0], 16) : parseFloat(num[0]), p: i });
            i += num[0].length;
            continue;
        }
        const id = /^[A-Za-z_]\w*/.exec(resto);
        if (id) { toks.push({ k: "id", v: id[0], p: i }); i += id[0].length; continue; }
        const multi = NK_PUNTUACION.find((s) => src.startsWith(s, i));
        if (multi) { toks.push({ k: "p", v: multi, p: i }); i += multi.length; continue; }
        toks.push({ k: "p", v: ch, p: i });
        i++;
    }
    return toks;
}

function nkEs(t, v) { return !!t && t.k === "p" && t.v === v; }
function nkEsId(t, v) { return !!t && t.k === "id" && (v === undefined || t.v === v); }
function nkEsObjetoPlano(v) { return !!v && typeof v === "object" && !Array.isArray(v) && !("$ref" in v) && !("$call" in v) && !("$new" in v) && !("$expr" in v); }

// T[i] es ( [ {  -> índice justo después de su cierre.
function nkSaltarBalanceado(T, i) {
    let prof = 0;
    for (let j = i; j < T.length; j++) {
        const t = T[j];
        if (t.k !== "p") continue;
        if (t.v === "(" || t.v === "[" || t.v === "{") prof++;
        else if (t.v === ")" || t.v === "]" || t.v === "}") { prof--; if (prof === 0) return j + 1; }
    }
    return T.length;
}

// Avanza hasta la próxima , ) ] } ; de este nivel.
function nkSaltarHastaSeparador(T, j) {
    while (j < T.length) {
        const t = T[j];
        if (t.k === "p" && (t.v === "," || t.v === ")" || t.v === "]" || t.v === "}" || t.v === ";")) return j;
        if (t.k === "p" && (t.v === "(" || t.v === "[" || t.v === "{")) { j = nkSaltarBalanceado(T, j); continue; }
        j++;
    }
    return j;
}

// Lista de argumentos/elementos hasta el cierre. T[i] es la apertura.
function nkParseLista(T, i, cierre) {
    const items = [];
    let j = i + 1, mapa = null;
    while (j < T.length && !nkEs(T[j], cierre)) {
        const r = nkParseValor(T, j);
        let k = r.i;
        if (cierre === "]" && nkEs(T[k], "=>")) { // map literal ["a" => 1]
            const rv = nkParseValor(T, k + 1);
            mapa = mapa || {};
            mapa[String(r.v)] = rv.v;
            k = rv.i;
        } else {
            items.push(r.v);
        }
        if (k <= j) k = j + 1;
        if (!nkEs(T[k], ",") && !nkEs(T[k], cierre)) k = nkSaltarHastaSeparador(T, k);
        if (nkEs(T[k], ",")) k++;
        else if (!nkEs(T[k], cierre) && k < T.length && T[k].k === "p" && /^[)\]};]$/.test(T[k].v)) break; // cierre desparejo
        j = k;
    }
    return { v: mapa && !items.length ? mapa : items, i: nkEs(T[j], cierre) ? j + 1 : j };
}

function nkParsePrimario(T, i) {
    const t = T[i];
    if (!t) return { v: undefined, i };
    if ((nkEs(t, "-") || nkEs(t, "+")) && T[i + 1] && T[i + 1].k === "num") return { v: t.v === "-" ? -T[i + 1].v : T[i + 1].v, i: i + 2 };
    if (t.k === "str" || t.k === "num") return { v: t.v, i: i + 1 };
    if (nkEsId(t, "true") || nkEsId(t, "false")) return { v: t.v === "true", i: i + 1 };
    if (nkEsId(t, "null")) return { v: null, i: i + 1 };
    if (nkEs(t, "[")) return nkParseLista(T, i, "]");
    if (nkEs(t, "{")) {
        const esObjeto = nkEs(T[i + 1], "}") || ((T[i + 1] && (T[i + 1].k === "id" || T[i + 1].k === "str")) && nkEs(T[i + 2], ":"));
        if (!esObjeto) return { v: { $expr: "bloque" }, i: nkSaltarBalanceado(T, i) };
        const obj = {};
        let j = i + 1;
        while (j < T.length && !nkEs(T[j], "}")) {
            const clave = T[j];
            if (!clave || (clave.k !== "id" && clave.k !== "str") || !nkEs(T[j + 1], ":")) { j = nkSaltarHastaSeparador(T, j + 1); if (nkEs(T[j], ",")) j++; continue; }
            const r = nkParseValor(T, j + 2);
            obj[clave.v] = r.v;
            j = r.i > j + 2 ? r.i : j + 3;
            if (!nkEs(T[j], ",") && !nkEs(T[j], "}")) j = nkSaltarHastaSeparador(T, j);
            if (nkEs(T[j], ",")) j++;
            else if (!nkEs(T[j], "}")) break;
        }
        return { v: obj, i: nkEs(T[j], "}") ? j + 1 : j };
    }
    if (nkEs(t, "(")) { // (expr) o (expr : Tipo)
        const r = nkParseValor(T, i + 1);
        const fin = nkSaltarBalanceado(T, i);
        return { v: nkEs(T[r.i], ")") || nkEs(T[r.i], ":") ? r.v : { $expr: "()" }, i: fin };
    }
    if (nkEsId(t, "cast")) {
        if (nkEs(T[i + 1], "(")) { const r = nkParseValor(T, i + 2); return { v: r.v, i: nkSaltarBalanceado(T, i + 1) }; }
        return nkParsePrimario(T, i + 1);
    }
    if (t.k === "id") {
        const esNew = t.v === "new";
        let j = esNew ? i + 1 : i;
        if (!nkEsId(T[j])) return { v: { $expr: t.v }, i: i + 1 };
        let nombre = T[j].v;
        j++;
        while (nkEs(T[j], ".") && nkEsId(T[j + 1])) { nombre += "." + T[j + 1].v; j += 2; }
        if (nkEs(T[j], "<") && esNew) { let prof = 0; for (; j < T.length; j++) { if (nkEs(T[j], "<")) prof++; else if (nkEs(T[j], ">") && --prof === 0) { j++; break; } } }
        if (nkEs(T[j], "(")) {
            const r = nkParseLista(T, j, ")");
            return { v: esNew ? { $new: nombre, args: r.v } : { $call: nombre, args: r.v }, i: r.i };
        }
        return { v: esNew ? { $new: nombre, args: [] } : { $ref: nombre }, i: j };
    }
    return { v: { $expr: String(t.v) }, i: i + 1 };
}

// Valor completo: primario + (opcional) + - * / entre constantes; lo demás se marca como expresión.
function nkParseValor(T, i) {
    let r = nkParsePrimario(T, i);
    let v = r.v, j = r.i;
    while (T[j] && T[j].k === "p" && ["+", "-", "*", "/"].includes(T[j].v)) {
        const op = T[j].v;
        const d = nkParsePrimario(T, j + 1);
        if (d.i <= j + 1) break;
        const a = v, b = d.v;
        if (typeof a === "number" && typeof b === "number") v = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
        else if (op === "+" && (typeof a === "string" || typeof b === "string") && ["string", "number"].includes(typeof a) && ["string", "number"].includes(typeof b)) v = String(a) + String(b);
        else v = { $expr: "op" };
        j = d.i;
    }
    if (T[j] && !(T[j].k === "p" && [",", ")", "]", "}", ";", ":", "=>"].includes(T[j].v))) {
        v = { $expr: "compuesta" };
        j = nkSaltarHastaSeparador(T, j);
    }
    return { v, i: j };
}

// Índice del primer token con pos >= p
function nkClases(T) {
    const clases = [];
    for (let i = 0; i < T.length; i++) {
        if (!nkEsId(T[i], "class") || !nkEsId(T[i + 1])) continue;
        const nombre = T[i + 1].v;
        let j = i + 2, padre = "";
        if (nkEs(T[j], "<")) { let prof = 0; for (; j < T.length; j++) { if (nkEs(T[j], "<")) prof++; else if (nkEs(T[j], ">") && --prof === 0) { j++; break; } } }
        if (nkEsId(T[j], "extends") && nkEsId(T[j + 1])) {
            padre = T[j + 1].v; j += 2;
            while (nkEs(T[j], ".") && nkEsId(T[j + 1])) { padre += "." + T[j + 1].v; j += 2; }
        }
        while (j < T.length && !nkEs(T[j], "{") && !nkEs(T[j], ";")) j++;
        if (!nkEs(T[j], "{")) continue;
        const fin = nkSaltarBalanceado(T, j);
        clases.push({ nombre, padre, ini: j, fin });
        i = j;
    }
    return clases;
}

// var/final NOMBRE(:Tipo)? = valor   y   NOMBRE.push(valor)   y   NOMBRE = valor
function nkDeclaraciones(T) {
    const decl = [];
    for (let i = 0; i < T.length; i++) {
        const t = T[i];
        if ((nkEsId(t, "var") || nkEsId(t, "final")) && nkEsId(T[i + 1])) {
            let j = i + 2;
            if (nkEs(T[j], ":")) {
                let prof = 0;
                for (j++; j < T.length; j++) {
                    const x = T[j];
                    if (x.k !== "p") continue;
                    if (x.v === "(" || x.v === "[" || x.v === "{" || x.v === "<") prof++;
                    else if (x.v === ")" || x.v === "]" || x.v === "}" || x.v === ">") prof--;
                    else if (x.v === "->") continue;
                    if (prof <= 0 && (x.v === "=" || x.v === ";" || x.v === ",")) break;
                    if (prof < 0) break;
                }
            }
            if (nkEs(T[j], "=")) decl.push({ tipo: "decl", nombre: T[i + 1].v, i: j + 1, pos: i });
        } else if (nkEsId(t) && nkEs(T[i + 1], ".") && nkEsId(T[i + 2], "push") && nkEs(T[i + 3], "(")) {
            decl.push({ tipo: "push", nombre: t.v, i: i + 4, pos: i });
        } else if (nkEsId(t) && nkEs(T[i + 1], "=") && !nkEsId(T[i - 1], "var") && !nkEsId(T[i - 1], "final") && !nkEs(T[i - 1], ":") && !nkEs(T[i - 1], "?")) {
            // asignación (también this.NOMBRE = ...); se excluyen parámetros con valor por defecto
            let k = i - 1;
            if (nkEs(T[k], ".") && nkEsId(T[k - 1], "this")) k -= 2;
            if (!nkEs(T[k], "(") && !nkEs(T[k], ",")) decl.push({ tipo: "asig", nombre: t.v, i: i + 2, pos: i });
        }
    }
    return decl;
}

function nkCrearContexto(texto) {
    const T = nkTokenizar(texto);
    return { T, clases: nkClases(T), decl: nkDeclaraciones(T), cache: {} };
}

function nkClaseDe(ctx, pos) {
    return ctx.clases.find((c) => pos > c.ini && pos < c.fin) || null;
}

// Valor de una variable por nombre: prefiere la declaración de la misma clase.
function nkValorVariable(ctx, nombre, clase, prof) {
    const mismas = ctx.decl.filter((d) => d.nombre === nombre);
    if (!mismas.length) return undefined;
    const enClase = clase ? mismas.filter((d) => nkClaseDe(ctx, d.pos) === clase) : [];
    const lista = enClase.length ? enClase : mismas;
    const base = lista.find((d) => d.tipo === "decl") || lista.find((d) => d.tipo === "asig");
    let valor = base ? nkResolver(ctx, nkParseValor(ctx.T, base.i).v, clase, prof + 1) : undefined;
    lista.filter((d) => d.tipo === "push").forEach((d) => {
        if (valor === undefined) valor = [];
        if (!Array.isArray(valor)) return;
        nkParseLista(ctx.T, d.i - 1, ")").v.forEach((x) => valor.push(nkResolver(ctx, x, clase, prof + 1)));
    });
    return valor;
}

// Valor devuelto por una función del archivo:  function NOMBRE(...) { ... return VALOR; }
function nkValorRetorno(ctx, nombre, clase, prof) {
    const T = ctx.T;
    for (let i = 0; i < T.length; i++) {
        if (!nkEsId(T[i], "function") || !nkEsId(T[i + 1], nombre) || !nkEs(T[i + 2], "(")) continue;
        if (clase && nkClaseDe(ctx, i) !== clase) continue;
        let j = nkSaltarBalanceado(T, i + 2);
        while (j < T.length && !nkEs(T[j], "{") && !nkEsId(T[j], "return") && !nkEs(T[j], ";")) j++;
        // Cuerpo de una sola expresión:  function NOMBRE() return VALOR;
        if (nkEsId(T[j], "return")) return nkResolver(ctx, nkParseValor(T, j + 1).v, clase, prof + 1);
        if (!nkEs(T[j], "{")) continue;
        const fin = nkSaltarBalanceado(T, j);
        for (let k = j; k < fin; k++) if (nkEsId(T[k], "return")) return nkResolver(ctx, nkParseValor(T, k + 1).v, clase, prof + 1);
    }
    return undefined;
}

function nkResolver(ctx, v, clase, prof, ambito) {
    prof = prof || 0;
    if (prof > 12) return v;
    if (Array.isArray(v)) return v.map((x) => nkResolver(ctx, x, clase, prof + 1, ambito));
    if (!v || typeof v !== "object") return v;
    if ("$ref" in v) {
        const partes = v.$ref.split(".");
        if (partes[0] === "NoteKindParamType" || partes[0] === "SongNoteFieldType" || partes[0] === "SongEventFieldType") return v;
        const nombre = partes[0] === "this" || partes.length > 1 ? partes[partes.length - 1] : partes[0];
        if (ambito && Object.prototype.hasOwnProperty.call(ambito, nombre)) {
            if (ambito[nombre].tieneDefecto) return nkResolver(ctx, ambito[nombre].valor, clase, prof + 1);
            if (partes.length === 1) return { $ref: v.$ref, sinValor: true };
        }
        const r = nkValorVariable(ctx, nombre, clase, prof);
        return r === undefined ? v : r;
    }
    if ("$new" in v) {
        const args = v.args.map((x) => nkResolver(ctx, x, clase, prof + 1, ambito));
        // new SongEventSchema([...]) / new SongNoteSchema([...]) -> el array; sin argumentos -> [] (luego .push)
        if (/Schema$/.test(v.$new)) return args.length ? args[0] : [];
        return { $new: v.$new, args };
    }
    if ("$call" in v) {
        const partes = v.$call.split(".");
        const nombre = partes[partes.length - 1];
        if (nombre === "concat" && partes.length > 1) {
            const base = nkResolver(ctx, { $ref: partes.slice(0, -1).join(".") }, clase, prof + 1, ambito);
            const extra = nkResolver(ctx, v.args[0], clase, prof + 1, ambito);
            if (Array.isArray(base) && Array.isArray(extra)) return base.concat(extra);
        }
        const r = nkValorRetorno(ctx, nombre, clase, prof);
        return r === undefined ? v : r;
    }
    if ("$expr" in v) return v;
    const out = {};
    Object.keys(v).forEach((k) => { out[k] = nkResolver(ctx, v[k], clase, prof + 1, ambito); });
    return out;
}

function nkTextoValor(v) {
    if (v && typeof v === "object") {
        if ("$ref" in v) return v.$ref;
        if ("$call" in v) return v.$call + "(...)";
        if ("$new" in v) return "new " + v.$new + "(...)";
        return "expresión";
    }
    return JSON.stringify(v);
}

function nkNumero(v) { return typeof v === "number" && Number.isFinite(v) ? v : undefined; }

// Objeto Haxe ya resuelto -> parámetro normalizado { name, description, type, data, opciones? }
function nkNormalizarParam(obj, avisos) {
    if (!nkEsObjetoPlano(obj)) { avisos.push(`No se pudo leer un parámetro (${nkTextoValor(obj)}).`); return null; }
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) { avisos.push("Un parámetro no tiene \"name\" y se ignoró."); return null; }
    let tipoTxt = "";
    if (typeof obj.type === "string") tipoTxt = obj.type;
    else if (obj.type && obj.type.$ref) tipoTxt = obj.type.$ref.split(".").pop();
    const fuente = nkEsObjetoPlano(obj.data) ? obj.data : obj; // data { } (V-Slice) o campos sueltos
    const data = {};
    ["min", "max", "step", "precision"].forEach((k) => { const n = nkNumero(fuente[k]); if (n !== undefined) data[k] = n; });
    if (["string", "number", "boolean"].includes(typeof fuente.defaultValue)) data.defaultValue = fuente.defaultValue;
    let type = NK_TIPOS_PARAM[tipoTxt.toLowerCase().replace(/^ranged_?/, "")];
    if (!type) {
        const dv = data.defaultValue;
        if (!tipoTxt && dv !== undefined) {
            type = typeof dv === "boolean" ? "BOOL" : typeof dv === "number" ? (Number.isInteger(dv) ? "INT" : "FLOAT") : "STRING";
            avisos.push(`"${name}" no tiene type; se dedujo ${type} por su defaultValue.`);
        } else {
            avisos.push(`"${name}" tiene un type desconocido (${tipoTxt || "sin type"}); V-Slice solo admite String, Int y Float, así que se ignoró.`);
            return null;
        }
    }
    if (type !== "STRING" && type !== "INT" && type !== "FLOAT" || /^ranged_?/i.test(tipoTxt)) {
        avisos.push(`"${name}" usa type ${tipoTxt || type}, que no es oficial de V-Slice (String, Int, Float); aquí se edita igual, pero el editor del juego no lo muestra.`);
    }
    const p = {
        name,
        description: typeof obj.description === "string" ? obj.description : (typeof obj.title === "string" ? obj.title : ""),
        type,
        data
    };
    if (type === "ENUM") {
        const keys = nkEsObjetoPlano(obj.keys) ? obj.keys : {};
        p.opciones = Object.keys(keys).map((label) => ({ label, value: keys[label] })).filter((o) => ["string", "number", "boolean"].includes(typeof o.value));
        if (!p.opciones.length) { avisos.push(`"${name}" es enum pero no tiene keys; se ignoró.`); return null; }
    }
    return p;
}

// Lista de parámetros (con push / asignaciones a params dentro de la clase).
function nkParamsDeClase(ctx, clase, valorArg, ambito, avisos) {
    let lista = nkResolver(ctx, valorArg, clase, 0, ambito);
    const crudos = [];
    if (Array.isArray(lista)) crudos.push(...lista);
    else if (lista && typeof lista === "object" && !lista.sinValor) avisos.push(`No se pudieron leer los params (${nkTextoValor(lista)}).`);
    // this.params = [...] / params = [...] / params.push({...}) dentro de la clase (después de super)
    ctx.decl.filter((d) => d.nombre === "params" && d.tipo !== "decl" && d.pos > clase.ini && d.pos < clase.fin && d.pos > (clase.superPos || 0)).forEach((d) => {
        if (d.tipo === "asig") {
            const v = nkResolver(ctx, nkParseValor(ctx.T, d.i).v, clase, 0, null);
            if (Array.isArray(v)) { crudos.length = 0; crudos.push(...v); }
        } else {
            nkParseLista(ctx.T, d.i - 1, ")").v.forEach((x) => crudos.push(nkResolver(ctx, x, clase, 0, null)));
        }
    });
    // Formato nuevo (PR "More Note Kind Params"): function getNoteSchema() return new SongNoteSchema([...])
    if (!crudos.length) {
        const esquema = nkValorRetorno(ctx, "getNoteSchema", clase, 0);
        if (Array.isArray(esquema)) crudos.push(...esquema);
    }
    const params = [];
    const vistos = new Set();
    crudos.forEach((obj) => {
        const p = nkNormalizarParam(obj, avisos);
        if (!p) return;
        if (vistos.has(p.name)) { avisos.push(`El parámetro "${p.name}" está repetido; se usó el primero.`); return; }
        vistos.add(p.name);
        params.push(p);
    });
    return params;
}

// Parámetros del constructor: function new(noteKind:String = "x", ?params:Array<...>)
function nkAmbitoConstructor(ctx, clase) {
    const T = ctx.T;
    for (let i = clase.ini; i < clase.fin; i++) {
        if (!nkEsId(T[i], "function") || !nkEsId(T[i + 1], "new") || !nkEs(T[i + 2], "(")) continue;
        const ambito = {};
        const finArgs = nkSaltarBalanceado(T, i + 2) - 1;
        let j = i + 3;
        while (j < finArgs) {
            if (nkEs(T[j], "?")) j++;
            if (!nkEsId(T[j])) { j++; continue; }
            const nombre = T[j].v;
            let k = j + 1, prof = 0;
            for (; k < finArgs; k++) {
                const x = T[k];
                if (x.k !== "p") continue;
                if (x.v === "(" || x.v === "[" || x.v === "{" || x.v === "<") prof++;
                else if (x.v === ")" || x.v === "]" || x.v === "}" || x.v === ">") prof--;
                else if (prof === 0 && (x.v === "=" || x.v === ",")) break;
            }
            if (nkEs(T[k], "=")) {
                const r = nkParseValor(T, k + 1);
                ambito[nombre] = { tieneDefecto: true, valor: r.v };
                k = r.i;
            } else ambito[nombre] = { tieneDefecto: false };
            while (k < finArgs && !nkEs(T[k], ",")) k++;
            j = k + 1;
        }
        let cuerpo = finArgs + 1;
        while (cuerpo < clase.fin && !nkEs(T[cuerpo], "{")) cuerpo++;
        return { ambito, cuerpoIni: cuerpo, cuerpoFin: nkSaltarBalanceado(T, cuerpo) };
    }
    return null;
}

function nkAnalizarClase(ctx, clase) {
    const T = ctx.T;
    const ctor = nkAmbitoConstructor(ctx, clase);
    const ambito = ctor ? ctor.ambito : {};
    let args = null;
    const desde = ctor ? ctor.cuerpoIni : clase.ini, hasta = ctor ? ctor.cuerpoFin : clase.fin;
    for (let i = desde; i < hasta; i++) {
        if (nkEsId(T[i], "super") && nkEs(T[i + 1], "(")) { args = nkParseLista(T, i + 1, ")").v; clase.superPos = i; break; }
    }
    const avisos = [];
    const res = (k) => (args && k < args.length ? nkResolver(ctx, args[k], clase, 0, ambito) : undefined);
    const a0 = res(0), a1 = res(1), a2 = res(2);
    const id = typeof a0 === "string" ? a0.trim() : "";
    let estilo = null;
    if (typeof a2 === "string" && a2.trim()) estilo = a2.trim();
    else if (a2 && typeof a2 === "object" && !a2.sinValor) avisos.push(`No se pudo leer el noteStyleId (${nkTextoValor(a2)}); se usará sin estilo.`);
    let descripcion = typeof a1 === "string" ? a1 : "";
    if (a1 && typeof a1 === "object" && !a1.sinValor) avisos.push(`No se pudo leer la descripción (${nkTextoValor(a1)}).`);
    const params = args ? nkParamsDeClase(ctx, clase, args.length > 3 ? args[3] : undefined, ambito, avisos) : [];
    return { id, descripcion, estilo, clase: clase.nombre, params, avisos, tieneSuper: !!args, a0 };
}

// Respaldo: objetos { name: ..., type: ... } sueltos en el archivo.
function nkParamsSueltos(ctx, avisos) {
    const T = ctx.T, crudos = [];
    for (let i = 0; i < T.length; i++) {
        if (!nkEs(T[i], "{") || !nkEsId(T[i + 1], "name") || !nkEs(T[i + 2], ":")) continue;
        const r = nkParseValor(T, i);
        const v = nkResolver(ctx, r.v, nkClaseDe(ctx, i), 0);
        if (nkEsObjetoPlano(v) && "type" in v) crudos.push(v);
    }
    const params = [], vistos = new Set();
    crudos.forEach((o) => { const p = nkNormalizarParam(o, avisos); if (p && !vistos.has(p.name)) { vistos.add(p.name); params.push(p); } });
    return params;
}

function analizarHxcNoteKind(textoOriginal, nombreArchivo) {
    const texto = String(textoOriginal || "").replace(/^\uFEFF/, "");
    const ctx = nkCrearContexto(texto);
    const T = ctx.T;
    const tieneSuper = T.some((t, i) => nkEsId(t, "super") && nkEs(T[i + 1], "("));
    if (!ctx.clases.length && !tieneSuper && !/NoteKind/.test(texto)) {
        throw new Error(`"${nombreArchivo}" no parece un script NoteKind (.hxc): no tiene "class ... extends NoteKind" ni "super(...)".`);
    }
    const nombres = new Set(ctx.clases.map((c) => c.nombre));
    const esKind = (c, prof) => {
        const base = c.padre.split(".").pop();
        if (/NoteKind$/.test(base)) return true;
        const padre = ctx.clases.find((x) => x.nombre === base);
        return !!padre && prof < 8 && esKind(padre, prof + 1);
    };
    let candidatas = ctx.clases.filter((c) => esKind(c, 0));
    const avisosGenerales = [];
    if (!candidatas.length && ctx.clases.length) {
        const c = ctx.clases[0];
        avisosGenerales.push(c.padre ? `La clase extiende "${c.padre}" (se esperaba NoteKind).` : `La clase "${c.nombre}" no extiende NoteKind.`);
        candidatas = [c];
    }
    let kinds = candidatas.map((c) => nkAnalizarClase(ctx, c));
    const conId = kinds.filter((k) => k.id);
    const principal = conId.length ? conId[0] : (kinds[0] || { id: "", descripcion: "", estilo: null, clase: "", params: [], avisos: [] });
    const otros = conId.slice(conId.indexOf(principal) + 1).filter((k) => k.id !== principal.id);
    principal.avisos = avisosGenerales.concat(principal.avisos || []);

    if (!principal.id) {
        const k = /\bkind\s*==\s*["']([^"']+)["']/.exec(texto);
        if (k) { principal.id = k[1]; principal.avisos.push(`El kind se tomó de la comparación kind == "${k[1]}".`); }
        else if (principal.clase) { principal.id = principal.clase.replace(/Note(Kind)?$/i, "").toLowerCase() || principal.clase.toLowerCase(); principal.avisos.push(`No se encontró el kind en super(); se usó "${principal.id}" (nombre de la clase).`); }
        else { principal.id = String(nombreArchivo || "custom").replace(/\.[^.]+$/, "").toLowerCase(); principal.avisos.push(`Se usó el nombre del archivo como kind ("${principal.id}").`); }
    }
    if (!principal.params.length && !otros.length && /NoteKindParamType|defaultValue/.test(texto)) {
        const sueltos = nkParamsSueltos(ctx, []);
        if (sueltos.length) {
            principal.params = sueltos;
            principal.avisos.push(`Los parámetros no estaban en super(); se tomaron ${sueltos.length} objeto${sueltos.length === 1 ? "" : "s"} { name, type } del archivo.`);
        }
    }
    if (otros.length) principal.avisos.push(`El archivo trae ${otros.length + 1} NoteKinds; se importan todos (${[principal].concat(otros).map((k) => k.id).join(", ")}).`);
    const limpiar = (k) => ({ id: k.id, descripcion: k.descripcion || k.clase || k.id, estilo: k.estilo, clase: k.clase || "", params: k.params, avisos: k.avisos || [] });
    const salida = limpiar(principal);
    salida.otros = otros.map(limpiar);
    return salida;
}

// ---------------------------------------------------------------------
// NoteStyle (.json) + Sparrow (.xml) + PNG -> sprites por dirección
// ---------------------------------------------------------------------
function nkValidarNoteStyle(data, nombre) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`"${nombre}" no es un NoteStyle de V-Slice.`);
    const note = data.assets && data.assets.note;
    if (!note || typeof note !== "object") {
        if (Array.isArray(data.animations)) throw new Error(`"${nombre}" parece el JSON de un personaje, no un NoteStyle (falta assets.note).`);
        throw new Error(`"${nombre}" no es un NoteStyle de V-Slice (falta "assets.note").`);
    }
    return data;
}

function nkPrefijosDireccion(json, dir) {
    const d = json && json.assets && json.assets.note && json.assets.note.data;
    const prefijo = d && d[dir] && typeof d[dir].prefix === "string" ? d[dir].prefix : null;
    return prefijo ? [prefijo] : NK_PREFIJOS_POR_DEFECTO[dir];
}

function nkFrameDireccion(atlas, json, dir) {
    for (const prefijo of nkPrefijosDireccion(json, dir)) {
        const frames = atlas.frames.filter((f) => f.nombre.startsWith(prefijo));
        if (frames.length) {
            frames.sort((a, b) => (a.num - b.num) || (a.orden - b.orden));
            return frames[0];
        }
    }
    return null;
}

function nkLeerAtlas(texto) {
    if (typeof leerAtlasSparrow !== "function") throw new Error("Falta el lector de XML Sparrow.");
    return leerAtlasSparrow(texto);
}

function nkCargarImagen(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            if (!img.naturalWidth || !img.naturalHeight) { URL.revokeObjectURL(url); reject(new Error("La imagen está vacía.")); return; }
            resolve({ img, url });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo abrir la imagen. ¿Es un .png válido?")); };
        img.src = url;
    });
}

async function nkConstruirSprites(def) {
    if (!def || !def.json || !def.xml || !def.png || !def.png.blob) return null;
    const atlas = nkLeerAtlas(def.xml.texto);
    const { img, url } = await nkCargarImagen(def.png.blob);
    const sprites = {};
    try {
        NK_DIRECCIONES.forEach((dir) => {
            const f = nkFrameDireccion(atlas, def.json.data, dir);
            if (!f) return;
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(f.fw));
            canvas.height = Math.max(1, Math.round(f.fh));
            const ctx = canvas.getContext("2d");
            ctx.translate(f.offX, f.offY);
            if (f.rot) { ctx.translate(0, f.dh); ctx.rotate(-Math.PI / 2); }
            ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
            sprites[dir] = canvas.toDataURL("image/png");
        });
    } finally {
        URL.revokeObjectURL(url);
    }
    return Object.keys(sprites).length ? sprites : null;
}

function nkActualizarEstilosSprites() {
    let style = document.getElementById("note-kinds-sprites");
    if (!style) {
        style = document.createElement("style");
        style.id = "note-kinds-sprites";
        document.head.appendChild(style);
    }
    let css = "";
    Object.values(noteKindsGCD).forEach((def) => {
        if (!def._sprites) return;
        NK_DIRECCIONES.forEach((dir, i) => {
            const src = def._sprites[dir];
            if (src) css += `.grid-note-circle.nk-sprite.${def._css}.note-col-${i}{background-image:url("${src}");}\n`;
        });
    });
    style.textContent = css;
}

// ---------------------------------------------------------------------
// Marca EventNote.png (se pide solo cuando hace falta; con respaldo CSS)
// ---------------------------------------------------------------------
function nkAsegurarBadge() {
    if (nkBadgeEstado !== "desconocido") return;
    nkBadgeEstado = "cargando";
    const img = new Image();
    img.onload = () => {
        nkBadgeEstado = img.naturalWidth ? "ok" : "falta";
        document.body.classList.toggle("nk-badge-img", nkBadgeEstado === "ok");
        nkActualizarAvisoBadge();
    };
    img.onerror = () => {
        nkBadgeEstado = "falta";
        document.body.classList.remove("nk-badge-img");
        nkActualizarAvisoBadge();
    };
    img.src = NK_BADGE_SRC;
}

function nkActualizarAvisoBadge() {
    const aviso = document.getElementById("nk-badge-status");
    if (!aviso) return;
    aviso.hidden = nkBadgeEstado !== "falta";
}

// ---------------------------------------------------------------------
// Pintado en la grilla (lo llaman repintarCeldaNota y pintarNotasActuales)
// ---------------------------------------------------------------------
function decorarCeldaNotaKind(cell, circulo, nota, carril) {
    if (!cell) return;
    cell.querySelectorAll(".note-kind-badge").forEach((el) => el.remove());
    cell.classList.remove("has-note-kind");
    if (!nota || !nkEsKindReal(nota.kind)) {
        if (cell.dataset.nkTitle) { cell.removeAttribute("title"); delete cell.dataset.nkTitle; }
        return;
    }
    const kind = String(nota.kind);
    const def = nkObtenerDef(kind);
    cell.classList.add("has-note-kind");
    let titulo = def ? `${def.descripcion || def.id} (kind: ${def.id}${def.predeterminado ? " · predeterminado" : ""})` : `${kind} (kind no importado)`;
    if (Array.isArray(nota.params) && nota.params.length) {
        titulo += "\n" + nota.params.map((p) => `${p.name}: ${p.value}`).join("\n");
    }
    cell.title = titulo;
    cell.dataset.nkTitle = "1";
    const dir = NK_DIRECCIONES[((parseInt(carril, 10) || 0) % 4 + 4) % 4];
    if (def && def._sprites && def._sprites[dir] && circulo) {
        circulo.classList.add("nk-sprite", def._css);
        return;
    }
    const badge = document.createElement("span");
    badge.className = "note-kind-badge" + (def ? "" : " unknown");
    badge.setAttribute("aria-hidden", "true");
    cell.appendChild(badge);
    nkAsegurarBadge();
}

function nkRepintarNotasConKind(kind) {
    if (!currentChartData || !currentChartData.notes || typeof repintarCeldaNota !== "function") return;
    Object.keys(currentChartData.notes).forEach((key) => {
        const nota = currentChartData.notes[key];
        if (nota && nkEsKindReal(nota.kind) && (!kind || nota.kind === kind)) repintarCeldaNota(key);
    });
}

// Nota nueva al tocar una casilla (charter.js). Con un kind activo, lo lleva.
function nuevaNotaGCD() {
    if (!nkEsKindReal(noteKindActivo)) return { len: 0 };
    const def = nkCustomActivo ? null : nkObtenerDef(noteKindActivo);
    if (!def) return { len: 0, kind: String(noteKindActivo) }; // Custom: k = texto, p vacío
    const nota = { len: 0, kind: def.id };
    const params = nkParamsActuales(def);
    if (params.length) nota.params = params;
    return nota;
}

// ---------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------
function nkValorPorDefecto(p) {
    const d = p.data || {};
    if (d.defaultValue !== undefined && d.defaultValue !== null) return nkNormalizarValor(p, d.defaultValue);
    if (p.type === "BOOL") return false;
    if (p.type === "STRING") return "";
    if (p.type === "ENUM") return p.opciones && p.opciones.length ? p.opciones[0].value : "";
    let v = 0; // como el juego: defaultValue ?? 0
    if (typeof d.min === "number" && v < d.min) v = d.min;
    if (typeof d.max === "number" && v > d.max) v = d.max;
    return v;
}

function nkNormalizarValor(p, valor) {
    const d = p.data || {};
    if (p.type === "BOOL") return valor === true || valor === "true" || valor === 1 || valor === "1";
    if (p.type === "STRING") return String(valor == null ? "" : valor);
    if (p.type === "ENUM") {
        const ops = p.opciones || [];
        const o = ops.find((x) => x.value === valor) || ops.find((x) => String(x.value) === String(valor));
        return o ? o.value : (ops.length ? ops[0].value : "");
    }
    let n = parseFloat(valor);
    if (!Number.isFinite(n)) n = 0;
    if (typeof d.min === "number") n = Math.max(d.min, n);
    if (typeof d.max === "number") n = Math.min(d.max, n);
    if (p.type === "INT") return Math.round(n);
    if (typeof d.precision === "number" && d.precision >= 0) n = parseFloat(n.toFixed(Math.min(10, d.precision)));
    return n;
}

function nkValor(def, p) {
    def.valores = def.valores || {};
    if (!(p.name in def.valores)) return nkValorPorDefecto(p);
    return nkNormalizarValor(p, def.valores[p.name]);
}

function nkParamsActuales(def) {
    return (def.params || []).map((p) => ({ name: p.name, value: nkValor(def, p) }));
}

function nkEtiquetaTipo(tipo) {
    return { INT: "Int", FLOAT: "Float", STRING: "String", BOOL: "Bool", ENUM: "Enum" }[tipo] || tipo;
}

// ---------------------------------------------------------------------
// IndexedDB (definiciones globales)
// ---------------------------------------------------------------------
function nkAbrirDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error("IndexedDB no disponible")); return; }
        const req = indexedDB.open(NK_DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(NK_STORE)) db.createObjectStore(NK_STORE, { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("No se pudo abrir IndexedDB"));
    });
}

function nkSerializable(def) {
    const out = {};
    Object.keys(def).forEach((k) => { if (!k.startsWith("_")) out[k] = def[k]; });
    return out;
}

async function nkGuardarDef(def) {
    const db = await nkAbrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(NK_STORE, "readwrite");
        tx.objectStore(NK_STORE).put(nkSerializable(def));
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
    });
}

async function nkBorrarDefDB(id) {
    const db = await nkAbrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(NK_STORE, "readwrite");
        tx.objectStore(NK_STORE).delete(id);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function nkLeerDefsDB() {
    const db = await nkAbrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(NK_STORE, "readonly");
        const req = tx.objectStore(NK_STORE).getAll();
        req.onsuccess = () => { db.close(); resolve(req.result || []); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

function nkProgramarGuardado(def) {
    clearTimeout(_nkGuardadoTimers[def.id]);
    _nkGuardadoTimers[def.id] = setTimeout(() => {
        nkGuardarDef(def).catch((e) => console.warn("[Evento de Notas] No se pudo guardar", e));
    }, 500);
}

function nkPrepararDef(def) {
    def._css = "nk-s-" + (++nkContadorCss);
    def.valores = def.valores || {};
    def.params = Array.isArray(def.params) ? def.params : [];
    return def;
}

let noteKindsListos = false;
async function cargarNoteKindsGuardados() {
    try {
        const lista = await nkLeerDefsDB();
        for (const rec of lista) {
            if (!rec || !rec.id) continue;
            // V0.8.2f: se vuelve a leer el .hxc guardado con el parser nuevo (corrige params mal detectados).
            if (rec.hxc && typeof rec.hxc.texto === "string") {
                try {
                    const info = analizarHxcNoteKind(rec.hxc.texto, rec.hxc.nombre || rec.id);
                    const k = [info].concat(info.otros || []).find((x) => x.id === rec.id);
                    if (k) { rec.params = k.params; rec.descripcion = k.descripcion; rec.estilo = k.estilo; rec.avisos = k.avisos; }
                } catch (e) { }
            }
            const def = nkPrepararDef(rec);
            try { def._sprites = await nkConstruirSprites(def); } catch (e) { def._sprites = null; }
            noteKindsGCD[def.id] = def;
        }
    } catch (e) {
        console.warn("[Evento de Notas] No se pudieron leer los note kinds guardados", e);
    }
    noteKindsListos = true;
    nkActualizarEstilosSprites();
    nkRepintarNotasConKind();
    renderizarNoteEvents();
}

// ---------------------------------------------------------------------
// Ventana
// ---------------------------------------------------------------------
function abrirVentanaNoteEvents() {
    const ventana = document.getElementById("note-events-window");
    if (!ventana) return;
    document.getElementById("menu-windows-wrapper")?.classList.remove("open");
    ventana.classList.add("active");
    ventana.classList.remove("minimized");
    ventana.setAttribute("aria-hidden", "false");
    const boton = ventana.querySelector(".floating-window-minimize i");
    if (boton) boton.className = "fa-solid fa-minus";
    renderizarNoteEvents();
}

function cerrarVentanaNoteEvents() {
    const ventana = document.getElementById("note-events-window");
    if (!ventana) return;
    ventana.classList.remove("active");
    ventana.setAttribute("aria-hidden", "true");
}

function alternarMinimizarNoteEvents() {
    const ventana = document.getElementById("note-events-window");
    const boton = ventana?.querySelector(".floating-window-minimize i");
    if (!ventana) return;
    ventana.classList.toggle("minimized");
    if (boton) boton.className = ventana.classList.contains("minimized") ? "fa-solid fa-square-plus" : "fa-solid fa-minus";
}

function hacerVentanaNoteEventsMovible() {
    const ventana = document.getElementById("note-events-window");
    const cabecera = document.getElementById("note-events-window-header");
    if (!ventana || !cabecera) return;
    let arrastrando = false, offsetX = 0, offsetY = 0;
    cabecera.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        if (typeof esPortraitPermitidoActivo === "function" && esPortraitPermitidoActivo()) return;
        const rect = ventana.getBoundingClientRect();
        arrastrando = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        try { cabecera.setPointerCapture(event.pointerId); } catch (e) { }
    });
    cabecera.addEventListener("pointermove", (event) => {
        if (!arrastrando) return;
        const maxX = Math.max(0, window.innerWidth - ventana.offsetWidth);
        const maxY = Math.max(32, window.innerHeight - ventana.offsetHeight);
        ventana.style.left = `${Math.min(maxX, Math.max(0, event.clientX - offsetX))}px`;
        ventana.style.top = `${Math.min(maxY, Math.max(32, event.clientY - offsetY))}px`;
    });
    cabecera.addEventListener("pointerup", () => { arrastrando = false; });
    cabecera.addEventListener("pointercancel", () => { arrastrando = false; });
}

function mostrarVistaNoteEvents(vista, id) {
    noteEventsUI.vista = vista;
    if (id !== undefined) noteEventsUI.editando = id;
    if (vista !== "importar" && noteEventsUI.importacion) noteEventsUI.importacion = null;
    renderizarNoteEvents();
}

// Kinds usados por el chart abierto (todas las dificultades) -> Map(kind -> nº de flechas)
function nkKindsEnChart() {
    const mapa = new Map();
    if (!currentChartData) return mapa;
    const vistos = new Set();
    const contar = (notes) => {
        if (!notes || typeof notes !== "object" || vistos.has(notes)) return;
        vistos.add(notes);
        Object.values(notes).forEach((n) => {
            if (n && nkEsKindReal(n.kind)) mapa.set(String(n.kind), (mapa.get(String(n.kind)) || 0) + 1);
        });
    };
    contar(currentChartData.notes);
    if (currentChartData.difficulties && typeof currentChartData.difficulties === "object") {
        Object.values(currentChartData.difficulties).forEach((d) => contar(d && d.notes));
    }
    return mapa;
}

function nkKindsNoImportados() {
    return Array.from(nkKindsEnChart().entries()).filter(([k]) => !nkObtenerDef(k));
}

function nkVistaPreviaHTML(def, grande, sinMarca) {
    const clase = grande ? "nk-preview big" : "nk-preview";
    if (sinMarca) return `<span class="${clase} sin-estilo"><span class="nk-preview-arrow"></span></span>`;
    if (def && def._sprites) {
        const src = def._sprites.left || def._sprites.down || def._sprites.up || def._sprites.right;
        return `<span class="${clase}"><img src="${src}" alt=""></span>`;
    }
    nkAsegurarBadge();
    return `<span class="${clase} sin-estilo"><span class="nk-preview-arrow"></span><span class="note-kind-badge${def ? "" : " unknown"}"></span></span>`;
}

function renderizarNoteEvents() {
    const cont = document.getElementById("note-events-content");
    if (!cont) return;
    const ventana = document.getElementById("note-events-window");
    if (ventana && !ventana.classList.contains("active")) { nkActualizarIndicadorKind(); return; }
    const vista = noteEventsUI.vista;
    document.querySelectorAll("#note-events-window .nk-main-btn[data-vista]").forEach((b) => b.classList.toggle("active", b.dataset.vista === vista || (vista === "editar" && b.dataset.vista === "lista")));
    if (vista === "importar" && noteEventsUI.importacion) cont.innerHTML = nkHTMLImportacion();
    else if (vista === "lista") cont.innerHTML = nkHTMLLista();
    else if (vista === "editar" && noteEventsUI.editando === NK_ID_DEFAULT) cont.innerHTML = nkHTMLEditorDefault();
    else if (vista === "editar" && noteEventsUI.editando === NK_ID_CUSTOM) cont.innerHTML = nkHTMLEditorCustom();
    else if (vista === "editar" && nkObtenerDef(noteEventsUI.editando)) cont.innerHTML = nkHTMLEditor(nkObtenerDef(noteEventsUI.editando));
    else { noteEventsUI.vista = "inicio"; cont.innerHTML = nkHTMLInicio(); }
    if (noteEventsUI.vista === "lista") nkFiltrarLista();
    nkActualizarAvisoBadge();
    nkActualizarIndicadorKind();
    nkActualizarContadorSeleccion();
}

function nkHTMLNoImportados() {
    const faltan = nkKindsNoImportados();
    if (!faltan.length) return "";
    return `<div class="nk-section-title">En este chart, sin importar</div>
        <div class="nk-missing-list">${faltan.map(([k, n]) => `
            <div class="nk-missing-item">
                ${nkVistaPreviaHTML(null)}
                <span class="nk-item-copy"><strong>${nkEscapar(k)}</strong><small>no importado · ${n} flecha${n === 1 ? "" : "s"}</small></span>
                <button type="button" class="nk-small-btn" onclick="iniciarImportacionNoteKind()" title="Importar el .hxc de este kind"><i class="fa-solid fa-file-import"></i> .hxc</button>
            </div>`).join("")}</div>`;
}

function nkHTMLInicio() {
    const defs = Object.values(noteKindsGCD);
    const nPred = NK_PREDETERMINADOS.length;
    let html = `<div class="events-empty-state nk-empty"><i class="fa-solid fa-circle-info"></i><span>Hay <strong>${nPred} notas predeterminadas</strong> (Default, Custom, Week 5, Week 7 y Blazin') listas para usar. Toca <strong>Elegir existente</strong> para verlas${defs.length ? "" : ", o <strong>Importar</strong> para cargar el <code>.hxc</code> de otro NoteKind"}.</span></div>`;
    if (defs.length) {
        html += `<div class="events-empty-state nk-empty"><i class="fa-solid fa-file-import"></i><span>${defs.length} nota${defs.length === 1 ? "" : "s"} personalizada${defs.length === 1 ? "" : "s"} importada${defs.length === 1 ? "" : "s"}. También están en <strong>Elegir existente</strong>.</span></div>`;
    }
    html += nkHTMLNoImportados();
    return html;
}

function nkTextoBusqueda(...partes) {
    return nkEscapar(partes.filter(Boolean).join(" ").toLowerCase());
}

function nkHTMLItemPredeterminado(info, usados) {
    const activo = info.id === NK_ID_CUSTOM ? (nkCustomActivo && !!noteKindActivo) : (!nkCustomActivo && info.id !== NK_ID_DEFAULT && noteKindActivo === info.id);
    let preview, detalle, busca;
    if (info.id === NK_ID_DEFAULT) {
        preview = nkVistaPreviaHTML(null, false, true);
        detalle = "flecha normal (sin kind)";
        busca = nkTextoBusqueda(info.nombre, "normal");
    } else if (info.id === NK_ID_CUSTOM) {
        const k = nkCustomKindValido();
        preview = nkVistaPreviaHTML(nkObtenerDef(k) || { id: "custom" });
        detalle = k ? `kind: <code>${nkEscapar(k)}</code>` : "escribe tu propio kind";
        busca = nkTextoBusqueda(info.nombre, k);
    } else {
        const def = nkObtenerDef(info.id);
        const n = usados.get(info.id) || 0;
        const importado = !!noteKindsGCD[info.id];
        preview = nkVistaPreviaHTML(def);
        detalle = `kind: <code>${nkEscapar(info.id)}</code>${importado ? " · .hxc importado" : ""}${n ? ` · ${n} en el chart` : ""}`;
        busca = nkTextoBusqueda(info.nombre, info.id);
    }
    const titulo = info.nota ? ` title="${nkEscapar(info.nota)}"` : "";
    return `<button type="button" class="nk-kind-item compact${activo ? " active" : ""}" data-kind="${nkEscapar(info.id)}" data-busqueda="${busca}"${titulo} onclick="editarNoteKind(this.dataset.kind)">
                ${preview}
                <span class="nk-item-copy"><strong>${nkEscapar(info.nombre)}</strong><small>${detalle}</small></span>
                ${activo ? '<span class="nk-active-tag">ACTIVO</span>' : '<i class="fa-solid fa-chevron-right"></i>'}
            </button>`;
}

function nkHTMLLista() {
    const usados = nkKindsEnChart();
    let html = `<label class="nk-search" for="nk-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="nk-search" class="events-field" placeholder="Buscar" autocomplete="off" spellcheck="false" value="${nkEscapar(noteEventsUI.busqueda)}"></label>`;
    html += `<div class="nk-section-title" data-nk-grupo="pred">Predeterminados</div>`;
    html += `<div class="nk-kind-list nk-builtin-list" data-nk-grupo="pred">${NK_PREDETERMINADOS.map((info) => nkHTMLItemPredeterminado(info, usados)).join("")}</div>`;
    // Importados (los que pisan un predeterminado ya salen arriba, en su lugar).
    const defs = Object.values(noteKindsGCD).filter((d) => !nkEsPredeterminado(d.id))
        .sort((a, b) => String(a.descripcion || a.id).localeCompare(String(b.descripcion || b.id)));
    html += `<div class="nk-section-title" data-nk-grupo="imp">Notas importadas</div>`;
    if (!defs.length) {
        html += `<div class="events-empty-state nk-empty" data-nk-grupo="imp"><i class="fa-solid fa-circle-info"></i><span>No hay notas importadas todavía.</span></div>`;
    } else {
        html += `<div class="nk-kind-list" data-nk-grupo="imp">${defs.map((def) => {
            const n = usados.get(def.id) || 0;
            const activo = !nkCustomActivo && noteKindActivo === def.id;
            return `<button type="button" class="nk-kind-item${activo ? " active" : ""}" data-kind="${nkEscapar(def.id)}" data-busqueda="${nkTextoBusqueda(def.descripcion, def.id)}" onclick="editarNoteKind(this.dataset.kind)">
                ${nkVistaPreviaHTML(def)}
                <span class="nk-item-copy"><strong>${nkEscapar(def.descripcion || def.id)}</strong><small>kind: ${nkEscapar(def.id)} · ${def.params.length} parámetro${def.params.length === 1 ? "" : "s"}${n ? ` · ${n} en el chart` : ""}</small></span>
                ${activo ? '<span class="nk-active-tag">ACTIVO</span>' : '<i class="fa-solid fa-chevron-right"></i>'}
            </button>`;
        }).join("")}</div>`;
    }
    html += `<div class="events-empty-state nk-empty nk-sin-resultados" hidden><i class="fa-solid fa-magnifying-glass"></i><span>Sin resultados.</span></div>`;
    html += nkHTMLNoImportados();
    return html;
}

// Filtra la lista sin volver a dibujarla (no se pierde el foco del buscador).
function nkFiltrarLista() {
    const cont = document.getElementById("note-events-content");
    if (!cont) return;
    const q = String(noteEventsUI.busqueda || "").trim().toLowerCase();
    let total = 0;
    ["pred", "imp"].forEach((g) => {
        const lista = cont.querySelector(`.nk-kind-list[data-nk-grupo="${g}"]`);
        let visibles = 0;
        if (lista) lista.querySelectorAll(".nk-kind-item").forEach((item) => {
            const ok = !q || String(item.dataset.busqueda || "").includes(q);
            item.hidden = !ok;
            if (ok) visibles++;
        });
        total += visibles;
        const titulo = cont.querySelector(`.nk-section-title[data-nk-grupo="${g}"]`);
        const vacio = cont.querySelector(`.nk-empty[data-nk-grupo="${g}"]`);
        if (titulo) titulo.hidden = !!q && !visibles;
        if (vacio) vacio.hidden = !!q;
    });
    const sin = cont.querySelector(".nk-sin-resultados");
    if (sin) sin.hidden = !q || total > 0;
}

function nkHTMLImportacion() {
    const imp = noteEventsUI.importacion;
    const paso = NK_PASOS[imp.paso];
    const nombres = { 1: imp.hxc && imp.hxc.nombre, 2: imp.json && imp.json.nombre, 3: imp.xml && imp.xml.nombre, 4: "" };
    const titulos = { 1: "HXC", 2: "JSON (opcional)", 3: "XML", 4: "PNG" };
    const pills = [1, 2, 3, 4].map((n) => {
        const clase = n < imp.paso ? "done" : (n === imp.paso ? "current" : "");
        const icono = n < imp.paso ? '<i class="fa-solid fa-check"></i>' : `${n}`;
        const titulo = nombres[n] ? ` title="${nkEscapar(nombres[n])}"` : "";
        return `<span class="nk-step-pill ${clase}" data-paso="${n}"${titulo}>${icono} ${titulos[n]}</span>`;
    }).join("");
    let detalle = "";
    if (imp.paso === 1) {
        detalle = "El .hxc es obligatorio. Puedes elegir varios archivos a la vez (.hxc, .json, .xml y .png).";
    } else {
        const info = imp.hxc.info;
        detalle = `<strong>${nkEscapar(info.descripcion)}</strong> · kind <code>${nkEscapar(info.id)}</code>${info.estilo ? ` · estilo <code>${nkEscapar(info.estilo)}</code>` : ""} · ${info.params.length} parámetro${info.params.length === 1 ? "" : "s"}${info.otros && info.otros.length ? ` · +${info.otros.length} kind${info.otros.length === 1 ? "" : "s"} más en el archivo` : ""}`;
        if (imp.paso === 2) detalle += `<br>Si la nota tiene NoteStyle, elige su <code>.json</code>. Si no, toca <strong>No tengo JSON</strong>: se verá la flecha normal con la marca EventNote.`;
        if (imp.paso >= 3 && imp.json) {
            const ap = imp.json.data.assets.note.assetPath;
            detalle += `<br>JSON: ${nkEscapar(imp.json.nombre)}${ap ? ` · assetPath <code>${nkEscapar(ap)}</code>` : ""}`;
        }
        if (imp.paso === 4 && imp.xml) detalle += `<br>XML: ${nkEscapar(imp.xml.nombre)} (${imp.xmlDirecciones} de 4 direcciones encontradas)`;
    }
    const avisos = imp.paso > 1 && imp.hxc.info.avisos.length
        ? `<div class="nk-hint-warn"><i class="fa-solid fa-circle-exclamation"></i> ${imp.hxc.info.avisos.map(nkEscapar).join(" ")}</div>` : "";
    const omitir = imp.paso === 2 ? `<button type="button" class="nk-btn ghost" onclick="omitirJsonNoteKind()"><i class="fa-solid fa-forward"></i> No tengo JSON</button>` : "";
    return `<div class="nk-import-box">
        <div class="nk-steps-pills">${pills}</div>
        <div class="nk-steps-msg">${nkEscapar(paso.texto)}</div>
        <div class="nk-steps-hint">${detalle}</div>
        ${avisos}
        ${imp.error ? `<div class="nk-steps-error"><i class="fa-solid fa-triangle-exclamation"></i> ${nkEscapar(imp.error)}</div>` : ""}
        <div class="nk-steps-actions">
            <button type="button" class="nk-btn primary" onclick="abrirSelectorNoteKind()"><i class="fa-solid fa-folder-open"></i> Elegir ${paso.titulo}</button>
            ${omitir}
            <button type="button" class="nk-btn ghost" onclick="cancelarImportacionNoteKind()">Cancelar</button>
        </div>
    </div>`;
}

function nkControlParamHTML(def, p, i) {
    const v = nkValor(def, p);
    const d = p.data || {};
    if (p.type === "BOOL") {
        return `<label class="nk-check"><input type="checkbox" data-nk-param="${i}" ${v ? "checked" : ""}> <span>${v ? "Activado" : "Desactivado"}</span></label>`;
    }
    if (p.type === "STRING") {
        return `<input type="text" class="events-field" data-nk-param="${i}" value="${nkEscapar(v)}">`;
    }
    if (p.type === "ENUM") {
        return `<select class="events-field" data-nk-param="${i}">${(p.opciones || []).map((o, k) => `<option value="${k}" ${o.value === v ? "selected" : ""}>${nkEscapar(o.label)}</option>`).join("")}</select>`;
    }
    // INT / FLOAT (NumberStepper del juego: step por defecto 1.0, min/max opcionales)
    const attrs = [];
    if (typeof d.min === "number") attrs.push(`min="${d.min}"`);
    if (typeof d.max === "number") attrs.push(`max="${d.max}"`);
    const esEntero = p.type === "INT";
    const step = typeof d.step === "number" && d.step > 0 ? d.step : (esEntero ? 1 : (typeof d.precision === "number" ? Math.pow(10, -d.precision) : "any"));
    if (typeof d.min === "number" && typeof d.max === "number" && d.max > d.min) {
        const pasoRango = step === "any" ? (d.max - d.min) / 100 : step;
        return `<div class="nk-range-row"><input type="range" class="nk-range" data-nk-param="${i}" ${attrs.join(" ")} step="${pasoRango}" value="${v}"><input type="number" class="events-field nk-range-num" data-nk-param="${i}" ${attrs.join(" ")} step="${step}" value="${v}"></div>`;
    }
    return `<input type="number" class="events-field" data-nk-param="${i}" ${attrs.join(" ")} step="${step}" value="${v}">`;
}

function nkInfoParam(p) {
    const d = p.data || {};
    const partes = [];
    if (typeof d.min === "number" || typeof d.max === "number") partes.push(`${typeof d.min === "number" ? d.min : "−∞"} a ${typeof d.max === "number" ? d.max : "∞"}`);
    if (typeof d.step === "number") partes.push(`paso ${d.step}`);
    if (typeof d.precision === "number") partes.push(`${d.precision} decimal${d.precision === 1 ? "" : "es"}`);
    if (d.defaultValue !== undefined) partes.push(`defecto ${typeof d.defaultValue === "string" ? `"${d.defaultValue}"` : d.defaultValue}`);
    return partes.join(" · ");
}

// Botones "Usar en el chart" (comunes a importados, predeterminados y Custom).
function nkHTMLBotonesUso(activo, usados, kindTxt) {
    return `<div class="nk-section-title">Usar en el chart</div>
        <button type="button" class="nk-btn wide ${activo ? "on" : ""}" id="nk-btn-activar" onclick="alternarNoteKindActivo(noteEventsUI.editando)">
            <i class="fa-solid ${activo ? "fa-toggle-on" : "fa-toggle-off"}"></i> ${activo ? "Activo al colocar flechas" : "Usar al colocar flechas"}
        </button>
        <div class="nk-btn-grid">
            <button type="button" class="nk-btn" id="nk-btn-aplicar" onclick="aplicarNoteKindASeleccion()"><i class="fa-solid fa-wand-magic-sparkles"></i> Aplicar a seleccionadas <span class="nk-sel-count" id="nk-sel-count"></span></button>
            <button type="button" class="nk-btn" id="nk-btn-quitar" onclick="quitarNoteKindDeSeleccion()"><i class="fa-solid fa-eraser"></i> Quitar kind</button>
        </div>
        <button type="button" class="nk-btn wide ghost" id="nk-btn-seleccionar" onclick="seleccionarNotasDeKind()"><i class="fa-solid fa-object-group"></i> Seleccionar flechas ${kindTxt}${usados ? ` (${usados} en el chart)` : ""}</button>`;
}

function nkHTMLEditorDefault() {
    let sinKind = 0;
    if (currentChartData && currentChartData.notes) Object.values(currentChartData.notes).forEach((n) => { if (n && !nkEsKindReal(n.kind)) sinKind++; });
    return `<div class="event-preview-card nk-editor-card">
            ${nkVistaPreviaHTML(null, true, true)}
            <div class="nk-editor-copy">
                <strong>Default</strong>
                <span>Flecha normal, sin kind (en el <code>.fnfc</code> no lleva <code>k</code>).</span>
                <span>Nota predeterminada · no tiene parámetros</span>
            </div>
        </div>
        ${nkHTMLBotonesUso(!nkEsKindReal(noteKindActivo), sinKind, "normales")}
        <div class="nk-footer-row">
            <button type="button" class="nk-btn ghost" onclick="mostrarVistaNoteEvents('lista')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
        </div>`;
}

function nkHTMLEditorCustom() {
    const k = nkCustomKindValido();
    const def = k ? nkObtenerDef(k) : null;
    const usados = k ? (nkKindsEnChart().get(k) || 0) : 0;
    const activo = nkCustomActivo && !!noteKindActivo;
    return `<div class="event-preview-card nk-editor-card">
            ${nkVistaPreviaHTML(def || { id: "custom" }, true)}
            <div class="nk-editor-copy">
                <strong>Custom</strong>
                <span>Escribe el kind de la nota tal como lo usa tu script (<code>k</code> en el <code>.fnfc</code>).</span>
                <span id="nk-custom-info">${k ? `kind: <code>${nkEscapar(k)}</code>${def ? ` · ${nkEscapar(def.descripcion || def.id)}` : ""}` : "Nota predeterminada · sin kind escrito"}</span>
            </div>
        </div>
        <div class="nk-section-title">Parámetros</div>
        <div class="nk-params" id="nk-params">
            <div class="nk-param">
                <label class="events-field-label" for="nk-custom-kind">Custom Note Type</label>
                <input type="text" class="events-field" id="nk-custom-kind" data-nk-custom="1" value="${nkEscapar(nkCustomTexto())}" placeholder="ej. mi-nota" autocomplete="off" spellcheck="false">
            </div>
        </div>
        ${nkHTMLBotonesUso(activo, usados, "de este kind")}
        <div class="nk-footer-row">
            <button type="button" class="nk-btn ghost" onclick="mostrarVistaNoteEvents('lista')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
        </div>`;
}

function nkHTMLEditor(def) {
    const usados = nkKindsEnChart().get(def.id) || 0;
    const activo = !nkCustomActivo && noteKindActivo === def.id;
    const pred = nkInfoPredeterminado(def.id);
    const importado = !!noteKindsGCD[def.id];
    const sprites = def._sprites
        ? `<div class="nk-sprite-row">${NK_DIRECCIONES.map((dir) => def._sprites[dir]
            ? `<span class="nk-sprite-cell" title="${dir}"><img src="${def._sprites[dir]}" alt="${dir}"></span>`
            : `<span class="nk-sprite-cell missing" title="${dir}: sin frame (flecha normal)">?</span>`).join("")}</div>` : "";
    const estiloTxt = def.json
        ? `NoteStyle: ${nkEscapar(def.json.nombre)}${def._sprites ? "" : " (sin sprites)"}`
        : (importado ? "Sin JSON: flecha normal + marca EventNote" : "Flecha normal + marca EventNote");
    const origen = importado
        ? `${def.clase ? `clase ${nkEscapar(def.clase)} · ` : ""}${nkEscapar(def.hxc ? def.hxc.nombre : "")}${pred ? " · reemplaza a la predeterminada" : ""}`
        : `Nota predeterminada · viene con el juego (${nkEscapar(pred && pred.script ? pred.script : "blazin.hxc")}), no hace falta importar el .hxc`;
    const params = def.params.length
        ? def.params.map((p, i) => {
            const info = nkInfoParam(p);
            return `<div class="nk-param">
                <label class="events-field-label">${nkEscapar(p.description || p.name)} <span class="nk-param-type">${nkEtiquetaTipo(p.type)}</span></label>
                <div class="nk-param-desc"><code>${nkEscapar(p.name)}</code>${info ? ` · ${nkEscapar(info)}` : ""}</div>
                ${nkControlParamHTML(def, p, i)}
            </div>`;
        }).join("")
        : `<div class="nk-param-desc nk-no-params">Este NoteKind no tiene parámetros.</div>`;
    return `<div class="event-preview-card nk-editor-card">
            ${nkVistaPreviaHTML(def, true)}
            <div class="nk-editor-copy">
                <strong>${nkEscapar(pred ? pred.nombre : (def.descripcion || def.id))}</strong>
                <span>kind: <code>${nkEscapar(def.id)}</code>${def.estilo ? ` · estilo: <code>${nkEscapar(def.estilo)}</code>` : ""}</span>
                <span>${origen}</span>
                ${pred && pred.nota ? `<span>${nkEscapar(pred.nota)}</span>` : ""}
                <span>${estiloTxt}</span>
            </div>
        </div>
        ${sprites}
        <div class="nk-section-title">Parámetros</div>
        <div class="nk-params" id="nk-params">${params}</div>
        ${nkHTMLBotonesUso(activo, usados, "de este kind")}
        <div class="nk-footer-row">
            <button type="button" class="nk-btn ghost" onclick="mostrarVistaNoteEvents('lista')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
            ${importado ? `<button type="button" class="nk-btn danger" onclick="eliminarNoteKind()"><i class="fa-solid fa-trash"></i> ${pred ? "Quitar .hxc importado" : "Eliminar"}</button>` : '<span class="nk-builtin-lock"><i class="fa-solid fa-lock"></i> Predeterminada</span>'}
        </div>`;
}

function editarNoteKind(id) {
    id = id == null ? "" : String(id);
    if (id !== NK_ID_DEFAULT && id !== NK_ID_CUSTOM && !nkObtenerDef(id)) return;
    mostrarVistaNoteEvents("editar", id);
}

function nkActualizarContadorSeleccion() {
    const el = document.getElementById("nk-sel-count");
    if (!el) return;
    const n = (typeof obtenerClavesSeleccionadas === "function" && currentChartData) ? obtenerClavesSeleccionadas().length : 0;
    el.textContent = n ? `(${n})` : "";
    const aplicar = document.getElementById("nk-btn-aplicar");
    const quitar = document.getElementById("nk-btn-quitar");
    if (aplicar) aplicar.classList.toggle("disabled", !n);
    if (quitar) quitar.classList.toggle("disabled", !n);
}

function nkActualizarIndicadorKind() {
    const ind = document.getElementById("note-kind-indicator");
    if (!ind) return;
    const activo = nkEsKindReal(noteKindActivo);
    const def = activo && !nkCustomActivo ? nkObtenerDef(noteKindActivo) : null;
    ind.hidden = !activo;
    const label = document.getElementById("note-kind-indicator-label");
    if (activo && label) {
        const pred = def ? nkInfoPredeterminado(def.id) : null;
        label.textContent = def ? (pred ? pred.nombre : (def.descripcion || def.id)) : `Custom: ${noteKindActivo}`;
    }
    document.body.classList.toggle("note-kind-on", activo);
}

// Inputs de parámetros (delegación)
function nkManejarInputParam(e) {
    const el = e.target;
    if (el && el.id === "nk-search") {
        noteEventsUI.busqueda = el.value;
        nkFiltrarLista();
        return;
    }
    if (el && el.dataset && el.dataset.nkCustom) { nkManejarInputCustom(e, el); return; }
    if (!el || !el.dataset || el.dataset.nkParam === undefined) return;
    const def = noteKindsGCD[noteEventsUI.editando];
    if (!def) return;
    const p = def.params[parseInt(el.dataset.nkParam, 10)];
    if (!p) return;
    let valor;
    if (el.type === "checkbox") valor = el.checked;
    else if (p.type === "ENUM") { const o = (p.opciones || [])[parseInt(el.value, 10)]; valor = o ? o.value : undefined; }
    else valor = el.value;
    if ((p.type === "INT" || p.type === "FLOAT") && e.type === "input" && (valor === "" || valor === "-")) return;
    const normal = nkNormalizarValor(p, valor);
    def.valores[p.name] = normal;
    if (el.type === "checkbox") {
        const span = el.parentElement && el.parentElement.querySelector("span");
        if (span) span.textContent = normal ? "Activado" : "Desactivado";
    }
    // Sincroniza el par range/number del mismo parámetro.
    document.querySelectorAll(`#nk-params [data-nk-param="${el.dataset.nkParam}"]`).forEach((otro) => {
        if (otro !== el && otro.type !== "checkbox" && otro.tagName !== "SELECT") otro.value = normal;
    });
    if (e.type === "change" && el.type === "number") el.value = normal;
    nkProgramarGuardado(def);
}

// Custom Note Type: el texto se guarda en el navegador; si Custom está activo, las
// flechas nuevas usan el texto nuevo.
function nkManejarInputCustom(e, el) {
    nkGuardarCustomTexto(el.value);
    const k = nkCustomKindValido();
    if (nkCustomActivo) {
        if (k) noteKindActivo = k;
        else { noteKindActivo = null; nkCustomActivo = false; }
    }
    const info = document.getElementById("nk-custom-info");
    if (info) {
        const def = k ? nkObtenerDef(k) : null;
        info.innerHTML = k ? `kind: <code>${nkEscapar(k)}</code>${def ? ` · ${nkEscapar(def.descripcion || def.id)}` : ""}` : "Nota predeterminada · sin kind escrito";
    }
    // Sin redibujar: el blur (change) llega justo antes del clic en un botón.
    nkActualizarIndicadorKind();
}

// ---------------------------------------------------------------------
// Importación (HXC -> JSON opcional -> XML -> PNG)
// ---------------------------------------------------------------------
function iniciarImportacionNoteKind() {
    abrirVentanaNoteEvents();
    noteEventsUI.importacion = { paso: 1, hxc: null, json: null, xml: null, png: null, error: "", xmlDirecciones: 0 };
    noteEventsUI.vista = "importar";
    renderizarNoteEvents();
    abrirSelectorNoteKind();
}

function abrirSelectorNoteKind() {
    const imp = noteEventsUI.importacion;
    const input = document.getElementById("note-kind-file");
    if (!imp || !input) return;
    input.accept = NK_PASOS[imp.paso].accept;
    input.multiple = true;
    input.value = "";
    try { input.click(); } catch (e) { }
}

function cancelarImportacionNoteKind() {
    noteEventsUI.importacion = null;
    noteEventsUI.vista = "inicio";
    renderizarNoteEvents();
    nkToast("Importación cancelada");
}

async function omitirJsonNoteKind() {
    const imp = noteEventsUI.importacion;
    if (!imp || imp.paso !== 2) return;
    imp.json = null;
    await finalizarImportacionNoteKind();
}

async function procesarArchivosNoteKind(archivos) {
    const imp = noteEventsUI.importacion;
    if (!imp || !archivos || !archivos.length) return;
    imp.error = "";
    const porTipo = { hxc: null, json: null, xml: null, png: null };
    const sinTipo = [];
    archivos.forEach((a) => {
        const t = nkTipoArchivo(a);
        if (t && !porTipo[t]) porTipo[t] = a;
        else if (!t) sinTipo.push(a);
    });
    const tipoPaso = NK_PASOS[imp.paso].tipo;
    if (!porTipo[tipoPaso] && sinTipo.length) porTipo[tipoPaso] = sinTipo[0];
    let avanzo = false;
    try {
        if (imp.paso === 1) {
            if (!porTipo.hxc) throw new Error("Primero elige el archivo .hxc del NoteKind (es obligatorio).");
            const texto = await porTipo.hxc.text();
            if (!texto.trim()) throw new Error(`"${porTipo.hxc.name}" está vacío.`);
            const info = analizarHxcNoteKind(texto, porTipo.hxc.name);
            imp.hxc = { nombre: porTipo.hxc.name, texto, info };
            imp.paso = 2;
            avanzo = true;
        }
        if (imp.paso === 2 && porTipo.json) {
            let data;
            try { data = JSON.parse((await porTipo.json.text()).replace(/^\uFEFF/, "")); }
            catch (e) { throw new Error(`"${porTipo.json.name}" no es un JSON válido.`); }
            nkValidarNoteStyle(data, porTipo.json.name);
            imp.json = { nombre: porTipo.json.name, data };
            imp.paso = 3;
            avanzo = true;
        }
        if (imp.paso === 3 && porTipo.xml) {
            const texto = await porTipo.xml.text();
            const atlas = nkLeerAtlas(texto);
            const dirs = NK_DIRECCIONES.filter((dir) => nkFrameDireccion(atlas, imp.json.data, dir));
            if (!dirs.length) {
                const pref = NK_DIRECCIONES.map((d) => nkPrefijosDireccion(imp.json.data, d)[0]).join(", ");
                throw new Error(`Ningún prefijo del JSON (${pref}) coincide con los SubTexture de "${porTipo.xml.name}". ¿Es el XML de estas notas?`);
            }
            imp.xml = { nombre: porTipo.xml.name, texto };
            imp.xmlAtlas = atlas;
            imp.xmlDirecciones = dirs.length;
            imp.paso = 4;
            avanzo = true;
        }
        if (imp.paso === 4 && porTipo.png) {
            const { img, url } = await nkCargarImagen(porTipo.png);
            URL.revokeObjectURL(url);
            let maxX = 0, maxY = 0;
            imp.xmlAtlas.frames.forEach((f) => { maxX = Math.max(maxX, f.x + f.w); maxY = Math.max(maxY, f.y + f.h); });
            imp.pngChico = maxX > img.naturalWidth + 1 || maxY > img.naturalHeight + 1;
            imp.png = { nombre: porTipo.png.name, blob: new Blob([porTipo.png], { type: porTipo.png.type || "image/png" }) };
            if (noteEventsUI.importacion !== imp) return;
            await finalizarImportacionNoteKind();
            return;
        }
        if (!avanzo) {
            if (imp.paso === 2 && (porTipo.xml || porTipo.png)) throw new Error("Primero elige el .json del NoteStyle, o toca \"No tengo JSON\".");
            if (imp.paso === 3 && porTipo.png && !porTipo.xml) throw new Error("Primero elige el .xml (Sparrow) de las notas; después el .png.");
            throw new Error(`En este paso falta el archivo .${tipoPaso}.`);
        }
    } catch (err) {
        if (noteEventsUI.importacion !== imp) return;
        imp.error = err && err.message ? err.message : "No se pudo leer el archivo.";
        renderizarNoteEvents();
        nkToast(imp.error);
        return;
    }
    renderizarNoteEvents();
    nkToast(NK_PASOS[imp.paso].texto);
}

async function finalizarImportacionNoteKind() {
    const imp = noteEventsUI.importacion;
    if (!imp || !imp.hxc) return;
    const info = imp.hxc.info;
    const anterior = noteKindsGCD[info.id];
    const def = nkPrepararDef({
        id: info.id,
        descripcion: info.descripcion,
        estilo: info.estilo,
        clase: info.clase,
        params: info.params,
        avisos: info.avisos,
        hxc: { nombre: imp.hxc.nombre, texto: imp.hxc.texto },
        json: imp.json ? { nombre: imp.json.nombre, data: imp.json.data } : null,
        xml: imp.json && imp.xml ? { nombre: imp.xml.nombre, texto: imp.xml.texto } : null,
        png: imp.json && imp.png ? { nombre: imp.png.nombre, blob: imp.png.blob } : null,
        valores: anterior && anterior.valores ? anterior.valores : {},
        importado: Date.now()
    });
    try { def._sprites = await nkConstruirSprites(def); }
    catch (e) { def._sprites = null; console.warn("[Evento de Notas] sprites", e); }
    noteKindsGCD[def.id] = def;
    // Archivos con varias clases NoteKind (ej. 2hot.hxc): se importan todas.
    const extras = [];
    for (const otro of (info.otros || [])) {
        const prev = noteKindsGCD[otro.id];
        const mismoEstilo = !!imp.json && otro.estilo === info.estilo;
        const d2 = nkPrepararDef({
            id: otro.id, descripcion: otro.descripcion, estilo: otro.estilo, clase: otro.clase, params: otro.params, avisos: otro.avisos,
            hxc: { nombre: imp.hxc.nombre, texto: imp.hxc.texto },
            json: mismoEstilo ? def.json : null, xml: mismoEstilo ? def.xml : null, png: mismoEstilo ? def.png : null,
            valores: prev && prev.valores ? prev.valores : {}, importado: Date.now()
        });
        d2._sprites = mismoEstilo ? def._sprites : null;
        noteKindsGCD[d2.id] = d2;
        extras.push(d2);
    }
    nkActualizarEstilosSprites();
    noteEventsUI.importacion = null;
    noteEventsUI.vista = "editar";
    noteEventsUI.editando = def.id;
    nkRepintarNotasConKind(def.id);
    renderizarNoteEvents();
    let msg = `${anterior ? "Actualizada" : "Importada"}: ${def.descripcion} (kind "${def.id}")${extras.length ? ` y ${extras.length} kind${extras.length === 1 ? "" : "s"} más del mismo archivo` : ""}`;
    if (imp.pngChico) msg += ". Ojo: el PNG es más chico que el XML";
    nkToast(msg);
    extras.forEach((d2) => { nkRepintarNotasConKind(d2.id); nkGuardarDef(d2).catch((e) => console.warn("[Evento de Notas] guardar", e)); });
    try { await nkGuardarDef(def); }
    catch (e) { console.warn("[Evento de Notas] No se pudo guardar en IndexedDB", e); nkToast("Importada, pero no se pudo guardar en este navegador (se perderá al recargar)."); }
}

async function eliminarNoteKind() {
    const def = noteKindsGCD[noteEventsUI.editando];
    if (!def) { nkToast("Las notas predeterminadas no se pueden eliminar"); return; }
    const pred = nkEsPredeterminado(def.id);
    if (!confirm(pred
        ? `¿Quitar el .hxc importado de "${def.descripcion || def.id}"? Vuelve a quedar la nota predeterminada.`
        : `¿Eliminar la nota personalizada "${def.descripcion || def.id}"? Las flechas del chart conservan su kind.`)) return;
    delete noteKindsGCD[def.id];
    if (noteKindActivo === def.id && !pred && !nkCustomActivo) noteKindActivo = null;
    nkActualizarEstilosSprites();
    nkRepintarNotasConKind(def.id);
    if (pred) mostrarVistaNoteEvents("editar", def.id);
    else mostrarVistaNoteEvents("lista");
    try { await nkBorrarDefDB(def.id); } catch (e) { console.warn("[Evento de Notas] borrar", e); }
    nkToast(`Eliminada: ${def.descripcion || def.id}`);
}

// ---------------------------------------------------------------------
// Aplicar al chart (todo pasa por el historial: Atrasar / Adelantar)
// ---------------------------------------------------------------------
// Kind al que apuntan los botones del editor abierto: Default, Custom o un kind.
function nkObjetivoEditor(avisar) {
    const id = noteEventsUI.editando;
    if (id === NK_ID_DEFAULT) return { tipo: "default", kind: null, nombre: "Default", params: [] };
    if (id === NK_ID_CUSTOM) {
        const k = nkCustomKindValido();
        if (!k) { if (avisar) nkToast("Escribe primero el Custom Note Type"); return null; }
        return { tipo: "custom", kind: k, nombre: k, params: [] };
    }
    const def = nkObtenerDef(id);
    if (!def) return null;
    const pred = nkInfoPredeterminado(def.id);
    return { tipo: "def", kind: def.id, nombre: pred ? pred.nombre : (def.descripcion || def.id), params: nkParamsActuales(def) };
}

function alternarNoteKindActivo(id) {
    if (id === undefined) id = noteEventsUI.editando;
    id = id == null ? "" : String(id);
    if (id === NK_ID_DEFAULT) { desactivarNoteKindActivo(); return; }
    if (id === NK_ID_CUSTOM) {
        if (nkCustomActivo && noteKindActivo) { desactivarNoteKindActivo(); return; }
        const k = nkCustomKindValido();
        if (!k) { nkToast("Escribe primero el Custom Note Type"); return; }
        noteKindActivo = k;
        nkCustomActivo = true;
        renderizarNoteEvents();
        nkToast(`Las flechas nuevas serán Custom "${k}"`);
        return;
    }
    const def = nkObtenerDef(id);
    if ((!nkCustomActivo && noteKindActivo === id) || !def) {
        desactivarNoteKindActivo();
        return;
    }
    noteKindActivo = def.id;
    nkCustomActivo = false;
    renderizarNoteEvents();
    const pred = nkInfoPredeterminado(def.id);
    nkToast(`Las flechas nuevas serán "${pred ? pred.nombre : (def.descripcion || def.id)}"`);
}

function desactivarNoteKindActivo() {
    const habia = !!noteKindActivo;
    noteKindActivo = null;
    nkCustomActivo = false;
    renderizarNoteEvents();
    if (habia) nkToast("Las flechas nuevas vuelven a ser normales");
}

function aplicarNoteKindASeleccion() {
    if (!currentChartData) return;
    const obj = nkObjetivoEditor(true);
    if (!obj) return;
    if (obj.tipo === "default") { quitarNoteKindDeSeleccion(); return; }
    const claves = obtenerClavesSeleccionadas();
    if (!claves.length) { nkToast("No hay flechas seleccionadas"); return; }
    const params = obj.params;
    ejecutarEdicionChart(`Note kind "${obj.nombre}" (${claves.length})`, () => {
        claves.forEach((key) => {
            const nota = currentChartData.notes[key];
            if (!nota) return;
            const nueva = Object.assign({}, nota, { kind: obj.kind });
            if (params.length) nueva.params = nkClonar(params);
            else delete nueva.params;
            escribirNotaChart(key, nueva);
        });
    });
    renderizarNoteEvents();
    nkToast(`${claves.length} flecha${claves.length === 1 ? "" : "s"} → ${obj.nombre}`);
}

function quitarNoteKindDeSeleccion() {
    if (!currentChartData) return;
    const claves = obtenerClavesSeleccionadas().filter((k) => currentChartData.notes[k] && nkEsKindReal(currentChartData.notes[k].kind));
    if (!claves.length) { nkToast("Ninguna flecha seleccionada tiene kind"); return; }
    ejecutarEdicionChart(`Quitar kind (${claves.length})`, () => {
        claves.forEach((key) => {
            const nueva = Object.assign({}, currentChartData.notes[key]);
            delete nueva.kind;
            delete nueva.params;
            escribirNotaChart(key, nueva);
        });
    });
    renderizarNoteEvents();
    nkToast(`${claves.length} flecha${claves.length === 1 ? "" : "s"} vuelven a ser normales`);
}

function seleccionarNotasDeKind() {
    if (!currentChartData) return;
    const obj = nkObjetivoEditor(true);
    if (!obj) return;
    limpiarSeleccionNotas();
    Object.keys(currentChartData.notes).forEach((key) => {
        const nota = currentChartData.notes[key];
        if (!nota) return;
        const coincide = obj.tipo === "default" ? !nkEsKindReal(nota.kind) : String(nota.kind) === obj.kind;
        if (coincide) agregarNotaASeleccion(key);
    });
    const n = obtenerClavesSeleccionadas().length;
    nkToast(n ? `${n} flecha${n === 1 ? "" : "s"} de "${obj.nombre}" seleccionada${n === 1 ? "" : "s"}` : "No hay flechas de este kind en esta dificultad");
}

// Aviso al abrir un chart que usa kinds sin importar.
function avisarKindsNoImportados() {
    const faltan = nkKindsNoImportados();
    if (!faltan.length) return;
    setTimeout(() => nkToast(`Este chart usa notas sin importar: ${faltan.map(([k]) => k).slice(0, 3).join(", ")}${faltan.length > 3 ? "…" : ""} (Windows > Evento de Notas)`), 400);
    renderizarNoteEvents();
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
NK_PREDETERMINADOS.forEach((info) => {
    if (info.id === NK_ID_DEFAULT || info.id === NK_ID_CUSTOM) return;
    const def = nkPrepararDef({ id: info.id, descripcion: info.nombre, estilo: null, clase: "", params: [], avisos: [], json: null, predeterminado: true });
    def._sprites = null;
    nkDefsPredeterminadas[info.id] = def;
});

window.addEventListener("load", () => {
    hacerVentanaNoteEventsMovible();
    const input = document.getElementById("note-kind-file");
    if (input) input.addEventListener("change", () => {
        const archivos = Array.from(input.files || []);
        input.value = "";
        procesarArchivosNoteKind(archivos);
    });
    const cont = document.getElementById("note-events-content");
    if (cont) {
        cont.addEventListener("input", nkManejarInputParam);
        cont.addEventListener("change", nkManejarInputParam);
    }
    cargarNoteKindsGuardados();
});
