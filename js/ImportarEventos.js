// =====================================================================
// V0.8.2i "Event Update" — Events > Importar eventos
// Importa eventos de V-Slice (SongEvent / ScriptedSongEvent) desde su .hxc:
//   class X extends ScriptedSongEvent {
//     function new() { super('EventId', { processOldEvents: true }); }
//     override function getTitle() return 'Título';
//     override function getIconPath() return 'ui/chart-editor/events/EventId';
//     override function getEventSchema() return new SongEventSchema([
//       { name, title, type: SongEventFieldType.FLOAT | INTEGER | STRING | BOOL | ENUM | FRAME,
//         defaultValue, min, max, step, units, keys: ['Label' => valor], children } ]);
//   }
// En el chart se guarda { t, e: 'EventId', v: { name: valor, ... } } como el juego.
// Ícono: el editor oficial carga ui/chart-editor/events/<EventId>.png + .xml (Sparrow)
// y anima los SubTexture con prefijo '<EventId>0' (ChartEditorEventSprite).
// Reusa el tokenizador/parser de literales Haxe de js/NoteEvents.js (nkCrearContexto...).
// Las definiciones se guardan en IndexedDB (fnf_gcd_songevents) y sobreviven al recargar.
// Nunca toca el audio ni la reproducción.
// =====================================================================

const IE_DB_NAME = "fnf_gcd_songevents";
const IE_STORE = "eventos";
const IE_FPS_ICONO = 24; // ChartEditorEventSprite: addByPrefix(eventName, eventName + '0', 24)
const IE_MAX_FRAMES = 96;
const IE_TAM_FRAME = 64;  // cada frame del strip se dibuja en un cuadrado de 64px
const IE_TIPOS_CAMPO = { string: "STRING", integer: "INTEGER", int: "INTEGER", float: "FLOAT", number: "FLOAT", bool: "BOOL", boolean: "BOOL", enum: "ENUM", frame: "FRAME", dynamic: "DYNAMIC" };
// V0.8.2k: getters de SongEventData -> tipo del campo.
const IE_GETTERS_DATA = { getFloat: "FLOAT", getInt: "INTEGER", getBool: "BOOL", getString: "STRING", getDynamic: "DYNAMIC", getArray: "DYNAMIC", getBoolArray: "DYNAMIC", getStringArray: "DYNAMIC", getIntArray: "DYNAMIC", getFloatArray: "DYNAMIC" };
const IE_TIPOS_OFICIALES = ["string", "integer", "float", "bool", "enum", "frame"];
// Constantes estáticas de SongEvent.hx que los scripts suelen usar como defaultValue.
const IE_CONSTANTES = { "SongEvent.DEFAULT_EASE": "linear", "SongEvent.DEFAULT_EASE_DIR": "In" };

let eventosImportadosGCD = {};   // id -> definición
let eventosImportadosListos = false;
let ieContadorCss = 0;
const ieUI = { importacion: null, selectorDestino: null, ocupado: false };

function ieEscapar(t) { return typeof nkEscapar === "function" ? nkEscapar(t) : String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function ieToast(m) { if (typeof mostrarToastGCD === "function") mostrarToastGCD(m); }
function ieClonar(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function ieTieneClave(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }

// funkin.util.tools.StringTools.toTitleCase (título por defecto de SongEvent.getTitle()).
function ieTitleCase(texto) {
    return String(texto || "").split(" ").map((w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase()).join(" ");
}

// ---------------------------------------------------------------------
// Parser (.hxc -> SongEvents)
// ---------------------------------------------------------------------
function ieTextoTipo(t) {
    if (typeof t === "string") return t;
    if (t && typeof t === "object" && t.$ref) return t.$ref.split(".").pop();
    return "";
}

function ieConstante(v) {
    if (v && typeof v === "object" && v.$ref && ieTieneClave(IE_CONSTANTES, v.$ref)) return IE_CONSTANTES[v.$ref];
    return v;
}

function ieEsPrimitivo(v) { return ["string", "number", "boolean"].includes(typeof v); }

// Un campo del schema (ya resuelto) -> lista de campos normalizados (FRAME se aplana como listAllFields()).
function ieNormalizarCampo(obj, avisos, grupo, prof) {
    if (!nkEsObjetoPlano(obj)) { avisos.push(`No se pudo leer un campo del schema (${nkTextoValor(obj)}).`); return []; }
    const tipoTxt = ieTextoTipo(obj.type);
    let type = IE_TIPOS_CAMPO[tipoTxt.toLowerCase()];
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const title = typeof obj.title === "string" ? obj.title : name;
    if (type === "FRAME") {
        if (!Array.isArray(obj.children)) { avisos.push(`El frame "${title || name}" no tiene children.`); return []; }
        if (prof > 4) return [];
        return obj.children.flatMap((h) => ieNormalizarCampo(h, avisos, title || name || grupo, prof + 1));
    }
    if (!name) { avisos.push("Un campo del schema no tiene \"name\" y se ignoró."); return []; }
    let dv = ieConstante(obj.defaultValue);
    if (dv !== undefined && dv !== null && !ieEsPrimitivo(dv)) {
        avisos.push(`No se pudo leer el defaultValue de "${name}" (${nkTextoValor(dv)}).`);
        dv = undefined;
    }
    if (!type) {
        if (!tipoTxt && dv !== undefined && dv !== null) {
            type = typeof dv === "boolean" ? "BOOL" : typeof dv === "number" ? (Number.isInteger(dv) ? "INTEGER" : "FLOAT") : "STRING";
            avisos.push(`"${name}" no tiene type; se dedujo ${type} por su defaultValue.`);
        } else {
            // V0.8.2k: antes se ignoraba; ahora sale como campo libre (JSON/texto) para no perder la opción.
            // V0.8.2l: ya no es opcional; se escribe siempre (con su respaldo del script si lo hay).
            avisos.push(`"${name}" tiene un type desconocido (${tipoTxt || "sin type"}); se muestra como campo libre (JSON o texto).`);
            type = "DYNAMIC";
        }
    } else if (!IE_TIPOS_OFICIALES.includes(tipoTxt.toLowerCase()) && !/^[A-Z]+$/.test(tipoTxt)) {
        avisos.push(`"${name}" usa type "${tipoTxt}", que no es oficial (string, integer, float, bool, enum); se trató como ${type}.`);
    }
    const campo = { name, title: title || name, type };
    if (grupo) campo.grupo = grupo;
    ["min", "max", "step"].forEach((k) => { const n = nkNumero(obj[k]); if (n !== undefined) campo[k] = n; });
    if (typeof obj.units === "string" && obj.units !== "") campo.units = obj.units;
    if (type === "ENUM") {
        const keys = nkEsObjetoPlano(obj.keys) ? obj.keys : null;
        const opciones = keys ? Object.keys(keys).map((label) => ({ label, value: ieConstante(keys[label]) })).filter((o) => ieEsPrimitivo(o.value)) : [];
        if (!opciones.length) {
            // V0.8.2k/l: enum sin keys -> campo de texto (normal, no opcional).
            avisos.push(`"${name}" es enum pero no tiene keys (el editor oficial da error); se muestra como texto.`);
            campo.type = "STRING";
        } else campo.opciones = opciones;
    }
    // V0.8.2l: solo es opcional si el .hxc lo dice (optional/opcional: true o un título/comentario con esa palabra).
    if (obj.optional === true || obj.opcional === true || obj.optional === "true" || obj.opcional === "true") campo.opcional = true;
    if (IE_RE_OPCIONAL.test(String(campo.title || ""))) campo.opcional = true;
    type = campo.type;
    if (dv !== undefined && dv !== null) {
        if (type === "INTEGER" || type === "FLOAT") {
            const n = typeof dv === "number" ? dv : parseFloat(dv);
            if (Number.isFinite(n)) campo.defaultValue = n;
            else avisos.push(`El defaultValue de "${name}" no es un número.`);
        } else if (type === "BOOL") campo.defaultValue = dv === true || dv === "true";
        else if (type === "STRING") campo.defaultValue = String(dv);
        else campo.defaultValue = dv;
    }
    return [campo];
}

const IE_RE_OPCIONAL = /\b(opcional|optional)\b/i;

// V0.8.2l: nombres de campos del schema marcados como opcionales con un comentario
// ( { name: 'k', ... } // opcional ) en el texto del .hxc.
function ieOpcionalesPorComentario(texto) {
    const nombres = new Set();
    const lineas = String(texto || "").split(/\r?\n/);
    const reNombre = /\bname\s*:\s*(['"])(.*?)\1/g;
    const partir = (l) => {
        let enStr = null;
        for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (enStr) { if (ch === "\\") i++; else if (ch === enStr) enStr = null; continue; }
            if (ch === '"' || ch === "'") { enStr = ch; continue; }
            if (ch === "/" && (l[i + 1] === "/" || l[i + 1] === "*")) return { codigo: l.slice(0, i), comentario: l.slice(i + 2) };
        }
        return { codigo: l, comentario: "" };
    };
    const nombresEn = (codigo) => Array.from(codigo.matchAll(reNombre)).map((m) => m[2]);
    lineas.forEach((l, i) => {
        const { codigo, comentario } = partir(l);
        if (!comentario || !IE_RE_OPCIONAL.test(comentario)) return;
        let hallados = nombresEn(codigo);
        if (!hallados.length && !codigo.trim()) {
            // Comentario en su propia línea: aplica al campo de la línea siguiente.
            for (let j = i + 1; j < Math.min(lineas.length, i + 4) && !hallados.length; j++) hallados = nombresEn(partir(lineas[j]).codigo);
        }
        if (!hallados.length) {
            // Comentario dentro del objeto del campo (en la línea del title, type...).
            for (let j = i - 1; j >= Math.max(0, i - 6) && !hallados.length; j--) {
                const cod = partir(lineas[j]).codigo;
                hallados = nombresEn(cod);
                if (!hallados.length && /[}\]]/.test(cod)) break;
            }
        }
        hallados.forEach((n) => nombres.add(n));
    });
    return nombres;
}

function ieNormalizarEsquema(esquema, avisos) {
    if (esquema === undefined || esquema === null) return [];
    if (!Array.isArray(esquema)) { avisos.push(`No se pudo leer getEventSchema() (${nkTextoValor(esquema)}).`); return []; }
    const campos = [], vistos = new Set();
    esquema.forEach((obj) => ieNormalizarCampo(obj, avisos, null, 0).forEach((c) => {
        if (vistos.has(c.name)) { avisos.push(`El campo "${c.name}" está repetido; se usó el primero.`); return; }
        vistos.add(c.name);
        campos.push(c);
    }));
    return campos;
}

// ---------------------------------------------------------------------
// V0.8.2k: relación script <-> song-chart.json
// Lo que el script lee del "v" del evento (handleEvent(data), precacheEvent,
// getEventParams, buildChartData...): data.getFloat('k'), data.getInt/Bool/
// String/Dynamic/Array('k'), data.value.k, data.value?.k, data.value['k'],
// Reflect.field(data.value, 'k'), alias (var v = data.value) y
// data.valueAsStruct('k'). También el valor de respaldo que usa si la clave
// no está (… != null ? … : X  /  … ?? X). Así ninguna opción que afecte al
// chart queda fuera del Event Data.
// ---------------------------------------------------------------------
const IE_FUNCIONES_DATA = /^(handleEvent|precacheEvent|precache\w*|getEventParams|buildChartData|buildEventData|parseEventData|onSongEvent|eventTriggered)$/;

function ieTipoDeValor(v) {
    if (typeof v === "boolean") return "BOOL";
    if (typeof v === "number") return Number.isInteger(v) ? "INTEGER" : "FLOAT";
    if (typeof v === "string") return "STRING";
    return "DYNAMIC";
}

// Nombres de los parámetros que reciben el SongEventData.
function ieParametrosData(ctx, clase) {
    const T = ctx.T, nombres = new Set();
    for (let i = clase.ini; i < clase.fin; i++) {
        if (!nkEsId(T[i], "function") || !nkEsId(T[i + 1]) || !nkEs(T[i + 2], "(")) continue;
        const fin = nkSaltarBalanceado(T, i + 2);
        let primero = true;
        for (let j = i + 3; j < fin - 1; j++) {
            if (!nkEsId(T[j]) || !(nkEs(T[j - 1], "(") || nkEs(T[j - 1], ",") || nkEs(T[j - 1], "?"))) continue;
            const tipo = nkEs(T[j + 1], ":") && nkEsId(T[j + 2]) ? T[j + 2].v : "";
            if (/SongEventData$/.test(tipo) || (primero && IE_FUNCIONES_DATA.test(T[i + 1].v) && !/^(Float|Int|Bool|String)$/.test(tipo))) nombres.add(T[j].v);
            primero = false;
        }
    }
    return nombres;
}

// Fin de la expresión de lectura (tokens) -> valor de respaldo si lo hay.
function ieRespaldoLectura(ctx, clase, j) {
    const T = ctx.T;
    let k = -1;
    if (nkEs(T[j], "??")) k = j + 1;
    else if (nkEs(T[j], "?") && nkEs(T[j + 1], "?")) k = j + 2;
    else if (nkEs(T[j], "!=") && nkEsId(T[j + 1], "null") && nkEs(T[j + 2], "?")) {
        // a != null ? a : X  -> el X tras el ":" de este nivel
        let m = j + 3, prof = 0;
        for (; m < clase.fin; m++) {
            const t = T[m];
            if (t.k !== "p") continue;
            if (t.v === "(" || t.v === "[" || t.v === "{") prof++;
            else if (t.v === ")" || t.v === "]" || t.v === "}") { if (--prof < 0) break; }
            else if (prof === 0 && (t.v === ";" || t.v === ",")) break;
            else if (prof === 0 && t.v === ":") { k = m + 1; break; }
        }
    }
    if (k < 0) return undefined;
    let v = nkResolver(ctx, nkParseValor(T, k).v, clase, 0);
    v = ieConstante(v);
    return ieEsPrimitivo(v) ? v : undefined;
}

function ieLecturasScript(ctx, clase) {
    const T = ctx.T;
    const params = ieParametrosData(ctx, clase);
    const lecturas = new Map();
    let claveValorAntiguo = null;
    if (!params.size) return { lecturas, claveValorAntiguo, params: [] };
    // alias: var v = data.value;  /  var v = data.valueAsStruct('k');
    const alias = new Set();
    ctx.decl.forEach((d) => {
        if (d.pos <= clase.ini || d.pos >= clase.fin || d.tipo === "push") return;
        if (nkEsId(T[d.i]) && params.has(T[d.i].v) && nkEs(T[d.i + 1], ".") && nkEsId(T[d.i + 2])) {
            const campo = T[d.i + 2].v;
            if (campo === "value" && /^[;,)]$/.test((T[d.i + 3] || {}).v || ";")) alias.add(d.nombre);
            if (campo === "valueAsStruct") alias.add(d.nombre);
        }
    });
    const anotar = (clave, tipo, fin, fuente) => {
        if (typeof clave !== "string" || !clave) return;
        const r = lecturas.get(clave) || { name: clave, tipo: null, fuente };
        if (tipo && (!r.tipo || r.tipo === "DYNAMIC")) r.tipo = tipo;
        if (r.scriptDefault === undefined) {
            const dv = ieRespaldoLectura(ctx, clase, fin);
            if (dv !== undefined) r.scriptDefault = dv;
        }
        lecturas.set(clave, r);
    };
    // ¿T[i] empieza una referencia al "v" del evento? -> índice tras ella
    const finValor = (i) => {
        if (!nkEsId(T[i])) return -1;
        if (alias.has(T[i].v) && !nkEs(T[i - 1], ".")) return i + 1;
        if (params.has(T[i].v) && !nkEs(T[i - 1], ".") && nkEs(T[i + 1], ".") && nkEsId(T[i + 2], "value")) return i + 3;
        return -1;
    };
    for (let i = clase.ini; i < clase.fin; i++) {
        const t = T[i];
        if (!nkEsId(t)) continue;
        // data.getFloat('k') ...
        if (params.has(t.v) && !nkEs(T[i - 1], ".") && (nkEs(T[i + 1], ".") || nkEs(T[i + 1], "?.")) && nkEsId(T[i + 2]) && nkEs(T[i + 3], "(")) {
            const metodo = T[i + 2].v;
            const fin = nkSaltarBalanceado(T, i + 3);
            const args = nkResolver(ctx, nkParseLista(T, i + 3, ")").v, clase, 0);
            if (ieTieneClave(IE_GETTERS_DATA, metodo)) anotar(args[0], IE_GETTERS_DATA[metodo], fin, `${t.v}.${metodo}('${args[0]}')`);
            else if (metodo === "valueAsStruct" && typeof args[0] === "string") claveValorAntiguo = args[0];
            continue;
        }
        // Reflect.field(data.value, 'k') / ReflectUtil.getAnonymousField(v, 'k')
        if ((t.v === "Reflect" || t.v === "ReflectUtil") && nkEs(T[i + 1], ".") && nkEsId(T[i + 2]) && /^(field|getProperty|hasField|getAnonymousField|hasAnonymousField)$/.test(T[i + 2].v) && nkEs(T[i + 3], "(")) {
            const e = finValor(i + 4);
            if (e > 0 && nkEs(T[e], ",") && T[e + 1] && T[e + 1].k === "str") anotar(T[e + 1].v, null, nkSaltarBalanceado(T, i + 3), `Reflect.${T[i + 2].v}`);
            continue;
        }
        const e = finValor(i);
        if (e < 0) continue;
        // v.k / v?.k
        if ((nkEs(T[e], ".") || nkEs(T[e], "?.")) && nkEsId(T[e + 1]) && !nkEs(T[e + 2], "(")) {
            anotar(T[e + 1].v, null, e + 2, `value.${T[e + 1].v}`);
        } else if (nkEs(T[e], "[") && T[e + 1] && T[e + 1].k === "str" && nkEs(T[e + 2], "]")) {
            anotar(T[e + 1].v, null, e + 3, `value['${T[e + 1].v}']`);
        }
    }
    lecturas.forEach((r) => { if (!r.tipo) r.tipo = r.scriptDefault !== undefined ? ieTipoDeValor(r.scriptDefault) : "DYNAMIC"; });
    return { lecturas, claveValorAntiguo, params: Array.from(params) };
}

// "intensityCamGame" -> "Intensity Cam Game"
function ieTituloDeClave(k) {
    return String(k).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// Une el schema con lo que lee el script: claves sin campo -> campos normales (V0.8.2l:
// ya no son opcionales; se escriben siempre con el respaldo del script o el de su tipo).
function ieUnirLecturasScript(campos, lect, avisos) {
    const porNombre = new Map(campos.map((c) => [c.name, c]));
    lect.lecturas.forEach((r, k) => {
        const c = porNombre.get(k);
        if (c) {
            c.leidoPorScript = true;
            // Valor crudo del script (sin el clamp del schema: es lo que usa si la clave no está).
            if (r.scriptDefault !== undefined) c.scriptDefault = r.scriptDefault;
            return;
        }
        const nuevo = { name: k, title: ieTituloDeClave(k), type: r.tipo, extra: true, leidoPorScript: true, fuente: r.fuente };
        if (r.scriptDefault !== undefined) nuevo.scriptDefault = r.scriptDefault;
        campos.push(nuevo);
        porNombre.set(k, nuevo);
        avisos.push(`El script lee "${k}" (${r.fuente}) pero no está en getEventSchema(); se agregó al Event Data${r.scriptDefault !== undefined ? ` (predeterminado ${JSON.stringify(r.scriptDefault)})` : ""}.`);
    });
    return campos;
}

// Nombre de la animación del ícono: addByPrefix/addByIndices/play o una variable/función que lo nombre.
function ieAnimacionDeClase(ctx, clase) {
    const T = ctx.T;
    for (let i = clase.ini; i < clase.fin; i++) {
        const t = T[i];
        if (!nkEsId(t) || !nkEs(T[i + 1], "(")) continue;
        if (t.v === "addByPrefix" || t.v === "addByIndices" || t.v === "addAnimation") {
            const args = nkResolver(ctx, nkParseLista(T, i + 1, ")").v, clase, 0);
            const prefijo = typeof args[1] === "string" && args[1] ? args[1] : null;
            if (prefijo) {
                const fpsArg = t.v === "addByIndices" ? args[4] : args[2];
                return { nombre: typeof args[0] === "string" ? args[0] : prefijo, prefijo, fps: nkNumero(fpsArg), fuente: `${t.v}('${args[0]}', '${prefijo}')` };
            }
        }
    }
    const reVar = /^(icon|event)_?(anim(ation)?|prefix|sprite)(_?(name|prefix))?$|^(anim(ation)?_?(name|prefix)|iconAnimation|iconPrefix|iconAnim)$/i;
    const decl = ctx.decl.find((d) => d.tipo === "decl" && reVar.test(d.nombre) && d.pos > clase.ini && d.pos < clase.fin);
    if (decl) {
        const v = nkResolver(ctx, nkParseValor(T, decl.i).v, clase, 0);
        if (typeof v === "string" && v.trim()) return { nombre: v.trim(), prefijo: v.trim(), fuente: `var ${decl.nombre}` };
    }
    for (const fn of ["getIconAnimation", "getIconAnimationName", "getIconPrefix", "getAnimationName"]) {
        const v = nkValorRetorno(ctx, fn, clase, 0);
        if (typeof v === "string" && v.trim()) return { nombre: v.trim(), prefijo: v.trim(), fuente: `${fn}()` };
    }
    return null;
}

function ieAnalizarClase(ctx, clase) {
    const T = ctx.T;
    const avisos = [];
    const ctor = nkAmbitoConstructor(ctx, clase);
    const ambito = ctor ? ctor.ambito : {};
    const desde = ctor ? ctor.cuerpoIni : clase.ini, hasta = ctor ? ctor.cuerpoFin : clase.fin;
    let args = null;
    for (let i = desde; i < hasta; i++) {
        if (nkEsId(T[i], "super") && nkEs(T[i + 1], "(")) { args = nkParseLista(T, i + 1, ")").v; break; }
    }
    const res = (k) => (args && k < args.length ? nkResolver(ctx, args[k], clase, 0, ambito) : undefined);
    const a0 = res(0), a1 = res(1);
    let id = typeof a0 === "string" ? a0.trim() : "";
    if (!args) avisos.push("No se encontró super('EventId') en el constructor.");
    else if (!id) avisos.push(`No se pudo leer el id del evento (${nkTextoValor(a0)}).`);
    const processOldEvents = nkEsObjetoPlano(a1) && a1.processOldEvents === true;

    let titulo = nkValorRetorno(ctx, "getTitle", clase, 0);
    let tituloFuente = "getTitle()";
    if (typeof titulo !== "string" || !titulo.trim()) {
        if (titulo !== undefined) avisos.push(`No se pudo leer getTitle() (${nkTextoValor(titulo)}); se usó el título por defecto.`);
        titulo = null;
        tituloFuente = "id.toTitleCase()";
    }
    const rutaIcono = nkValorRetorno(ctx, "getIconPath", clase, 0);
    const esquema = nkValorRetorno(ctx, "getEventSchema", clase, 0);
    const campos = ieNormalizarEsquema(esquema, avisos);
    // V0.8.2k: lo que el script lee del "v" del chart también entra al Event Data.
    let lect = { lecturas: new Map(), claveValorAntiguo: null, params: [] };
    try { lect = ieLecturasScript(ctx, clase); } catch (e) { console.warn("[Importar eventos] lecturas del script", e); }
    ieUnirLecturasScript(campos, lect, avisos);
    const anim = ieAnimacionDeClase(ctx, clase);
    const info = { id, titulo, tituloFuente, processOldEvents, clase: clase.nombre, padre: clase.padre, rutaIcono: typeof rutaIcono === "string" ? rutaIcono.trim() : null, rutaIconoCruda: rutaIcono, anim, campos, avisos, tieneEsquema: esquema !== undefined };
    info.lecturasScript = Array.from(lect.lecturas.keys());
    if (lect.claveValorAntiguo) info.claveValorAntiguo = lect.claveValorAntiguo;
    return info;
}

// Datos del ícono: ruta (getIconPath), nombre del asset y prefijo de la animación en el XML.
function ieInfoIcono(info) {
    const ruta = info.rutaIcono;
    const rutaPorDefecto = !ruta || /(^|\/)default$/i.test(ruta);
    const nombre = ruta && !rutaPorDefecto ? ruta.split("/").pop().replace(/\.(png|xml)$/i, "") : info.id;
    const declarado = (!!ruta && !rutaPorDefecto) || !!info.anim;
    let prefijo, fuente;
    if (info.anim) { prefijo = info.anim.prefijo; fuente = info.anim.fuente; }
    else { prefijo = `${info.id}0`; fuente = "regla del editor oficial: '<EventId>0'"; }
    const candidatos = [];
    [prefijo, `${info.id}0`, `${nombre}0`, info.id, nombre].forEach((p) => { if (p && !candidatos.includes(p)) candidatos.push(p); });
    return { ruta: ruta || null, nombre, declarado, prefijo, fuente, candidatos, fps: (info.anim && info.anim.fps) || IE_FPS_ICONO };
}

function analizarHxcSongEvent(textoOriginal, nombreArchivo) {
    const texto = String(textoOriginal || "").replace(/^\uFEFF/, "");
    const ctx = nkCrearContexto(texto);
    const nombres = new Map(ctx.clases.map((c) => [c.nombre, c]));
    const esEvento = (c, prof) => {
        const base = c.padre.split(".").pop();
        if (/^(Scripted)?SongEvent$/.test(base)) return true;
        const padre = nombres.get(base);
        return !!padre && padre !== c && prof < 8 && esEvento(padre, prof + 1);
    };
    const candidatas = ctx.clases.filter((c) => esEvento(c, 0));
    const ignoradas = ctx.clases.filter((c) => !candidatas.includes(c)).map((c) => ({ clase: c.nombre, padre: c.padre }));
    if (!candidatas.length) {
        const otro = ctx.clases.length ? ` (encontré ${ctx.clases.map((c) => `${c.nombre}${c.padre ? " extends " + c.padre : ""}`).join(", ")})` : "";
        throw new Error(`"${nombreArchivo}" no parece un script de evento: no tiene "class ... extends ScriptedSongEvent"${otro}.`);
    }
    const eventos = [];
    const vistos = new Set();
    let opcionalesComentario = new Set();
    try { opcionalesComentario = ieOpcionalesPorComentario(texto); } catch (e) { }
    candidatas.forEach((c) => {
        const info = ieAnalizarClase(ctx, c);
        // Clase base sin super('EventId') de la que heredan otros eventos del archivo: no es un evento.
        if (!info.id && candidatas.some((x) => x !== c && x.padre.split(".").pop() === c.nombre)) {
            ignoradas.push({ clase: c.nombre, padre: c.padre, base: true });
            return;
        }
        if (!info.id) {
            info.id = c.nombre;
            info.avisos.push(`Se usó el nombre de la clase ("${c.nombre}") como id del evento.`);
        }
        if (vistos.has(info.id)) return;
        vistos.add(info.id);
        if (!info.titulo) info.titulo = ieTitleCase(info.id);
        if (opcionalesComentario.size) info.campos.forEach((c) => { if (!c.extra && opcionalesComentario.has(c.name)) c.opcional = true; });
        info.icono = ieInfoIcono(info);
        info.archivo = nombreArchivo;
        eventos.push(info);
    });
    return { archivo: nombreArchivo, eventos, ignoradas };
}

// ---------------------------------------------------------------------
// Valores (v) como los escribe el editor oficial
// ---------------------------------------------------------------------
function ieValorCampo(c, crudo) {
    if (crudo === undefined || crudo === null) return undefined;
    switch (c.type) {
        case "INTEGER":
        case "FLOAT": {
            let n = typeof crudo === "number" ? crudo : parseFloat(crudo);
            if (!Number.isFinite(n)) return undefined;
            if (typeof c.min === "number") n = Math.max(c.min, n);
            if (typeof c.max === "number") n = Math.min(c.max, n);
            if (c.type === "INTEGER") return Math.round(n);
            return parseFloat(n.toFixed(10));
        }
        case "BOOL": return crudo === true || crudo === "true" || crudo === 1 || crudo === "1";
        case "ENUM": {
            const o = c.opciones.find((x) => x.value === crudo) || c.opciones.find((x) => String(x.value) === String(crudo));
            return o ? o.value : crudo; // un valor que no está en keys se conserva
        }
        case "DYNAMIC": return ieClonar(crudo);
        default: return typeof crudo === "object" ? JSON.stringify(crudo) : String(crudo);
    }
}

// Valor que muestra el formulario (sin escribirlo).
function ieValorVisible(c, v) {
    const actual = ieTieneClave(v, c.name) ? ieValorCampo(c, v[c.name]) : undefined;
    if (actual !== undefined) return actual;
    if (c.defaultValue !== undefined) return c.defaultValue;
    if (c.scriptDefault !== undefined && c.type !== "DYNAMIC") { const sd = ieValorCampo(c, c.scriptDefault); if (sd !== undefined) return sd; }
    if (c.type === "DYNAMIC") return c.scriptDefault !== undefined ? c.scriptDefault : "";
    if (c.type === "BOOL") return false;
    if (c.type === "STRING") return "";
    if (c.type === "ENUM") return c.opciones[0].value;
    let n = 0;
    if (typeof c.min === "number" && n < c.min) n = c.min;
    if (typeof c.max === "number" && n > c.max) n = c.max;
    return n;
}

// Campos del schema en su orden (con defaultValue si no hay valor) + claves extra intactas.
function ieNormalizarValores(defGCD, v) {
    if (!defGCD || defGCD.noImportado) return ieClonar(v);
    let origen = v && typeof v === "object" && !Array.isArray(v) ? v : {};
    // V0.8.2k: formato viejo (v suelto) + data.valueAsStruct('k') del script -> { k: v }.
    const def = defGCD.importado || {};
    if (v !== undefined && v !== null && typeof v !== "object" && def.claveValorAntiguo) origen = { [def.claveValorAntiguo]: v };
    const salida = {};
    (defGCD.campos || []).forEach((c) => {
        const val = ieTieneClave(origen, c.name) ? ieValorCampo(c, origen[c.name]) : undefined;
        if (val !== undefined) salida[c.name] = val;
        else if (!c.opcional) {
            // V0.8.2l: todo campo del Event Data se escribe con su predeterminado (defaultValue
            // del schema, respaldo del script "?? X" o el del tipo). Un campo libre (DYNAMIC)
            // sin ningún predeterminado no se inventa.
            if (c.type === "DYNAMIC" && c.defaultValue === undefined && c.scriptDefault === undefined) return;
            const d = ieValorVisible(c, {});
            if (d !== undefined) salida[c.name] = ieClonar(d);
        }
    });
    Object.keys(origen).forEach((k) => { if (!ieTieneClave(salida, k)) salida[k] = ieClonar(origen[k]); });
    return salida;
}

// ---------------------------------------------------------------------
// Definiciones para EventosGCD.js
// ---------------------------------------------------------------------
function ieCorto(titulo, id) {
    const base = String(titulo || id || "").split("|").pop().trim() || String(id || "");
    const palabras = base.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s_\-]+/).filter(Boolean);
    const ini = palabras.map((p) => p[0]).join("").toUpperCase();
    return (ini || base.slice(0, 2).toUpperCase()).slice(0, 3);
}

function ieDefinicionGCD(id) {
    const def = eventosImportadosGCD[id];
    if (def) {
        if (!def._gcd) {
            def._gcd = {
                id: def.id, label: def.titulo, clave: "ext:" + def.id, externo: true,
                icon: def._iconoUrl || EVENTO_ICONO_RESPALDO,
                desc: `Evento importado · ${def.id}`,
                corto: def._iconoUrl ? "" : ieCorto(def.titulo, def.id),
                campos: def.campos, orden: def.campos.map((c) => c.name), importado: def
            };
        }
        return def._gcd;
    }
    const sid = String(id ?? "");
    return { id: sid, label: `${sid || "(sin id)"} (no importado)`, clave: "ext:" + sid, externo: true, noImportado: true, icon: EVENTO_ICONO_RESPALDO, desc: "Evento no importado: sus datos se conservan tal cual", corto: "?", campos: [], orden: [] };
}

function ieExisteEvento(id) { return !!eventosImportadosGCD[id]; }

function ieListaOrdenada() {
    return Object.values(eventosImportadosGCD).sort((a, b) => a.titulo.localeCompare(b.titulo));
}

// ---------------------------------------------------------------------
// Ícono (PNG + XML Sparrow -> strip animado con CSS, o PNG estático)
// ---------------------------------------------------------------------
function ieFramesIcono(atlas, icono) {
    for (const p of icono.candidatos || [icono.prefijo]) {
        const fr = atlas.frames.filter((f) => f.nombre.startsWith(p));
        if (fr.length) { fr.sort((a, b) => (a.num - b.num) || (a.orden - b.orden)); return { frames: fr, prefijo: p, exacto: true }; }
    }
    // Respaldo: la primera animación del XML (nombre del primer SubTexture sin el número final).
    const base = atlas.frames[0].nombre.replace(/\d+(\.(png|astc))?$/i, "");
    const fr = atlas.frames.filter((f) => f.nombre.replace(/\d+(\.(png|astc))?$/i, "") === base);
    fr.sort((a, b) => (a.num - b.num) || (a.orden - b.orden));
    return { frames: fr, prefijo: base, exacto: false };
}

function ieCanvasABlobUrl(canvas) {
    return new Promise((resolve) => {
        if (canvas.toBlob) canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : canvas.toDataURL("image/png")), "image/png");
        else resolve(canvas.toDataURL("image/png"));
    });
}

function ieLiberarIcono(def) {
    [def._iconoUrl, def._anim && def._anim.url].forEach((u) => { if (u && u.startsWith("blob:")) URL.revokeObjectURL(u); });
    def._iconoUrl = null; def._anim = null; def._gcd = null; def._iconoInfo = null;
}

// Construye def._iconoUrl (primer frame / PNG) y def._anim ({url, n, fps}) si hay varios frames.
async function ieConstruirIcono(def) {
    ieLiberarIcono(def);
    if (!def.png || !def.png.blob) return;
    const { img, url } = await nkCargarImagen(def.png.blob);
    try {
        if (!def.xml || !def.xml.texto) {
            const c = document.createElement("canvas");
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext("2d").drawImage(img, 0, 0);
            def._iconoUrl = await ieCanvasABlobUrl(c);
            def._iconoInfo = { frames: 1, prefijo: null, exacto: true, estatico: true };
            return;
        }
        const atlas = nkLeerAtlas(def.xml.texto);
        const sel = ieFramesIcono(atlas, def.icono || {});
        const frames = sel.frames.slice(0, IE_MAX_FRAMES);
        let W = 1, H = 1;
        frames.forEach((f) => { W = Math.max(W, f.fw); H = Math.max(H, f.fh); });
        const S = IE_TAM_FRAME, esc = S / Math.max(W, H);
        const strip = document.createElement("canvas");
        strip.width = S * frames.length; strip.height = S;
        const g = strip.getContext("2d");
        g.imageSmoothingEnabled = true;
        frames.forEach((f, k) => {
            g.save();
            g.translate(k * S + (S - W * esc) / 2, (S - H * esc) / 2);
            g.scale(esc, esc);
            g.translate(f.offX, f.offY);
            if (f.rot) { g.translate(0, f.dh); g.rotate(-Math.PI / 2); }
            g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
            g.restore();
        });
        const primero = document.createElement("canvas");
        primero.width = S; primero.height = S;
        primero.getContext("2d").drawImage(strip, 0, 0, S, S, 0, 0, S, S);
        def._iconoUrl = await ieCanvasABlobUrl(primero);
        if (frames.length > 1) def._anim = { url: await ieCanvasABlobUrl(strip), n: frames.length, fps: (def.icono && def.icono.fps) || IE_FPS_ICONO };
        def._iconoInfo = { frames: frames.length, total: sel.frames.length, prefijo: sel.prefijo, exacto: sel.exacto };
    } finally {
        URL.revokeObjectURL(url);
    }
}

function ieActualizarEstilos() {
    let style = document.getElementById("ie-iconos-css");
    if (!style) { style = document.createElement("style"); style.id = "ie-iconos-css"; document.head.appendChild(style); }
    let css = "";
    Object.values(eventosImportadosGCD).forEach((def) => {
        if (def._anim) css += `.ie-anim.${def._css} .ie-anim-strip{background-image:url("${def._anim.url}");animation-duration:${(def._anim.n / def._anim.fps).toFixed(3)}s;animation-timing-function:steps(${def._anim.n});}\n`;
    });
    style.textContent = css;
}

let ieObservador = null;
function ieObservar(el) {
    if (!("IntersectionObserver" in window)) return;
    if (!ieObservador) {
        ieObservador = new IntersectionObserver((entradas) => {
            entradas.forEach((e) => e.target.classList.toggle("ie-fuera", !e.isIntersecting));
        }, { rootMargin: "120px" });
    }
    el.classList.add("ie-fuera");
    ieObservador.observe(el);
}

// Elemento del ícono para la grilla o la ventana (img, o span animado).
function ieCrearIconoEvento(defGCD, clase) {
    const def = defGCD && defGCD.importado;
    if (def && def._anim) {
        const span = document.createElement("span");
        span.className = `${clase} ie-anim ${def._css}`;
        span.setAttribute("role", "img");
        span.setAttribute("aria-label", defGCD.label);
        span.dataset.eventType = defGCD.id;
        const strip = document.createElement("span");
        strip.className = "ie-anim-strip";
        strip.style.width = `${def._anim.n * 100}%`;
        span.appendChild(strip);
        ieObservar(span);
        return span;
    }
    const img = crearImagenIconoEventoGCD(defGCD.icon || EVENTO_ICONO_RESPALDO, clase);
    img.alt = defGCD.label;
    img.dataset.eventType = defGCD.id;
    return img;
}

function ieHTMLIcono(defGCD, clase) {
    const def = defGCD && defGCD.importado;
    if (def && def._anim) return `<span class="${clase} ie-anim ${def._css}" role="img" aria-label="${ieEscapar(defGCD.label)}"><span class="ie-anim-strip" style="width:${def._anim.n * 100}%"></span></span>`;
    return `<img class="${clase}" alt="" src="${ieEscapar((defGCD && defGCD.icon) || EVENTO_ICONO_RESPALDO)}">`;
}

// Cabecera de la ventana Events: muestra el ícono importado (animado o no).
function ieMostrarIconoCabecera(img, defGCD) {
    if (!img) return;
    let anim = document.getElementById("event-preview-anim");
    const def = defGCD && defGCD.externo ? defGCD.importado : null;
    if (def && def._anim) {
        if (!anim) {
            anim = document.createElement("span");
            anim.id = "event-preview-anim";
            anim.innerHTML = '<span class="ie-anim-strip"></span>';
            img.insertAdjacentElement("afterend", anim);
        }
        anim.className = `event-preview-icon ie-anim ${def._css}`;
        anim.firstChild.style.width = `${def._anim.n * 100}%`;
        anim.hidden = false;
        img.hidden = true;
        return true;
    }
    if (anim) anim.hidden = true;
    img.hidden = false;
    return false;
}

function ieRepintarCeldas(id) {
    if (!currentChartData || !currentChartData.events || typeof repintarCeldaEvento !== "function") return;
    // V0.8.2k: se repinta la casilla entera (puede tener varios eventos pegados).
    const filas = new Set();
    Object.keys(currentChartData.events).forEach((clave) => {
        const ev = currentChartData.events[clave];
        if (ev && ev.type === IE_TIPO_EXTERNO && (id === undefined || ev.e === id)) filas.add(parseInt(clave, 10));
    });
    filas.forEach((f) => { if (Number.isFinite(f)) repintarCeldaEvento(f); });
}

// ---------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------
function ieAbrirDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error("IndexedDB no disponible")); return; }
        const req = indexedDB.open(IE_DB_NAME, 1);
        req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(IE_STORE)) db.createObjectStore(IE_STORE, { keyPath: "id" }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("No se pudo abrir IndexedDB"));
    });
}

function ieSerializable(def) {
    const out = {};
    Object.keys(def).forEach((k) => { if (!k.startsWith("_")) out[k] = def[k]; });
    return out;
}

async function ieTx(modo, fn) {
    const db = await ieAbrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IE_STORE, modo);
        const r = fn(tx.objectStore(IE_STORE));
        tx.oncomplete = () => { db.close(); resolve(r && "result" in r ? r.result : true); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
    });
}

function ieGuardarDef(def) { return ieTx("readwrite", (s) => { s.put(ieSerializable(def)); }); }
function ieBorrarDefDB(id) { return ieTx("readwrite", (s) => { s.delete(id); }); }
function ieLeerDefsDB() { return ieTx("readonly", (s) => s.getAll()); }

function iePrepararDef(def) {
    def._css = "ie-i-" + (++ieContadorCss);
    def.campos = Array.isArray(def.campos) ? def.campos : [];
    return def;
}

async function cargarEventosImportados() {
    try {
        const lista = await ieLeerDefsDB();
        for (const rec of lista || []) {
            if (!rec || !rec.id) continue;
            // Se vuelve a leer el .hxc guardado con el parser actual.
            if (rec.hxc && typeof rec.hxc.texto === "string") {
                try {
                    const r = analizarHxcSongEvent(rec.hxc.texto, rec.hxc.nombre || rec.id);
                    const info = r.eventos.find((x) => x.id === rec.id);
                    if (info) Object.assign(rec, { titulo: info.titulo, campos: info.campos, avisos: info.avisos, processOldEvents: info.processOldEvents, clase: info.clase, icono: info.icono, claveValorAntiguo: info.claveValorAntiguo || null, lecturasScript: info.lecturasScript || [] });
                } catch (e) { }
            }
            const def = iePrepararDef(rec);
            try { await ieConstruirIcono(def); } catch (e) { console.warn("[Importar eventos] ícono", e); }
            eventosImportadosGCD[def.id] = def;
        }
    } catch (e) {
        console.warn("[Importar eventos] No se pudieron leer los eventos guardados", e);
    }
    eventosImportadosListos = true;
    ieActualizarEstilos();
    ieRepintarCeldas();
    ieRefrescarVentana();
}

// ---------------------------------------------------------------------
// Ventana Events: formulario Event Data de un evento importado
// ---------------------------------------------------------------------
function ieRenderizarFormulario(contenedor, defGCD, evento) {
    contenedor.innerHTML = "";
    contenedor.dataset.renderKey = defGCD.clave;
    if (defGCD.noImportado) {
        let crudo = "";
        try { crudo = JSON.stringify(evento.v === undefined ? {} : evento.v, null, 1); } catch (e) { crudo = String(evento.v); }
        contenedor.innerHTML = `<div class="ie-aviso"><i class="fa-solid fa-circle-exclamation"></i><div><strong>Evento no importado</strong>
            <span><code>${ieEscapar(defGCD.id)}</code> no está en este editor. Sus datos se guardan tal cual al exportar el song-chart.json.</span></div></div>
            <pre class="ie-raw">${ieEscapar(crudo.length > 1200 ? crudo.slice(0, 1200) + "…" : crudo)}</pre>
            <button type="button" class="ie-btn primary" onclick="iniciarImportacionEventos(${ieEscapar(JSON.stringify(defGCD.id))})"><i class="fa-solid fa-file-import"></i> Importar su .hxc</button>`;
        return;
    }
    const v = evento.v && typeof evento.v === "object" ? evento.v : {};
    const def = defGCD.importado;
    const info = document.createElement("div");
    info.className = "ie-form-info";
    info.innerHTML = `<i class="fa-solid fa-puzzle-piece"></i> Importado · <code>${ieEscapar(def.id)}</code>${def.hxc && def.hxc.nombre ? ` · ${ieEscapar(def.hxc.nombre)}` : ""}`;
    contenedor.appendChild(info);
    if (!def.campos.length) {
        const vacio = document.createElement("div");
        vacio.className = "events-classic-hint";
        vacio.textContent = "Este evento no tiene Event Data (getEventSchema vacío).";
        contenedor.appendChild(vacio);
        return;
    }
    let grupo = null;
    def.campos.forEach((c, i) => {
        if (c.grupo && c.grupo !== grupo) {
            const t = document.createElement("div");
            t.className = "ie-grupo";
            t.textContent = c.grupo;
            contenedor.appendChild(t);
        }
        grupo = c.grupo || null;
        const wrap = document.createElement("div");
        wrap.className = "event-data-field" + (c.type === "BOOL" ? " is-bool" : "");
        const idCtrl = `ie-field-${def._css}-${i}`;
        const valor = ieValorVisible(c, v);
        let control;
        if (c.type === "BOOL") {
            control = document.createElement("input");
            control.type = "checkbox";
            control.className = "event-data-check";
            control.checked = valor === true;
            control.addEventListener("change", () => ieCambiarCampo(c, control));
        } else if (c.type === "ENUM") {
            control = document.createElement("select");
            control.className = "events-field";
            // V0.8.2m: un "ease" cuyo enum ya usa los valores estándar (sineIn, quadInOut, INSTANT...)
            // muestra la lista oficial completa (Classic solo si el .hxc lo trae). Si el .hxc usa
            // ease + easeDir aparte (formato 0.8.x) se deja tal cual lo define.
            const esEase = /^ease$/i.test(String(c.name)) && typeof enumEsListaEaseEstandarGCD === "function" && enumEsListaEaseEstandarGCD(c.opciones);
            const ops = esEase ? opcionesEaseEstandarParaHxcGCD(c.opciones) : c.opciones.slice();
            if (!ops.some((o) => o.value === valor || String(o.value) === String(valor))) ops.push({ label: `${valor} (importado)`, value: valor });
            ops.forEach((o, k) => {
                const op = document.createElement("option");
                op.value = String(k);
                op.textContent = o.label;
                if (o.value === valor || (String(o.value) === String(valor) && !ops.some((x) => x.value === valor))) op.selected = true;
                control.appendChild(op);
            });
            control._ieOpciones = ops;
            control.addEventListener("change", () => ieCambiarCampo(c, control));
            // Lista con "Buscar..." para los ease y los enums largos.
            if (typeof hacerSelectBuscableGCD === "function" && ((/ease/i.test(String(c.name)) && !/dir/i.test(String(c.name))) || ops.length >= 12)) hacerSelectBuscableGCD(control);
        } else if (c.type === "DYNAMIC") {
            control = document.createElement("input");
            control.className = "events-field ie-dynamic";
            control.type = "text";
            control.spellcheck = false;
            control.autocomplete = "off";
            const tiene = ieTieneClave(v, c.name);
            const crudoV = tiene ? v[c.name] : undefined;
            control.value = !tiene ? "" : typeof crudoV === "string" ? crudoV : JSON.stringify(crudoV);
            if (c.scriptDefault !== undefined) control.placeholder = typeof c.scriptDefault === "string" ? c.scriptDefault : JSON.stringify(c.scriptDefault);
            control.addEventListener("change", () => ieCambiarCampo(c, control));
        } else {
            control = document.createElement("input");
            control.className = "events-field";
            if (c.type === "INTEGER" || c.type === "FLOAT") {
                control.type = "number";
                control.step = String(c.step ?? (c.type === "INTEGER" ? 1 : 0.1));
                if (c.min !== undefined) control.min = String(c.min);
                if (c.max !== undefined) control.max = String(c.max);
                control.inputMode = c.type === "INTEGER" ? "numeric" : "decimal";
                control.addEventListener("change", () => {
                    const vAct = currentChartData?.events?.[eventoSeleccionado]?.v || {};
                    control.value = c.opcional && !ieTieneClave(vAct, c.name) ? "" : String(ieValorVisible(c, vAct));
                });
            } else {
                control.type = "text";
                control.spellcheck = false;
                control.autocomplete = "off";
            }
            control.value = String(valor);
            // Opcional sin escribir: el campo queda vacío (con el respaldo del script como pista).
            if (c.opcional && !ieTieneClave(v, c.name)) {
                control.value = "";
                const pista = c.scriptDefault !== undefined ? c.scriptDefault : c.defaultValue;
                if (pista !== undefined) control.placeholder = String(pista);
            }
            control.addEventListener("input", () => ieCambiarCampo(c, control));
        }
        control.id = idCtrl;
        control.dataset.eventField = c.name;
        control.dataset.ieTipo = c.type;
        if (c.opcional) wrap.classList.add("ie-opcional");
        // 082l: si el título ya dice "opcional"/"optional", no se repite la marca.
        if (c.opcional && IE_RE_OPCIONAL.test(String(c.title || ""))) wrap.classList.add("ie-opcional-titulo");
        const ayuda = [c.type.toLowerCase(), c.min !== undefined ? `min ${c.min}` : "", c.max !== undefined ? `max ${c.max}` : "", c.step !== undefined ? `step ${c.step}` : ""].filter(Boolean).join(" · ");
        if (c.type === "BOOL") {
            const linea = document.createElement("label");
            linea.className = "event-data-bool";
            linea.htmlFor = idCtrl;
            linea.title = `${c.name} (bool)`;
            linea.appendChild(control);
            const span = document.createElement("span");
            span.textContent = c.title;
            linea.appendChild(span);
            wrap.appendChild(linea);
        } else {
            const label = document.createElement("label");
            label.className = "events-field-label";
            label.htmlFor = idCtrl;
            label.textContent = c.title;
            label.title = `${c.name} (${ayuda})`;
            wrap.appendChild(label);
            if (c.units) {
                const fila = document.createElement("div");
                fila.className = "event-data-unit-row";
                fila.appendChild(control);
                const u = document.createElement("span");
                u.className = "event-data-unit";
                u.textContent = c.units;
                fila.appendChild(u);
                wrap.appendChild(fila);
            } else wrap.appendChild(control);
        }
        // V0.8.2k: pistas de la relación con el script.
        // V0.8.2l: nada es opcional salvo que el .hxc lo diga.
        const pistas = [];
        const txtDef = (x) => (typeof x === "string" ? `"${x}"` : JSON.stringify(x));
        if (c.opcional) {
            pistas.push("Opcional (lo dice el .hxc)");
            if (c.scriptDefault !== undefined) pistas.push(`si no se escribe, el script usa ${txtDef(c.scriptDefault)}`);
        } else if (c.extra) {
            pistas.push("Lo lee el script del chart");
            if (c.scriptDefault !== undefined) pistas.push(`predeterminado ${txtDef(c.scriptDefault)}`);
        }
        if (c.type === "DYNAMIC") pistas.push("JSON o texto");
        if (pistas.length || c.opcional) {
            const nota = document.createElement("div");
            nota.className = "ie-campo-nota";
            nota.textContent = pistas.join(" · ");
            if (c.opcional) {
                const quitar = document.createElement("button");
                quitar.type = "button";
                quitar.className = "ie-campo-reset";
                quitar.dataset.ieOpt = c.name;
                quitar.title = "Quitar del song-chart (el script usa su valor de respaldo)";
                quitar.innerHTML = '<i class="fa-solid fa-eraser"></i> Quitar';
                quitar.hidden = !ieTieneClave(v, c.name);
                quitar.addEventListener("click", () => { ieQuitarCampoOpcional(c); if (typeof actualizarVentanaEvento === "function") actualizarVentanaEvento(); });
                nota.appendChild(quitar);
            }
            wrap.appendChild(nota);
        }
        contenedor.appendChild(wrap);
    });
}

function ieCambiarCampo(c, control) {
    if (eventoSeleccionado === null || !currentChartData?.events?.[eventoSeleccionado]) return;
    const evento = currentChartData.events[eventoSeleccionado];
    if (evento.type !== IE_TIPO_EXTERNO) return;
    const defGCD = ieDefinicionGCD(evento.e);
    if (defGCD.noImportado) return;
    let crudo;
    if (c.type === "BOOL") crudo = control.checked;
    else if (c.type === "ENUM") { const o = (control._ieOpciones || [])[parseInt(control.value, 10)]; crudo = o ? o.value : undefined; }
    else if (c.type === "DYNAMIC") {
        // Campo libre: JSON (número, true/false, [lista], {objeto}) o texto.
        const txt = control.value;
        if (txt.trim() === "") {
            if (c.opcional) return ieQuitarCampoOpcional(c);
            // V0.8.2l: no opcional -> vuelve a su predeterminado (o se quita si no tiene ninguno).
            if (c.defaultValue === undefined && c.scriptDefault === undefined) return ieQuitarCampoOpcional(c, true);
            crudo = c.defaultValue !== undefined ? c.defaultValue : c.scriptDefault;
        } else {
            try { crudo = JSON.parse(txt); } catch (e) { crudo = txt; }
        }
    }
    else crudo = control.value;
    if (c.opcional && (c.type === "INTEGER" || c.type === "FLOAT" || c.type === "STRING") && String(crudo).trim() === "") return ieQuitarCampoOpcional(c);
    const valor = ieValorCampo(c, crudo);
    if (valor === undefined) return; // número a medio escribir
    const antes = ieClonar(evento);
    evento.v = ieNormalizarValores(defGCD, { ...(evento.v && typeof evento.v === "object" ? evento.v : {}), [c.name]: valor });
    ieTrasCambioCampo(defGCD, evento, antes);
}

function ieTrasCambioCampo(defGCD, evento, antes, accionSuelta) {
    const texto = typeof tituloEventoGCD === "function" ? tituloEventoGCD(defGCD, evento) : `${defGCD.label} ${JSON.stringify(evento.v)}`;
    if (typeof actualizarTituloEventoGCD === "function") actualizarTituloEventoGCD(eventoSeleccionado, texto);
    if (typeof registrarCambioConfigEvento === "function") registrarCambioConfigEvento(eventoSeleccionado, antes, evento, !!accionSuelta);
    document.querySelectorAll(`#event-data-fields [data-ie-opt]`).forEach((b) => {
        const k = b.dataset.ieOpt;
        b.hidden = !(evento.v && typeof evento.v === "object" && ieTieneClave(evento.v, k));
    });
}

// V0.8.2k: un campo opcional vuelve a "no escrito" (el script usa su valor de respaldo).
function ieQuitarCampoOpcional(c, forzar) {
    if (eventoSeleccionado === null || !currentChartData?.events?.[eventoSeleccionado]) return;
    const evento = currentChartData.events[eventoSeleccionado];
    if (evento.type !== IE_TIPO_EXTERNO || !evento.v || typeof evento.v !== "object" || !ieTieneClave(evento.v, c.name)) return;
    if (!c.opcional && !forzar) return; // V0.8.2l: los campos normales no se quitan
    const defGCD = ieDefinicionGCD(evento.e);
    const antes = ieClonar(evento);
    const v = ieClonar(evento.v);
    delete v[c.name];
    evento.v = v;
    ieTrasCambioCampo(defGCD, evento, antes, true);
}

// Opciones del <select> "Tipo de evento" (grupo Importados + no importado actual).
function ieActualizarSelectTipo(select, defActual) {
    if (!select) return;
    let grupo = select.querySelector("optgroup[data-ie]");
    const lista = ieListaOrdenada();
    const firma = lista.map((d) => d.id + "|" + d.titulo).join("~");
    if (!grupo || grupo.dataset.firma !== firma) {
        if (grupo) grupo.remove();
        grupo = document.createElement("optgroup");
        grupo.label = "Importados";
        grupo.dataset.ie = "1";
        grupo.dataset.firma = firma;
        lista.forEach((d) => {
            const op = document.createElement("option");
            op.value = "ext:" + d.id;
            op.textContent = d.titulo;
            grupo.appendChild(op);
        });
        grupo.hidden = !lista.length;
        select.appendChild(grupo);
    }
    select.querySelector("option[data-ie-temp]")?.remove();
    if (defActual && defActual.noImportado) {
        const op = document.createElement("option");
        op.value = defActual.clave;
        op.textContent = defActual.label;
        op.dataset.ieTemp = "1";
        op.disabled = true;
        select.appendChild(op);
    }
}

// ---------------------------------------------------------------------
// Sección "Eventos importados" + importador
// ---------------------------------------------------------------------
function ieEventosEnChart() {
    const usados = {};
    const ev = currentChartData && currentChartData.events;
    if (ev) Object.values(ev).forEach((e) => { if (e && e.type === IE_TIPO_EXTERNO) usados[e.e] = (usados[e.e] || 0) + 1; });
    return usados;
}

function ieRefrescarVentana() {
    const cont = document.getElementById("ie-section");
    if (!cont) return;
    const imp = ieUI.importacion;
    const panel = document.getElementById("ie-import-panel");
    if (panel) {
        panel.hidden = !imp;
        panel.innerHTML = imp ? ieHTMLImportacion(imp) : "";
    }
    const lista = document.getElementById("ie-list");
    if (lista) lista.innerHTML = ieHTMLLista();
    const select = document.getElementById("event-type-select");
    if (select && typeof eventoSeleccionado !== "undefined") {
        const ev = eventoSeleccionado !== null && currentChartData?.events ? currentChartData.events[eventoSeleccionado] : null;
        const def = ev ? definicionEventoGCD(ev) : null;
        ieActualizarSelectTipo(select, def);
        if (def) select.value = def.clave;
        else if (typeof tipoEventoNuevoGCD !== "undefined") select.value = definicionPorClaveGCD(tipoEventoNuevoGCD).clave;
    }
}

function ieHTMLLista() {
    const usados = ieEventosEnChart();
    const lista = ieListaOrdenada();
    let html = "";
    if (!lista.length && !ieUI.importacion) html += `<div class="ie-vacio">Todavía no importaste eventos. Toca <strong>Importar eventos</strong> y elige uno o varios <code>.hxc</code>.</div>`;
    lista.forEach((d) => {
        const g = ieDefinicionGCD(d.id);
        const activo = typeof tipoEventoNuevoGCD !== "undefined" && tipoEventoNuevoGCD === g.clave;
        const n = usados[d.id] || 0;
        const icono = d._iconoInfo ? (d._iconoInfo.estatico ? "PNG" : `${d._iconoInfo.frames} frame${d._iconoInfo.frames === 1 ? "" : "s"}`) : (d.iconoOmitido ? "sin ícono" : "Default.png");
        html += `<div class="ie-item${activo ? " active" : ""}" data-ie-id="${ieEscapar(d.id)}">
            <span class="ie-item-icon">${ieHTMLIcono(g, "ie-mini-icon")}</span>
            <div class="ie-item-main"><strong title="${ieEscapar(d.titulo)}">${ieEscapar(d.titulo)}</strong>
            <span><code>${ieEscapar(d.id)}</code> · ${d.campos.length} campo${d.campos.length === 1 ? "" : "s"} · ${icono}${n ? ` · <b>${n} en el chart</b>` : ""}</span></div>
            <div class="ie-item-actions">
                <button type="button" class="ie-icon-btn${activo ? " on" : ""}" title="Usar al tocar casillas vacías" onclick="ieUsarEvento(${ieEscapar(JSON.stringify(d.id))})"><i class="fa-solid fa-hand-pointer"></i></button>
                <button type="button" class="ie-icon-btn" title="Cambiar ícono (PNG + XML)" onclick="ieCambiarIcono(${ieEscapar(JSON.stringify(d.id))})"><i class="fa-solid fa-image"></i></button>
                <button type="button" class="ie-icon-btn" title="Reimportar .hxc" onclick="iniciarImportacionEventos(${ieEscapar(JSON.stringify(d.id))})"><i class="fa-solid fa-rotate"></i></button>
                <button type="button" class="ie-icon-btn danger" title="Eliminar" onclick="ieEliminarEvento(${ieEscapar(JSON.stringify(d.id))})"><i class="fa-solid fa-trash"></i></button>
            </div></div>`;
    });
    const faltan = Object.keys(usados).filter((id) => !ieExisteEvento(id));
    if (faltan.length) {
        html += `<div class="ie-subtitulo">No importados en este chart</div>`;
        faltan.forEach((id) => {
            html += `<div class="ie-item missing" data-ie-missing="${ieEscapar(id)}"><span class="ie-item-icon"><span class="ie-q">?</span></span>
                <div class="ie-item-main"><strong>${ieEscapar(id)}</strong><span>${usados[id]} en el chart · datos conservados</span></div>
                <div class="ie-item-actions"><button type="button" class="ie-btn small" onclick="iniciarImportacionEventos(${ieEscapar(JSON.stringify(id))})"><i class="fa-solid fa-file-import"></i> .hxc</button></div></div>`;
        });
    }
    return html;
}

function ieHTMLImportacion(imp) {
    if (imp.fase === "hxc") {
        return `<div class="ie-import-box">
            <div class="ie-steps-msg">${imp.objetivo ? `Elige el .hxc de <code>${ieEscapar(imp.objetivo)}</code>` : "Elige uno o varios .hxc de eventos"}</div>
            <div class="ie-steps-hint">Scripts <code>extends ScriptedSongEvent</code> de V-Slice. Puedes elegir también sus .png y .xml a la vez.</div>
            <div class="ie-steps-hint ie-mod-hint"><i class="fa-solid fa-circle-info"></i> GCD solo edita los datos del chart: para que el evento funcione al jugar, su <code>.hxc</code> (y lo que use) tiene que estar en tu mod, en <code>scripts/</code>.</div>
            ${imp.error ? `<div class="ie-error"><i class="fa-solid fa-triangle-exclamation"></i> ${ieEscapar(imp.error)}</div>` : ""}
            <div class="ie-actions"><button type="button" class="ie-btn primary" onclick="ieAbrirSelector('hxc')"><i class="fa-solid fa-folder-open"></i> Elegir .hxc</button>
            <button type="button" class="ie-btn ghost" onclick="ieCancelarImportacion()">Cancelar</button></div></div>`;
    }
    const filas = imp.pendientes.map((p, i) => {
        const info = p.info;
        const g = p._preview || { label: info.titulo, icon: EVENTO_ICONO_RESPALDO };
        const necesita = info.icono.declarado || imp.soloIcono;
        let estado;
        if (p.omitir) estado = `<span class="ie-tag">Default.png</span>`;
        else if (p.png) estado = `<span class="ie-tag ok">${p.xml ? (p._frames > 1 ? `${p._frames} frames` : "1 frame") : "PNG estático"}</span>`;
        else estado = necesita ? `<span class="ie-tag warn">falta ícono</span>` : `<span class="ie-tag">Default.png</span>`;
        const iconoTxt = necesita
            ? `Ícono: <code>${ieEscapar(info.icono.ruta || "ui/chart-editor/events/" + info.id)}</code> · animación <code>${ieEscapar(info.icono.prefijo)}</code>`
            : "Sin ícono propio (usa Default.png). Puedes añadirle uno.";
        const avisos = (info.avisos || []).concat(p.avisos || []);
        return `<div class="ie-pend" data-ie-pend="${i}">
            <div class="ie-pend-top"><span class="ie-item-icon">${ieHTMLIcono(g, "ie-mini-icon")}</span>
            <div class="ie-item-main"><strong>${ieEscapar(info.titulo)}</strong><span><code>${ieEscapar(info.id)}</code> · ${info.campos.length} campo${info.campos.length === 1 ? "" : "s"}${eventosImportadosGCD[info.id] && !imp.soloIcono ? " · <b>reemplaza</b>" : ""}</span></div>${estado}</div>
            <div class="ie-steps-hint">${iconoTxt}</div>
            ${p.archivosIcono ? `<div class="ie-steps-hint">${ieEscapar(p.archivosIcono)}</div>` : ""}
            ${avisos.length ? `<div class="ie-warn"><i class="fa-solid fa-circle-exclamation"></i> ${avisos.map(ieEscapar).join(" ")}</div>` : ""}
            ${p.error ? `<div class="ie-error"><i class="fa-solid fa-triangle-exclamation"></i> ${ieEscapar(p.error)}</div>` : ""}
            <div class="ie-actions">
                <button type="button" class="ie-btn${p.png ? " done" : ""}" onclick="ieAbrirSelector('png', ${i})"><i class="fa-solid fa-image"></i> Elegir PNG</button>
                <button type="button" class="ie-btn${p.xml ? " done" : ""}" onclick="ieAbrirSelector('xml', ${i})"><i class="fa-solid fa-code"></i> Elegir XML</button>
                <button type="button" class="ie-btn ghost${p.omitir ? " on" : ""}" onclick="ieOmitirIcono(${i})"><i class="fa-solid fa-forward"></i> Omitir icono</button>
            </div></div>`;
    }).join("");
    const extra = imp.ignoradas && imp.ignoradas.length ? `<div class="ie-steps-hint">Se ignoraron ${imp.ignoradas.length} clase${imp.ignoradas.length === 1 ? "" : "s"} que no son eventos (${imp.ignoradas.map((c) => ieEscapar(c.clase + (c.padre ? " extends " + c.padre : ""))).join(", ")}).</div>` : "";
    const errores = imp.erroresArchivo && imp.erroresArchivo.length ? `<div class="ie-error"><i class="fa-solid fa-triangle-exclamation"></i> ${imp.erroresArchivo.map(ieEscapar).join(" ")}</div>` : "";
    return `<div class="ie-import-box">
        <div class="ie-steps-msg">${imp.soloIcono ? "Ícono del evento" : `${imp.pendientes.length} evento${imp.pendientes.length === 1 ? "" : "s"} encontrado${imp.pendientes.length === 1 ? "" : "s"}`}</div>
        <div class="ie-steps-hint">Elige el <code>.png</code> y el <code>.xml</code> (Sparrow) del ícono, o toca <strong>Omitir icono</strong> para usar <code>eventassets/Default.png</code>.</div>
        ${extra}${errores}
        ${imp.error ? `<div class="ie-error"><i class="fa-solid fa-triangle-exclamation"></i> ${ieEscapar(imp.error)}</div>` : ""}
        <div class="ie-pend-list">${filas}</div>
        <div class="ie-actions"><button type="button" class="ie-btn primary" id="ie-guardar" onclick="ieFinalizarImportacion()"><i class="fa-solid fa-check"></i> ${imp.soloIcono ? "Guardar ícono" : "Guardar eventos"}</button>
        <button type="button" class="ie-btn ghost" onclick="ieCancelarImportacion()">Cancelar</button></div></div>`;
}

function ieAsegurarVentana() {
    const v = document.getElementById("events-window");
    if (v && !v.classList.contains("active") && typeof abrirVentanaEvents === "function") abrirVentanaEvents();
    if (v && v.classList.contains("minimized") && typeof alternarMinimizarEvents === "function") alternarMinimizarEvents();
}

function iniciarImportacionEventos(objetivo) {
    ieAsegurarVentana();
    ieUI.importacion = { fase: "hxc", objetivo: typeof objetivo === "string" ? objetivo : null, pendientes: [], error: "" };
    ieRefrescarVentana();
    document.getElementById("ie-import-panel")?.scrollIntoView({ block: "nearest" });
    ieAbrirSelector("hxc");
}

function ieCambiarIcono(id) {
    const def = eventosImportadosGCD[id];
    if (!def) return;
    ieAsegurarVentana();
    const info = { id: def.id, titulo: def.titulo, campos: def.campos, icono: def.icono || ieInfoIcono({ id: def.id, rutaIcono: null }), avisos: [] };
    ieUI.importacion = { fase: "iconos", soloIcono: true, pendientes: [{ info, png: null, xml: null, omitir: false }], error: "" };
    ieRefrescarVentana();
    document.getElementById("ie-import-panel")?.scrollIntoView({ block: "nearest" });
}

function ieAbrirSelector(tipo, indice) {
    const input = document.getElementById("ie-file");
    if (!input || !ieUI.importacion) return;
    ieUI.selectorDestino = { tipo, indice: indice ?? null };
    input.accept = tipo === "hxc" ? ".hxc,.hx,.png,.astc,.xml" : (tipo === "png" ? ".png,.astc,.ktx,.ktx2,image/png,.xml" : ".xml,text/xml,.png,.astc");
    input.multiple = true;
    input.value = "";
    try { input.click(); } catch (e) { }
}

function ieCancelarImportacion() {
    ieUI.importacion = null;
    ieRefrescarVentana();
    ieToast("Importación cancelada");
}

function ieOmitirIcono(i) {
    const p = ieUI.importacion && ieUI.importacion.pendientes[i];
    if (!p) return;
    p.omitir = !p.omitir;
    if (p.omitir) { p.png = null; p.xml = null; p.error = ""; p.avisos = []; p._preview = null; p.archivosIcono = ""; }
    ieRefrescarVentana();
}

function ieExtension(nombre) { const m = /\.([^.]+)$/.exec(String(nombre || "")); return m ? m[1].toLowerCase() : ""; }
function ieBase(nombre) { return String(nombre || "").replace(/\.[^.]+$/, "").toLowerCase(); }

// Asigna un PNG/XML a la fila pendiente cuyo nombre coincide (EventId / nombre del ícono).
function ieFilaPorNombre(imp, archivo) {
    const b = ieBase(archivo.name);
    return imp.pendientes.findIndex((p) => [p.info.id, p.info.icono.nombre, p.info.clase].filter(Boolean).some((n) => String(n).toLowerCase() === b));
}

async function ieAsignarArchivoIcono(imp, i, archivo) {
    const p = imp.pendientes[i];
    if (!p) return;
    const ext = ieExtension(archivo.name);
    p.error = "";
    if (ext === "xml") {
        const texto = await archivo.text();
        const atlas = nkLeerAtlas(texto); // lanza si no es Sparrow
        p.xml = { nombre: archivo.name, texto };
        p._atlas = atlas;
    } else {
        const { url } = await nkCargarImagen(archivo);
        URL.revokeObjectURL(url);
        p.png = { nombre: archivo.name, blob: new Blob([archivo], { type: archivo.type || "image/png" }) };
    }
    p.omitir = false;
    await ieConstruirPreview(p);
}

async function ieConstruirPreview(p) {
    p.avisos = [];
    p.archivosIcono = [p.png && `PNG: ${p.png.nombre}`, p.xml && `XML: ${p.xml.nombre}`].filter(Boolean).join(" · ");
    if (p._previewDef) { ieLiberarIcono(p._previewDef); p._previewDef = null; }
    p._preview = null; p._frames = 0;
    if (p.xml && p._atlas) {
        const sel = ieFramesIcono(p._atlas, p.info.icono);
        p._frames = Math.min(sel.frames.length, IE_MAX_FRAMES);
        if (!sel.exacto) p.avisos.push(`El XML no tiene SubTexture con el prefijo "${p.info.icono.prefijo}"; se usa su primera animación ("${sel.prefijo}", ${sel.frames.length} frames).`);
        else if (sel.frames.length > IE_MAX_FRAMES) p.avisos.push(`La animación tiene ${sel.frames.length} frames; se usan los primeros ${IE_MAX_FRAMES}.`);
    }
    if (!p.png) return;
    const tmp = iePrepararDef({ id: p.info.id, titulo: p.info.titulo, campos: p.info.campos, icono: p.info.icono, png: p.png, xml: p.xml });
    tmp._css = "ie-prev-" + tmp._css;
    try {
        await ieConstruirIcono(tmp);
        p._previewDef = tmp;
        p._preview = { label: tmp.titulo, icon: tmp._iconoUrl, importado: tmp };
        ieActualizarEstilosPreview();
    } catch (e) {
        p.error = e && e.message ? e.message : "No se pudo armar el ícono.";
    }
}

function ieActualizarEstilosPreview() {
    let style = document.getElementById("ie-preview-css");
    if (!style) { style = document.createElement("style"); style.id = "ie-preview-css"; document.head.appendChild(style); }
    const imp = ieUI.importacion;
    style.textContent = imp ? imp.pendientes.map((p) => p._previewDef && p._previewDef._anim
        ? `.ie-anim.${p._previewDef._css} .ie-anim-strip{background-image:url("${p._previewDef._anim.url}");animation-duration:${(p._previewDef._anim.n / p._previewDef._anim.fps).toFixed(3)}s;animation-timing-function:steps(${p._previewDef._anim.n});}` : "").join("\n") : "";
}

async function procesarArchivosEventos(archivos) {
    ieUI.ocupado = true;
    document.getElementById("ie-import-panel")?.classList.add("ocupado");
    try { await ieProcesarArchivos(archivos); }
    finally { ieUI.ocupado = false; document.getElementById("ie-import-panel")?.classList.remove("ocupado"); }
}

async function ieProcesarArchivos(archivos) {
    const imp = ieUI.importacion;
    const destino = ieUI.selectorDestino || { tipo: "hxc", indice: null };
    if (!imp || !archivos || !archivos.length) return;
    imp.error = "";
    const hxcs = archivos.filter((a) => ["hxc", "hx"].includes(ieExtension(a.name)));
    const iconos = archivos.filter((a) => ["png", "astc", "ktx", "ktx2", "xml"].includes(ieExtension(a.name)));
    try {
        if (imp.fase === "hxc") {
            if (!hxcs.length) throw new Error("Elige al menos un archivo .hxc (es obligatorio).");
            const pendientes = [], errores = [], ignoradas = [];
            for (const f of hxcs) {
                const texto = await f.text();
                if (!texto.trim()) { errores.push(`"${f.name}" está vacío.`); continue; }
                try {
                    const r = analizarHxcSongEvent(texto, f.name);
                    ignoradas.push(...r.ignoradas);
                    r.eventos.forEach((info) => {
                        if (typeof definicionEventoPorIdVSlice === "function" && definicionEventoPorIdVSlice(info.id) && definicionEventoPorIdVSlice(info.id).id === info.id) {
                            errores.push(`"${info.id}" ya es un evento integrado del editor; no se importó.`);
                            return;
                        }
                        const i = pendientes.findIndex((p) => p.info.id === info.id);
                        const fila = { info, hxc: { nombre: f.name, texto }, png: null, xml: null, omitir: false };
                        if (i >= 0) pendientes[i] = fila; else pendientes.push(fila);
                    });
                } catch (e) { errores.push(e.message); }
            }
            if (!pendientes.length) throw new Error(errores.join(" ") || "No se encontraron eventos.");
            if (imp.objetivo && !pendientes.some((p) => p.info.id === imp.objetivo)) errores.push(`Ojo: ningún evento de estos archivos se llama "${imp.objetivo}".`);
            imp.pendientes = pendientes;
            imp.erroresArchivo = errores;
            imp.ignoradas = ignoradas;
            imp.fase = "iconos";
            // El ícono anterior se conserva al reimportar.
            pendientes.forEach((p) => {
                const prev = eventosImportadosGCD[p.info.id];
                if (prev && prev.png) { p.png = prev.png; p.xml = prev.xml; p.heredado = true; }
            });
            for (const a of iconos) {
                // Por nombre (EventId / nombre del ícono); con un solo evento, cualquier PNG/XML es suyo.
                let i = ieFilaPorNombre(imp, a);
                if (i < 0 && pendientes.length === 1) i = 0;
                if (i >= 0) { try { await ieAsignarArchivoIcono(imp, i, a); } catch (e) { imp.pendientes[i].error = `${a.name}: ${e.message}`; } }
            }
            for (const p of pendientes) {
                if (p.heredado) {
                    if (p.xml) try { p._atlas = nkLeerAtlas(p.xml.texto); } catch (e) { }
                    await ieConstruirPreview(p);
                }
            }
            // Si ningún evento declara ícono, no hace falta preguntar nada.
            if (pendientes.every((p) => (!p.info.icono.declarado || p.png) && !p.error && !(p.avisos && p.avisos.length) && !p.info.avisos.length) && !errores.length) {
                await ieFinalizarImportacion();
                return;
            }
        } else {
            const i = destino.indice ?? 0;
            for (const a of iconos.length ? iconos : archivos) {
                let fila = ieFilaPorNombre(imp, a);
                if (fila < 0 || imp.pendientes.length === 1 || iconos.length <= 2) fila = i;
                try { await ieAsignarArchivoIcono(imp, fila, a); }
                catch (e) { if (imp.pendientes[fila]) imp.pendientes[fila].error = `${a.name}: ${e.message}`; }
            }
        }
    } catch (err) {
        if (ieUI.importacion !== imp) return;
        imp.error = err && err.message ? err.message : "No se pudo leer el archivo.";
        ieRefrescarVentana();
        ieToast(imp.error);
        return;
    }
    if (ieUI.importacion === imp) ieRefrescarVentana();
}

async function ieFinalizarImportacion() {
    if (!ieUI.importacion || !ieUI.importacion.pendientes.length) return;
    const yaOcupado = ieUI.ocupado;
    ieUI.ocupado = true;
    document.getElementById("ie-import-panel")?.classList.add("ocupado");
    try { await ieFinalizar(); }
    finally {
        if (!yaOcupado) { ieUI.ocupado = false; document.getElementById("ie-import-panel")?.classList.remove("ocupado"); }
    }
}

async function ieFinalizar() {
    const imp = ieUI.importacion;
    if (!imp || !imp.pendientes.length) return;
    const guardados = [];
    for (const p of imp.pendientes) {
        const info = p.info;
        const anterior = eventosImportadosGCD[info.id];
        let def;
        if (imp.soloIcono) {
            def = anterior;
            if (!def) continue;
            def.png = p.omitir ? null : (p.png || null);
            def.xml = p.omitir || !p.png ? null : (p.xml || null);
            def.iconoOmitido = !!p.omitir;
        } else {
            def = iePrepararDef({
                id: info.id, titulo: info.titulo, clase: info.clase, campos: info.campos, avisos: info.avisos,
                processOldEvents: info.processOldEvents, icono: info.icono,
                claveValorAntiguo: info.claveValorAntiguo || null, lecturasScript: info.lecturasScript || [],
                hxc: { nombre: p.hxc.nombre, texto: p.hxc.texto },
                png: p.omitir ? null : (p.png || null),
                xml: p.omitir || !p.png ? null : (p.xml || null),
                iconoOmitido: !!p.omitir || (!p.png && info.icono.declarado),
                importado: Date.now()
            });
            if (anterior) ieLiberarIcono(anterior);
        }
        try { await ieConstruirIcono(def); } catch (e) { console.warn("[Importar eventos] ícono", e); ieToast(`No se pudo armar el ícono de ${def.titulo}: ${e.message}`); }
        def._gcd = null;
        eventosImportadosGCD[def.id] = def;
        guardados.push(def);
        if (p._previewDef) ieLiberarIcono(p._previewDef);
    }
    ieUI.importacion = null;
    ieActualizarEstilos();
    ieActualizarEstilosPreview();
    guardados.forEach((d) => ieRepintarCeldas(d.id));
    // El primero queda como tipo para las casillas vacías (si no hay evento seleccionado).
    if (!imp.soloIcono && guardados.length && (typeof eventoSeleccionado === "undefined" || eventoSeleccionado === null)) tipoEventoNuevoGCD = "ext:" + guardados[0].id;
    if (typeof actualizarVentanaEvento === "function") actualizarVentanaEvento(); else ieRefrescarVentana();
    ieToast(imp.soloIcono ? `Ícono actualizado: ${guardados[0] ? guardados[0].titulo : ""}` : `Importado${guardados.length === 1 ? "" : "s"}: ${guardados.map((d) => d.titulo).join(", ")}`);
    let fallo = false;
    for (const d of guardados) { try { await ieGuardarDef(d); } catch (e) { fallo = true; console.warn("[Importar eventos] guardar", e); } }
    if (fallo) ieToast("Importado, pero no se pudo guardar en este navegador (se perderá al recargar).");
}

function ieUsarEvento(id) {
    if (!eventosImportadosGCD[id]) return;
    const clave = "ext:" + id;
    if (typeof eventoSeleccionado !== "undefined" && eventoSeleccionado !== null && typeof deseleccionarEventoActual === "function") deseleccionarEventoActual();
    tipoEventoNuevoGCD = tipoEventoNuevoGCD === clave ? "Focus Camera" : clave;
    if (typeof actualizarVentanaEvento === "function") actualizarVentanaEvento();
    ieToast(tipoEventoNuevoGCD === clave ? `Las casillas vacías de Events crean un ${eventosImportadosGCD[id].titulo}` : "Las casillas vacías vuelven a crear Focus Camera");
}

async function ieEliminarEvento(id) {
    const def = eventosImportadosGCD[id];
    if (!def) return;
    const n = ieEventosEnChart()[id] || 0;
    if (!window.confirm(`¿Eliminar el evento importado "${def.titulo}"?${n ? `\n\nEl chart tiene ${n}: se quedan como "no importado" y sus datos se conservan.` : ""}`)) return;
    ieLiberarIcono(def);
    delete eventosImportadosGCD[id];
    if (typeof tipoEventoNuevoGCD !== "undefined" && tipoEventoNuevoGCD === "ext:" + id) tipoEventoNuevoGCD = "Focus Camera";
    ieActualizarEstilos();
    ieRepintarCeldas(id);
    if (typeof actualizarVentanaEvento === "function") actualizarVentanaEvento(); else ieRefrescarVentana();
    ieToast(`Eliminado: ${def.titulo}`);
    try { await ieBorrarDefDB(id); } catch (e) { console.warn("[Importar eventos] borrar", e); }
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("ie-file");
    if (input) input.addEventListener("change", () => {
        const archivos = Array.from(input.files || []);
        input.value = "";
        procesarArchivosEventos(archivos);
    });
    document.addEventListener("visibilitychange", () => document.body.classList.toggle("ie-oculto", document.hidden));
    cargarEventosImportados();
});

// ---------------------------------------------------------------------
// V0.8.2k: aviso de eventos no reconocidos tras importar un chart
// ---------------------------------------------------------------------
// Cuenta los eventos externos sin .hxc importado (en Default y en las variaciones).
function ieEventosNoReconocidos() {
    const conteo = {};
    const revisar = (events) => {
        if (!events || typeof events !== "object") return;
        Object.values(events).forEach((e) => {
            if (e && e.type === IE_TIPO_EXTERNO && e.e && !ieExisteEvento(e.e)) conteo[e.e] = (conteo[e.e] || 0) + 1;
        });
    };
    if (typeof currentChartData !== "undefined" && currentChartData) {
        revisar(currentChartData.events);
        const vars = currentChartData.variaciones && typeof currentChartData.variaciones === "object" ? currentChartData.variaciones : {};
        Object.keys(vars).forEach((id) => revisar(vars[id] && vars[id].events));
    }
    return conteo;
}

function cerrarAvisoEventosNoReconocidos() {
    const el = document.getElementById("ie-unknown-overlay");
    if (el) el.remove();
}

function ieImportarDesdeAviso(id) {
    cerrarAvisoEventosNoReconocidos();
    iniciarImportacionEventos(typeof id === "string" ? id : undefined);
}

// Muestra la lista y devuelve cuántos tipos distintos faltan.
function avisarEventosNoReconocidosGCD() {
    const conteo = ieEventosNoReconocidos();
    const ids = Object.keys(conteo).sort();
    cerrarAvisoEventosNoReconocidos();
    if (!ids.length) return 0;
    const total = ids.reduce((a, id) => a + conteo[id], 0);
    const ov = document.createElement("div");
    ov.id = "ie-unknown-overlay";
    ov.className = "ie-unknown-overlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-labelledby", "ie-unknown-title");
    ov.innerHTML = `<div class="ie-unknown-box">
        <div class="ie-unknown-head"><i class="fa-solid fa-circle-question"></i><strong id="ie-unknown-title">Eventos no reconocidos</strong>
            <button type="button" class="ie-unknown-close" onclick="cerrarAvisoEventosNoReconocidos()" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>
        <p class="ie-unknown-desc">Este chart trae ${total} evento${total === 1 ? "" : "s"} de ${ids.length} tipo${ids.length === 1 ? "" : "s"} que GCD no conoce. Se conservan tal cual (salen con <b>?</b>). Importa su <code>.hxc</code> para ver y editar su Event Data.</p>
        <div class="ie-unknown-list">${ids.map((id) => `<div class="ie-unknown-item" data-ie-unknown="${ieEscapar(id)}">
            <span class="ie-q">?</span><div class="ie-item-main"><strong>${ieEscapar(id)}</strong><span>${conteo[id]} en el chart</span></div>
            <button type="button" class="ie-btn small" onclick="ieImportarDesdeAviso(${ieEscapar(JSON.stringify(id))})"><i class="fa-solid fa-file-import"></i> Importar .hxc</button></div>`).join("")}</div>
        <div class="ie-unknown-mod"><i class="fa-solid fa-circle-info"></i> Recuerda: para que funcionen al jugar, estos eventos (su <code>.hxc</code> y lo que use) tienen que estar en tu mod.</div>
        <div class="ie-actions"><button type="button" class="ie-btn primary" onclick="ieImportarDesdeAviso()"><i class="fa-solid fa-folder-open"></i> Importar eventos (.hxc)</button>
        <button type="button" class="ie-btn ghost" onclick="cerrarAvisoEventosNoReconocidos()">Más tarde</button></div></div>`;
    ov.addEventListener("click", (e) => { if (e.target === ov) cerrarAvisoEventosNoReconocidos(); });
    document.body.appendChild(ov);
    return ids.length;
}
