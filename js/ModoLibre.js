// =====================================================================
// V0.8.2k/l — EXTRAS > Modo Libre
// Las flechas se pueden colocar fuera de la casilla exacta. Cada flecha
// conserva su casilla ("fila-carril") y guarda "off": la fracción de
// casilla (-0.5 … 0.5) en la que quedó. En el song-chart.json solo cambia
// su "t" = (fila + off) · duración de casilla; "off" nunca se exporta.
// Imán (0–100, de 5 en 5): 100 = casilla exacta, 0 = totalmente libre.
// V0.8.2l: desactivar Modo Libre ya NO acomoda nada: las flechas libres se
// quedan donde están (también al exportar/importar). Cada flecha guarda en
// el editor su número ("iman") y el punto tocado ("libP"); nunca salen en el
// song-chart.json. Si no los tiene (p. ej. importada), el número se calcula
// por lo movida que está: 100 − |off|·200.
// =====================================================================

const MODO_LIBRE_LS = "gcd_modo_libre_v1";
const MODO_LIBRE_PASO = 5;
const OFF_LIBRE_MINIMO = 0.02; // por debajo se considera "en la casilla"
let modoLibreActivo = false;
let imanModoLibre = 100;

(function cargarModoLibreLS() {
    try {
        const d = JSON.parse(localStorage.getItem(MODO_LIBRE_LS) || "null");
        if (d && typeof d === "object") {
            modoLibreActivo = !!d.activo;
            const n = Number(d.iman);
            if (Number.isFinite(n)) imanModoLibre = normalizarImanModoLibre(n);
        }
    } catch (e) { /* sin preferencia guardada */ }
})();

function normalizarImanModoLibre(n) {
    const v = Math.round((Number(n) || 0) / MODO_LIBRE_PASO) * MODO_LIBRE_PASO;
    return Math.min(100, Math.max(0, v));
}

function guardarModoLibreLS() {
    try { localStorage.setItem(MODO_LIBRE_LS, JSON.stringify({ activo: modoLibreActivo, iman: imanModoLibre })); } catch (e) { /* almacenamiento lleno o bloqueado */ }
}

function redondearOffLibre(off) {
    const v = Math.round(Math.min(0.5, Math.max(-0.5, Number(off) || 0)) * 1000) / 1000;
    return Math.abs(v) < OFF_LIBRE_MINIMO ? 0 : v;
}

// Offset de una flecha nueva según dónde se tocó la casilla y el imán.
function offsetModoLibreDesdeClick(e, cell) {
    if (!modoLibreActivo || imanModoLibre >= 100 || !e || !cell) return 0;
    const rect = cell.getBoundingClientRect();
    if (!rect.height || !Number.isFinite(e.clientY)) return 0;
    const p = Math.min(0.5, Math.max(-0.5, (e.clientY - rect.top) / rect.height - 0.5));
    return redondearOffLibre(p * (1 - imanModoLibre / 100));
}

// Import: tiempo exacto en casillas (p. ej. 12.3) y la casilla elegida (12) -> off.
function offsetLibreDesdeTiempo(exacto, fila) {
    if (!Number.isFinite(exacto) || exacto < 0) return 0;
    return redondearOffLibre(exacto - fila);
}

// Pinta la flecha desplazada dentro de su casilla.
function aplicarOffsetLibreCelda(cell, nota) {
    if (!cell) return;
    const off = nota ? redondearOffLibre(nota.off) : 0;
    if (!off) {
        cell.classList.remove("nota-libre");
        cell.style.removeProperty("--off-libre");
        return;
    }
    const alto = typeof alturaCelda === "number" ? alturaCelda : 45;
    cell.classList.add("nota-libre");
    cell.style.setProperty("--off-libre", `${Math.round(off * alto * 100) / 100}px`);
}

function contarNotasLibres(notes) {
    let n = 0;
    for (const k in notes || {}) if (notes[k] && redondearOffLibre(notes[k].off)) n++;
    return n;
}

// ---------- V0.8.2l: número por flecha ----------
function esNotaLibre(nota) {
    return !!nota && !!redondearOffLibre(nota.off);
}

// Número 0–100 de una flecha (qué tan pegada a su casilla está).
function valorLibreNota(nota) {
    if (!nota) return 100;
    const guardado = Number(nota.iman);
    if (Number.isFinite(guardado)) return normalizarImanModoLibre(guardado);
    return normalizarImanModoLibre(100 - Math.abs(redondearOffLibre(nota.off)) * 200);
}

// Punto (-0.5 … 0.5) hacia el que se corre la flecha cuando baja el número.
function puntoLibreNota(nota) {
    if (!nota) return 0.5;
    const p = Number(nota.libP);
    if (Number.isFinite(p)) return Math.min(0.5, Math.max(-0.5, p));
    const off = redondearOffLibre(nota.off);
    if (!off) return 0.5; // en la casilla: al bajar el número se corre hacia abajo
    const v = valorLibreNota(nota);
    const factor = 1 - v / 100;
    const deducido = factor > 0 ? off / factor : (off > 0 ? 0.5 : -0.5);
    return Math.min(0.5, Math.max(-0.5, deducido));
}

// Copia de la nota con el número aplicado (off = punto · (1 − número/100)).
function aplicarValorLibreANota(nota, valor) {
    if (!nota) return nota;
    const v = normalizarImanModoLibre(valor);
    const p = puntoLibreNota(nota);
    const salida = Object.assign({}, nota);
    const off = redondearOffLibre(p * (1 - v / 100));
    if (off) salida.off = off; else delete salida.off;
    salida.iman = v;
    salida.libP = Math.round(p * 1000) / 1000;
    return salida;
}

// Flecha nueva en Modo Libre: punto tocado + imán actual.
function prepararNotaLibreNueva(nota, p) {
    delete nota.off; delete nota.iman; delete nota.libP;
    if (!modoLibreActivo || imanModoLibre >= 100 || !Number.isFinite(p)) return nota;
    const punto = Math.min(0.5, Math.max(-0.5, p));
    const off = redondearOffLibre(punto * (1 - imanModoLibre / 100));
    if (off) nota.off = off;
    nota.iman = imanModoLibre;
    nota.libP = Math.round(punto * 1000) / 1000;
    return nota;
}

function clavesNotasSeleccionadasLibre() {
    return typeof obtenerClavesSeleccionadas === "function" && typeof currentChartData !== "undefined" && currentChartData ? obtenerClavesSeleccionadas() : [];
}

// La última flecha seleccionada (la que manda el número).
function claveUltimaNotaSeleccionada(claves) {
    const lista = claves || clavesNotasSeleccionadasLibre();
    if (!lista.length) return null;
    const principal = typeof notaSeleccionada === "string" && notaSeleccionada ? notaSeleccionada.replace("cell-", "") : null;
    if (principal && lista.includes(principal)) return principal;
    return lista[lista.length - 1];
}

function valorLibreSeleccion() {
    const k = claveUltimaNotaSeleccionada();
    return k ? valorLibreNota(currentChartData.notes[k]) : null;
}

// Al mover con Modo Libre activo: el número de la última seleccionada se aplica a todas.
function valorLibreParaMover(claves) {
    if (!modoLibreActivo || !claves || !claves.length) return null;
    const k = claveUltimaNotaSeleccionada(claves);
    return k && currentChartData.notes[k] ? valorLibreNota(currentChartData.notes[k]) : null;
}

// +/− con flechas seleccionadas: el nuevo número reemplaza el de todas (se puede Atrasar).
function aplicarValorLibreSeleccion(valor) {
    const claves = clavesNotasSeleccionadasLibre();
    if (!claves.length) return 0;
    const v = normalizarImanModoLibre(valor);
    const principal = claveUltimaNotaSeleccionada(claves);
    ejecutarEdicionChart(`Número libre ${v} (${claves.length} flecha${claves.length === 1 ? "" : "s"})`, () => {
        claves.forEach((k) => {
            const nota = currentChartData.notes[k];
            if (nota) escribirNotaChart(k, aplicarValorLibreANota(nota, v));
        });
    });
    // La selección no cambia (y la principal sigue siendo la misma).
    if (principal && typeof agregarNotaASeleccion === "function") agregarNotaASeleccion(principal);
    return claves.length;
}

function textoImanModoLibre() {
    if (imanModoLibre >= 100) return "100: las flechas caen exactas en la casilla.";
    if (imanModoLibre <= 0) return "0: las flechas quedan justo donde toques.";
    return `${imanModoLibre}: entre más alto, más se pegan a la casilla.`;
}

function actualizarUIModoLibre() {
    // V0.8.2l: con flechas seleccionadas se muestra (y se cambia) el número de la última.
    const valorSel = modoLibreActivo ? valorLibreSeleccion() : null;
    const haySel = valorSel !== null;
    const mostrado = haySel ? valorSel : imanModoLibre;
    const nSel = haySel ? clavesNotasSeleccionadasLibre().length : 0;
    const item = document.getElementById("menu-item-modo-libre");
    if (item) {
        item.classList.toggle("checked", modoLibreActivo);
        item.setAttribute("aria-checked", modoLibreActivo ? "true" : "false");
    }
    const chip = document.getElementById("modo-libre-indicator");
    if (chip) {
        chip.hidden = !modoLibreActivo;
        const lbl = document.getElementById("modo-libre-indicator-valor");
        if (lbl) lbl.textContent = String(imanModoLibre);
    }
    const valor = document.getElementById("modo-libre-valor");
    if (valor) valor.textContent = String(mostrado);
    const etiqueta = document.getElementById("modo-libre-label");
    if (etiqueta) etiqueta.textContent = haySel ? (nSel === 1 ? "FLECHA SELECCIONADA" : "ÚLTIMA SELECCIONADA") : "IMÁN A LA CASILLA";
    const ventana = document.getElementById("modo-libre-window");
    if (ventana) ventana.classList.toggle("con-seleccion", haySel);
    const hint = document.getElementById("modo-libre-hint");
    if (hint) {
        hint.textContent = haySel
            ? (nSel === 1
                ? `${mostrado}: qué tan movida está. + / − la mueven (100 = en su casilla).`
                : `${mostrado}: número de la última seleccionada. + / − lo aplican a las ${nSel} flechas.`)
            : textoImanModoLibre();
    }
    const mas = document.getElementById("modo-libre-mas");
    const menos = document.getElementById("modo-libre-menos");
    if (mas) mas.disabled = mostrado >= 100;
    if (menos) menos.disabled = mostrado <= 0;
    const barra = document.getElementById("modo-libre-barra");
    if (barra) barra.style.width = `${mostrado}%`;
    document.body.classList.toggle("modo-libre-activo", modoLibreActivo);
}

function abrirVentanaModoLibre() {
    const v = document.getElementById("modo-libre-window");
    if (!v) return;
    v.classList.add("active");
    v.setAttribute("aria-hidden", "false");
    actualizarUIModoLibre();
}

function cerrarVentanaModoLibre() {
    const v = document.getElementById("modo-libre-window");
    if (!v) return;
    v.classList.remove("active");
    v.setAttribute("aria-hidden", "true");
}

function activarModoLibre(activo) {
    const nuevo = !!activo;
    if (nuevo === modoLibreActivo) {
        if (nuevo) abrirVentanaModoLibre();
        return;
    }
    modoLibreActivo = nuevo;
    guardarModoLibreLS();
    if (nuevo) {
        abrirVentanaModoLibre();
        if (typeof mostrarToastGCD === "function") mostrarToastGCD(`Modo Libre activado (imán ${imanModoLibre})`);
    } else {
        cerrarVentanaModoLibre();
        // V0.8.2l: no se acomoda nada; las flechas libres conservan su tiempo exacto.
        const n = typeof currentChartData !== "undefined" && currentChartData ? contarNotasLibres(currentChartData.notes) : 0;
        if (typeof mostrarToastGCD === "function") mostrarToastGCD(n ? `Modo Libre desactivado: las ${n} flecha(s) libres se quedan donde están` : "Modo Libre desactivado");
    }
    actualizarUIModoLibre();
}

function alternarModoLibre() {
    document.getElementById("menu-extras-wrapper")?.classList.remove("open");
    activarModoLibre(!modoLibreActivo);
}

function cambiarImanModoLibre(delta) {
    const paso = delta > 0 ? MODO_LIBRE_PASO : -MODO_LIBRE_PASO;
    // V0.8.2l: con flechas seleccionadas, + / − cambian SU número (todas toman el nuevo).
    const actual = modoLibreActivo ? valorLibreSeleccion() : null;
    if (actual !== null) {
        const nuevo = normalizarImanModoLibre(actual + paso);
        if (nuevo !== actual) aplicarValorLibreSeleccion(nuevo);
        actualizarUIModoLibre();
        return;
    }
    imanModoLibre = normalizarImanModoLibre(imanModoLibre + paso);
    guardarModoLibreLS();
    actualizarUIModoLibre();
}

function fijarImanModoLibre(n) {
    imanModoLibre = normalizarImanModoLibre(n);
    guardarModoLibreLS();
    actualizarUIModoLibre();
}

// Tras importar: avisa si el chart trae flechas fuera de casilla.
function revisarNotasLibresImportadas() {
    if (typeof currentChartData === "undefined" || !currentChartData) return 0;
    const n = contarNotasLibres(currentChartData.notes);
    if (n && !modoLibreActivo && typeof mostrarToastGCD === "function") {
        mostrarToastGCD(`${n} flecha(s) vienen fuera de su casilla y se respetan (borde gris).`);
    }
    return n;
}

// ---------- menú EXTRAS ----------
function toggleMenuExtras(event) {
    if (event) event.stopPropagation();
    ["menu-archivos-wrapper", "menu-windows-wrapper", "menu-editor-wrapper"].forEach((id) => document.getElementById(id)?.classList.remove("open"));
    const w = document.getElementById("menu-extras-wrapper");
    if (w) w.classList.toggle("open");
    actualizarUIModoLibre();
}

window.addEventListener("click", function (e) {
    const w = document.getElementById("menu-extras-wrapper");
    if (w && !w.contains(e.target)) w.classList.remove("open");
});

function hacerVentanaModoLibreMovible() {
    const ventana = document.getElementById("modo-libre-window");
    const cabecera = document.getElementById("modo-libre-window-header");
    if (!ventana || !cabecera || ventana.dataset.movible) return;
    ventana.dataset.movible = "1";
    let arrastrando = false, dx = 0, dy = 0;
    cabecera.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        const rect = ventana.getBoundingClientRect();
        arrastrando = true;
        dx = event.clientX - rect.left;
        dy = event.clientY - rect.top;
        ventana.style.right = "auto";
        cabecera.setPointerCapture(event.pointerId);
    });
    cabecera.addEventListener("pointermove", (event) => {
        if (!arrastrando) return;
        const maxX = Math.max(0, window.innerWidth - ventana.offsetWidth);
        const maxY = Math.max(32, window.innerHeight - ventana.offsetHeight);
        ventana.style.left = `${Math.min(maxX, Math.max(0, event.clientX - dx))}px`;
        ventana.style.top = `${Math.min(maxY, Math.max(32, event.clientY - dy))}px`;
    });
    cabecera.addEventListener("pointerup", () => { arrastrando = false; });
    cabecera.addEventListener("pointercancel", () => { arrastrando = false; });
}

document.addEventListener("DOMContentLoaded", () => {
    hacerVentanaModoLibreMovible();
    actualizarUIModoLibre();
});
if (document.readyState !== "loading") setTimeout(() => { hacerVentanaModoLibreMovible(); actualizarUIModoLibre(); }, 0);
