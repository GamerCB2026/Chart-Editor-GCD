// =====================================================================
// V0.8.2 Ronda 4 — EXTRAS > Charteo Rápido
// Coloca flechas en vivo en el tiempo actual de la canción (sonando o en pausa).
//  PC:      ← ↓ ↑ → = Player · W A S D = Oponente (W arriba, A izq, S abajo, D der).
//           Mantener la tecla mientras suena la canción alarga el sustain.
//  Móvil horizontal: se oculta la interfaz y salen flechas abajo de cada lado + Play.
//  Vertical: Recortar/Extender se reemplazan por las 4 flechas + selector Oponente/Player.
// Al activarlo se enciende Modo Libre; al quitarlo se deja como estaba antes.
// No se guarda nada en localStorage. Cada flecha es un paso de Atrasar (Ctrl+Z).
// =====================================================================

let charteoRapidoActivo = false;
let crLadoVertical = "player";      // "player" | "oponente" (solo en modo vertical)
let crModoLibreAntes = null;        // estado de Modo Libre antes de activar
const crTeclasActivas = new Map();  // código -> { key, t0 }

// Carriles: 0 izq, 1 abajo, 2 arriba, 3 der (Player 0–3, Oponente 4–7).
const CR_TECLAS_PLAYER = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
const CR_TECLAS_OPONENTE = { KeyA: 4, KeyS: 5, KeyW: 6, KeyD: 7 };

function crEsTactil() {
    try {
        return window.matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints || 0) > 0;
    } catch (e) { return false; }
}

function crEsVertical() {
    return typeof esPortraitPermitidoActivo === "function" && esPortraitPermitidoActivo();
}

function crTiempoActual() {
    const hay = typeof hayAudioCargado === "function" ? hayAudioCargado() : false;
    if (hay && typeof getMasterSongTime === "function") return getMasterSongTime();
    const ws = document.getElementById("scroll-workspace");
    return ws && typeof tiempoCancionDesdeScrollTop === "function" ? tiempoCancionDesdeScrollTop(ws.scrollTop) : 0;
}

function crEditorListo() {
    const ws = document.getElementById("editor-workspace");
    return !!(ws && ws.classList.contains("active") && typeof currentChartData !== "undefined" && currentChartData);
}

// Coloca una flecha en el carril c (0–7) en el tiempo actual. Devuelve su clave o null.
function colocarNotaCharteoRapido(c, tiempo) {
    if (!crEditorListo()) return null;
    const paso = (60 / currentChartData.bpm) / 4;
    const t = Number.isFinite(tiempo) ? tiempo : crTiempoActual();
    const total = Math.max(1, parseInt(currentChartData.totalRows, 10) || 1);
    const y = Math.max(0, t / paso);
    const fila = Math.max(0, Math.min(total - 1, Math.round(y)));
    const punto = Math.min(0.5, Math.max(-0.5, y - fila));
    const nota = typeof nuevaNotaGCD === "function" ? nuevaNotaGCD() : { len: 0 };
    if (typeof prepararNotaLibreNueva === "function") prepararNotaLibreNueva(nota, punto);
    else delete nota.off;
    // Evita duplicar una flecha casi en el mismo punto del mismo carril.
    const offNuevo = Number(nota.off) || 0;
    for (const k in currentChartData.notes) {
        const p = k.split("-");
        if (parseInt(p[1], 10) !== c || parseInt(p[0], 10) !== fila) continue;
        const o = Number(currentChartData.notes[k] && currentChartData.notes[k].off) || 0;
        if (Math.abs(o - offNuevo) < 0.05) { crDestello(c); return null; }
    }
    const key = typeof claveLibreNota === "function" ? claveLibreNota(fila, c) : `${fila}-${c}`;
    ejecutarEdicionChart("Charteo rápido", () => escribirNotaChart(key, nota));
    crDestello(c);
    return key;
}

// Alarga el sustain de una flecha recién puesta según cuánto se mantuvo.
function crAplicarSustain(key, segundos) {
    if (!key || !crEditorListo() || !currentChartData.notes[key]) return;
    const paso = (60 / currentChartData.bpm) / 4;
    const len = Math.floor(segundos / paso);
    if (len < 2) return; // toques cortos = flecha normal
    const nota = currentChartData.notes[key];
    ejecutarEdicionChart("Charteo rápido: sustain", () => escribirNotaChart(key, Object.assign({}, nota, { len })));
}

function crDestello(c) {
    document.querySelectorAll(`.cr-arrow[data-carril="${c}"], .cr-arrow[data-dir="${c % 4}"]`).forEach((b) => {
        b.classList.add("cr-pressed");
        setTimeout(() => b.classList.remove("cr-pressed"), 110);
    });
}

// ---------- teclado (PC) ----------
window.addEventListener("keydown", function (e) {
    if (!charteoRapidoActivo || !crEditorListo()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typeof esCampoDeTexto === "function" && esCampoDeTexto(e.target)) return;
    if (typeof hayModalAbiertoEditor === "function" && hayModalAbiertoEditor()) return;
    let c = CR_TECLAS_PLAYER[e.key];
    if (c === undefined) c = CR_TECLAS_OPONENTE[e.code];
    if (c === undefined) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat || crTeclasActivas.has(e.code)) return;
    const t0 = crTiempoActual();
    const key = colocarNotaCharteoRapido(c, t0);
    crTeclasActivas.set(e.code, { key, t0 });
}, true);

window.addEventListener("keyup", function (e) {
    const info = crTeclasActivas.get(e.code);
    if (!info) return;
    crTeclasActivas.delete(e.code);
    if (!charteoRapidoActivo) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (typeof isPlaying !== "undefined" && isPlaying) crAplicarSustain(info.key, crTiempoActual() - info.t0);
}, true);

window.addEventListener("blur", () => crTeclasActivas.clear());

// ---------- botones en pantalla ----------
function crCrearFlecha(dir, carril) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `cr-arrow note-col-${dir}`;
    b.dataset.dir = String(dir);
    if (carril !== null) b.dataset.carril = String(carril);
    b.setAttribute("aria-label", ["Izquierda", "Abajo", "Arriba", "Derecha"][dir]);
    b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const c = carril !== null ? carril : (crLadoVertical === "oponente" ? 4 + dir : dir);
        colocarNotaCharteoRapido(c);
    });
    return b;
}

function crConstruirUI() {
    if (document.getElementById("charteo-rapido-bar")) return;
    const bar = document.createElement("div");
    bar.id = "charteo-rapido-bar";
    bar.className = "charteo-rapido-bar";
    bar.setAttribute("aria-label", "Charteo Rápido");
    // Horizontal táctil: flechas bajo cada lado + Play al centro.
    const h = document.createElement("div");
    h.className = "cr-horizontal";
    const gOp = document.createElement("div"); gOp.className = "cr-grupo cr-grupo-oponente";
    const gPl = document.createElement("div"); gPl.className = "cr-grupo cr-grupo-player";
    for (let d = 0; d < 4; d++) { gOp.appendChild(crCrearFlecha(d, 4 + d)); gPl.appendChild(crCrearFlecha(d, d)); }
    const play = document.createElement("button");
    play.type = "button";
    play.id = "cr-play";
    play.className = "cr-play";
    play.setAttribute("aria-label", "Reproducir / Pausar");
    play.innerHTML = '<i class="fa-solid fa-play"></i>';
    play.addEventListener("click", () => { if (typeof togglePlayPause === "function") togglePlayPause(); crActualizarPlay(); });
    h.append(gOp, play, gPl);
    // Vertical: 4 flechas + selector de lado.
    const v = document.createElement("div");
    v.className = "cr-vertical";
    const fila = document.createElement("div"); fila.className = "cr-fila";
    for (let d = 0; d < 4; d++) fila.appendChild(crCrearFlecha(d, null));
    const sel = document.createElement("div");
    sel.className = "cr-selector";
    sel.setAttribute("role", "radiogroup");
    [["oponente", "Oponente"], ["player", "Player"]].forEach(([val, txt]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.lado = val;
        b.setAttribute("role", "radio");
        b.textContent = txt;
        b.addEventListener("click", () => { crLadoVertical = val; crActualizarSelector(); });
        sel.appendChild(b);
    });
    v.append(fila, sel);
    bar.append(h, v);
    const ref = document.getElementById("mobile-sustain-bar");
    if (ref && ref.parentNode) ref.parentNode.insertBefore(bar, ref.nextSibling);
    else document.body.appendChild(bar);
    crActualizarSelector();
}

function crActualizarSelector() {
    document.querySelectorAll("#charteo-rapido-bar .cr-selector button").forEach((b) => {
        const on = b.dataset.lado === crLadoVertical;
        b.classList.toggle("active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
    });
    const bar = document.getElementById("charteo-rapido-bar");
    if (bar) bar.classList.toggle("cr-lado-oponente", crLadoVertical === "oponente");
}

function crActualizarPlay() {
    const b = document.getElementById("cr-play");
    if (!b) return;
    const sonando = typeof isPlaying !== "undefined" && isPlaying;
    b.innerHTML = sonando ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    b.classList.toggle("playing", sonando);
}

// Alinea los grupos de flechas debajo de su lado de la grilla (horizontal táctil).
function crPosicionarGrupos() {
    if (!document.body.classList.contains("cr-touch")) return;
    const bar = document.getElementById("charteo-rapido-bar");
    if (!bar) return;
    const br = bar.getBoundingClientRect();
    [["cols-oponente", ".cr-grupo-oponente"], ["cols-jugador", ".cr-grupo-player"]].forEach(([id, sel]) => {
        const col = document.getElementById(id);
        const g = bar.querySelector(sel);
        if (!col || !g) return;
        const r = col.getBoundingClientRect();
        if (!r.width) return;
        g.style.left = `${Math.round(r.left - br.left)}px`;
        g.style.width = `${Math.round(r.width)}px`;
        g.style.setProperty("--cr-size", `${Math.max(28, Math.min(64, Math.round(r.width / 4) - 2))}px`);
    });
}

function crActualizarModo() {
    const b = document.body;
    const vertical = charteoRapidoActivo && crEsVertical();
    const tactil = charteoRapidoActivo && !vertical && crEsTactil();
    b.classList.toggle("charteo-rapido", charteoRapidoActivo);
    b.classList.toggle("cr-vertical", vertical);
    b.classList.toggle("cr-touch", tactil);
    const item = document.getElementById("menu-item-charteo-rapido");
    if (item) {
        item.classList.toggle("checked", charteoRapidoActivo);
        item.setAttribute("aria-checked", charteoRapidoActivo ? "true" : "false");
    }
    crActualizarPlay();
    if (tactil) requestAnimationFrame(crPosicionarGrupos);
}

function activarCharteoRapido(activo) {
    const nuevo = !!activo;
    if (nuevo === charteoRapidoActivo) return;
    charteoRapidoActivo = nuevo;
    crTeclasActivas.clear();
    crConstruirUI();
    if (nuevo) {
        crModoLibreAntes = typeof modoLibreActivo !== "undefined" ? modoLibreActivo : null;
        if (typeof activarModoLibre === "function" && !modoLibreActivo) {
            activarModoLibre(true);
            if (typeof cerrarVentanaModoLibre === "function") cerrarVentanaModoLibre();
        }
        if (typeof closeMobilePanels === "function") closeMobilePanels();
    } else if (crModoLibreAntes === false && typeof activarModoLibre === "function" && modoLibreActivo) {
        activarModoLibre(false);
    }
    crActualizarModo();
    if (typeof reajustarTrasCambioViewport === "function") requestAnimationFrame(() => reajustarTrasCambioViewport());
    if (typeof mostrarToastGCD === "function") {
        mostrarToastGCD(nuevo
            ? (crEsVertical() || crEsTactil() ? "Charteo Rápido activado: toca las flechas" : "Charteo Rápido: ← ↓ ↑ → Player · W A S D Oponente")
            : "Charteo Rápido desactivado");
    }
}

function alternarCharteoRapido() {
    document.getElementById("menu-extras-wrapper")?.classList.remove("open");
    activarCharteoRapido(!charteoRapidoActivo);
}

window.addEventListener("resize", () => { if (charteoRapidoActivo) crActualizarModo(); });
window.addEventListener("orientationchange", () => { if (charteoRapidoActivo) setTimeout(crActualizarModo, 150); });
setInterval(() => { if (charteoRapidoActivo) { crActualizarPlay(); crPosicionarGrupos(); } }, 400);
