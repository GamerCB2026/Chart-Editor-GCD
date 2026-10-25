// =====================================================================
// V0.8.2l — Varias flechas en la misma casilla ("pila", típico del spam)
// y selección por flecha en Modo Libre.
//
// currentChartData.notes usa "fila-carril" para la primera flecha de una
// casilla y "fila-carril~1", "fila-carril~2"... para las demás del mismo
// carril. En el song-chart.json cada una sale por separado (nunca se
// fusionan, nunca se duplican). Las que caen en el mismo punto de la
// casilla se dibujan como UNA flecha con un contador (×N); al mover una,
// se separa y las demás quedan a la vista.
// =====================================================================

const SEP_PILA_NOTA = "~";
const UMBRAL_PILA_NOTA = 0.2; // fracción de casilla: más juntas que esto = misma flecha visual

function partesClaveNotaGCD(key) {
    const s = String(key);
    const guion = s.indexOf("-");
    const tilde = s.indexOf(SEP_PILA_NOTA);
    const n = tilde < 0 ? 0 : parseInt(s.slice(tilde + 1), 10);
    return { f: parseInt(s, 10), c: guion < 0 ? NaN : parseInt(s.slice(guion + 1), 10), n: Number.isFinite(n) ? n : 0 };
}

function baseClaveNota(key) {
    const s = String(key);
    const tilde = s.indexOf(SEP_PILA_NOTA);
    return tilde < 0 ? s : s.slice(0, tilde);
}

function claveNotaPila(f, c, n) {
    return n > 0 ? `${f}-${c}${SEP_PILA_NOTA}${n}` : `${f}-${c}`;
}

function notasActualesGCD() {
    return (typeof currentChartData !== "undefined" && currentChartData && currentChartData.notes) || {};
}

// Mapa "fila-carril" -> [claves] de todas las notas (para operaciones masivas).
function indiceCeldasNotas(notes) {
    const ns = notes || notasActualesGCD();
    const mapa = new Map();
    for (const k in ns) {
        if (!ns[k]) continue;
        const b = baseClaveNota(k);
        let l = mapa.get(b);
        if (!l) { l = []; mapa.set(b, l); }
        l.push(k);
    }
    mapa.forEach((l) => l.sort((a, b) => partesClaveNotaGCD(a).n - partesClaveNotaGCD(b).n));
    return mapa;
}

// Mayor índice de pila usado en un mapa de notas (se calcula una vez y se
// actualiza al escribir), para buscar las flechas de una casilla sin
// recorrer todo el chart.
const _maxPilaNotasGCD = new WeakMap();
function maxPilaNotas(notes) {
    const ns = notes || notasActualesGCD();
    let m = _maxPilaNotasGCD.get(ns);
    if (m === undefined) {
        m = 0;
        for (const k in ns) {
            if (k.indexOf(SEP_PILA_NOTA) < 0) continue;
            const n = partesClaveNotaGCD(k).n;
            if (n > m) m = n;
        }
        _maxPilaNotasGCD.set(ns, m);
    }
    return m;
}

function registrarClavePilaNota(notes, key) {
    if (!notes || String(key).indexOf(SEP_PILA_NOTA) < 0) return;
    const n = partesClaveNotaGCD(key).n;
    const m = _maxPilaNotasGCD.get(notes);
    if (m !== undefined && n > m) _maxPilaNotasGCD.set(notes, n);
}

// Claves de las flechas de una casilla (en orden de la pila).
function clavesNotasCelda(f, c, notes, indice) {
    const base = `${f}-${c}`;
    if (indice) return (indice.get(base) || []).slice();
    const ns = notes || notasActualesGCD();
    const out = [];
    const m = maxPilaNotas(ns);
    for (let i = 0; i <= m; i++) {
        const k = claveNotaPila(f, c, i);
        if (ns[k]) out.push(k);
    }
    return out;
}

// Primera clave libre de la casilla ("f-c", luego "f-c~1", ...).
function claveLibreNota(f, c, notes) {
    const ns = notes || notasActualesGCD();
    for (let i = 0; i < 100000; i++) {
        const k = claveNotaPila(f, c, i);
        if (!ns[k]) { registrarClavePilaNota(ns, k); return k; }
    }
    return claveNotaPila(f, c, Date.now());
}

function offNotaGCD(nota) {
    if (!nota) return 0;
    return typeof redondearOffLibre === "function" ? redondearOffLibre(nota.off) : (Number(nota.off) || 0);
}

// Agrupa las flechas de una casilla en "flechas visuales" (pilas).
// Cada grupo: { claves (orden de pila), top (la que se ve encima), off }.
function gruposVisualesNotas(claves, notes) {
    const ns = notes || notasActualesGCD();
    const items = claves.filter((k) => ns[k]).map((k) => ({ k, off: offNotaGCD(ns[k]), n: partesClaveNotaGCD(k).n }))
        .sort((a, b) => (a.off - b.off) || (a.n - b.n));
    const grupos = [];
    let g = null;
    items.forEach((it) => {
        if (g && Math.abs(it.off - g.ref) < UMBRAL_PILA_NOTA) g.items.push(it);
        else { g = { ref: it.off, items: [it] }; grupos.push(g); }
    });
    return grupos.map((gr) => {
        const ordenados = gr.items.slice().sort((a, b) => a.n - b.n);
        const top = ordenados[ordenados.length - 1].k;
        return { claves: ordenados.map((x) => x.k), top, off: offNotaGCD(ns[top]), minN: ordenados[0].n };
    });
}

function grupoDeNotaGCD(key, notes, indice) {
    const { f, c } = partesClaveNotaGCD(key);
    const grupos = gruposVisualesNotas(clavesNotasCelda(f, c, notes, indice), notes);
    return grupos.find((g) => g.claves.includes(String(key))) || null;
}

// Grupo "principal" de una casilla (el que se pinta directo en la celda).
function grupoPrincipalCelda(grupos) {
    if (!grupos.length) return null;
    return grupos.reduce((a, b) => (b.minN < a.minN ? b : a));
}

// ---------- pintado ----------
function limpiarCeldaNotasGCD(cell) {
    cell.querySelectorAll(".grid-note-circle, .sustain-line, .note-kind-badge, .nota-extra, .nota-pila-badge").forEach((el) => el.remove());
    cell.classList.remove("nota-multi", "nota-pila");
    delete cell.dataset.notaCount;
}

function crearCirculoNotaGCD(contenedor, nota, c) {
    const circulo = document.createElement("div");
    circulo.className = `grid-note-circle note-col-${c % 4}`;
    contenedor.appendChild(circulo);
    const len = Math.max(0, parseInt(nota && nota.len, 10) || 0);
    if (len > 0) {
        const line = document.createElement("div");
        line.className = "sustain-line";
        line.style.height = len * alturaCelda + "px";
        contenedor.appendChild(line);
    }
    return circulo;
}

function crearBadgePilaGCD(contenedor, n) {
    const b = document.createElement("span");
    b.className = "nota-pila-badge";
    b.textContent = `×${n}`;
    b.title = `${n} flechas en el mismo punto`;
    contenedor.appendChild(b);
}

function seleccionNotasActual() {
    return typeof notasSeleccionadas !== "undefined" ? notasSeleccionadas : new Set();
}

// Pinta TODAS las flechas de una casilla (una, varias pegadas o separadas).
function pintarCeldaNotasGCD(f, c, indice) {
    const cell = document.getElementById(`cell-${f}-${c}`);
    if (!cell) return;
    limpiarCeldaNotasGCD(cell);
    const notes = notasActualesGCD();
    const claves = clavesNotasCelda(f, c, notes, indice);
    const sel = seleccionNotasActual();
    if (!claves.length) {
        if (typeof decorarCeldaNotaKind === "function") decorarCeldaNotaKind(cell, null, null, c);
        if (typeof aplicarOffsetLibreCelda === "function") aplicarOffsetLibreCelda(cell, null);
        cell.classList.remove("selected-note");
        return;
    }
    const grupos = gruposVisualesNotas(claves, notes);
    const principal = grupoPrincipalCelda(grupos);
    const notaP = notes[principal.top];
    const circulo = crearCirculoNotaGCD(cell, notaP, c);
    if (typeof decorarCeldaNotaKind === "function") decorarCeldaNotaKind(cell, circulo, notaP, c);
    if (typeof aplicarOffsetLibreCelda === "function") aplicarOffsetLibreCelda(cell, notaP);
    if (principal.claves.length > 1) { crearBadgePilaGCD(cell, principal.claves.length); cell.classList.add("nota-pila"); }
    cell.classList.toggle("selected-note", principal.claves.some((k) => sel.has(k)));
    cell.dataset.notaCount = String(claves.length);
    grupos.forEach((g) => {
        if (g === principal) return;
        cell.classList.add("nota-multi");
        const nota = notes[g.top];
        const wrap = document.createElement("div");
        wrap.className = "nota-extra";
        wrap.dataset.notaKey = g.top;
        const circ = crearCirculoNotaGCD(wrap, nota, c);
        cell.appendChild(wrap);
        if (typeof decorarCeldaNotaKind === "function") decorarCeldaNotaKind(wrap, circ, nota, c);
        if (typeof aplicarOffsetLibreCelda === "function") aplicarOffsetLibreCelda(wrap, nota);
        if (g.claves.length > 1) crearBadgePilaGCD(wrap, g.claves.length);
        wrap.classList.toggle("seleccionada", g.claves.some((k) => sel.has(k)));
    });
}

function pintarTodasLasNotasGCD() {
    const notes = notasActualesGCD();
    const indice = indiceCeldasNotas(notes);
    indice.forEach((_, base) => {
        const { f, c } = partesClaveNotaGCD(base);
        if (Number.isFinite(f) && Number.isFinite(c)) pintarCeldaNotasGCD(f, c, indice);
    });
}

// Solo el resaltado de selección (sin repintar sprites).
function marcarSeleccionCeldasNotas(claves) {
    const bases = new Set();
    claves.forEach((k) => bases.add(baseClaveNota(k)));
    if (!bases.size) return;
    const notes = notasActualesGCD();
    const indice = bases.size > 24 ? indiceCeldasNotas(notes) : null;
    const sel = seleccionNotasActual();
    bases.forEach((base) => {
        const { f, c } = partesClaveNotaGCD(base);
        const cell = document.getElementById(`cell-${f}-${c}`);
        if (!cell) return;
        const lista = clavesNotasCelda(f, c, notes, indice);
        if (!lista.length) { cell.classList.remove("selected-note"); return; }
        const grupos = gruposVisualesNotas(lista, notes);
        const principal = grupoPrincipalCelda(grupos);
        cell.classList.toggle("selected-note", principal.claves.some((k) => sel.has(k)));
        cell.querySelectorAll(".nota-extra").forEach((w) => {
            const g = grupos.find((x) => x.top === w.dataset.notaKey);
            w.classList.toggle("seleccionada", !!g && g.claves.some((k) => sel.has(k)));
        });
    });
}

// ---------- Modo Libre: la hitbox es la flecha ----------
// y = posición vertical en casillas desde el inicio (la casilla f ocupa [f, f+1)).
// Hitbox del tamaño de una casilla centrada en la flecha.
function notaEnPuntoLibreGCD(c, y, notes) {
    const ns = notes || notasActualesGCD();
    const base = Math.floor(y);
    let mejor = null;
    for (let fr = base - 1; fr <= base + 1; fr++) {
        if (fr < 0) continue;
        const grupos = gruposVisualesNotas(clavesNotasCelda(fr, c, ns), ns);
        grupos.forEach((g) => {
            const centro = fr + g.off + 0.5;
            const d = Math.abs(y - centro);
            if (d <= 0.5 && (!mejor || d < mejor.d)) mejor = { d, fila: fr, grupo: g };
        });
    }
    return mejor;
}

function posicionClickCeldaGCD(e, f, cell) {
    if (!e || !cell || !Number.isFinite(e.clientY)) return null;
    const rect = cell.getBoundingClientRect();
    if (!rect.height) return null;
    return f + (e.clientY - rect.top) / rect.height;
}
