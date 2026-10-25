// SOLUCIÓN BUG: Resetea todos los campos para evitar que las canciones se mezclen
function resetearFormularios() {
    const songName = document.getElementById("song-name");
    if(songName) songName.value = "Bopeebo";
    
    const songBpm = document.getElementById("song-bpm");
    if(songBpm) songBpm.value = "";

    const songAuthor = document.getElementById("song-author");
    if(songAuthor) songAuthor.value = "Kawai Sprite";

    const songCharter = document.getElementById("song-charter");
    if(songCharter) songCharter.value = "Deiby";
    
    // Lista de todos los inputs de archivos (Nuevos y de Re-vincular)
    const inputs = ['file-inst', 'file-inst-v1', 'file-inst-v2', 'file-re-inst', 'file-re-voice1', 'file-re-voice2'];
    const labels = ['label-inst', 'label-voice1', 'label-voice2', 'label-re-inst', 'label-re-voice1', 'label-re-voice2'];
    
    for(let i = 0; i < inputs.length; i++) {
        let inp = document.getElementById(inputs[i]);
        let lab = document.getElementById(labels[i]);
        if(inp) inp.value = ''; // Borra el archivo de la memoria del botón
        if(lab) lab.innerText = 'Ninguno'; // Restaura el texto visual
    }
}
 
const PORTRAIT_KEY = 'fnf_gcd_portrait_allowed';

function setPortraitMode(enabled) {
  document.body.classList.toggle('portrait-allowed', !!enabled);
  localStorage.setItem(PORTRAIT_KEY, enabled ? '1' : '0');
  document.querySelectorAll('.portrait-select-card').forEach(c => c.classList.remove('active-theme'));
  const btn = document.getElementById(enabled ? 'portrait-on-btn' : 'portrait-off-btn');
  if (btn) btn.classList.add('active-theme');
  if (!enabled) closeMobilePanels();
  if (typeof reajustarTrasCambioViewport === 'function') {
    requestAnimationFrame(() => reajustarTrasCambioViewport());
  }
}

function toggleMobilePanel(side) {
  const left = side === 'left';
  document.body.classList.toggle(left ? 'left-panel-open' : 'right-panel-open');
  if (left) document.body.classList.remove('right-panel-open');
  else document.body.classList.remove('left-panel-open');
}

function closeMobilePanels() {
  document.body.classList.remove('left-panel-open', 'right-panel-open');
}


function esPortraitPermitidoActivo() {
  return document.body.classList.contains('portrait-allowed')
    && window.matchMedia('(orientation: portrait)').matches;
}

window.onload = function () {
    cargarHitsound(); 
    renderizarProyectosArchivados();
    const workspace = document.getElementById("scroll-workspace");
    if (workspace) {
        workspace.addEventListener("click", function (e) {
            if (!e.target.closest(".grid-cell")) deseleccionarNotaActual();
        });
    }
    const allowed = localStorage.getItem(PORTRAIT_KEY) !== '0';
    setPortraitMode(allowed);
};

// v098: si ambas voces → enemy=v2 / player=v1; si no → Instrumental en ambos.
// Definición canónica también en audio.js; esta copia se alinea si audio.js no cargó.
function autoAjustarSelectoresDeWaveform(_tieneVoces) {
    if (typeof window !== 'undefined' && window._autoAjustarSelectoresDeWaveformAudio) {
        return window._autoAjustarSelectoresDeWaveformAudio(_tieneVoces);
    }
    const selE = document.getElementById('wave-select-enemy');
    const selP = document.getElementById('wave-select-player');
    if (!selE || !selP) return;
    const hayV1 = !!(typeof buffers !== 'undefined' && buffers && buffers.v1) || !!audioVoice1;
    const hayV2 = !!(typeof buffers !== 'undefined' && buffers && buffers.v2) || !!audioVoice2;
    if (hayV1 && hayV2) {
        selE.value = 'v2';
        selP.value = 'v1';
        return;
    }
    const hayInst = !!(typeof buffers !== 'undefined' && buffers && buffers.inst) || !!audioInst;
    selE.value = hayInst ? 'inst' : (hayV2 ? 'v2' : 'inst');
    selP.value = hayInst ? 'inst' : (hayV1 ? 'v1' : 'inst');
}
try { window.autoAjustarSelectoresDeWaveform = autoAjustarSelectoresDeWaveform; } catch (e) {}

function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".content-panel").forEach((panel) => panel.classList.remove("active"));
    const tabBtn = document.getElementById(`tab-${tabId}`);
    const panel = document.getElementById(`panel-${tabId}`);
    if (tabBtn) tabBtn.classList.add("active");
    if (panel) panel.classList.add("active");
    if (tabId === "stage") document.body.classList.add("stage-editor-mode");
    else document.body.classList.remove("stage-editor-mode");
}

function setTheme(themeName) {
    document.documentElement.setAttribute("data-theme", themeName);
    document.querySelectorAll(".theme-select-card:not(.portrait-select-card)").forEach((c) => c.classList.remove("active-theme"));
    document.getElementById(`theme-${themeName}-btn`).classList.add("active-theme");
}

function cambiarZoomDesdeAjustes(valor) {
    globalZoomFactor = parseFloat(valor);
    document.getElementById("zoom-val-display").innerText = globalZoomFactor.toFixed(2);
    if (currentChartData) {
        // Zoom no debe desincronizar: reloj = Inst, re-scroll + wave
        if (typeof resyncTrasCambioGrilla === 'function') resyncTrasCambioGrilla();
        else {
            actualizarAlturaScroll();
            if (typeof reposicionarScroll === 'function') reposicionarScroll(true);
        }
    }
}

function abrirModalNuevoChart() {
    irAPaso1();
    document.getElementById("modal-nuevo-chart").classList.add("active");
}

function cerrarModalNuevoChart() {
    document.getElementById("modal-nuevo-chart").classList.remove("active");
}

function irAPaso2() {
    const paso1 = document.getElementById('step-1');
    const paso2 = document.getElementById('step-2');
    if (paso1 && paso2) {
        paso1.style.display = 'none';
        paso1.classList.remove('active');
        paso2.style.display = 'block'; 
        paso2.classList.add('active');
    }
}

function irAPaso1() {
    const paso1 = document.getElementById('step-1');
    const paso2 = document.getElementById('step-2');
    if (paso1 && paso2) {
        paso2.style.display = 'none';
        paso2.classList.remove('active');
        paso1.style.display = 'block';
        paso1.classList.add('active');
    }
}

function actualizarNombreArchivo(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (input.files.length > 0) label.innerText = input.files[0].name;
}

async function crearProyectoFinalFiel() {
    const fileInst = document.getElementById("file-inst").files[0];
    const fileV1 = document.getElementById("file-inst-v1").files[0];
    const fileV2 = document.getElementById("file-inst-v2").files[0];
    
    if (!fileInst) { alert("El inst.ogg (Instrumental) es obligatorio."); return; }

    // v096: una sola voz es válida (se reproduce la que exista)
    // GUARDAR AUDIOS EN LAS VARIABLES PARA EL ZIP
    fileRawInst = fileInst;
    fileRawV1 = fileV1 || null;
    fileRawV2 = fileV2 || null;

    
    const bpmInput = parseFloat(document.getElementById("song-bpm").value.trim());
    const nameInput = document.getElementById("song-name").value.trim();

    if (!nameInput) { alert("Escribe el nombre de la canción."); return; }
    if (!Number.isFinite(bpmInput) || bpmInput < 20 || bpmInput > 400) {
        alert("Escribe un BPM válido entre 20 y 400.");
        return;
    }
    
    limpiarAudiosExistentes();
    const btn = document.getElementById("btn-crear-final");
    const oldText = btn.innerText;
    btn.innerText = "Procesando Audio...";
    btn.disabled = true;
    
    try {
        audioInst = crearElementoAudio(fileInst);
        if (fileV1) audioVoice1 = crearElementoAudio(fileV1);
        if (fileV2) audioVoice2 = crearElementoAudio(fileV2);
        buffers.inst = await decodeAudioFile(fileInst);
        buffers.v1 = await decodeAudioFile(fileV1);
        buffers.v2 = await decodeAudioFile(fileV2);
        if (typeof reconstruirCacheWaveforms === 'function') reconstruirCacheWaveforms();
        fijarVolumenPistas();
        if (typeof resetWaPlaybackState === 'function') resetWaPlaybackState();
        if (typeof sincronizarPistasAudio === 'function') sincronizarPistasAudio(0);

        const duracionSegundos = (buffers.inst && buffers.inst.duration)
            || (audioInst && audioInst.duration)
            || 0;
        if (!duracionSegundos) { alert("No se pudo obtener la duración del instrumental."); return; }
        const totalSteps = Math.ceil((bpmInput / 60) * duracionSegundos * 4);
        const filasFinales = Math.ceil(totalSteps / 16) * 16;
        
        currentChartData = {
            id: "chart_" + Date.now(), songName: nameInput, bpm: bpmInput,
            author: document.getElementById("song-author").value.trim(),
            charter: document.getElementById("song-charter").value.trim(),
            speed: parseFloat(document.getElementById("speed-dummy-input").value) || 1,
            player: "bf",
            girlfriend: "gf",
            opponent: "dad",
            album: "volume1",
            difficulty: 3,
            stage: "stage",
            totalRows: filasFinales, notes: {},
        };
        asegurarDificultadesChart(currentChartData);
        autoAjustarSelectoresDeWaveform(!!(fileV1 || fileV2));
        generarEstructuraGrilla(filasFinales);
        cargarDatosEnMesa(fileV1, fileV2, nameInput, bpmInput);
        cerrarModalNuevoChart();
        inicializarWorkspace();
        if (typeof refrescarWaveformsTrasCarga === 'function') refrescarWaveformsTrasCarga();
        else if (typeof actualizarWaveforms === 'function') setTimeout(() => actualizarWaveforms(null, true), 150);
        if (typeof actualizarMenuArchivar === "function") actualizarMenuArchivar();
    } catch (err) { alert("Ocurrió un error leyendo los audios."); } 
    finally { btn.innerText = oldText; btn.disabled = false; }
}

function cargarDatosEnMesa(v1, v2, name, bpm) {
    document.getElementById("track-player-label").innerText = v1 ? v1.name : "No Player Voice";
    document.getElementById("track-enemy-label").innerText = v2 ? v2.name : "No Enemy Voice";
    document.getElementById("display-song-name").innerText = name;
    document.getElementById("display-song-bpm").innerText = "BPM: " + bpm;
}

function sincronizarChartDesdeInterfaz() {
    if (!currentChartData) return null;

    const songName = document.getElementById("song-name")?.value.trim();
    const bpm = parseFloat(document.getElementById("song-bpm")?.value);
    const author = document.getElementById("song-author")?.value.trim();
    const charter = document.getElementById("song-charter")?.value.trim();
    const speed = parseFloat(document.getElementById("speed-dummy-input")?.value);

    if (songName) currentChartData.songName = songName;
    if (Number.isFinite(bpm) && bpm > 0) currentChartData.bpm = bpm;
    if (author !== undefined) currentChartData.author = author;
    if (charter !== undefined) currentChartData.charter = charter;
    if (Number.isFinite(speed) && speed > 0) currentChartData.speed = speed;
    return currentChartData;
}

// LOGICA DE BOTONES DE MENÚ Y EXPORTACIÓN
function toggleMenuArchivos(event) {
    if (event) event.stopPropagation();
    const archivos = document.getElementById("menu-archivos-wrapper");
    const windows = document.getElementById("menu-windows-wrapper");
    if (windows) windows.classList.remove("open");
    document.getElementById("menu-editor-wrapper")?.classList.remove("open");
    document.getElementById("menu-extras-wrapper")?.classList.remove("open");
    if (archivos) archivos.classList.toggle("open");
    if (typeof actualizarMenuArchivar === "function") actualizarMenuArchivar();
}
function toggleMenuWindows(event) {
    if (event) event.stopPropagation();
    const archivos = document.getElementById("menu-archivos-wrapper");
    const windows = document.getElementById("menu-windows-wrapper");
    if (archivos) archivos.classList.remove("open");
    document.getElementById("menu-editor-wrapper")?.classList.remove("open");
    document.getElementById("menu-extras-wrapper")?.classList.remove("open");
    if (windows) windows.classList.toggle("open");
    if (typeof actualizarMenuVisualizarPersonajes === "function") actualizarMenuVisualizarPersonajes();
}
// Cierra solo si el click/tap queda fuera de los wrappers (evita race táctil
// donde el click sintético cerraba el menú justo tras abrirlo).
window.addEventListener("click", function (e) {
    const archivos = document.getElementById("menu-archivos-wrapper");
    const windows = document.getElementById("menu-windows-wrapper");
    const t = e.target;
    if (archivos && !archivos.contains(t)) archivos.classList.remove("open");
    if (windows && !windows.contains(t)) windows.classList.remove("open");
});

function abrirVentanaEvents() {
    const ventana = document.getElementById("events-window");
    const wrapper = document.getElementById("menu-windows-wrapper");
    if (!ventana) return;
    ventana.classList.add("active");
    ventana.setAttribute("aria-hidden", "false");
    actualizarVentanaEvento();
    if (wrapper) wrapper.classList.remove("open");
}

function cerrarVentanaEvents() {
    const ventana = document.getElementById("events-window");
    if (!ventana) return;
    ventana.classList.remove("active");
    ventana.setAttribute("aria-hidden", "true");
}

function abrirVentanaMetadata() {
    const ventana = document.getElementById("metadata-window");
    const wrapper = document.getElementById("menu-windows-wrapper");
    if (!ventana) return;
    ventana.classList.add("active");
    ventana.classList.remove("minimized");
    ventana.setAttribute("aria-hidden", "false");
    actualizarMetadataEnInterfaz();
    if (wrapper) wrapper.classList.remove("open");
}

function cerrarVentanaMetadata() {
    const ventana = document.getElementById("metadata-window");
    if (!ventana) return;
    ventana.classList.remove("active");
    ventana.setAttribute("aria-hidden", "true");
}

function abrirVentanaHelp() {
    const ventana = document.getElementById("help-window");
    if (!ventana) return;
    ventana.classList.add("active");
    ventana.classList.remove("minimized");
    ventana.setAttribute("aria-hidden", "false");
}

function cerrarVentanaHelp() {
    const ventana = document.getElementById("help-window");
    if (!ventana) return;
    ventana.classList.remove("active");
    ventana.setAttribute("aria-hidden", "true");
}

function alternarMinimizarHelp() {
    const ventana = document.getElementById("help-window");
    const boton = ventana?.querySelector(".floating-window-minimize i");
    if (!ventana) return;
    ventana.classList.toggle("minimized");
    if (boton) boton.className = ventana.classList.contains("minimized") ? "fa-solid fa-square-plus" : "fa-solid fa-minus";
}

function alternarMinimizarMetadata() {
    const ventana = document.getElementById("metadata-window");
    const boton = ventana?.querySelector(".floating-window-minimize i");
    if (!ventana) return;
    ventana.classList.toggle("minimized");
    if (boton) boton.className = ventana.classList.contains("minimized") ? "fa-solid fa-square-plus" : "fa-solid fa-minus";
}

function actualizarMetadataEnInterfaz() {
    if (!currentChartData) return;
    const valores = {
        "metadata-song-name": currentChartData.songName || "",
        "metadata-composer": currentChartData.author || "",
        "metadata-charter": currentChartData.charter || "",
        "metadata-bpm": currentChartData.bpm || 160,
        "metadata-album": currentChartData.album || "volume1",
        "metadata-stickers": currentChartData.stickerPack || "",
        "metadata-difficulty": obtenerRatingDificultadGCD(currentChartData, dificultadActiva),
        "metadata-player": currentChartData.player || "bf",
        "metadata-girlfriend": currentChartData.girlfriend || "gf",
        "metadata-opponent": currentChartData.opponent || "dad",
        "metadata-stage": currentChartData.stage || "stage"
    };
    Object.entries(valores).forEach(([id, valor]) => {
        const campo = document.getElementById(id);
        if (campo) campo.value = valor;
    });
    const nombreDif = (typeof dificultadActiva === "string" && dificultadActiva) || "normal";
    const etiqueta = document.getElementById("metadata-difficulty-label");
    if (etiqueta) etiqueta.textContent = `Dificultad «${nombreDif}» (1-15)`;
    const estado = document.getElementById("metadata-variation-status");
    if (estado) {
        const v = typeof variacionActivaGCD === "function" ? variacionActivaGCD() : "default";
        estado.textContent = v === "default" ? "DEFAULT" : String(v).toUpperCase();
    }
}

// V0.8.2n: rating (1-15) por dificultad → playData.ratings de V-Slice.
function obtenerRatingDificultadGCD(datos, dificultad) {
    const r = datos && datos.ratings && typeof datos.ratings === "object" ? Number(datos.ratings[dificultad]) : NaN;
    if (Number.isFinite(r) && r > 0) return Math.min(15, Math.max(1, Math.round(r)));
    const d = parseInt(datos && datos.difficulty, 10);
    return Number.isFinite(d) && d > 0 ? Math.min(15, Math.max(1, d)) : 3;
}

function actualizarMetadataDesdeInterfaz() {
    if (!currentChartData) return;
    const leerTexto = (id) => document.getElementById(id)?.value.trim() || "";
    const bpm = parseFloat(document.getElementById("metadata-bpm")?.value);
    const dificultad = parseInt(document.getElementById("metadata-difficulty")?.value, 10);
    currentChartData.songName = leerTexto("metadata-song-name") || currentChartData.songName;
    currentChartData.author = leerTexto("metadata-composer");
    currentChartData.charter = leerTexto("metadata-charter");
    const bpmAnterior = currentChartData.bpm;
    if (Number.isFinite(bpm) && bpm >= 20 && bpm <= 400) currentChartData.bpm = bpm;
    currentChartData.album = leerTexto("metadata-album");
    if (Number.isInteger(dificultad)) {
        const nombreDif = (typeof dificultadActiva === "string" && dificultadActiva) || "normal";
        if (!currentChartData.ratings || typeof currentChartData.ratings !== "object") currentChartData.ratings = {};
        currentChartData.ratings[nombreDif] = Math.min(15, Math.max(1, dificultad));
    }
    currentChartData.stickerPack = leerTexto("metadata-stickers");
    currentChartData.player = leerTexto("metadata-player") || "bf";
    currentChartData.girlfriend = leerTexto("metadata-girlfriend") || "gf";
    currentChartData.opponent = leerTexto("metadata-opponent") || "dad";
    currentChartData.stage = leerTexto("metadata-stage") || "stage";
    if (typeof actualizarPanelPersonajes === "function") actualizarPanelPersonajes();
    document.getElementById("song-name").value = currentChartData.songName;
    document.getElementById("song-bpm").value = currentChartData.bpm;
    document.getElementById("song-author").value = currentChartData.author;
    document.getElementById("song-charter").value = currentChartData.charter;
    document.getElementById("display-song-name").innerText = currentChartData.songName;
    document.getElementById("display-song-bpm").innerText = "BPM: " + currentChartData.bpm;
    // BPM/grilla: re-mapear scroll desde tiempo del Inst (evita desync)
    if (Number.isFinite(bpm) && bpm !== bpmAnterior && typeof resyncTrasCambioGrilla === 'function') {
        resyncTrasCambioGrilla();
    }
    guardarProyectoActualLocalmente();
}

function guardarProyectoActualLocalmente() {
    if (!currentChartData?.id) return;
    const proyectos = (typeof leerProyectosArchivadosLS === "function")
        ? leerProyectosArchivadosLS()
        : (JSON.parse(localStorage.getItem("fnf_mobile_charts") || "[]") || []);
    const indice = proyectos.findIndex((proyecto) => proyecto.id === currentChartData.id);
    if (indice === -1) return;
    try {
        const limpio = (typeof clonLimpiarChartParaLS === "function")
            ? clonLimpiarChartParaLS(currentChartData)
            : JSON.parse(JSON.stringify({
                id: currentChartData.id,
                songName: currentChartData.songName,
                bpm: currentChartData.bpm,
                author: currentChartData.author,
                charter: currentChartData.charter,
                speed: currentChartData.speed,
                player: currentChartData.player,
                opponent: currentChartData.opponent,
                girlfriend: currentChartData.girlfriend,
                album: currentChartData.album,
                difficulty: currentChartData.difficulty,
                stage: currentChartData.stage,
                totalRows: currentChartData.totalRows,
                activeDifficulty: currentChartData.activeDifficulty,
                notes: currentChartData.notes || {},
                events: currentChartData.events || {},
                difficulties: currentChartData.difficulties,
                archivado: true
            }));
        delete limpio.audioBase64;
        proyectos[indice] = limpio;
        if (typeof guardarProyectosArchivadosLS === "function") {
            guardarProyectosArchivadosLS(proyectos);
        } else {
            localStorage.setItem("fnf_mobile_charts", JSON.stringify(proyectos));
        }
    } catch (e) {
        console.warn("No se pudo actualizar el proyecto archivado en localStorage", e);
    }
}

function alternarMinimizarEvents() {
    const ventana = document.getElementById("events-window");
    const boton = ventana?.querySelector(".floating-window-minimize i");
    if (!ventana) return;
    ventana.classList.toggle("minimized");
    if (boton) boton.className = ventana.classList.contains("minimized") ? "fa-solid fa-square-plus" : "fa-solid fa-minus";
}

function hacerVentanaEventsMovible() {
    const ventana = document.getElementById("events-window");
    const cabecera = document.getElementById("events-window-header");
    if (!ventana || !cabecera) return;

    let arrastrando = false;
    let offsetX = 0;
    let offsetY = 0;

    cabecera.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        if (typeof esPortraitPermitidoActivo === "function" && esPortraitPermitidoActivo()) return;
        const rect = ventana.getBoundingClientRect();
        arrastrando = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        cabecera.setPointerCapture(event.pointerId);
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

function hacerVentanaMetadataMovible() {
    const ventana = document.getElementById("metadata-window");
    const cabecera = document.getElementById("metadata-window-header");
    if (!ventana || !cabecera) return;
    let arrastrando = false;
    let offsetX = 0;
    let offsetY = 0;
    cabecera.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        if (typeof esPortraitPermitidoActivo === "function" && esPortraitPermitidoActivo()) return;
        const rect = ventana.getBoundingClientRect();
        arrastrando = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        cabecera.setPointerCapture(event.pointerId);
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

function hacerVentanaHelpMovible() {
    const ventana = document.getElementById("help-window");
    const cabecera = document.getElementById("help-window-header");
    if (!ventana || !cabecera) return;
    let arrastrando = false;
    let offsetX = 0;
    let offsetY = 0;
    cabecera.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        if (typeof esPortraitPermitidoActivo === "function" && esPortraitPermitidoActivo()) return;
        const rect = ventana.getBoundingClientRect();
        arrastrando = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        cabecera.setPointerCapture(event.pointerId);
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

function hacerVentanaDificultadMovible() {
    const ventana = document.getElementById("difficulty-window");
    const cabecera = document.getElementById("difficulty-window-header");
    if (!ventana || !cabecera) return;
    let arrastrando = false;
    let offsetX = 0;
    let offsetY = 0;
    cabecera.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        if (typeof esPortraitPermitidoActivo === "function" && esPortraitPermitidoActivo()) return;
        const rect = ventana.getBoundingClientRect();
        arrastrando = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        cabecera.setPointerCapture(event.pointerId);
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

window.addEventListener("load", () => {
    hacerVentanaEventsMovible();
    hacerVentanaMetadataMovible();
    hacerVentanaHelpMovible();
    hacerVentanaDificultadMovible();
});

function menuNuevoChart() { 
    exitEditor(); 
    resetearFormularios(); // <-- Purgamos por si acaso
    abrirModalNuevoChart(); 
}

// menuArchivarChart / blob audio → js/archivador.js (IndexedDB + localStorage limpio)

// ==========================================
// --- EXPORTAR ARCHIVO .FNFC CON AUDIOS ---
// ==========================================
function convertirNotasVSlice(notas, stepDuration) {
    return Object.entries(notas || {}).map(([key, nota]) => {
        const [row, col] = key.split("-").map((valor) => parseInt(valor, 10));
        if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
        // V0.8.2k Modo Libre: "off" (fracción de casilla) solo cambia el tiempo; no se exporta.
        const off = Number(nota?.off) || 0;
        const salida = {
            "t": off ? Math.round((row + off) * stepDuration * 1000 * 1000) / 1000 : row * stepDuration * 1000,
            "d": col,
            "l": (parseInt(nota?.len, 10) || 0) * stepDuration * 1000
        };
        // V0.8.2 Note Events: kind ("k") y params ("p") como en V-Slice.
        const kind = nota && nota.kind !== undefined && nota.kind !== null ? String(nota.kind).trim() : "";
        if (kind && kind.toLowerCase() !== "normal") {
            salida.k = kind;
            salida.p = Array.isArray(nota.params)
                ? nota.params.filter((p) => p && typeof p.name === "string").map((p) => ({ "n": p.name, "v": p.value })) // NoteParamData de V-Slice: @:alias("n") / @:alias("v")
                : [];
        } else {
            salida.p = [];
        }
        return salida;
    }).filter(Boolean).sort((a, b) => a.t - b.t);
}

function convertirEventosVSlice(eventos, stepDuration) {
    // V0.8.2k: eventos pegados ("fila~1"...) salen por separado con la misma "t", en su orden.
    const pila = (k) => (typeof indicePilaClaveEvento === "function" ? indicePilaClaveEvento(k) : 0);
    const entradas = Object.entries(eventos || {}).sort((a, b) => (parseInt(a[0], 10) - parseInt(b[0], 10)) || (pila(a[0]) - pila(b[0])));
    return entradas.map(([row, evento]) => {
        const fila = parseInt(row, 10);
        if (!Number.isInteger(fila) || !evento) return null;
        // V0.8.2 Event Update: los demás tipos se exportan con su id V-Slice y su "v".
        if (typeof exportarEventoVSliceGCD === "function") {
            const otro = exportarEventoVSliceGCD(evento, fila * stepDuration * 1000);
            if (otro) return otro;
        }
        // V-Slice (FocusCameraSongEvent): char -1=Position, 0=player, 1=opponent, 2=gf
        // V0.8.2m: se escriben la duración y el ease reales (antes siempre 4 / CLASSIC)
        // y Position sale con char -1 como en el juego (antes no llevaba char).
        const targetToChar = { opponent: 1, player: 0, gf: 2, position: -1 };
        const dur = Number(evento.duration);
        const valores = {
            "x": Number(evento.offsetX) || 0,
            "duration": Number.isFinite(dur) ? Math.max(0, dur) : 4,
            "y": Number(evento.offsetY) || 0,
            "ease": evento.effect === undefined || evento.effect === null || evento.effect === "" ? "CLASSIC" : String(evento.effect)
        };
        valores.char = Object.prototype.hasOwnProperty.call(targetToChar, evento.target)
            ? targetToChar[evento.target]
            : 0;
        // Claves extra que traía el chart (easeDir, etc.).
        if (evento.extraV && typeof evento.extraV === "object") {
            Object.keys(evento.extraV).forEach((k) => {
                if (!Object.prototype.hasOwnProperty.call(valores, k)) valores[k] = JSON.parse(JSON.stringify(evento.extraV[k]));
            });
        }
        return {
            "t": fila * stepDuration * 1000,
            "e": "FocusCamera",
            "v": valores
        };
    }).filter(Boolean); // ya van ordenados por fila y por posición en la casilla
}

// V0.8.2j: arma song-metadata / song-chart de V-Slice para una carpeta (Default o variación).
// "bf-erect" en la variación erect → "bf" (el sufijo solo va en el nombre del .ogg).
function vozBaseGCD(id, variacion) {
    const v = String(id || "");
    const suf = variacion && variacion !== "default" ? "-" + String(variacion).toLowerCase() : "";
    return suf && v.toLowerCase().endsWith(suf) && v.length > suf.length ? v.slice(0, -suf.length) : v;
}

function construirJsonVSliceGCD(datos, opciones = {}) {
    const esDefault = !opciones.variacion || opciones.variacion === "default";
    const inputSongName = datos?.songName || "Bopeebo";
    const inputBPM = datos?.bpm || 100;
    const inputArtist = datos?.author || "Kawai Sprite";
    const inputCharter = datos?.charter || "Deiby";
    const inputSpeed = datos?.speed || 1;
    const inputAlbum = datos?.album || "volume1";
    const inputStickers = String(datos?.stickerPack || "").trim();
    const inputPlayer = datos?.player || "bf";
    const inputGirlfriend = datos?.girlfriend || "gf";
    const inputOpponent = datos?.opponent || "dad";
    const inputStage = datos?.stage || "stage";

    const notasActivas = datos?.notes || {};

    // Orden canónico de dificultades
    const ORDEN_DIFICULTADES = ["easy", "normal", "hard"];

    const dificultadesRaw = datos?.difficulties
        ? { ...datos.difficulties }
        : { normal: { notes: notasActivas, events: datos?.events || {} } };

    // Asegurar que la dificultad activa esté representada también (por si acaso)
    if (datos?.activeDifficulty && !dificultadesRaw[datos.activeDifficulty]) {
        dificultadesRaw[datos.activeDifficulty] = { notes: datos.notes || {}, events: datos.events || {} };
    }

    function dificultadTieneContenido(diff) {
        if (!diff || typeof diff !== "object") return false;
        const tieneNotes = diff.notes && typeof diff.notes === "object" && Object.keys(diff.notes).length > 0;
        const tieneEvents = diff.events && typeof diff.events === "object" && Object.keys(diff.events).length > 0;
        return tieneNotes || tieneEvents;
    }

    // Default: easy → normal → hard (solo con contenido) y luego las añadidas (siempre).
    // Variación: todas sus dificultades, en su orden.
    const ordenadas = [];
    if (esDefault) {
        ORDEN_DIFICULTADES.forEach((nombre) => {
            if (dificultadesRaw[nombre] && dificultadTieneContenido(dificultadesRaw[nombre])) ordenadas.push(nombre);
        });
        Object.keys(dificultadesRaw).forEach((nombre) => {
            if (ORDEN_DIFICULTADES.indexOf(nombre) === -1) ordenadas.push(nombre);
        });
    } else {
        Object.keys(dificultadesRaw).forEach((nombre) => ordenadas.push(nombre));
    }

    // Por si acaso no hay NINGUNA, forzamos normal con lo activo
    if (ordenadas.length === 0) {
        ordenadas.push("normal");
        dificultadesRaw.normal = { notes: notasActivas, events: datos?.events || {} };
    }

    const velocidades = datos?.scrollSpeeds || {};
    const ratingsEntries = {};
    ordenadas.forEach((nombre) => { ratingsEntries[nombre] = obtenerRatingDificultadGCD(datos, nombre); });
    const scrollSpeedEntries = {};
    ordenadas.forEach((nombre) => {
        const v = nombre === datos?.activeDifficulty ? inputSpeed : parseFloat(velocidades[nombre]);
        scrollSpeedEntries[nombre] = Number.isFinite(v) && v > 0 ? v : inputSpeed;
    });

    const metadataData = {
        "version": "2.2.4",
        "songName": inputSongName,
        "artist": inputArtist,
        "charter": inputCharter,
        "divisions": 96,
        "looped": false,
        "offsets": {
            "instrumental": 0,
            "altInstrumentals": {},
            "vocals": {},
            "altVocals": {}
        },
        "playData": {
            "songVariations": esDefault ? (opciones.songVariations || []).slice() : [],
            "difficulties": ordenadas.slice(),
            "characters": {
                "player": inputPlayer,
                "girlfriend": inputGirlfriend,
                "opponent": inputOpponent,
                "instrumental": opciones.instrumental || "",
                "altInstrumentals": [],
                // Siempre el id base (sin "-<variación>"), como en V-Slice oficial.
                "opponentVocals": [vozBaseGCD(inputOpponent, opciones.variacion)],
                "playerVocals": [vozBaseGCD(inputPlayer, opciones.variacion)]
            },
            "stage": inputStage,
            "album": inputAlbum,
            "noteStyle": "funkin",
            "ratings": ratingsEntries,
            "previewStart": 0,
            "previewEnd": 0
        },
        "generatedBy": "Chart Editor GCD",
        "timeFormat": "ms",
        "timeChanges": [
            { "t": 0, "b": 0, "bpm": inputBPM, "n": 4, "d": 4 }
        ]
    };
    // stickerPack es opcional en V-Slice: vacío = stickers del personaje.
    if (inputStickers) {
        const pd = metadataData.playData, orden = {};
        Object.keys(pd).forEach((k) => { if (k === "album") orden.stickerPack = inputStickers; orden[k] = pd[k]; });
        metadataData.playData = orden;
    }
    if (!esDefault) metadataData.variation = opciones.variacion;

    // - notes: por dificultad.
    // - events: UN SOLO ARRAY GLOBAL a nivel raíz (eventos compartidos en el editor).
    const stepDuration = (60 / inputBPM) / 4;
    const vSliceNotes = {};
    ordenadas.forEach((nombre) => {
        const diff = dificultadesRaw[nombre] || { notes: {}, events: {} };
        const notas = nombre === datos?.activeDifficulty && datos?.notes ? datos.notes : diff.notes;
        vSliceNotes[nombre] = convertirNotasVSlice(notas, stepDuration);
    });
    const eventosCompartidos = datos?.events
        || (ordenadas[0] && dificultadesRaw[ordenadas[0]]?.events)
        || {};
    const vSliceEvents = convertirEventosVSlice(eventosCompartidos, stepDuration);

    const chartData = {
        "version": "2.0.0",
        "scrollSpeed": scrollSpeedEntries,
        "events": vSliceEvents,
        "notes": vSliceNotes,
        "generatedBy": "Chart Editor GCD"
    };
    return { metadataData, chartData, ordenadas };
}

// V0.8.2n: id de canción (nombre de archivo). El .fnfc usa el songName de la variación DEFAULT.
function idCancionGCD(nombre) {
    return String(nombre || "Bopeebo").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "song";
}
function idArchivoAudioGCD(texto) {
    return String(texto || "").trim().replace(/[\\/:*?"<>|\s]+/g, "-");
}
function esArchivoAudioGCD(f) { return f instanceof Blob && f.size > 0; }

// Prepara todo lo que va dentro del .fnfc (mismos nombres que usa V-Slice):
//   <id>-metadata.json / <id>-chart.json (+ -<var>), Inst.ogg, Voices-<player>.ogg,
//   Voices-<opponent>.ogg, Inst-<var>.ogg, Voices-<player>-<var>.ogg, Voices-<opponent>-<var>.ogg.
function construirContenidoFNFCGCD() {
    const chartActual = sincronizarChartDesdeInterfaz();
    if (typeof guardarVelocidadDificultad === "function") guardarVelocidadDificultad();
    guardarDificultadActiva();
    const tieneVar = typeof listaVariacionesGCD === "function";
    const variaciones = tieneVar ? listaVariacionesGCD().filter((id) => id !== "default") : [];
    const datosDefault = typeof datosVariacionGCD === "function" ? (datosVariacionGCD("default") || chartActual) : chartActual;
    const audiosDefault = typeof audiosDeVariacionGCD === "function"
        ? audiosDeVariacionGCD("default")
        : { inst: fileRawInst, v1: fileRawV1, v2: fileRawV2 };
    // V0.8.2n-2: el .fnfc (y sus json / manifest) usan el nombre de la variación DEFAULT.
    const songNameId = idCancionGCD(datosDefault?.songName || chartActual?.songName);
    const archivos = []; // [nombre, contenido]
    const jsons = {};    // var -> { metadata, chart }

    const playerDef = idArchivoAudioGCD(datosDefault?.player || "bf");
    const opponentDef = idArchivoAudioGCD(datosDefault?.opponent || "dad");
    const base = construirJsonVSliceGCD(datosDefault, { variacion: "default", songVariations: variaciones });
    jsons.default = { metadata: base.metadataData, chart: base.chartData };
    archivos.push([`${songNameId}-metadata.json`, JSON.stringify(base.metadataData, null, 2)]);
    archivos.push([`${songNameId}-chart.json`, JSON.stringify(base.chartData, null, 2)]);
    if (esArchivoAudioGCD(audiosDefault.inst)) archivos.push(["Inst.ogg", audiosDefault.inst]);
    if (esArchivoAudioGCD(audiosDefault.v1)) archivos.push([`Voices-${playerDef}.ogg`, audiosDefault.v1]);
    if (esArchivoAudioGCD(audiosDefault.v2) && opponentDef !== playerDef) archivos.push([`Voices-${opponentDef}.ogg`, audiosDefault.v2]);

    variaciones.forEach((id) => {
        const datos = datosVariacionGCD(id);
        if (!datos) return;
        const a = audiosDeVariacionGCD(id);
        const instPropio = esArchivoAudioGCD(a.inst) && a.inst !== audiosDefault.inst;
        const instId = instPropio ? idArchivoAudioGCD((datos.metaExtra && datos.metaExtra.instrumental) || id) : "";
        const r = construirJsonVSliceGCD(datos, { variacion: id, instrumental: instId });
        jsons[id] = { metadata: r.metadataData, chart: r.chartData };
        archivos.push([`${songNameId}-metadata-${id}.json`, JSON.stringify(r.metadataData, null, 2)]);
        archivos.push([`${songNameId}-chart-${id}.json`, JSON.stringify(r.chartData, null, 2)]);
        if (instPropio) archivos.push([`Inst-${instId}.ogg`, a.inst]);
        // Voces: si es el mismo audio Y el mismo personaje que Default, el juego cae a Voices-<personaje>.ogg.
        const pj = idArchivoAudioGCD(datos.player || "bf");
        const op = idArchivoAudioGCD(datos.opponent || "dad");
        if (esArchivoAudioGCD(a.v1) && (a.v1 !== audiosDefault.v1 || pj !== playerDef)) archivos.push([`Voices-${pj}-${id}.ogg`, a.v1]);
        if (esArchivoAudioGCD(a.v2) && op !== pj && (a.v2 !== audiosDefault.v2 || op !== opponentDef)) archivos.push([`Voices-${op}-${id}.ogg`, a.v2]);
    });
    archivos.push(["manifest.json", JSON.stringify({ version: "1.0.0", songId: songNameId }, null, 2)]);
    return { songNameId, archivos, jsons };
}

function descargarBlobGCD(contenido, nombre) {
    const url = URL.createObjectURL(contenido);
    const dlElem = document.createElement("a");
    dlElem.setAttribute("href", url);
    dlElem.setAttribute("download", nombre);
    document.body.appendChild(dlElem);
    dlElem.click();
    document.body.removeChild(dlElem);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function menuGuardarChartTo() {
    if (!currentChartData) return;
    const { songNameId, archivos } = construirContenidoFNFCGCD();
    const zip = new JSZip();
    archivos.forEach(([nombre, contenido]) => zip.file(nombre, contenido));
    zip.generateAsync({ type: "blob" }).then(function (content) {
        descargarBlobGCD(content, `${songNameId}.fnfc`);
    }).catch(err => {
        alert("Error al estructurar el chart con audios.");
        console.error(err);
    });
}

// Ventana Dificultad → Descargar Chart / Descargar Metadata (variación actual,
// mismo formato y nombre que dentro del .fnfc).
function descargarJsonVariacionActivaGCD(tipo) {
    if (!currentChartData) return;
    try {
        const { songNameId, jsons } = construirContenidoFNFCGCD();
        const v = typeof variacionActivaGCD === "function" ? variacionActivaGCD() : "default";
        const par = jsons[v] || jsons.default;
        const clave = tipo === "metadata" ? "metadata" : "chart";
        const nombre = `${songNameId}-${clave}${v !== "default" ? "-" + v : ""}.json`;
        descargarBlobGCD(new Blob([JSON.stringify(par[clave], null, 2)], { type: "application/json" }), nombre);
        if (typeof mostrarToastGCD === "function") mostrarToastGCD(`Descargado ${nombre}`);
    } catch (err) {
        console.error("[Descargar JSON]", err);
        alert("No se pudo generar el JSON de la variación actual.");
    }
}

function menuExit() { exitEditor(); }

function exitEditor() {
    limpiarAudiosExistentes();
    cerrarVentanaDificultad();
    cerrarVentanaEvents();
    cerrarVentanaMetadata();
    cerrarVentanaHelp();
    if (typeof cerrarVisualizarPersonajes === "function") cerrarVisualizarPersonajes();
    if (typeof cerrarVentanaNoteEvents === "function") cerrarVentanaNoteEvents();
    resetearFormularios(); // <-- Purgamos formularios al salir
    document.getElementById("editor-workspace").classList.remove("active");
    document.getElementById("main-menu").classList.remove("hidden");
    renderizarProyectosArchivados();
}

// ==========================================
// --- RE-VINCULAR AUDIOS A UN CHART ARCHIVADO ---
// ==========================================

function abrirModalReVincularAudios() {
    // Solo limpia los selectores de este modal (resetearFormularios cambiaba el nombre de la canción a "Bopeebo").
    [["file-re-inst", "label-re-inst"], ["file-re-voice1", "label-re-voice1"], ["file-re-voice2", "label-re-voice2"]].forEach(([i, l]) => {
        const inp = document.getElementById(i), lab = document.getElementById(l);
        if (inp) inp.value = "";
        if (lab) lab.innerText = "Ninguno";
    });
    const info = document.getElementById("revincular-variacion-info");
    if (info && currentChartData) {
        const v = typeof variacionActivaGCD === "function" ? variacionActivaGCD() : "default";
        const pj = currentChartData.player || "bf", op = currentChartData.opponent || "dad";
        const suf = v === "default" ? "" : "-" + v;
        info.innerHTML = `Variación: <b>${v === "default" ? "Default" : v}</b> — los audios se vinculan solo a esta variación ` +
            `(se exportan como Inst${suf}.ogg, Voices-${pj}${suf}.ogg y Voices-${op}${suf}.ogg).`;
    }
    document.getElementById("modal-revincular-audio").classList.add("active");
}

function cerrarModalReVincularAudios() {
    document.getElementById("modal-revincular-audio").classList.remove("active");
}

async function procesarReVinculacionAudios() {
    const fileInst = document.getElementById("file-re-inst").files[0];
    const fileV1 = document.getElementById("file-re-voice1").files[0];
    const fileV2 = document.getElementById("file-re-voice2").files[0];

    if (!fileInst) {
        alert("El inst (Instrumental) es obligatorio para poder escuchar la música.");
        return;
    }

    // v096: una sola voz es válida
    if (isPlaying) togglePlayPause();

    const btn = document.getElementById("btn-revincular-final");
    const oldText = btn.innerHTML;
    btn.innerHTML = "Cargando...";
    btn.disabled = true;

    try {
        // Liberamos WA + HTMLAudio anteriores
        if (typeof resetWaPlaybackState === 'function') resetWaPlaybackState();
        if (audioInst) { audioInst.pause(); audioInst = null; }
        if (audioVoice1) { audioVoice1.pause(); audioVoice1 = null; }
        if (audioVoice2) { audioVoice2.pause(); audioVoice2 = null; }
        
        // v096: HTMLAudio es playback primario; buffers solo para waveforms
        audioInst = crearElementoAudio(fileInst);
        if (fileV1) audioVoice1 = crearElementoAudio(fileV1);
        if (fileV2) audioVoice2 = crearElementoAudio(fileV2);

        buffers.inst = await decodeAudioFile(fileInst);
        buffers.v1 = await decodeAudioFile(fileV1);
        buffers.v2 = await decodeAudioFile(fileV2);
        if (typeof reconstruirCacheWaveforms === 'function') reconstruirCacheWaveforms();
        fijarVolumenPistas();
        aplicarMuteEstadosUI();

        fileRawInst = fileInst;
        fileRawV1 = fileV1 || null;
        fileRawV2 = fileV2 || null;
        autoAjustarSelectoresDeWaveform(!!(fileV1 || fileV2));
        cargarDatosEnMesa(fileV1, fileV2, currentChartData.songName, currentChartData.bpm);

        if (typeof resetWaPlaybackState === 'function') resetWaPlaybackState();
        sincronizarPistasAudio(0);
        if (typeof refrescarWaveformsTrasCarga === 'function') refrescarWaveformsTrasCarga();
        else if (typeof actualizarWaveforms === 'function') actualizarWaveforms(0, true);
        
        // Guardar en el archivador (IndexedDB) si el chart ya está archivado.
        if (currentChartData && currentChartData.id && typeof chartEstaEnArchivador === "function" && chartEstaEnArchivador() && typeof idbPutAudios === "function") {
            try {
                await idbPutAudios(currentChartData.id, { inst: fileRawInst || undefined, v1: fileRawV1 || undefined, v2: fileRawV2 || undefined });
            } catch (e) { console.warn("No se pudieron guardar los audios re-vinculados", e); }
        }
        if (typeof mostrarToastGCD === "function") {
            const v = typeof variacionActivaGCD === "function" ? variacionActivaGCD() : "default";
            mostrarToastGCD(`Audios vinculados a ${v === "default" ? "Default" : v}`);
        }
        cerrarModalReVincularAudios();
        
    } catch (err) {
        alert("Ocurrió un error leyendo los audios.");
        console.error(err);
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
}
