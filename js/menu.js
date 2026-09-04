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
 
window.onload = function () {
    cargarHitsound(); 
    renderizarProyectosArchivados();
    const workspace = document.getElementById("scroll-workspace");
    if (workspace) {
        workspace.addEventListener("click", function (e) {
            if (!e.target.closest(".grid-cell")) deseleccionarNotaActual();
        });
    }
};

// Ayudante inteligente para cambiar la Waveform
function autoAjustarSelectoresDeWaveform(tieneVoces) {
    if (!tieneVoces) {
        document.getElementById('wave-select-enemy').value = 'inst';
        document.getElementById('wave-select-player').value = 'inst';
    } else {
        document.getElementById('wave-select-enemy').value = 'v2';
        document.getElementById('wave-select-player').value = 'v1';
    }
}

function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".content-panel").forEach((panel) => panel.classList.remove("active"));
    document.getElementById(`tab-${tabId}`).classList.add("active");
    document.getElementById(`panel-${tabId}`).classList.add("active");
}

function setTheme(themeName) {
    document.documentElement.setAttribute("data-theme", themeName);
    document.querySelectorAll(".theme-select-card").forEach((c) => c.classList.remove("active-theme"));
    document.getElementById(`theme-${themeName}-btn`).classList.add("active-theme");
}

function cambiarZoomDesdeAjustes(valor) {
    globalZoomFactor = parseFloat(valor);
    document.getElementById("zoom-val-display").innerText = globalZoomFactor.toFixed(2);
    if (currentChartData) {
        actualizarAlturaScroll();
        reposicionarScroll();
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

    if ((fileV1 && !fileV2) || (!fileV1 && fileV2)) {
        alert("¡Error de Voces!\nSi agregas la pista de voz de un personaje, obligatoriamente debes agregar la del otro.\n(Sube las dos voces, o no subas ninguna).");
        return; 
    }
    
    // GUARDAR AUDIOS EN LAS VARIABLES PARA EL ZIP
    fileRawInst = fileInst;
    fileRawV1 = fileV1 || null;
    fileRawV2 = fileV2 || null;

    // NUEVO: CONDICIÓN ESTRICTA DE VOCES
    if ((fileV1 && !fileV2) || (!fileV1 && fileV2)) {
        alert("¡Error de Voces!\nSi agregas la pista de voz de un personaje, obligatoriamente debes agregar la del otro.\n(Sube las dos voces, o no subas ninguna).");
        return; // Detiene el proceso
    }
    
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
        audioInst = new Audio(URL.createObjectURL(fileInst));
        if (fileV1) audioVoice1 = new Audio(URL.createObjectURL(fileV1));
        if (fileV2) audioVoice2 = new Audio(URL.createObjectURL(fileV2));
        buffers.inst = await decodeAudioFile(fileInst);
        buffers.v1 = await decodeAudioFile(fileV1);
        buffers.v2 = await decodeAudioFile(fileV2);
        
        const duracionSegundos = buffers.inst.duration;
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
        autoAjustarSelectoresDeWaveform(fileV1 && fileV2);
        generarEstructuraGrilla(filasFinales);
        cargarDatosEnMesa(fileV1, fileV2, nameInput, bpmInput);
        cerrarModalNuevoChart();
        inicializarWorkspace();
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
    event.stopPropagation();
    document.getElementById("menu-archivos-wrapper").classList.toggle("open");
}
function toggleMenuWindows(event) {
    event.stopPropagation();
    document.getElementById("menu-windows-wrapper").classList.toggle("open");
}
window.addEventListener("click", function () {
    const wrapper = document.getElementById("menu-archivos-wrapper");
    if (wrapper) wrapper.classList.remove("open");
    const windowsWrapper = document.getElementById("menu-windows-wrapper");
    if (windowsWrapper) windowsWrapper.classList.remove("open");
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
        "metadata-difficulty": currentChartData.difficulty || 3,
        "metadata-player": currentChartData.player || "bf",
        "metadata-girlfriend": currentChartData.girlfriend || "gf",
        "metadata-opponent": currentChartData.opponent || "dad",
        "metadata-stage": currentChartData.stage || "stage"
    };
    Object.entries(valores).forEach(([id, valor]) => {
        const campo = document.getElementById(id);
        if (campo) campo.value = valor;
    });
}

function actualizarMetadataDesdeInterfaz() {
    if (!currentChartData) return;
    const leerTexto = (id) => document.getElementById(id)?.value.trim() || "";
    const bpm = parseFloat(document.getElementById("metadata-bpm")?.value);
    const dificultad = parseInt(document.getElementById("metadata-difficulty")?.value, 10);
    currentChartData.songName = leerTexto("metadata-song-name") || currentChartData.songName;
    currentChartData.author = leerTexto("metadata-composer");
    currentChartData.charter = leerTexto("metadata-charter");
    if (Number.isFinite(bpm) && bpm >= 20 && bpm <= 400) currentChartData.bpm = bpm;
    currentChartData.album = leerTexto("metadata-album");
    if (Number.isInteger(dificultad)) currentChartData.difficulty = Math.min(15, Math.max(1, dificultad));
    currentChartData.player = leerTexto("metadata-player") || "bf";
    currentChartData.girlfriend = leerTexto("metadata-girlfriend") || "gf";
    currentChartData.opponent = leerTexto("metadata-opponent") || "dad";
    currentChartData.stage = leerTexto("metadata-stage") || "stage";
    document.getElementById("song-name").value = currentChartData.songName;
    document.getElementById("song-bpm").value = currentChartData.bpm;
    document.getElementById("song-author").value = currentChartData.author;
    document.getElementById("song-charter").value = currentChartData.charter;
    document.getElementById("display-song-name").innerText = currentChartData.songName;
    document.getElementById("display-song-bpm").innerText = "BPM: " + currentChartData.bpm;
    guardarProyectoActualLocalmente();
}

function guardarProyectoActualLocalmente() {
    if (!currentChartData?.id) return;
    const proyectos = JSON.parse(localStorage.getItem("fnf_mobile_charts")) || [];
    const indice = proyectos.findIndex((proyecto) => proyecto.id === currentChartData.id);
    if (indice === -1) return;
    proyectos[indice] = currentChartData;
    localStorage.setItem("fnf_mobile_charts", JSON.stringify(proyectos));
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

// NUEVA FUNCIÓN: Guarda el estado actual en el localStorage del navegador
async function menuArchivarChart() {
    if (!currentChartData) {
        alert("No hay ningún chart abierto para archivar.");
        return;
    }

    sincronizarChartDesdeInterfaz();
    let proyectos = JSON.parse(localStorage.getItem("fnf_mobile_charts")) || [];
    if (!currentChartData.id) {
        currentChartData.id = "chart_" + Date.now();
    }

    // Convertir los audios cargados en formato base64 para almacenarlos sin perderlos
    const audioData = {};
    if (fileRawInst) audioData.inst = await blobToBase64(fileRawInst);
    if (fileRawV1) audioData.v1 = await blobToBase64(fileRawV1);
    if (fileRawV2) audioData.v2 = await blobToBase64(fileRawV2);

    currentChartData.audioBase64 = audioData;

    const index = proyectos.findIndex((p) => p.id === currentChartData.id);
    if (index !== -1) {
        proyectos[index] = currentChartData;
    } else {
        proyectos.push(currentChartData);
    }

    try {
        localStorage.setItem("fnf_mobile_charts", JSON.stringify(proyectos));
        alert("¡Chart y audios archivados exitosamente en la memoria de tu navegador!");
    } catch (e) {
        alert("Atención: El archivo de audio es muy grande para el almacenamiento local del navegador. Se guardará únicamente el chart de notas.");
        delete currentChartData.audioBase64;
        localStorage.setItem("fnf_mobile_charts", JSON.stringify(proyectos));
    }
}

// Convertidor auxiliar de archivos Blob a String Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ==========================================
// --- EXPORTAR ARCHIVO .FNFC CON AUDIOS ---
// ==========================================
function convertirNotasVSlice(notas, stepDuration) {
    return Object.entries(notas || {}).map(([key, nota]) => {
        const [row, col] = key.split("-").map((valor) => parseInt(valor, 10));
        if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
        return {
            "t": row * stepDuration * 1000,
            "d": col,
            "l": (parseInt(nota?.len, 10) || 0) * stepDuration * 1000,
            "p": []
        };
    }).filter(Boolean).sort((a, b) => a.t - b.t);
}

function convertirEventosVSlice(eventos, stepDuration) {
    return Object.entries(eventos || {}).map(([row, evento]) => {
        const fila = parseInt(row, 10);
        if (!Number.isInteger(fila) || !evento) return null;
        const targetToChar = { opponent: 0, player: 1, gf: 2 };
        return {
            "t": fila * stepDuration * 1000,
            "e": "FocusCamera",
            "v": {
                "x": Number(evento.offsetX) || 0,
                "duration": 4,
                "y": Number(evento.offsetY) || 0,
                "ease": "CLASSIC",
                "char": targetToChar[evento.target] ?? 0
            }
        };
    }).filter(Boolean).sort((a, b) => a.t - b.t);
}

function menuGuardarChartTo() {
    const chartActual = sincronizarChartDesdeInterfaz();
    guardarDificultadActiva();
    const inputSongName = chartActual?.songName || "Bopeebo";
    const inputBPM = chartActual?.bpm || 100;
    const inputArtist = chartActual?.author || "Kawai Sprite";
    const inputCharter = chartActual?.charter || "Deiby";
    const inputSpeed = chartActual?.speed || 1;
    const inputAlbum = chartActual?.album || "volume1";
    const inputDifficulty = Math.min(15, Math.max(1, parseInt(chartActual?.difficulty, 10) || 3));
    const inputPlayer = chartActual?.player || "bf";
    const inputGirlfriend = chartActual?.girlfriend || "gf";
    const inputOpponent = chartActual?.opponent || "dad";
    const inputStage = chartActual?.stage || "stage";

    const notasActivas = chartActual?.notes || {};

    // Orden canónico de dificultades
    const ORDEN_DIFICULTADES = ["easy", "normal", "hard"];

    // Construir el pool de dificultades REALES: solo las que existen y NO están vacías
    const dificultadesRaw = chartActual?.difficulties
        ? { ...chartActual.difficulties }
        : { normal: { notes: notasActivas, events: chartActual?.events || {} } };

    // Asegurar que la dificultad activa esté representada también (por si acaso)
    if (chartActual?.activeDifficulty && !dificultadesRaw[chartActual.activeDifficulty]) {
        dificultadesRaw[chartActual.activeDifficulty] = { notes: chartActual.notes || {}, events: chartActual.events || {} };
    }

    function dificultadTieneContenido(diff) {
        if (!diff || typeof diff !== "object") return false;
        const tieneNotes = diff.notes && typeof diff.notes === "object" && Object.keys(diff.notes).length > 0;
        const tieneEvents = diff.events && typeof diff.events === "object" && Object.keys(diff.events).length > 0;
        return tieneNotes || tieneEvents;
    }

    // Construir lista final en orden easy → normal → hard; añadir al final otras dif. custom
    const ordenadas = [];
    ORDEN_DIFICULTADES.forEach((nombre) => {
        if (dificultadesRaw[nombre] && dificultadTieneContenido(dificultadesRaw[nombre])) {
            ordenadas.push(nombre);
        }
    });
    Object.keys(dificultadesRaw).forEach((nombre) => {
        if (ORDEN_DIFICULTADES.indexOf(nombre) === -1 && dificultadTieneContenido(dificultadesRaw[nombre])) {
            ordenadas.push(nombre);
        }
    });

    // Por si acaso no hay NINGUNA, forzamos normal con lo activo
    if (ordenadas.length === 0) {
        ordenadas.push("normal");
        dificultadesRaw.normal = { notes: notasActivas, events: chartActual?.events || {} };
    }

    console.log("Generando empaquetado oficial FNF V-Slice .fnfc con audios... Dificultades:", ordenadas);
    const zip = new JSZip();
    const songNameId = inputSongName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

    // 1. CONSTRUCCIÓN DE SONG-METADATA.JSON
    const ratingsEntries = {};
    ordenadas.forEach((nombre) => { ratingsEntries[nombre] = inputDifficulty; });
    const scrollSpeedEntries = {};
    ordenadas.forEach((nombre) => { scrollSpeedEntries[nombre] = inputSpeed; });

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
            "songVariations": [],
            "difficulties": ordenadas.slice(),
            "characters": {
                "player": inputPlayer,
                "girlfriend": inputGirlfriend,
                "opponent": inputOpponent,
                "instrumental": "",
                "altInstrumentals": [],
                "opponentVocals": ["Opponent"],
                "playerVocals": ["Player"]
            },
            "stage": inputStage,
            "stickerPack": "funkin",
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

    // 2. CONSTRUCCIÓN DE SONG-CHART.JSON
    // - notes: por dificultad (easy / normal / hard).
    // - events: UN SOLO ARRAY GLOBAL a nivel raíz, NO por dificultad.
    //   El usuario confirma que los FocusCamera son iguales en todas las dificultades.
    //   Así que hacemos merge de todas las dificultades, eliminamos duplicados
    //   y ordenamos por tiempo "t".
    const stepDuration = (60 / inputBPM) / 4;
    const vSliceNotes = {};
    const eventsPool = new Map(); // clave = `${t}@${e}@${char}@${x}@${y}`  para dedupe
    ordenadas.forEach((nombre) => {
        const diff = dificultadesRaw[nombre] || { notes: {}, events: {} };
        vSliceNotes[nombre] = convertirNotasVSlice(diff.notes, stepDuration);
        const evList = convertirEventosVSlice(diff.events, stepDuration);
        if (Array.isArray(evList)) {
            evList.forEach((ev) => {
                try {
                    if (!ev || !ev.v) return;
                    const t = Number(ev.t) || 0;
                    const e = String(ev.e || "");
                    const c = Number(ev.v.char ?? 0);
                    const x = Number(ev.v.x ?? 0);
                    const y = Number(ev.v.y ?? 0);
                    const d = Number(ev.v.duration ?? 0);
                    const ease = String(ev.v.ease || "");
                    const k = `${t}|${e}|${c}|${x}|${y}|${d}|${ease}`;
                    if (!eventsPool.has(k)) eventsPool.set(k, ev);
                } catch(_) {}
            });
        }
    });
    const vSliceEvents = Array.from(eventsPool.values()).sort((a, b) => {
        const ta = Number(a && a.t) || 0;
        const tb = Number(b && b.t) || 0;
        return ta - tb;
    });

    const chartData = {
        "version": "2.0.0",
        "scrollSpeed": scrollSpeedEntries,
        "events": vSliceEvents,
        "notes": vSliceNotes,
        "generatedBy": "Chart Editor GCD"
    };

    // Agregar JSONs al ZIP
    zip.file(`${songNameId}-metadata.json`, JSON.stringify(metadataData, null, 2));
    zip.file(`${songNameId}-chart.json`, JSON.stringify(chartData, null, 2));

    // 3. EMPAQUETADO DE LOS ARCHIVOS OGG SELECCIONADOS EN EL PASO 2
    const audioFiles = [
        ["inst.ogg", fileRawInst],
        ["Voices-Player.ogg", fileRawV1],
        ["Voices-Opponent.ogg", fileRawV2]
    ];
    audioFiles.forEach(([fileName, audioFile]) => {
        if (audioFile instanceof Blob && audioFile.size > 0) zip.file(fileName, audioFile);
    });

    // 4. DESCARGA DEL ARCHIVO .FNFC COMPLETO
    zip.generateAsync({ type: "blob" }).then(function (content) {
        const url = URL.createObjectURL(content);
        const dlElem = document.createElement("a");
        dlElem.setAttribute("href", url);
        dlElem.setAttribute("download", `${songNameId}.fnfc`);
        document.body.appendChild(dlElem);
        dlElem.click();
        document.body.removeChild(dlElem);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }).catch(err => {
        alert("Error al estructurar el chart con audios.");
        console.error(err);
    });
}

function menuExit() { exitEditor(); }

function exitEditor() {
    limpiarAudiosExistentes();
    cerrarVentanaDificultad();
    cerrarVentanaEvents();
    cerrarVentanaMetadata();
    cerrarVentanaHelp();
    resetearFormularios(); // <-- Purgamos formularios al salir
    document.getElementById("editor-workspace").classList.remove("active");
    document.getElementById("main-menu").classList.remove("hidden");
    renderizarProyectosArchivados();
}

// ==========================================
// --- RE-VINCULAR AUDIOS A UN CHART ARCHIVADO ---
// ==========================================

function abrirModalReVincularAudios() {
    resetearFormularios(); // <-- Purgamos para que el modal salga limpio sin audios de canciones pasadas
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

    if ((fileV1 && !fileV2) || (!fileV1 && fileV2)) {
        alert("¡Error de Voces!\nSi agregas la pista de voz de un personaje, obligatoriamente debes agregar la del otro.");
        return;
    }

    if (isPlaying) togglePlayPause();

    const btn = document.getElementById("btn-revincular-final");
    const oldText = btn.innerHTML;
    btn.innerHTML = "Cargando...";
    btn.disabled = true;

    try {
        // Liberamos la memoria de audios anteriores por si acaso
        if (audioInst) { audioInst.pause(); audioInst = null; }
        if (audioVoice1) { audioVoice1.pause(); audioVoice1 = null; }
        if (audioVoice2) { audioVoice2.pause(); audioVoice2 = null; }
        
        // Creamos los nuevos reproductores con los archivos recién subidos
        audioInst = new Audio(URL.createObjectURL(fileInst));
        if (fileV1) audioVoice1 = new Audio(URL.createObjectURL(fileV1));
        if (fileV2) audioVoice2 = new Audio(URL.createObjectURL(fileV2));

        // Decodificamos para dibujar las Waveforms
        buffers.inst = await decodeAudioFile(fileInst);
        buffers.v1 = await decodeAudioFile(fileV1);
        buffers.v2 = await decodeAudioFile(fileV2);

        // Actualizamos los textos de la interfaz con los nuevos nombres
        fileRawInst = fileInst;
        fileRawV1 = fileV1 || null;
        fileRawV2 = fileV2 || null;
        autoAjustarSelectoresDeWaveform(fileV1 && fileV2);
        cargarDatosEnMesa(fileV1, fileV2, currentChartData.songName, currentChartData.bpm);
        
        // Redibujamos la gráfica
        actualizarWaveforms();
        
        cerrarModalReVincularAudios();
        
    } catch (err) {
        alert("Ocurrió un error leyendo los audios.");
        console.error(err);
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
}
