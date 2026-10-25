// =====================================================================
// V0.8.2 "Event Update" — Menú EDITOR
// Selección (simple / múltiple / todas), copiar, cortar, pegar, quitar
// flechas seleccionadas y Atrasar / Adelantar (historial de cambios).
// Todo trabaja sobre currentChartData.notes (dificultad activa) y
// currentChartData.events (compartidos). Nunca mueve ni busca el audio.
// =====================================================================

const HISTORIAL_MAX = 200;
let notasSeleccionadas = new Set();   // claves "fila-carril"
let modoMultiSeleccion = false;
let portapapelesNotas = null;          // [{ df, c, nota }]
let _historialEditor = { chart: null, porDificultad: {} };
let _transaccionEditor = null;
let _autoguardadoTimer = null;

// ---------- utilidades ----------
function clonarDatoEditor(v) {
    return v == null ? null : JSON.parse(JSON.stringify(v));
}

function esCampoDeTexto(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return true;
    if (tag !== "input") return false;
    const tipo = (el.getAttribute("type") || "text").toLowerCase();
    return ["text", "number", "search", "email", "url", "password", "tel"].includes(tipo);
}

function mostrarToastGCD(mensaje) {
    let toast = document.getElementById("gcd-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "gcd-toast";
        toast.className = "gcd-toast";
        toast.setAttribute("role", "status");
        document.body.appendChild(toast);
    }
    toast.textContent = mensaje;
    toast.classList.add("visible");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("visible"), 1600);
}

function partesClaveNota(key) {
    const partes = String(key).split("-");
    return { f: parseInt(partes[0], 10), c: parseInt(partes[1], 10) };
}

// ---------- pintado puntual de celdas ----------
function repintarCeldaNota(key) {
    const { f, c } = partesClaveNota(key);
    if (Number.isNaN(f) || Number.isNaN(c)) return;
    // V0.8.2l: la casilla se pinta entera (puede tener varias flechas: pila / spam).
    if (typeof pintarCeldaNotasGCD === "function") pintarCeldaNotasGCD(f, c);
    const existe = !!(currentChartData && currentChartData.notes && currentChartData.notes[key]);
    if (!existe && notasSeleccionadas.delete(String(key))) actualizarNotaPrincipal();
}

function repintarCeldaEvento(fila) {
    // V0.8.2k: la casilla muestra todos sus eventos (pegados si hay varios).
    if (typeof pintarFilaEventosGCD === "function") { pintarFilaEventosGCD(fila); return; }
    const cell = document.getElementById(`event-cell-${parseInt(fila, 10)}`);
    if (!cell) return;
    cell.querySelector(".event-note-icon")?.remove();
    if (currentChartData && currentChartData.events && currentChartData.events[fila]) {
        const icon = document.createElement("img");
        icon.className = "event-note-icon";
        icon.src = "eventassets/FocusCamera.png";
        icon.alt = "Focus Camera";
        cell.appendChild(icon);
    } else {
        cell.classList.remove("event-selected");
    }
}

// ---------- selección ----------
function actualizarNotaPrincipal() {
    if (notaSeleccionada) {
        const actual = notaSeleccionada.replace("cell-", "");
        if (notasSeleccionadas.has(actual)) return;
    }
    let ultima = null;
    notasSeleccionadas.forEach((k) => { ultima = k; });
    notaSeleccionada = ultima ? `cell-${ultima}` : null;
}

function limpiarSeleccionNotas() {
    const antes = Array.from(notasSeleccionadas);
    if (notaSeleccionada) antes.push(notaSeleccionada.replace("cell-", ""));
    notasSeleccionadas.clear();
    notaSeleccionada = null;
    marcarSeleccionNotasGCD(antes);
    actualizarEstadoMenuEditor();
}

// V0.8.2l: resaltado por casilla / por flecha (pilas y flechas separadas).
function marcarSeleccionNotasGCD(claves) {
    if (typeof marcarSeleccionCeldasNotas === "function") { marcarSeleccionCeldasNotas(claves); return; }
    claves.forEach((key) => {
        const { f, c } = partesClaveNota(key);
        document.getElementById(`cell-${f}-${c}`)?.classList.toggle("selected-note", notasSeleccionadas.has(key));
    });
}

function agregarNotaASeleccion(key) {
    if (!currentChartData || !currentChartData.notes[key]) return;
    // V0.8.2l: la última que entra queda como "principal" (Modo Libre muestra su número).
    notasSeleccionadas.delete(key);
    notasSeleccionadas.add(key);
    notaSeleccionada = `cell-${key}`;
    marcarSeleccionNotasGCD([key]);
    actualizarEstadoMenuEditor();
}

function quitarNotaDeSeleccion(key) {
    notasSeleccionadas.delete(key);
    marcarSeleccionNotasGCD([key]);
    if (notaSeleccionada === `cell-${key}`) notaSeleccionada = null;
    actualizarNotaPrincipal();
    actualizarEstadoMenuEditor();
}

function alternarSeleccionNota(key) {
    if (notasSeleccionadas.has(key)) quitarNotaDeSeleccion(key);
    else agregarNotaASeleccion(key);
}

function seleccionarSoloNota(key) {
    limpiarSeleccionNotas();
    agregarNotaASeleccion(key);
}

function obtenerClavesSeleccionadas() {
    if (!currentChartData || !currentChartData.notes) return [];
    const claves = Array.from(notasSeleccionadas).filter((k) => currentChartData.notes[k]);
    if (!claves.length && notaSeleccionada) {
        const k = notaSeleccionada.replace("cell-", "");
        if (currentChartData.notes[k]) claves.push(k);
    }
    return claves;
}

function seleccionarTodasLasNotas() {
    if (!currentChartData || !currentChartData.notes) return;
    deseleccionarEventoActual();
    limpiarSeleccionNotas();
    const todas = Object.keys(currentChartData.notes);
    todas.forEach((key) => notasSeleccionadas.add(key));
    marcarSeleccionNotasGCD(todas);
    actualizarNotaPrincipal();
    actualizarEstadoMenuEditor();
    mostrarToastGCD(notasSeleccionadas.size ? `${notasSeleccionadas.size} flechas seleccionadas` : "No hay flechas en esta dificultad");
}

function deseleccionarTodasLasNotas() {
    limpiarSeleccionNotas();
}

function alternarMultiSeleccion(forzar) {
    modoMultiSeleccion = typeof forzar === "boolean" ? forzar : !modoMultiSeleccion;
    document.body.classList.toggle("multi-select-on", modoMultiSeleccion);
    actualizarEstadoMenuEditor();
    mostrarToastGCD(modoMultiSeleccion ? "Multi-selección activada" : "Multi-selección desactivada");
}

// ---------- historial (Atrasar / Adelantar) ----------
function obtenerPilaHistorial() {
    if (_historialEditor.chart !== currentChartData) {
        _historialEditor = { chart: currentChartData, porDificultad: {} };
    }
    const d = claveHistorialDificultad(typeof variacionActivaGCD === "function" ? variacionActivaGCD() : "default", dificultadActiva || "normal");
    if (!_historialEditor.porDificultad[d]) _historialEditor.porDificultad[d] = { undo: [], redo: [] };
    return _historialEditor.porDificultad[d];
}

// "normal" en Default (como antes) o "erect/hard" en una variación.
function claveHistorialDificultad(variacion, dificultad) {
    return !variacion || variacion === "default" ? dificultad : `${variacion}/${dificultad}`;
}

// V0.8.2j: Añadir / Quitar dificultad también se pueden atrasar y adelantar.
// La entrada queda en la pila de la dificultad que queda activa tras el cambio.
function registrarCambioDificultad(info) {
    const pila = obtenerPilaHistorial();
    const etiqueta = info.accion === "añadir" ? `Añadir dificultad «${info.dificultad}»` : `Quitar dificultad «${info.dificultad}»`;
    if (info.accion === "quitar") {
        const clave = claveHistorialDificultad(info.variacion, info.dificultad);
        info.pilaGuardada = _historialEditor.porDificultad[clave] || null;
        delete _historialEditor.porDificultad[clave];
    }
    pila.undo.push({ etiqueta, tipo: "dificultad", info, notas: [], eventos: [], ts: Date.now() });
    if (pila.undo.length > HISTORIAL_MAX) pila.undo.splice(0, pila.undo.length - HISTORIAL_MAX);
    pila.redo = [];
    actualizarEstadoMenuEditor();
}

// Deshace (lado "antes") o rehace (lado "despues") un cambio de dificultad.
async function aplicarCambioDificultad(entrada, lado) {
    const info = entrada.info;
    const quitarla = (info.accion === "añadir") === (lado === "antes");
    if (quitarla) {
        // Quitar la dificultad info.dificultad (está activa en este momento).
        if (typeof variacionActivaGCD === "function" && variacionActivaGCD() !== info.variacion) await seleccionarDificultadGCD(info.variacion, info.dificultad);
        if (dificultadActiva !== info.dificultad) cambiarDificultad(info.dificultad);
        guardarDificultadActiva();
        if (typeof guardarVelocidadDificultad === "function") guardarVelocidadDificultad();
        const claveQuitada = claveHistorialDificultad(info.variacion, info.dificultad);
        const pilaQuitada = _historialEditor.porDificultad[claveQuitada] || null;
        const indice = Object.keys(currentChartData.difficulties).indexOf(info.dificultad);
        info.guardada = {
            notas: clonarDatoEditor(currentChartData.difficulties[info.dificultad].notes || {}),
            velocidad: currentChartData.scrollSpeeds ? currentChartData.scrollSpeeds[info.dificultad] : undefined,
            indice
        };
        info.pilaGuardada = pilaQuitada;
        const destino = info.accion === "añadir" ? info.previa : { variacion: info.variacion, dificultad: info.siguiente };
        quitarDificultadActiva({ sinHistorial: true, silencioso: true });
        delete _historialEditor.porDificultad[claveQuitada];
        if (destino && destino.dificultad) await seleccionarDificultadGCD(destino.variacion, destino.dificultad);
    } else {
        // Volver a poner la dificultad con sus notas y su historial.
        const g = info.guardada || {};
        await añadirDificultadGCD(info.variacion, info.dificultad, { notas: g.notas, velocidad: g.velocidad, indice: g.indice, sinHistorial: true, silencioso: true });
        if (info.pilaGuardada) _historialEditor.porDificultad[claveHistorialDificultad(info.variacion, info.dificultad)] = info.pilaGuardada;
        info.pilaGuardada = null;
        if (info.accion === "quitar" && info.siguiente) {
            // Al rehacer un "quitar" se vuelve a la dificultad siguiente; al deshacerlo, a la restaurada.
        }
    }
    programarAutoguardado();
}

// Escribe/borra una nota registrando el cambio si hay una edición en curso.
function escribirNotaChart(key, valor) {
    if (!currentChartData) return;
    if (!currentChartData.notes) currentChartData.notes = {};
    const notes = currentChartData.notes;
    const t = _transaccionEditor;
    if (t && !t.notas.has(key)) t.notas.set(key, { antes: clonarDatoEditor(notes[key] || null) });
    if (valor) {
        notes[key] = clonarDatoEditor(valor);
        if (typeof registrarClavePilaNota === "function") registrarClavePilaNota(notes, key);
    } else delete notes[key];
    if (t) t.notas.get(key).despues = clonarDatoEditor(valor || null);
    repintarCeldaNota(key);
}

function escribirEventoChart(fila, valor) {
    if (!currentChartData) return;
    if (!currentChartData.events) {
        currentChartData.events = {};
        asegurarEventosCompartidos(currentChartData);
    }
    const events = currentChartData.events;
    const k = String(fila);
    const t = _transaccionEditor;
    if (t && !t.eventos.has(k)) t.eventos.set(k, { antes: clonarDatoEditor(events[k] || null) });
    if (valor) events[k] = clonarDatoEditor(valor);
    else {
        delete events[k];
        if (typeof eventosSeleccionados !== "undefined") eventosSeleccionados.delete(k);
        if (eventoSeleccionado !== null && String(eventoSeleccionado) === k) eventoSeleccionado = null;
    }
    if (t) t.eventos.get(k).despues = clonarDatoEditor(valor || null);
    repintarCeldaEvento(k);
}

function empujarEntradaHistorial(entrada) {
    const pila = obtenerPilaHistorial();
    pila.undo.push(entrada);
    if (pila.undo.length > HISTORIAL_MAX) pila.undo.splice(0, pila.undo.length - HISTORIAL_MAX);
    pila.redo = [];
    programarAutoguardado();
    actualizarEstadoMenuEditor();
}

// Ejecuta una edición como un solo paso del historial.
function ejecutarEdicionChart(etiqueta, fn, tipo) {
    if (!currentChartData) return;
    if (_transaccionEditor) { fn(); return; } // anidada: se une a la edición en curso
    _transaccionEditor = { etiqueta, tipo: tipo || null, notas: new Map(), eventos: new Map() };
    try {
        fn();
    } finally {
        const t = _transaccionEditor;
        _transaccionEditor = null;
        const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const notas = [];
        t.notas.forEach((v, key) => { if (!igual(v.antes, v.despues)) notas.push({ key, antes: v.antes, despues: v.despues }); });
        const eventos = [];
        t.eventos.forEach((v, fila) => { if (!igual(v.antes, v.despues)) eventos.push({ fila, antes: v.antes, despues: v.despues }); });
        if (notas.length || eventos.length) {
            const entrada = { etiqueta: t.etiqueta, notas, eventos, ts: Date.now() };
            if (t.tipo) entrada.tipo = t.tipo;
            empujarEntradaHistorial(entrada);
        }
    }
}

// Cambios de configuración de un evento (inputs de la ventana Events).
// Los cambios seguidos sobre el mismo evento se agrupan en un solo paso.
function registrarCambioConfigEvento(fila, antes, despues, accionSuelta) {
    if (!currentChartData || JSON.stringify(antes) === JSON.stringify(despues)) return;
    const pila = obtenerPilaHistorial();
    const ultima = pila.undo[pila.undo.length - 1];
    const k = String(fila);
    const ahora = Date.now();
    // Los cambios seguidos (teclear) se juntan; una acción suelta (p. ej. "Quitar") va sola.
    if (!accionSuelta && ultima && ultima.tipo === "config-evento" && ultima.eventos[0].fila === k && ahora - ultima.ts < 1500 && pila.redo.length === 0) {
        ultima.eventos[0].despues = clonarDatoEditor(despues);
        ultima.ts = ahora;
        programarAutoguardado();
        return;
    }
    empujarEntradaHistorial({
        etiqueta: "Configurar evento",
        tipo: "config-evento",
        notas: [],
        eventos: [{ fila: k, antes: clonarDatoEditor(antes), despues: clonarDatoEditor(despues) }],
        ts: accionSuelta ? 0 : ahora
    });
}

function aplicarEntradaHistorial(entrada, lado) {
    const notes = currentChartData.notes;
    limpiarSeleccionNotas();
    const celdas = new Set();
    entrada.notas.forEach((cambio) => {
        const valor = cambio[lado];
        if (valor) {
            notes[cambio.key] = clonarDatoEditor(valor);
            if (typeof registrarClavePilaNota === "function") registrarClavePilaNota(notes, cambio.key);
        } else delete notes[cambio.key];
        celdas.add(typeof baseClaveNota === "function" ? baseClaveNota(cambio.key) : cambio.key);
    });
    // V0.8.2l: se repinta cada casilla una sola vez (puede tener varias flechas).
    celdas.forEach((base) => repintarCeldaNota(base));
    let tocaEventoSeleccionado = false;
    const filasEventos = new Set();
    entrada.eventos.forEach((cambio) => {
        const valor = cambio[lado];
        if (valor) currentChartData.events[cambio.fila] = clonarDatoEditor(valor);
        else {
            delete currentChartData.events[cambio.fila];
            if (typeof eventosSeleccionados !== "undefined") eventosSeleccionados.delete(String(cambio.fila));
        }
        filasEventos.add(parseInt(cambio.fila, 10));
        if (eventoSeleccionado !== null && String(eventoSeleccionado) === String(cambio.fila)) tocaEventoSeleccionado = true;
    });
    filasEventos.forEach((f) => repintarCeldaEvento(f));
    if (tocaEventoSeleccionado) {
        if (currentChartData.events[eventoSeleccionado]) actualizarVentanaEvento();
        else deseleccionarEventoActual();
    }
    // V0.8.2k: tras Atrasar/Adelantar un "Mover", los eventos movidos quedan seleccionados.
    if (entrada.tipo === "mover") {
        const claves = entrada.eventos.filter((c) => c[lado]).map((c) => String(c.fila));
        if (claves.length && typeof seleccionarEvento === "function") {
            seleccionarEvento(claves[claves.length - 1]);
            claves.forEach((k) => { if (typeof alternarSeleccionEvento === "function" && !eventosSeleccionados.has(k)) alternarSeleccionEvento(k, true); });
        }
    }
    // Resalta las flechas que quedaron tras el cambio (si no son demasiadas).
    if (entrada.notas.length <= 400) {
        entrada.notas.forEach((cambio) => { if (notes[cambio.key]) agregarNotaASeleccion(cambio.key); });
    }
    programarAutoguardado();
    actualizarEstadoMenuEditor();
}

let _cambioDificultadEnCurso = false;

async function atrasarCambio() {
    if (!currentChartData || _cambioDificultadEnCurso) return;
    const pila = obtenerPilaHistorial();
    const entrada = pila.undo.pop();
    if (!entrada) { mostrarToastGCD("No hay más cambios para atrasar"); return; }
    if (entrada.tipo === "dificultad") {
        _cambioDificultadEnCurso = true;
        try {
            await aplicarCambioDificultad(entrada, "antes");
            obtenerPilaHistorial().redo.push(entrada); // pila de la dificultad que quedó activa
        } finally { _cambioDificultadEnCurso = false; }
    } else {
        aplicarEntradaHistorial(entrada, "antes");
        pila.redo.push(entrada);
    }
    actualizarEstadoMenuEditor();
    mostrarToastGCD(`Atrasar: ${entrada.etiqueta}`);
}

async function adelantarCambio() {
    if (!currentChartData || _cambioDificultadEnCurso) return;
    const pila = obtenerPilaHistorial();
    const entrada = pila.redo.pop();
    if (!entrada) { mostrarToastGCD("No hay cambios para adelantar"); return; }
    if (entrada.tipo === "dificultad") {
        _cambioDificultadEnCurso = true;
        try {
            await aplicarCambioDificultad(entrada, "despues");
            obtenerPilaHistorial().undo.push(entrada);
        } finally { _cambioDificultadEnCurso = false; }
    } else {
        aplicarEntradaHistorial(entrada, "despues");
        pila.undo.push(entrada);
    }
    actualizarEstadoMenuEditor();
    mostrarToastGCD(`Adelantar: ${entrada.etiqueta}`);
}

// Solo actualiza proyectos que ya están en el Archivador (igual que Metadata).
function programarAutoguardado() {
    clearTimeout(_autoguardadoTimer);
    _autoguardadoTimer = setTimeout(() => {
        if (typeof guardarProyectoActualLocalmente === "function") guardarProyectoActualLocalmente();
    }, 800);
}

// ---------- quitar / copiar / cortar / pegar ----------
function quitarNotasSeleccionadas() {
    const claves = obtenerClavesSeleccionadas();
    if (!claves.length) { mostrarToastGCD("No hay flechas seleccionadas"); return; }
    ejecutarEdicionChart(claves.length === 1 ? "Quitar flecha" : `Quitar ${claves.length} flechas`, () => {
        claves.forEach((key) => escribirNotaChart(key, null));
    });
    limpiarSeleccionNotas();
    mostrarToastGCD(`${claves.length} flecha${claves.length === 1 ? "" : "s"} eliminada${claves.length === 1 ? "" : "s"}`);
}

function copiarNotasSeleccionadas(silencioso) {
    const claves = obtenerClavesSeleccionadas();
    if (!claves.length) { if (!silencioso) mostrarToastGCD("No hay flechas seleccionadas"); return 0; }
    let filaMin = Infinity;
    claves.forEach((k) => { filaMin = Math.min(filaMin, partesClaveNota(k).f); });
    portapapelesNotas = claves.map((k) => {
        const { f, c } = partesClaveNota(k);
        return { df: f - filaMin, c, nota: clonarDatoEditor(currentChartData.notes[k]) };
    }).sort((a, b) => a.df - b.df || a.c - b.c);
    actualizarEstadoMenuEditor();
    if (!silencioso) mostrarToastGCD(`${claves.length} flecha${claves.length === 1 ? "" : "s"} copiada${claves.length === 1 ? "" : "s"}`);
    return claves.length;
}

function cortarNotasSeleccionadas() {
    const claves = obtenerClavesSeleccionadas();
    if (!claves.length) { mostrarToastGCD("No hay flechas seleccionadas"); return; }
    copiarNotasSeleccionadas(true);
    ejecutarEdicionChart(`Cortar ${claves.length} flecha${claves.length === 1 ? "" : "s"}`, () => {
        claves.forEach((key) => escribirNotaChart(key, null));
    });
    limpiarSeleccionNotas();
    mostrarToastGCD(`${claves.length} flecha${claves.length === 1 ? "" : "s"} cortada${claves.length === 1 ? "" : "s"}`);
}

// Fila de la grilla que está bajo la línea de reproducción (sin tocar el audio).
function filaActualLineaReproduccion() {
    const workspace = document.getElementById("scroll-workspace");
    if (!workspace || !currentChartData) return 0;
    const fila = Math.round(workspace.scrollTop / (globalZoomFactor * alturaCelda));
    const total = parseInt(currentChartData.totalRows, 10) || 0;
    return Math.max(0, Math.min(Math.max(0, total - 1), fila));
}

function pegarNotas() {
    if (!currentChartData) return;
    if (!portapapelesNotas || !portapapelesNotas.length) { mostrarToastGCD("El portapapeles está vacío"); return; }
    const base = filaActualLineaReproduccion();
    const total = parseInt(currentChartData.totalRows, 10) || 0;
    const pegadas = [];
    let fuera = 0;
    ejecutarEdicionChart(`Pegar ${portapapelesNotas.length} flecha${portapapelesNotas.length === 1 ? "" : "s"}`, () => {
        const usadas = new Set();
        portapapelesNotas.forEach((item) => {
            const fila = base + item.df;
            if (fila < 0 || fila >= total) { fuera++; return; }
            // V0.8.2l: la primera de cada casilla reemplaza (como antes); si el portapapeles
            // trae varias flechas en la misma casilla (pila), las demás se apilan (no se pierden).
            const celda = `${fila}-${item.c}`;
            const key = usadas.has(celda) && typeof claveLibreNota === "function" ? claveLibreNota(fila, item.c) : celda;
            usadas.add(celda);
            escribirNotaChart(key, item.nota || { len: 0 });
            pegadas.push(key);
        });
    });
    limpiarSeleccionNotas();
    pegadas.forEach((k) => agregarNotaASeleccion(k));
    let msg = `${pegadas.length} flecha${pegadas.length === 1 ? "" : "s"} pegada${pegadas.length === 1 ? "" : "s"}`;
    if (fuera) msg += ` (${fuera} fuera de la canción)`;
    mostrarToastGCD(msg);
}

// ---------- V0.8.2k: Mover Notas (Subir / Bajar) ----------
// Con "Mover Notas" activo, Recortar/Extender pasan a Subir/Bajar y mueven
// las flechas y los eventos seleccionados una casilla (un step) a la vez.
let modoMoverNotas = false;

function alternarModoMoverNotas(forzar) {
    modoMoverNotas = typeof forzar === "boolean" ? forzar : !modoMoverNotas;
    document.body.classList.toggle("mover-notas-on", modoMoverNotas);
    actualizarBotonesSustainModo();
    actualizarEstadoMenuEditor();
    mostrarToastGCD(modoMoverNotas ? "Mover Notas: usa Subir y Bajar con las flechas/eventos seleccionados" : "Mover Notas desactivado: vuelven Recortar y Extender");
}

function actualizarBotonesSustainModo() {
    const mover = modoMoverNotas;
    const titulo = document.getElementById("sustain-panel-title");
    if (titulo) titulo.textContent = mover ? "Mover Notas" : "Longitud del Sustain";
    document.querySelectorAll(".sustain-btn.btn-recortar").forEach((b) => {
        b.innerHTML = mover ? '<i class="fa-solid fa-arrow-up"></i> Subir' : '<i class="fa-solid fa-caret-up"></i> Recortar';
        b.title = mover ? "Subir lo seleccionado una casilla" : "Recortar sustain";
    });
    document.querySelectorAll(".sustain-btn.btn-extender").forEach((b) => {
        b.innerHTML = mover ? '<i class="fa-solid fa-arrow-down"></i> Bajar' : '<i class="fa-solid fa-caret-down"></i> Extender';
        b.title = mover ? "Bajar lo seleccionado una casilla" : "Extender sustain";
    });
    document.querySelectorAll(".mobile-sustain-btn.btn-recortar").forEach((b) => {
        const span = b.querySelector("span");
        if (span) span.textContent = mover ? "Subir" : "Recortar";
        b.setAttribute("aria-label", mover ? "Subir lo seleccionado" : "Recortar sustain");
    });
    document.querySelectorAll(".mobile-sustain-btn.btn-extender").forEach((b) => {
        const span = b.querySelector("span");
        if (span) span.textContent = mover ? "Bajar" : "Extender";
        b.setAttribute("aria-label", mover ? "Bajar lo seleccionado" : "Extender sustain");
    });
    document.querySelectorAll(".sustain-btn, .mobile-sustain-btn").forEach((b) => b.classList.toggle("modo-mover", mover));
}

// Botones del panel derecho / barra móvil.
function accionBotonSustain(dir) {
    if (modoMoverNotas) return moverSeleccionChart(dir < 0 ? -1 : 1);
    return ajustarLongitudNota(dir);
}

// Mueve flechas y eventos seleccionados "delta" casillas (negativo = subir).
// V0.8.2l: cada flecha conserva su posición dentro de la casilla (Modo Libre
// encendido o apagado). Si se mueve una flecha de una pila, se separa y las
// demás quedan a la vista. Con Modo Libre activo, el número de la ventana
// (el de la última seleccionada) se aplica a todas las flechas movidas.
function moverSeleccionChart(delta) {
    if (!currentChartData) return false;
    const notes = currentChartData.notes || {};
    const events = currentChartData.events || (currentChartData.events = {});
    const claves = obtenerClavesSeleccionadas();
    const clavesEv = typeof obtenerClavesEventosSeleccionados === "function" ? obtenerClavesEventosSeleccionados() : [];
    if (!claves.length && !clavesEv.length) { mostrarToastGCD("Selecciona flechas o eventos para moverlos"); return false; }
    const total = parseInt(currentChartData.totalRows, 10) || 0;
    const seleccion = new Set(claves);
    const partes = (k) => (typeof partesClaveNotaGCD === "function" ? partesClaveNotaGCD(k) : Object.assign({ n: 0 }, partesClaveNota(k)));
    const offDe = (nota) => (typeof offNotaGCD === "function" ? offNotaGCD(nota) : (Number(nota && nota.off) || 0));
    // Número del Modo Libre que se aplica al mover (solo con Modo Libre activo).
    const valorLibre = typeof valorLibreParaMover === "function" ? valorLibreParaMover(claves) : null;
    const destinos = claves.map((k) => {
        const p = partes(k);
        let nota = clonarDatoEditor(notes[k]);
        if (valorLibre !== null && typeof aplicarValorLibreANota === "function") nota = aplicarValorLibreANota(nota, valorLibre);
        return { k, f: p.f, c: p.c, n: p.n, f2: p.f + delta, nota };
    }).sort((a, b) => (a.f - b.f) || (a.c - b.c) || (a.n - b.n));
    const filasEv = clavesEv.map((k) => ({ k, f: parseInt(k, 10) }));
    const fuera = destinos.some((d) => d.f2 < 0 || d.f2 >= total) || filasEv.some((d) => d.f + delta < 0 || d.f + delta >= total);
    if (fuera) { mostrarToastGCD(delta < 0 ? "Ya está en el inicio de la canción" : "Ya está en el final de la canción"); return false; }
    // Choque: otra flecha (no seleccionada) justo en el punto de destino.
    const umbral = typeof UMBRAL_PILA_NOTA === "number" ? UMBRAL_PILA_NOTA : 0.2;
    const choque = destinos.find((d) => {
        const enDestino = typeof clavesNotasCelda === "function" ? clavesNotasCelda(d.f2, d.c, notes) : (notes[`${d.f2}-${d.c}`] ? [`${d.f2}-${d.c}`] : []);
        return enDestino.some((k) => !seleccion.has(k) && Math.abs(offDe(notes[k]) - offDe(d.nota)) < umbral);
    });
    if (choque) { mostrarToastGCD("Hay otra flecha en el camino; no se movió nada"); return false; }
    const principal = eventoSeleccionado !== null ? String(eventoSeleccionado) : null;
    const principalNota = notaSeleccionada ? notaSeleccionada.replace("cell-", "") : null;
    const nuevasEv = {};
    const nuevasNotas = {};
    const n = claves.length + clavesEv.length;
    const etiqueta = `${delta < 0 ? "Subir" : "Bajar"} ${n === 1 ? (claves.length ? "flecha" : "evento") : `${n} elementos`}`;
    ejecutarEdicionChart(etiqueta, () => {
        destinos.forEach((d) => escribirNotaChart(d.k, null));
        destinos.forEach((d) => {
            const nk = typeof claveLibreNota === "function" ? claveLibreNota(d.f2, d.c, notes) : `${d.f2}-${d.c}`;
            escribirNotaChart(nk, d.nota);
            nuevasNotas[d.k] = nk;
        });
        const evOrden = typeof ordenarClavesEventos === "function" ? ordenarClavesEventos(clavesEv) : clavesEv;
        const evDatos = evOrden.map((k) => ({ k, f: parseInt(k, 10), ev: clonarDatoEditor(events[k]) }));
        evDatos.forEach((d) => escribirEventoChart(d.k, null));
        evDatos.forEach((d) => {
            const nk = typeof claveLibreEventoFila === "function" ? claveLibreEventoFila(d.f + delta) : String(d.f + delta);
            escribirEventoChart(nk, d.ev);
            nuevasEv[d.k] = nk;
        });
    }, "mover");
    limpiarSeleccionNotas();
    destinos.forEach((d) => { if (d.k !== principalNota) agregarNotaASeleccion(nuevasNotas[d.k]); });
    if (principalNota && nuevasNotas[principalNota]) agregarNotaASeleccion(nuevasNotas[principalNota]);
    const nuevas = Object.values(nuevasEv);
    if (nuevas.length && typeof seleccionarEvento === "function") {
        seleccionarEvento(principal && nuevasEv[principal] ? nuevasEv[principal] : nuevas[0]);
        nuevas.forEach((k) => { if (!eventosSeleccionados.has(k)) alternarSeleccionEvento(k, true); });
        if (principal && nuevasEv[principal] && eventoSeleccionado !== nuevasEv[principal]) alternarSeleccionEvento(nuevasEv[principal], true);
    }
    actualizarEstadoMenuEditor();
    return true;
}

// ---------- menú EDITOR ----------
function toggleMenuEditor(event) {
    if (event) event.stopPropagation();
    const editor = document.getElementById("menu-editor-wrapper");
    ["menu-archivos-wrapper", "menu-windows-wrapper", "menu-extras-wrapper"].forEach((id) => document.getElementById(id)?.classList.remove("open"));
    if (editor) editor.classList.toggle("open");
    actualizarEstadoMenuEditor();
}

function cerrarMenuEditor() {
    document.getElementById("menu-editor-wrapper")?.classList.remove("open");
}

// Ejecuta una acción del menú y lo cierra.
function accionMenuEditor(accion) {
    cerrarMenuEditor();
    const acciones = {
        seleccionarTodo: seleccionarTodasLasNotas,
        multi: () => alternarMultiSeleccion(),
        deseleccionar: deseleccionarTodasLasNotas,
        quitar: quitarNotasSeleccionadas,
        copiar: () => copiarNotasSeleccionadas(false),
        cortar: cortarNotasSeleccionadas,
        pegar: pegarNotas,
        mover: () => alternarModoMoverNotas(),
        atrasar: atrasarCambio,
        adelantar: adelantarCambio
    };
    if (acciones[accion]) acciones[accion]();
}

function actualizarEstadoMenuEditor() {
    const menu = document.getElementById("menu-editor-wrapper");
    const pila = currentChartData ? obtenerPilaHistorial() : { undo: [], redo: [] };
    const seleccion = currentChartData ? obtenerClavesSeleccionadas().length : 0;
    const set = (accion, deshabilitado) => {
        const el = menu?.querySelector(`[data-accion="${accion}"]`);
        if (el) el.classList.toggle("disabled", !!deshabilitado);
    };
    set("deseleccionar", !seleccion);
    set("quitar", !seleccion);
    set("copiar", !seleccion);
    set("cortar", !seleccion);
    set("pegar", !(portapapelesNotas && portapapelesNotas.length));
    set("atrasar", !pila.undo.length);
    set("adelantar", !pila.redo.length);
    const multi = menu?.querySelector('[data-accion="multi"]');
    if (multi) multi.classList.toggle("checked", modoMultiSeleccion);
    const mover = menu?.querySelector('[data-accion="mover"]');
    if (mover) mover.classList.toggle("checked", typeof modoMoverNotas !== "undefined" && modoMoverNotas);
    const indicadorMover = document.getElementById("mover-notas-indicator");
    if (indicadorMover) indicadorMover.hidden = !(typeof modoMoverNotas !== "undefined" && modoMoverNotas);
    // V0.8.2k: el contador suma flechas y eventos seleccionados.
    const evSel = currentChartData && typeof obtenerClavesEventosSeleccionados === "function" ? obtenerClavesEventosSeleccionados().length : 0;
    const contador = document.getElementById("editor-selection-count");
    if (contador) contador.textContent = seleccion + evSel ? String(seleccion + evSel) : "";
    const indicador = document.getElementById("multi-select-indicator");
    if (indicador) indicador.hidden = !modoMultiSeleccion;
    if (typeof nkActualizarContadorSeleccion === "function") nkActualizarContadorSeleccion();
    // V0.8.2l: la ventana de Modo Libre muestra el número de la última flecha seleccionada.
    if (typeof actualizarUIModoLibre === "function") actualizarUIModoLibre();
}

// ---------- atajos de teclado ----------
function hayModalAbiertoEditor() {
    return !!document.querySelector(".modal-overlay.active, .import-chart-overlay.active");
}

window.addEventListener("keydown", function (e) {
    const workspace = document.getElementById("editor-workspace");
    if (!workspace || !workspace.classList.contains("active") || !currentChartData) return;
    if (esCampoDeTexto(e.target) || hayModalAbiertoEditor()) return;
    const mod = e.ctrlKey || e.metaKey;
    const tecla = (e.key || "").toLowerCase();
    let accion = null;
    if (mod && !e.altKey) {
        if (tecla === "a") accion = seleccionarTodasLasNotas;
        else if (tecla === "c") accion = () => copiarNotasSeleccionadas(false);
        else if (tecla === "x") accion = cortarNotasSeleccionadas;
        else if (tecla === "v") accion = pegarNotas;
        else if (tecla === "z" && e.shiftKey) accion = adelantarCambio;
        else if (tecla === "z") accion = atrasarCambio;
        else if (tecla === "y") accion = adelantarCambio;
    } else if (e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        // V0.8.2k: Alt + ↑/↓ mueve la selección (como Subir / Bajar).
        accion = () => moverSeleccionChart(e.key === "ArrowUp" ? -1 : 1);
    } else if (!e.altKey) {
        if (e.key === "Escape") {
            if (!obtenerClavesSeleccionadas().length) return;
            accion = deseleccionarTodasLasNotas;
        } else if (e.key === "Delete" || e.key === "Backspace") {
            accion = quitarNotasSeleccionadas;
        }
    }
    if (!accion) return;
    // Si no hay flechas seleccionadas pero sí texto (p. ej. en Help), se deja copiar el texto.
    if (mod && (tecla === "c" || tecla === "x") && !obtenerClavesSeleccionadas().length) {
        const texto = window.getSelection ? String(window.getSelection()) : "";
        if (texto) return;
    }
    e.preventDefault();
    if (e.repeat && (tecla === "a" || tecla === "c" || tecla === "x")) return;
    accion();
});

// Cerrar el menú EDITOR al tocar fuera de él.
window.addEventListener("click", function (e) {
    const editor = document.getElementById("menu-editor-wrapper");
    if (editor && !editor.contains(e.target)) editor.classList.remove("open");
});
