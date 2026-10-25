// =====================================================================
// V0.8.2n — Ajustes finales de la "Event Update"
//   · Pestaña AUDIO: muestra / oculta el panel izquierdo.
//   · Panel derecho: X para ocultarlo y pestaña con flecha para volver a mostrarlo.
//   · Menú VISTA (con "FNF GCD (Próximamente)").
//   · Metadata por variación / rating por dificultad (refresco automático).
//   · Visualizar personajes → Ajustes (Guardar personaje, Cumplir animación,
//     Mantener animación seleccionada).
// =====================================================================

// ---------------------------------------------------------------------
// Paneles
// ---------------------------------------------------------------------
const PANELES_GCD_LS = "fnf_gcd_paneles";

function guardarEstadoPanelesGCD() {
    try {
        localStorage.setItem(PANELES_GCD_LS, JSON.stringify({
            izq: document.body.classList.contains("gcd-left-hidden"),
            der: document.body.classList.contains("gcd-right-hidden")
        }));
    } catch (e) { }
}

function refrescarTrasCambioPanelGCD() {
    // La grilla / waveforms se recalculan con el nuevo ancho.
    requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
        if (typeof actualizarWaveforms === "function") {
            try { actualizarWaveforms(null, true); } catch (e) { }
        }
    });
}

function alternarPanelAudioGCD(mostrar) {
    const oculto = document.body.classList.contains("gcd-left-hidden");
    const verlo = typeof mostrar === "boolean" ? mostrar : oculto;
    document.body.classList.toggle("gcd-left-hidden", !verlo);
    const tab = document.getElementById("audio-tab-btn");
    if (tab) {
        tab.classList.toggle("active-tab", verlo);
        tab.setAttribute("aria-pressed", verlo ? "true" : "false");
    }
    guardarEstadoPanelesGCD();
    refrescarTrasCambioPanelGCD();
}

function alternarPanelDerechoGCD(mostrar) {
    const oculto = document.body.classList.contains("gcd-right-hidden");
    const verlo = typeof mostrar === "boolean" ? mostrar : oculto;
    document.body.classList.toggle("gcd-right-hidden", !verlo);
    guardarEstadoPanelesGCD();
    refrescarTrasCambioPanelGCD();
}

// ---------------------------------------------------------------------
// Menú VISTA
// ---------------------------------------------------------------------
function toggleMenuVista(event) {
    if (event) event.stopPropagation();
    ["menu-archivos-wrapper", "menu-windows-wrapper", "menu-editor-wrapper", "menu-extras-wrapper"].forEach((id) => document.getElementById(id)?.classList.remove("open"));
    document.getElementById("menu-vista-wrapper")?.classList.toggle("open");
}

window.addEventListener("click", (e) => {
    const vista = document.getElementById("menu-vista-wrapper");
    if (vista && !vista.contains(e.target)) vista.classList.remove("open");
}, true); // captura: también cierra al abrir otro menú (sus botones detienen la propagación)

// ---------------------------------------------------------------------
// Metadata: cada cambio de dificultad / variación refresca la ventana
// ---------------------------------------------------------------------
(function engancharIndicadorDificultad() {
    if (typeof actualizarIndicadorDificultad !== "function") return;
    const original = actualizarIndicadorDificultad;
    actualizarIndicadorDificultad = function () {
        const r = original.apply(this, arguments);
        try { if (typeof actualizarMetadataEnInterfaz === "function") actualizarMetadataEnInterfaz(); } catch (e) { }
        return r;
    };
})();

// ---------------------------------------------------------------------
// Visualizar personajes → Ajustes
// ---------------------------------------------------------------------
const AJUSTES_PJ_LS = "fnf_gcd_personajes_ajustes";
const PERSONAJES_GUARDADOS_LS = "fnf_gcd_personajes_guardados";

function leerAjustesPersonajes() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(AJUSTES_PJ_LS) || "{}") || {}; } catch (e) { d = {}; }
    ["opponent", "player"].forEach((l) => {
        d[l] = Object.assign({ cumplirAnimacion: false, mantenerAnimacion: false }, d[l] || {});
    });
    return d;
}
let ajustesPersonajesGCD = leerAjustesPersonajes();

function guardarAjustesPersonajes() {
    try { localStorage.setItem(AJUSTES_PJ_LS, JSON.stringify(ajustesPersonajesGCD)); } catch (e) { }
}

// V0.8.2n-2: personajes guardados en IndexedDB, CON sus imágenes (png + xml / atlas).
const PERSONAJES_DB = "fnf_gcd_personajes";
const PERSONAJES_STORE = "personajes";

function abrirDBPersonajesGCD() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error("Este navegador no tiene IndexedDB.")); return; }
        const req = indexedDB.open(PERSONAJES_DB, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(PERSONAJES_STORE)) db.createObjectStore(PERSONAJES_STORE, { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function opDBPersonajesGCD(modo, fn) {
    const db = await abrirDBPersonajesGCD();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(PERSONAJES_STORE, modo);
            const req = fn(tx.objectStore(PERSONAJES_STORE));
            let res;
            if (req) req.onsuccess = () => { res = req.result; };
            tx.oncomplete = () => resolve(res);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error("Guardado cancelado (¿sin espacio?)."));
        });
    } finally { db.close(); }
}

function idArchivoPersonaje(nombre) {
    return String(nombre || "character").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "character";
}

async function guardarPersonajeLocalGCD(lado) {
    const e = personajesGCD[lado];
    if (!e || !e.personaje) { avisoPersonaje("Primero importa un personaje."); return; }
    const p = e.personaje;
    if (!p.desc || !Array.isArray(p.guardables) || !p.guardables.length || p.guardables.some((f) => f.tipo === "atlas" && !f.modelo)) {
        avisoPersonaje("Este personaje no se puede guardar: vuelve a importarlo.");
        return;
    }
    const nombre = document.getElementById(`char-save-name-${lado}`)?.value.trim() || p.nombre || "Personaje";
    const reg = { id: idArchivoPersonaje(nombre), nombre, formato: p.formato || "", fecha: Date.now(), desc: p.desc, fuentes: p.guardables };
    try {
        await opDBPersonajesGCD("readwrite", (st) => st.put(reg));
    } catch (err) {
        console.warn(err);
        avisoPersonaje("No se pudo guardar el personaje en el navegador (¿sin espacio?).");
        return;
    }
    p.nombre = nombre;
    avisoPersonaje(`${NOMBRE_LADO[lado]}: "${nombre}" guardado en este navegador (con imágenes)`);
    pintarPersonajesGuardados();
}

// Carga un personaje guardado en el lado indicado (sirve para Player u Opponent).
async function cargarPersonajeGuardadoGCD(id, lado) {
    let reg;
    try { reg = await opDBPersonajesGCD("readonly", (st) => st.get(id)); } catch (e) { reg = null; }
    if (!reg) { avisoPersonaje("No se encontró ese personaje guardado."); pintarPersonajesGuardados(); return; }
    const urls = [];
    try {
        const recursos = {};
        for (const f of reg.fuentes) {
            if (f.tipo === "sparrow") {
                const imagen = await cargarImagenPersonaje(f.png);
                urls.push(imagen.url);
                recursos[f.clave] = { tipo: "sparrow", atlas: f.atlas, img: imagen.img };
            } else {
                const modelo = structuredClone(f.modelo);
                modelo.sprites = new Map();
                for (const s of f.spritemaps) {
                    const imagen = await cargarImagenPersonaje(s.png);
                    urls.push(imagen.url);
                    atlasAgregarSpritemap(modelo, s.sm, imagen.img);
                }
                recursos[f.clave] = { tipo: "atlas", modelo };
            }
        }
        const personaje = construirPersonaje(reg.desc, recursos);
        if (personaje.animaciones.size === 0) throw new Error("No se pudo armar ninguna animación.");
        personaje.desc = reg.desc;
        personaje.guardables = reg.fuentes;
        personaje.nombre = reg.nombre;
        personaje.urls = urls;
        personaje.url = urls[0] || null;
        const estado = personajesGCD[lado];
        estado.importacion = null;
        asignarPersonaje(lado, personaje);
        actualizarPasosImportacionUI(lado);
        const campo = document.getElementById(`char-save-name-${lado}`);
        if (campo) campo.value = reg.nombre;
        cerrarAjustesPersonajeGCD(lado);
        avisoPersonaje(`${NOMBRE_LADO[lado]}: "${reg.nombre}" cargado (${personaje.animaciones.size} animaciones)`);
    } catch (err) {
        urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { } });
        avisoPersonaje(err && err.message ? err.message : "No se pudo cargar el personaje.");
    }
}

async function borrarPersonajeGuardadoGCD(id) {
    try { await opDBPersonajesGCD("readwrite", (st) => st.delete(id)); } catch (e) { }
    pintarPersonajesGuardados();
}

async function pintarPersonajesGuardados() {
    let lista = [];
    try { lista = (await opDBPersonajesGCD("readonly", (st) => st.getAll())) || []; } catch (e) { lista = []; }
    lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    ["opponent", "player"].forEach((lado) => {
        const cont = document.getElementById(`char-saved-list-${lado}`);
        if (!cont) return;
        if (!lista.length) { cont.innerHTML = '<span class="char-settings-hint">Todavía no hay personajes guardados.</span>'; return; }
        cont.innerHTML = lista.map((p) => {
            const id = escaparHTMLPersonaje(p.id), nom = escaparHTMLPersonaje(p.nombre);
            return `<div class="char-saved-item"><button type="button" class="char-saved-load" title="Cargar «${nom}» en ${escaparHTMLPersonaje(NOMBRE_LADO[lado])}" onclick="cargarPersonajeGuardadoGCD('${id}', '${lado}')">${nom}</button>` +
                `<button type="button" class="char-settings-btn-mini" title="Borrar" onclick="borrarPersonajeGuardadoGCD('${id}')"><i class="fa-solid fa-trash"></i></button></div>`;
        }).join("");
    });
}

function abrirAjustesPersonajeGCD(lado) {
    const panel = document.getElementById(`char-settings-${lado}`);
    if (!panel) return;
    const e = personajesGCD[lado];
    const nombre = document.getElementById(`char-save-name-${lado}`);
    if (nombre && e && e.personaje && !nombre.value) nombre.value = e.personaje.nombre || "";
    panel.querySelectorAll(".char-requiere-pj").forEach((b) => { b.disabled = !(e && e.personaje); });
    const aj = ajustesPersonajesGCD[lado];
    const c1 = document.getElementById(`char-opt-cumplir-${lado}`);
    const c2 = document.getElementById(`char-opt-mantener-${lado}`);
    if (c1) c1.checked = !!aj.cumplirAnimacion;
    if (c2) c2.checked = !!aj.mantenerAnimacion;
    pintarPersonajesGuardados();
    panel.hidden = false;
    document.getElementById(`char-window-${lado}`)?.classList.add("settings-open");
}

function cerrarAjustesPersonajeGCD(lado) {
    const panel = document.getElementById(`char-settings-${lado}`);
    if (panel) panel.hidden = true;
    document.getElementById(`char-window-${lado}`)?.classList.remove("settings-open");
}

function cambiarAjustePersonajeGCD(lado, clave, valor) {
    ajustesPersonajesGCD[lado][clave] = !!valor;
    guardarAjustesPersonajes();
    const e = personajesGCD[lado];
    if (clave === "mantenerAnimacion" && !valor && e) {
        e.mantenerAnim = null;
        e.previewHasta = 0;
        if (e.personaje) bailarPersonaje(e, true);
    }
}

function construirAjustesPersonaje(lado) {
    const cuerpo = document.getElementById(`char-body-${lado}`);
    const toolbar = document.querySelector(`#char-window-${lado} .char-preview-toolbar`);
    if (!cuerpo || !toolbar || document.getElementById(`char-settings-${lado}`)) return;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "char-tool-btn char-settings-open";
    boton.id = `char-settings-btn-${lado}`;
    boton.title = "Ajustes del visualizador";
    boton.setAttribute("aria-label", "Ajustes");
    boton.innerHTML = '<i class="fa-solid fa-gear"></i>';
    boton.onclick = () => abrirAjustesPersonajeGCD(lado);
    const importar = toolbar.querySelector(".char-import-btn");
    if (importar && importar.nextSibling) toolbar.insertBefore(boton, importar.nextSibling); else toolbar.appendChild(boton);

    const panel = document.createElement("div");
    panel.className = "char-settings";
    panel.id = `char-settings-${lado}`;
    panel.hidden = true;
    panel.innerHTML = `
        <div class="char-settings-head">
            <button type="button" class="char-settings-back" onclick="cerrarAjustesPersonajeGCD('${lado}')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
            <span>Ajustes · ${NOMBRE_LADO[lado]}</span>
        </div>
        <div class="char-settings-sec">
            <h4>GUARDAR PERSONAJE</h4>
            <div class="char-settings-row">
                <input type="text" id="char-save-name-${lado}" placeholder="Nombre del personaje" maxlength="60">
            </div>
            <div class="char-settings-row">
                <button type="button" class="char-settings-btn char-requiere-pj" onclick="guardarPersonajeLocalGCD('${lado}')"><i class="fa-solid fa-floppy-disk"></i> Guardar en el navegador</button>
            </div>
            <span class="char-settings-hint">Se guarda el personaje completo (datos + imágenes). Toca un nombre para cargarlo aquí.</span>
            <div class="char-saved-list" id="char-saved-list-${lado}"></div>
        </div>
        <div class="char-settings-sec">
            <h4>ANIMACIONES</h4>
            <label class="char-settings-toggle"><input type="checkbox" id="char-opt-cumplir-${lado}" onchange="cambiarAjustePersonajeGCD('${lado}', 'cumplirAnimacion', this.checked)">
                <span><b>Cumplir animación</b><br><span class="char-settings-hint">Al reproducir, los eventos «Play Animation» del chart hacen que el personaje haga esa animación.</span></span></label>
            <label class="char-settings-toggle"><input type="checkbox" id="char-opt-mantener-${lado}" onchange="cambiarAjustePersonajeGCD('${lado}', 'mantenerAnimacion', this.checked)">
                <span><b>Mantener animación seleccionada</b><br><span class="char-settings-hint">La animación elegida en «Probar animación…» se repite hasta elegir otra (o desactivar esto).</span></span></label>
        </div>`;
    cuerpo.appendChild(panel);
}

// --- Mantener animación seleccionada ---
(function engancharMantenerAnimacion() {
    if (typeof probarAnimacionPersonaje !== "function") return;
    const probarOriginal = probarAnimacionPersonaje;
    probarAnimacionPersonaje = function (lado, nombre) {
        const r = probarOriginal.apply(this, arguments);
        const e = personajesGCD[lado];
        if (e && e.personaje && nombre && ajustesPersonajesGCD[lado].mantenerAnimacion && e.anim) {
            e.mantenerAnim = e.anim;
            e.previewHasta = Number.MAX_SAFE_INTEGER;
        }
        return r;
    };
    const bailarOriginal = bailarPersonaje;
    bailarPersonaje = function (estado, forzar) {
        if (estado && estado.mantenerAnim && estado.personaje) {
            reproducirAnimPersonaje(estado, estado.mantenerAnim, true);
            estado.previewHasta = Number.MAX_SAFE_INTEGER;
            return;
        }
        return bailarOriginal.apply(this, arguments);
    };
    const cantarOriginal = cantarPersonaje;
    cantarPersonaje = function (lado) {
        const e = personajesGCD[lado];
        if (e && e.mantenerAnim) return false;
        return cantarOriginal.apply(this, arguments);
    };
    const dibujarOriginal = dibujarPersonaje;
    dibujarPersonaje = function (lado) {
        const e = personajesGCD[lado];
        if (e && e.mantenerAnim && e.personaje) {
            e.previewHasta = Number.MAX_SAFE_INTEGER;
            if (animacionTerminada(e)) reproducirAnimPersonaje(e, e.mantenerAnim, true);
        }
        return dibujarOriginal.apply(this, arguments);
    };
    const quitarOriginal = quitarPersonaje;
    quitarPersonaje = function (lado) {
        const r = quitarOriginal.apply(this, arguments);
        if (personajesGCD[lado]) personajesGCD[lado].mantenerAnim = null;
        return r;
    };
})();

// --- Cumplir animación (eventos Play Animation del chart) ---
function ladoDeObjetivoAnimacion(target) {
    const t = String(target || "").trim().toLowerCase();
    if (!t) return null;
    if (["bf", "boyfriend", "player"].includes(t)) return "player";
    if (["dad", "opponent", "enemy"].includes(t)) return "opponent";
    const c = (typeof currentChartData !== "undefined" && currentChartData) || {};
    if (String(c.player || "").toLowerCase() === t) return "player";
    if (String(c.opponent || "").toLowerCase() === t) return "opponent";
    ["player", "opponent"].forEach(() => { });
    for (const lado of ["player", "opponent"]) {
        const p = personajesGCD[lado] && personajesGCD[lado].personaje;
        if (p && String(p.nombre || "").toLowerCase() === t) return lado;
    }
    return null;
}

function eventosPlayAnimationEnRango(desde, hasta) {
    const salida = [];
    if (typeof currentChartData === "undefined" || !currentChartData || !currentChartData.events) return salida;
    const duracionStep = 60 / bpmPersonajes() / 4;
    const eventos = currentChartData.events;
    for (const key in eventos) {
        const ev = eventos[key];
        if (!ev || typeof ev !== "object") continue;
        const esPA = ev.type === "Play Animation" || ev.e === "PlayAnimation" || ev.type === "PlayAnimation";
        if (!esPA) continue;
        const fila = parseInt(key, 10);
        if (!Number.isFinite(fila)) continue;
        const t = (fila + (Number(ev.off) || 0)) * duracionStep;
        if (t <= desde || t > hasta) continue;
        const v = ev.v || {};
        salida.push({ t, target: v.target, anim: v.anim, force: !!v.force });
    }
    return salida.sort((a, b) => a.t - b.t);
}

function cumplirAnimacionPersonaje(lado, anim, force) {
    const e = personajesGCD[lado];
    if (!e || !e.personaje || !anim || e.mantenerAnim) return false;
    if (!reproducirAnimPersonaje(e, String(anim), true)) return false;
    const a = animacionActual(e);
    const duracion = a ? (a.loop ? 2 : a.frames.length / a.fps) : 1;
    e.cantando = false;
    e.terminando = false;
    e.holdTimer = 0;
    e.previewHasta = performance.now() + Math.max(0.3, duracion) * 1000;
    e.animEvento = { anim: e.anim, force: !!force };
    return true;
}

(function engancharCumplirAnimacion() {
    if (typeof notificarNotasPersonajes !== "function") return;
    const original = notificarNotasPersonajes;
    notificarNotasPersonajes = function (desde, hasta) {
        const r = original.apply(this, arguments);
        try {
            if (!visualizarPersonajesActivo || !hayPersonajesCargados() || !(hasta > desde)) return r;
            if (!ajustesPersonajesGCD.player.cumplirAnimacion && !ajustesPersonajesGCD.opponent.cumplirAnimacion) return r;
            eventosPlayAnimationEnRango(desde, hasta).forEach((ev) => {
                const lado = ladoDeObjetivoAnimacion(ev.target);
                if (lado && ajustesPersonajesGCD[lado].cumplirAnimacion) cumplirAnimacionPersonaje(lado, ev.anim, ev.force);
            });
        } catch (err) { console.warn("[Cumplir animación]", err); }
        return r;
    };
    // Una animación forzada por evento no la corta una nota (force = true, como en V-Slice).
    const cantarActual = cantarPersonaje;
    cantarPersonaje = function (lado) {
        const e = personajesGCD[lado];
        if (e && e.animEvento && e.animEvento.force && e.previewHasta > performance.now()) return false;
        if (e) e.animEvento = null;
        return cantarActual.apply(this, arguments);
    };
})();

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------
window.addEventListener("load", () => {
    ["opponent", "player"].forEach(construirAjustesPersonaje);
    try {
        const p = JSON.parse(localStorage.getItem(PANELES_GCD_LS) || "{}") || {};
        if (p.izq) alternarPanelAudioGCD(false);
        if (p.der) alternarPanelDerechoGCD(false);
    } catch (e) { }
});
