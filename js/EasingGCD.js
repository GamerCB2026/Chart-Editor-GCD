// =====================================================================
// V0.8.2m — Easing Type (Tipo de efecto) con la lista oficial de V-Slice
// y una lista desplegable con búsqueda ("Buscar...") como la del editor oficial.
//
// Valores que se escriben en el song-chart.json ("ease"): los mismos que el
// juego (FunkinCrew/Funkin, FocusCameraSongEvent / ZoomCameraSongEvent /
// ScrollSpeedEvent): 'linear', 'INSTANT', 'CLASSIC' (solo Focus Camera) y
// '<tipo><In|Out|InOut>' en camelCase: 'sineIn', 'backInOut', 'smootherStepOut'...
// En las versiones nuevas (0.8.x) el juego también acepta "ease" sin dirección
// + "easeDir" aparte ('sine' + 'InOut'); si "ease" ya trae la dirección, el
// juego ignora "easeDir" (SongEvent.EASE_TYPE_DIR_REGEX), así que los valores
// combinados funcionan en 0.7.x y en 0.8.x.
// =====================================================================

// Orden en que los muestra el editor oficial.
const EASES_VSLICE = [
    ["backIn", "Back In"], ["backInOut", "Back In/Out"], ["backOut", "Back Out"],
    ["bounceIn", "Bounce In"], ["bounceInOut", "Bounce In/Out"], ["bounceOut", "Bounce Out"],
    ["circIn", "Circ In"], ["circInOut", "Circ In/Out"], ["circOut", "Circ Out"],
    ["CLASSIC", "Classic (Ignores duration)"],
    ["cubeIn", "Cube In"], ["cubeInOut", "Cube In/Out"], ["cubeOut", "Cube Out"],
    ["elasticIn", "Elastic In"], ["elasticInOut", "Elastic In/Out"], ["elasticOut", "Elastic Out"],
    ["expoIn", "Expo In"], ["expoInOut", "Expo In/Out"], ["expoOut", "Expo Out"],
    ["INSTANT", "Instant (Ignores duration)"],
    ["linear", "Linear"],
    ["quadIn", "Quad In"], ["quadInOut", "Quad In/Out"], ["quadOut", "Quad Out"],
    ["quartIn", "Quart In"], ["quartInOut", "Quart In/Out"], ["quartOut", "Quart Out"],
    ["quintIn", "Quint In"], ["quintInOut", "Quint In/Out"], ["quintOut", "Quint Out"],
    ["sineIn", "Sine In"], ["sineInOut", "Sine In/Out"], ["sineOut", "Sine Out"],
    ["smoothStepIn", "Smooth Step In"], ["smoothStepInOut", "Smooth Step In/Out"], ["smoothStepOut", "Smooth Step Out"],
    ["smootherStepIn", "Smoother Step In"], ["smootherStepInOut", "Smoother Step In/Out"], ["smootherStepOut", "Smoother Step Out"]
];
// "Classic" solo existe en Focus Camera.
const EASE_SOLO_FOCUS_CAMERA = "CLASSIC";
const EASES_FOCUS_CAMERA_GCD = EASES_VSLICE.slice();
const EASES_GCD = EASES_VSLICE.filter(([v]) => v !== EASE_SOLO_FOCUS_CAMERA);
const EASE_BASES_VSLICE = ["sine", "quad", "cube", "quart", "quint", "expo", "smoothStep", "smootherStep", "elastic", "back", "bounce", "circ"];
const EASE_DIRECCIONES_VSLICE = ["In", "Out", "InOut"];

function easeTextoNormal(t) {
    return String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Dirección ('In' | 'Out' | 'InOut') de un ease combinado; null si no tiene.
function direccionEaseGCD(valor) {
    const m = /(InOut|In|Out)$/.exec(String(valor ?? ""));
    if (!m) return null;
    const base = String(valor).slice(0, -m[1].length);
    return EASE_BASES_VSLICE.includes(base) ? m[1] : null;
}

// Valor de la lista que corresponde a un ease guardado (solo para mostrarlo; el
// valor del chart no se toca hasta que se elija otro). Acepta el formato 0.8.x
// ('sine' + easeDir 'InOut' -> 'sineInOut'; sin easeDir el juego usa 'In') y
// mayúsculas distintas ('classic', 'SINEINOUT'). null si no está en la lista.
function easeCanonicoGCD(ease, easeDir, lista) {
    const opciones = lista || EASES_VSLICE;
    if (ease === undefined || ease === null || ease === "") return null;
    const s = String(ease);
    if (opciones.some(([v]) => v === s)) return s;
    const bajo = s.toLowerCase();
    const base = EASE_BASES_VSLICE.find((b) => b.toLowerCase() === bajo);
    if (base) {
        const dir = EASE_DIRECCIONES_VSLICE.find((d) => d.toLowerCase() === String(easeDir ?? "").toLowerCase()) || "In";
        const v = base + dir;
        return opciones.some(([x]) => x === v) ? v : null;
    }
    const igual = opciones.find(([v]) => v.toLowerCase() === bajo);
    return igual ? igual[0] : null;
}

function etiquetaEaseGCD(valor) {
    const o = EASES_VSLICE.find(([v]) => v === valor);
    return o ? o[1] : String(valor ?? "");
}

// Ease de otro engine (Codename: ease 'quad' + tipo 'InOut') a un valor de la lista.
function easeDesdeExternoGCD(ease, dir, conClassic) {
    const lista = conClassic ? EASES_FOCUS_CAMERA_GCD : EASES_GCD;
    const s = String(ease ?? "").trim();
    if (!s) return conClassic ? "CLASSIC" : "linear";
    if (s.toLowerCase() === "linear") return "linear";
    const combinado = easeCanonicoGCD(s.replace(/[\s_-]+(\w)/g, (_, c) => c.toUpperCase()), dir, lista);
    return combinado || s;
}

// Un enum de un .hxc importado "es" la lista estándar si todos sus valores están en ella
// (ej. 'sineIn', 'quadInOut', 'INSTANT'...). Si el .hxc usa el formato 0.8.x
// (ease 'sine' + campo easeDir aparte) se deja tal cual lo define.
function enumEsListaEaseEstandarGCD(opciones) {
    if (!Array.isArray(opciones) || !opciones.length) return false;
    const valores = new Set(EASES_VSLICE.map(([v]) => v));
    const conDireccion = opciones.some((o) => typeof o.value === "string" && direccionEaseGCD(o.value));
    return conDireccion && opciones.every((o) => typeof o.value === "string" && valores.has(o.value));
}

// Opciones estándar para un enum de .hxc (Classic solo si el .hxc lo trae).
function opcionesEaseEstandarParaHxcGCD(opciones) {
    const conClassic = opciones.some((o) => o.value === EASE_SOLO_FOCUS_CAMERA);
    return (conClassic ? EASES_FOCUS_CAMERA_GCD : EASES_GCD).map(([value, label]) => ({ value, label }));
}

// ---------------------------------------------------------------------
// Focus Camera (formulario propio de charter.js): "Tipo de efecto"
// ---------------------------------------------------------------------
function textoAyudaEaseFocusGCD(valor) {
    if (valor === "CLASSIC") return "Classic ignora la duración: la cámara sigue al personaje como en el juego clásico.";
    if (valor === "INSTANT") return "Instant ignora la duración: la cámara llega al instante.";
    return "La cámara se mueve con este efecto durante la duración (en steps).";
}

// Llena el <select> con la lista (más el valor importado si no está) y lo deja en el valor del evento.
function prepararSelectEaseFocusGCD(select, evento) {
    if (!select) return;
    const actual = evento ? (evento.effect || "CLASSIC") : "CLASSIC";
    const easeDir = evento && evento.extraV ? evento.extraV.easeDir : undefined;
    const mostrado = easeCanonicoGCD(actual, easeDir, EASES_FOCUS_CAMERA_GCD);
    const opciones = EASES_FOCUS_CAMERA_GCD.slice();
    if (!mostrado) opciones.push([actual, `${actual} (importado)`]);
    const firma = opciones.map(([v]) => v).join("|");
    if (select.dataset.easeFirma !== firma) {
        select.innerHTML = "";
        opciones.forEach(([v, t]) => {
            const op = document.createElement("option");
            op.value = v;
            op.textContent = t;
            select.appendChild(op);
        });
        select.dataset.easeFirma = firma;
    }
    select.value = mostrado || actual;
    const hint = document.getElementById("event-effect-hint");
    if (hint) hint.textContent = textoAyudaEaseFocusGCD(mostrado || actual);
}

// Aplica lo elegido en el <select> al evento Focus Camera. Si no cambió (sigue mostrando
// el mismo valor), el ease guardado se deja tal cual (p. ej. 'sine' + easeDir).
function aplicarEaseFocusDesdeSelectGCD(evento, select) {
    if (!evento || !select) return;
    const elegido = select.value || "CLASSIC";
    const easeDir = evento.extraV ? evento.extraV.easeDir : undefined;
    const mostrado = easeCanonicoGCD(evento.effect || "CLASSIC", easeDir, EASES_FOCUS_CAMERA_GCD) || (evento.effect || "CLASSIC");
    if (elegido !== mostrado) {
        evento.effect = elegido;
        const dir = direccionEaseGCD(elegido);
        if (evento.extraV && Object.prototype.hasOwnProperty.call(evento.extraV, "easeDir") && dir) evento.extraV.easeDir = dir;
    } else if (!evento.effect) evento.effect = "CLASSIC";
    const hint = document.getElementById("event-effect-hint");
    if (hint) hint.textContent = textoAyudaEaseFocusGCD(elegido);
}

// ---------------------------------------------------------------------
// Lista desplegable con búsqueda. Mejora un <select> nativo: el <select> se
// queda (sigue mostrando el valor y avisando con "change"), pero al abrirlo
// sale un panel con "Buscar..." y la lista filtrable.
// ---------------------------------------------------------------------
const ddBuscableGCD = { panel: null, select: null, filtradas: [], activo: -1 };

function hacerSelectBuscableGCD(select) {
    if (!select || select.dataset.buscable === "1") return select;
    select.dataset.buscable = "1";
    select.classList.add("gcd-select-buscable");
    const abrir = (e) => {
        if (select.disabled) return;
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (ddBuscableGCD.select === select && ddBuscableGCD.panel) { cerrarSelectBuscableGCD(); return; }
        abrirSelectBuscableGCD(select);
    };
    select.addEventListener("mousedown", (e) => { if (e.button === 0) abrir(e); });
    // En táctil solo se abre con un toque (no al terminar de deslizar la ventana).
    let toque = null;
    select.addEventListener("touchstart", (e) => { const t = e.touches[0]; toque = t ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
    select.addEventListener("touchend", (e) => {
        const t = e.changedTouches[0];
        const quieto = toque && t && Math.abs(t.clientX - toque.x) < 10 && Math.abs(t.clientY - toque.y) < 10;
        toque = null;
        if (quieto) abrir(e);
        else e.preventDefault();
    }, { passive: false });
    select.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "F4" || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"))) abrir(e);
    });
    return select;
}

function abrirSelectBuscableGCD(select) {
    cerrarSelectBuscableGCD();
    const panel = document.createElement("div");
    panel.className = "gcd-dd-panel";
    panel.setAttribute("role", "listbox");
    panel.innerHTML = `<div class="gcd-dd-search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" class="gcd-dd-input" placeholder="Buscar..." autocomplete="off" spellcheck="false" aria-label="Buscar"></div><div class="gcd-dd-list"></div>`;
    document.body.appendChild(panel);
    ddBuscableGCD.panel = panel;
    ddBuscableGCD.select = select;
    select.classList.add("gcd-dd-abierto");
    const input = panel.querySelector(".gcd-dd-input");
    input.addEventListener("input", () => filtrarSelectBuscableGCD(input.value));
    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = ddBuscableGCD.filtradas.length;
            if (!n) return;
            ddBuscableGCD.activo = (ddBuscableGCD.activo + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
            marcarActivoSelectBuscableGCD(true);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const o = ddBuscableGCD.filtradas[ddBuscableGCD.activo];
            if (o) elegirSelectBuscableGCD(o.value);
        } else if (e.key === "Escape" || e.key === "Tab") {
            if (e.key === "Escape") e.preventDefault();
            cerrarSelectBuscableGCD(true);
        }
    });
    panel.addEventListener("mousedown", (e) => { if (e.target !== input) e.preventDefault(); });
    filtrarSelectBuscableGCD("");
    posicionarSelectBuscableGCD();
    // En pantallas táctiles no se abre el teclado sola; en PC se escribe directo.
    const tactil = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (!tactil) input.focus({ preventScroll: true });
    // (el pointerdown que abrió la lista ya pasó, así que se puede escuchar desde ya)
    document.addEventListener("pointerdown", cerrarSelectBuscableFueraGCD, true);
    window.addEventListener("resize", posicionarSelectBuscableGCD);
    document.addEventListener("scroll", reposicionarOcerrarSelectBuscableGCD, true);
}

function filtrarSelectBuscableGCD(texto) {
    const { panel, select } = ddBuscableGCD;
    if (!panel || !select) return;
    const q = easeTextoNormal(texto);
    const lista = panel.querySelector(".gcd-dd-list");
    const todas = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }));
    ddBuscableGCD.filtradas = q ? todas.filter((o) => easeTextoNormal(o.label).includes(q) || easeTextoNormal(o.value).includes(q)) : todas;
    lista.innerHTML = "";
    if (!ddBuscableGCD.filtradas.length) {
        const vacio = document.createElement("div");
        vacio.className = "gcd-dd-empty";
        vacio.textContent = "Sin resultados";
        lista.appendChild(vacio);
    }
    ddBuscableGCD.filtradas.forEach((o, i) => {
        const item = document.createElement("div");
        item.className = "gcd-dd-item" + (o.value === select.value ? " selected" : "");
        item.setAttribute("role", "option");
        item.dataset.value = o.value;
        item.dataset.indice = String(i);
        item.innerHTML = `<span></span><i class="fa-solid fa-check"></i>`;
        item.firstChild.textContent = o.label;
        item.addEventListener("click", (e) => { e.stopPropagation(); elegirSelectBuscableGCD(o.value); });
        item.addEventListener("mousemove", () => { if (ddBuscableGCD.activo !== i) { ddBuscableGCD.activo = i; marcarActivoSelectBuscableGCD(false); } });
        lista.appendChild(item);
    });
    const sel = ddBuscableGCD.filtradas.findIndex((o) => o.value === select.value);
    ddBuscableGCD.activo = q ? 0 : sel;
    marcarActivoSelectBuscableGCD(true);
}

function marcarActivoSelectBuscableGCD(desplazar) {
    const { panel } = ddBuscableGCD;
    if (!panel) return;
    panel.querySelectorAll(".gcd-dd-item").forEach((el) => {
        const act = parseInt(el.dataset.indice, 10) === ddBuscableGCD.activo;
        el.classList.toggle("active", act);
        if (act && desplazar) el.scrollIntoView({ block: "nearest" });
    });
}

function posicionarSelectBuscableGCD() {
    const { panel, select } = ddBuscableGCD;
    if (!panel || !select) return;
    const r = select.getBoundingClientRect();
    const ancho = Math.max(r.width, 200);
    const vw = window.innerWidth, vh = window.innerHeight;
    const abajo = vh - r.bottom - 8, arriba = r.top - 8;
    const haciaAbajo = abajo >= 220 || abajo >= arriba;
    const alto = Math.min(320, haciaAbajo ? abajo - 4 : arriba - 4);
    panel.style.width = `${Math.min(ancho, vw - 16)}px`;
    panel.style.left = `${Math.max(8, Math.min(r.left, vw - Math.min(ancho, vw - 16) - 8))}px`;
    panel.style.maxHeight = `${Math.max(120, alto)}px`;
    if (haciaAbajo) {
        panel.style.top = `${r.bottom + 4}px`;
        panel.style.bottom = "";
        panel.classList.remove("arriba");
    } else {
        panel.style.top = "";
        panel.style.bottom = `${vh - r.top + 4}px`;
        panel.classList.add("arriba");
    }
}

function reposicionarOcerrarSelectBuscableGCD(e) {
    if (!ddBuscableGCD.panel) return;
    if (e && ddBuscableGCD.panel.contains(e.target)) return;
    const r = ddBuscableGCD.select.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || !ddBuscableGCD.select.isConnected) cerrarSelectBuscableGCD();
    else posicionarSelectBuscableGCD();
}

function cerrarSelectBuscableFueraGCD(e) {
    const { panel, select } = ddBuscableGCD;
    if (!panel) return;
    if (panel.contains(e.target) || e.target === select) return;
    cerrarSelectBuscableGCD();
}

function elegirSelectBuscableGCD(valor) {
    const select = ddBuscableGCD.select;
    cerrarSelectBuscableGCD(true);
    if (!select || select.disabled) return;
    if (select.value === String(valor)) return;
    select.value = String(valor);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
}

function cerrarSelectBuscableGCD(devolverFoco) {
    const { panel, select } = ddBuscableGCD;
    document.removeEventListener("pointerdown", cerrarSelectBuscableFueraGCD, true);
    window.removeEventListener("resize", posicionarSelectBuscableGCD);
    document.removeEventListener("scroll", reposicionarOcerrarSelectBuscableGCD, true);
    if (panel) panel.remove();
    if (select) {
        select.classList.remove("gcd-dd-abierto");
        if (devolverFoco === true && select.isConnected) select.focus({ preventScroll: true });
    }
    ddBuscableGCD.panel = null;
    ddBuscableGCD.select = null;
    ddBuscableGCD.filtradas = [];
    ddBuscableGCD.activo = -1;
}

// Focus Camera: el <select> fijo del index.
(function iniciarEaseFocusCameraGCD() {
    if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
    const select = document.getElementById("event-effect-select");
    if (!select) return;
    prepararSelectEaseFocusGCD(select, null);
    hacerSelectBuscableGCD(select);
})();
