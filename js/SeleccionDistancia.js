// =====================================================================
// V0.8.2 Ronda 5 — EDITOR: seleccionar por lado + Seleccionador de distancia
//  - Seleccionar flechas de oponente / de player (dificultad y variación actuales).
//  - Seleccionador de distancia (rango):
//      PC: clic en una flecha (inicio) y Shift + clic en otra -> se seleccionan las del camino.
//      Táctil: toca una flecha de inicio, baja/sube y toca otra -> igual.
//    Mismo lado = solo los carriles de ese lado; lados distintos = ambos lados.
//    Con Multi-seleccionar: el rango se SUMA a la selección; si las dos puntas ya
//    estaban seleccionadas, el rango las QUITA. Sin Multi: el rango reemplaza la selección.
// =====================================================================

let modoSeleccionDistancia = false;
let sdInicio = null; // { key, estabaSel }

function sdEsTactil(e) {
    if (e && e.pointerType) return e.pointerType === "touch" || e.pointerType === "pen";
    try { return window.matchMedia("(pointer: coarse)").matches; } catch (x) { return false; }
}

function sdPartes(key) {
    return typeof partesClaveNotaGCD === "function" ? partesClaveNotaGCD(key) : partesClaveNota(key);
}

function sdTiempoNota(key) {
    const { f } = sdPartes(key);
    const n = currentChartData.notes[key];
    return f + (Number(n && n.off) || 0);
}

function sdMultiActivo() {
    return typeof modoMultiSeleccion !== "undefined" && modoMultiSeleccion;
}

// Aplica una lista de claves a la selección: reemplazar / sumar / quitar.
function sdAplicarSeleccion(claves, modo) {
    if (typeof deseleccionarEventoActual === "function") deseleccionarEventoActual();
    if (modo === "reemplazar") limpiarSeleccionNotas();
    if (modo === "quitar") claves.forEach((k) => notasSeleccionadas.delete(k));
    else claves.forEach((k) => { notasSeleccionadas.delete(k); notasSeleccionadas.add(k); });
    marcarSeleccionNotasGCD(claves);
    if (modo === "quitar") { if (notaSeleccionada && !notasSeleccionadas.has(notaSeleccionada.replace("cell-", ""))) notaSeleccionada = null; }
    else if (claves.length) notaSeleccionada = `cell-${claves[claves.length - 1]}`;
    actualizarNotaPrincipal();
    actualizarEstadoMenuEditor();
}

// ---------- por lado ----------
function seleccionarNotasLado(lado) {
    if (typeof currentChartData === "undefined" || !currentChartData || !currentChartData.notes) return 0;
    const player = lado === "player";
    const claves = Object.keys(currentChartData.notes).filter((k) => {
        const c = sdPartes(k).c;
        return player ? c >= 0 && c < 4 : c >= 4 && c < 8;
    }).sort((a, b) => sdTiempoNota(a) - sdTiempoNota(b));
    sdAplicarSeleccion(claves, "reemplazar");
    if (typeof mostrarToastGCD === "function") {
        mostrarToastGCD(claves.length ? `${claves.length} flechas de ${player ? "player" : "oponente"} seleccionadas` : `No hay flechas de ${player ? "player" : "oponente"}`);
    }
    return claves.length;
}

// ---------- rango ----------
function clavesEnRangoGCD(keyA, keyB) {
    const a = sdPartes(keyA), b = sdPartes(keyB);
    const ladoA = a.c < 4, ladoB = b.c < 4;
    const carriles = ladoA === ladoB ? (ladoA ? [0, 1, 2, 3] : [4, 5, 6, 7]) : [0, 1, 2, 3, 4, 5, 6, 7];
    const tA = sdTiempoNota(keyA), tB = sdTiempoNota(keyB);
    const t0 = Math.min(tA, tB) - 1e-6, t1 = Math.max(tA, tB) + 1e-6;
    return Object.keys(currentChartData.notes).filter((k) => {
        const p = sdPartes(k);
        if (!carriles.includes(p.c)) return false;
        const t = sdTiempoNota(k);
        return t >= t0 && t <= t1;
    }).sort((x, y) => sdTiempoNota(x) - sdTiempoNota(y));
}

function sdMarcarInicio(key) {
    document.querySelectorAll(".grid-cell.rango-inicio").forEach((el) => el.classList.remove("rango-inicio"));
    if (!key) return;
    const { f, c } = sdPartes(key);
    document.getElementById(`cell-${f}-${c}`)?.classList.add("rango-inicio");
}

function sdFijarInicio(key, estabaSel) {
    sdInicio = key ? { key, estabaSel: !!estabaSel } : null;
    sdMarcarInicio(key);
}

function seleccionarRangoGCD(keyA, keyB, finEstabaSel) {
    const claves = clavesEnRangoGCD(keyA, keyB);
    let modo = "reemplazar";
    if (sdMultiActivo()) modo = sdInicio && sdInicio.estabaSel && finEstabaSel ? "quitar" : "sumar";
    sdAplicarSeleccion(claves, modo);
    sdFijarInicio(null);
    if (typeof mostrarToastGCD === "function") {
        mostrarToastGCD(modo === "quitar" ? `${claves.length} flechas deseleccionadas` : `${claves.length} flechas seleccionadas (${notasSeleccionadas.size} en total)`);
    }
    return claves.length;
}

// Flecha que se ve encima en el punto tocado (misma lógica que manejarClickCelda).
function sdNotaTocada(e, f, c, cell) {
    const libre = typeof modoLibreActivo !== "undefined" && modoLibreActivo;
    if (libre && typeof notaEnPuntoLibreGCD === "function") {
        const y = posicionClickCeldaGCD(e, f, cell);
        if (y === null) return null;
        const hit = notaEnPuntoLibreGCD(c, y);
        return hit ? hit.grupo.top : null;
    }
    if (typeof clavesNotasCelda === "function") {
        const claves = clavesNotasCelda(f, c);
        if (!claves.length) return null;
        const principal = grupoPrincipalCelda(gruposVisualesNotas(claves));
        return principal ? principal.top : claves[claves.length - 1];
    }
    return currentChartData.notes[`${f}-${c}`] ? `${f}-${c}` : null;
}

const _manejarClickCeldaOriginalSD = manejarClickCelda;
manejarClickCelda = function (e, f, c, cell) {
    const moviendo = typeof modoMoverNotas !== "undefined" && modoMoverNotas;
    if (!modoSeleccionDistancia || moviendo || !currentChartData) return _manejarClickCeldaOriginalSD(e, f, c, cell);
    const key = sdNotaTocada(e, f, c, cell);
    if (!key) return _manejarClickCeldaOriginalSD(e, f, c, cell); // casilla vacía: coloca flecha como siempre
    e.stopPropagation();
    const estabaSel = notasSeleccionadas.has(key);
    const inicioValido = sdInicio && currentChartData.notes[sdInicio.key];
    if (e.shiftKey) {
        // PC: Shift + clic = final del rango.
        if (inicioValido && sdInicio.key !== key) { seleccionarRangoGCD(sdInicio.key, key, estabaSel); return; }
        sdFijarInicio(key, estabaSel);
        sdAplicarSeleccion([key], sdMultiActivo() ? "sumar" : "reemplazar");
        return;
    }
    if (sdEsTactil(e)) {
        // Táctil: 1er toque = inicio, 2do toque = final.
        if (inicioValido) {
            if (sdInicio.key === key) { sdFijarInicio(null); if (typeof mostrarToastGCD === "function") mostrarToastGCD("Inicio cancelado"); return; }
            seleccionarRangoGCD(sdInicio.key, key, estabaSel);
            return;
        }
        sdFijarInicio(key, estabaSel);
        if (sdMultiActivo()) alternarSeleccionNota(key);
        else seleccionarSoloNota(key);
        if (typeof mostrarToastGCD === "function") mostrarToastGCD("Inicio marcado: toca la flecha final");
        return;
    }
    // PC sin Shift: comportamiento normal y esta flecha queda como inicio.
    _manejarClickCeldaOriginalSD(e, f, c, cell);
    if (currentChartData.notes[key]) sdFijarInicio(key, estabaSel);
    else sdFijarInicio(null);
};

function alternarSeleccionDistancia(forzar) {
    modoSeleccionDistancia = typeof forzar === "boolean" ? forzar : !modoSeleccionDistancia;
    sdFijarInicio(null);
    document.body.classList.toggle("rango-select-on", modoSeleccionDistancia);
    actualizarEstadoMenuEditor();
    if (typeof mostrarToastGCD === "function") {
        mostrarToastGCD(modoSeleccionDistancia
            ? (sdEsTactil() ? "Seleccionador de distancia: toca la flecha de inicio y luego la final" : "Seleccionador de distancia: clic en el inicio y Shift + clic en el final")
            : "Seleccionador de distancia desactivado");
    }
}

// ---------- menú EDITOR ----------
const _accionMenuEditorOriginalSD = accionMenuEditor;
accionMenuEditor = function (accion) {
    const extra = {
        seleccionarOponente: () => seleccionarNotasLado("oponente"),
        seleccionarPlayer: () => seleccionarNotasLado("player"),
        rango: () => alternarSeleccionDistancia()
    };
    if (extra[accion]) { if (typeof cerrarMenuEditor === "function") cerrarMenuEditor(); extra[accion](); return; }
    return _accionMenuEditorOriginalSD(accion);
};

const _actualizarEstadoMenuEditorOriginalSD = actualizarEstadoMenuEditor;
actualizarEstadoMenuEditor = function () {
    _actualizarEstadoMenuEditorOriginalSD.apply(this, arguments);
    const menu = document.getElementById("menu-editor-wrapper");
    const item = menu?.querySelector('[data-accion="rango"]');
    if (item) item.classList.toggle("checked", modoSeleccionDistancia);
    const chip = document.getElementById("rango-select-indicator");
    if (chip) chip.hidden = !modoSeleccionDistancia;
};
