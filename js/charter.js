function inicializarWorkspace() {
    document.getElementById("main-menu").classList.add("hidden");
    document.getElementById("editor-workspace").classList.add("active");
    
    document.getElementById("editor-workspace").offsetHeight;

    let intentos = 0;
    let chequearAltura = setInterval(() => {
        if (document.getElementById("scroll-workspace").clientHeight > 0 || intentos > 15) {
            clearInterval(chequearAltura); 
            actualizarAlturaScroll();
            reposicionarScroll();
            aplicarMuteEstadosUI();
            
            // Empujoncito extra para forzar a la pantalla a dibujarse
            setTimeout(actualizarWaveforms, 150);
        }
        intentos++;
    }, 20); 
}

function asegurarDificultadesChart(chart) {
    const nombres = ["hard", "normal", "easy"];
    const tieneMapaDeDificultades = chart.difficulties && typeof chart.difficulties === "object" && !Array.isArray(chart.difficulties);
    if (!tieneMapaDeDificultades) {
        chart.difficulties = {};
        chart.difficulties.normal = {
            notes: chart.notes && typeof chart.notes === "object" ? chart.notes : {},
            events: chart.events && typeof chart.events === "object" ? chart.events : {}
        };
        chart.difficulties.hard = { notes: {}, events: {} };
        chart.difficulties.easy = { notes: {}, events: {} };
    }
    Object.keys(chart.difficulties).forEach((nombre) => {
        chart.difficulties[nombre].notes ||= {};
        chart.difficulties[nombre].events ||= {};
    });
    chart.activeDifficulty = chart.difficulties[chart.activeDifficulty] ? chart.activeDifficulty : (chart.difficulties.normal ? "normal" : Object.keys(chart.difficulties)[0]);
    dificultadActiva = chart.activeDifficulty;
    chart.notes = chart.difficulties[dificultadActiva].notes;
    chart.events = chart.difficulties[dificultadActiva].events;
    actualizarIndicadorDificultad();
}

function guardarDificultadActiva() {
    if (!currentChartData || !dificultadActiva) return;
    if (!currentChartData.difficulties || typeof currentChartData.difficulties !== "object") currentChartData.difficulties = {};
    currentChartData.difficulties[dificultadActiva] = {
        notes: currentChartData.notes || {},
        events: currentChartData.events || {}
    };
}

function actualizarListaDificultades() {
    const lista = document.getElementById("difficulty-list");
    if (!lista || !currentChartData) return;
    lista.innerHTML = ["hard", "normal", "easy"].map((nombre) => {
        const existe = Boolean(currentChartData.difficulties?.[nombre]);
        const activo = nombre === dificultadActiva;
        return `<button class="difficulty-card ${activo ? "active" : ""} ${existe ? "" : "missing"}" type="button" ${existe ? `onclick="cambiarDificultad('${nombre}')"` : "disabled"}>
            <strong>${nombre.toUpperCase()}</strong><small>${existe ? "Disponible" : "Faltante"}</small>
        </button>`;
    }).join("");
}

function cambiarDificultad(nombre) {
    if (!currentChartData) return;
    if (!currentChartData.difficulties[nombre] || nombre === dificultadActiva) return;
    guardarDificultadActiva();
    dificultadActiva = nombre;
    currentChartData.activeDifficulty = nombre;
    currentChartData.notes = currentChartData.difficulties[nombre].notes;
    currentChartData.events = currentChartData.difficulties[nombre].events;
    notaSeleccionada = null;
    deseleccionarEventoActual();
    generarEstructuraGrilla(currentChartData.totalRows);
    pintarNotasActuales();
    pintarEventosActuales();
    actualizarListaDificultades();
    actualizarIndicadorDificultad();
}

function cambiarDificultadSiguiente() {
    const orden = ["normal", "hard", "easy"];
    const indice = orden.indexOf(dificultadActiva);
    cambiarDificultad(orden[(indice + 1) % orden.length]);
}

function actualizarIndicadorDificultad() {
    const indicador = document.getElementById("display-song-difficulty");
    if (indicador) indicador.innerText = dificultadActiva.toUpperCase();
}

function abrirVentanaDificultad() {
    const ventana = document.getElementById("difficulty-window");
    const wrapper = document.getElementById("menu-windows-wrapper");
    if (!ventana) return;
    ventana.classList.add("active");
    ventana.classList.remove("minimized");
    ventana.setAttribute("aria-hidden", "false");
    actualizarListaDificultades();
    if (wrapper) wrapper.classList.remove("open");
}

function cerrarVentanaDificultad() {
    const ventana = document.getElementById("difficulty-window");
    if (!ventana) return;
    ventana.classList.remove("active");
    ventana.setAttribute("aria-hidden", "true");
}

function alternarMinimizarDificultad() {
    const ventana = document.getElementById("difficulty-window");
    const boton = ventana?.querySelector(".floating-window-minimize i");
    if (!ventana) return;
    ventana.classList.toggle("minimized");
    if (boton) boton.className = ventana.classList.contains("minimized") ? "fa-solid fa-square-plus" : "fa-solid fa-minus";
}

function quitarDificultadActiva() {
    if (!currentChartData) return;
    const disponibles = ["hard", "normal", "easy"].filter((nombre) => currentChartData.difficulties[nombre]);
    if (disponibles.length <= 1) return;
    delete currentChartData.difficulties[dificultadActiva];
    const siguiente = disponibles.find((nombre) => nombre !== dificultadActiva) || "normal";
    dificultadActiva = siguiente;
    currentChartData.activeDifficulty = siguiente;
    currentChartData.notes = currentChartData.difficulties[siguiente].notes;
    currentChartData.events = currentChartData.difficulties[siguiente].events;
    generarEstructuraGrilla(currentChartData.totalRows);
    pintarNotasActuales();
    pintarEventosActuales();
    actualizarListaDificultades();
    actualizarIndicadorDificultad();
}

function restaurarDificultadesFaltantes() {
    if (!currentChartData) return;
    if (!currentChartData.difficulties || typeof currentChartData.difficulties !== "object") currentChartData.difficulties = {};
    ["hard", "normal", "easy"].forEach((nombre) => {
        if (!currentChartData.difficulties[nombre]) currentChartData.difficulties[nombre] = { notes: {}, events: {} };
    });
    actualizarListaDificultades();
}
 
function actualizarAlturaScroll() {
    const workspace = document.getElementById("scroll-workspace");
    if (!currentChartData || workspace.clientHeight === 0) return;
    const totalHeightPx = currentChartData.totalRows * alturaCelda;
    const scaledGridHeight = totalHeightPx * globalZoomFactor;
    const H = workspace.clientHeight;
    
    let inner = document.getElementById("scroll-inner");
    inner.style.height = scaledGridHeight + H + "px";
    
    const grilla = document.getElementById("grilla-dinamica-container");
    grilla.style.position = "absolute";
    grilla.style.top = H / 2 + "px";
    grilla.style.left = "50%";
    grilla.style.transformOrigin = "top center";
    grilla.style.transform = `translateX(-50%) scale(${globalZoomFactor})`;
    
    const labels = document.getElementById("lane-labels-wrapper");
    if (labels) labels.style.width = 360 * globalZoomFactor + "px";
    
    const canvas = document.getElementById("wave-canvas");
    if (canvas) {
        canvas.width = 360 * globalZoomFactor;
        canvas.height = H;
        canvas.style.width = 360 * globalZoomFactor + "px";
    }
}

function generarEstructuraGrilla(filas) {
    const jugador = document.getElementById("cols-jugador");
    const oponente = document.getElementById("cols-oponente");
    const events = document.getElementById("cols-events");
    jugador.innerHTML = "";
    oponente.innerHTML = "";
    events.innerHTML = "";
    
    for (const c of CARRILES_JUGADOR) {
        const col = document.createElement("div");
        col.className = "grid-column";
        for (let f = 0; f < filas; f++) {
            const cell = document.createElement("div");
            cell.className = "grid-cell";
            if (f % 4 === 0) cell.classList.add("beat-line");
            if (f % 16 === 0) cell.classList.add("measure-line");
            cell.id = `cell-${f}-${c}`;
            cell.onclick = (e) => manejarClickCelda(e, f, c, cell);
            col.appendChild(cell);
        }
        jugador.appendChild(col);
    }
    for (const c of CARRILES_OPONENTE) {
        const col = document.createElement("div");
        col.className = "grid-column";
        for (let f = 0; f < filas; f++) {
            const cell = document.createElement("div");
            cell.className = "grid-cell";
            if (f % 4 === 0) cell.classList.add("beat-line");
            if (f % 16 === 0) cell.classList.add("measure-line");
            cell.id = `cell-${f}-${c}`;
            cell.onclick = (e) => manejarClickCelda(e, f, c, cell);
            col.appendChild(cell);
        }
        oponente.appendChild(col);
    }

    const eventsColumn = document.createElement("div");
    eventsColumn.className = "grid-column events-column";
    for (let f = 0; f < filas; f++) {
        const cell = document.createElement("div");
        cell.className = "grid-cell";
        cell.id = `event-cell-${f}`;
        cell.onclick = (e) => manejarClickCeldaEvento(e, f, cell);
        if (f % 4 === 0) cell.classList.add("beat-line");
        if (f % 16 === 0) cell.classList.add("measure-line");
        eventsColumn.appendChild(cell);
    }
    events.appendChild(eventsColumn);
}

function manejarClickCeldaEvento(e, f, cell) {
    e.stopPropagation();
    if (!currentChartData.events) currentChartData.events = {};

    if (!currentChartData.events[f]) {
        currentChartData.events[f] = {
            type: "Focus Camera",
            target: "opponent",
            duration: 0,
            offsetX: 0,
            offsetY: 0,
            effect: "CLASSIC"
        };
        const icon = document.createElement("img");
        icon.className = "event-note-icon";
        icon.src = "eventassets/FocusCamera.png";
        icon.alt = "Focus Camera";
        cell.appendChild(icon);
    }

    seleccionarEvento(f);
}

function seleccionarEvento(f) {
    const anterior = eventoSeleccionado === null ? null : document.getElementById(`event-cell-${eventoSeleccionado}`);
    if (anterior) anterior.classList.remove("event-selected");

    eventoSeleccionado = Number(f);
    const cell = document.getElementById(`event-cell-${eventoSeleccionado}`);
    if (cell) cell.classList.add("event-selected");
    actualizarVentanaEvento();
}

function deseleccionarEventoActual() {
    if (eventoSeleccionado !== null) {
        const cell = document.getElementById(`event-cell-${eventoSeleccionado}`);
        if (cell) cell.classList.remove("event-selected");
    }
    eventoSeleccionado = null;
    actualizarVentanaEvento();
}

function eliminarEventoSeleccionado() {
    if (eventoSeleccionado === null || !currentChartData?.events?.[eventoSeleccionado]) return;
    const cell = document.getElementById(`event-cell-${eventoSeleccionado}`);
    if (cell) {
        cell.classList.remove("event-selected");
        cell.querySelector(".event-note-icon")?.remove();
    }
    delete currentChartData.events[eventoSeleccionado];
    eventoSeleccionado = null;
    actualizarVentanaEvento();
}

function actualizarVentanaEvento() {
    const evento = eventoSeleccionado === null || !currentChartData?.events
        ? null
        : currentChartData.events[eventoSeleccionado];
    const target = document.getElementById("event-target-select");
    const duration = document.getElementById("event-duration-input");
    const effect = document.getElementById("event-effect-select");
    const offsetX = document.getElementById("event-offset-x");
    const offsetY = document.getElementById("event-offset-y");
    const deleteButton = document.getElementById("event-delete-button");
    const positionFields = document.getElementById("events-position-fields");
    const controls = [target, duration, effect, offsetX, offsetY, deleteButton];

    controls.forEach((control) => { if (control) control.disabled = !evento; });
    if (!evento) {
        if (positionFields) positionFields.hidden = true;
        return;
    }

    evento.target = evento.target || "opponent";
    evento.duration = Number.isFinite(Number(evento.duration)) ? Number(evento.duration) : 0;
    evento.offsetX = Number.isFinite(Number(evento.offsetX)) ? Number(evento.offsetX) : 0;
    evento.offsetY = Number.isFinite(Number(evento.offsetY)) ? Number(evento.offsetY) : 0;
    evento.effect = evento.effect || "CLASSIC";
    if (target) target.value = evento.target;
    if (duration) duration.value = evento.duration;
    if (effect) effect.value = evento.effect;
    if (offsetX) offsetX.value = evento.offsetX;
    if (offsetY) offsetY.value = evento.offsetY;
    if (positionFields) positionFields.hidden = evento.target !== "position";
}

function actualizarConfiguracionEvento() {
    if (eventoSeleccionado === null || !currentChartData?.events?.[eventoSeleccionado]) return;
    const evento = currentChartData.events[eventoSeleccionado];
    evento.target = document.getElementById("event-target-select")?.value || "opponent";
    evento.duration = Math.max(0, parseFloat(document.getElementById("event-duration-input")?.value) || 0);
    evento.effect = document.getElementById("event-effect-select")?.value || "CLASSIC";
    evento.offsetX = parseFloat(document.getElementById("event-offset-x")?.value) || 0;
    evento.offsetY = parseFloat(document.getElementById("event-offset-y")?.value) || 0;
    const positionFields = document.getElementById("events-position-fields");
    if (positionFields) positionFields.hidden = evento.target !== "position";
}

function deseleccionarNotaActual() {
    if (notaSeleccionada) {
        const prevCell = document.getElementById(notaSeleccionada);
        if (prevCell) prevCell.classList.remove("selected-note");
        notaSeleccionada = null;
    }
}

function manejarClickCelda(e, f, c, cell) {
    e.stopPropagation();
    deseleccionarEventoActual();
    const id = `cell-${f}-${c}`;
    const key = `${f}-${c}`;
    if (currentChartData.notes[key]) {
        if (notaSeleccionada === id) {
            delete currentChartData.notes[key];
            const circles = cell.querySelectorAll(".grid-note-circle, .sustain-line");
            circles.forEach((c) => c.remove());
            cell.classList.remove("selected-note");
            notaSeleccionada = null;
        } else {
            deseleccionarNotaActual();
            notaSeleccionada = id;
            cell.classList.add("selected-note");
        }
    } else {
        deseleccionarNotaActual();
        currentChartData.notes[key] = { len: 0 };
        const circulo = document.createElement("div");
        circulo.className = `grid-note-circle note-col-${c % 4}`;
        cell.appendChild(circulo);
        notaSeleccionada = id;
        cell.classList.add("selected-note");
    }
}

function ajustarLongitudNota(dir) {
    if (!notaSeleccionada) return;
    const cell = document.getElementById(notaSeleccionada);
    if (!cell) return;
    const parts = notaSeleccionada.replace("cell-", "").split("-");
    const f = parseInt(parts[0]), c = parseInt(parts[1]), key = `${f}-${c}`;
    if (!currentChartData.notes[key]) return;
    
    let len = Math.max(0, (currentChartData.notes[key].len || 0) + dir);
    currentChartData.notes[key].len = len;
    
    let line = cell.querySelector(".sustain-line");
    if (!line) {
        line = document.createElement("div");
        line.className = "sustain-line";
        cell.appendChild(line);
    }
    line.style.height = len * alturaCelda + "px";
    if (len === 0) line.remove();
}

function sincronizarPistasAudio(tiempo) {
    if (!Number.isFinite(tiempo)) return;
    if (audioInst) audioInst.currentTime = tiempo;
    if (audioVoice1) audioVoice1.currentTime = tiempo;
    if (audioVoice2) audioVoice2.currentTime = tiempo;
}

function togglePlayPause() {
    if (!audioInst) return;
    const btn = document.getElementById("btn-play-pause");
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    
    if (isPlaying) {
        audioInst.pause();
        if (audioVoice1) audioVoice1.pause();
        if (audioVoice2) audioVoice2.pause();
        sincronizarPistasAudio(audioInst.currentTime);
        isPlaying = false;
        
        // Cambia a icono de Play
        btn.innerHTML = '<i class="fa-solid fa-play"></i> Reproducir';
        btn.classList.remove("playing");
        cancelAnimationFrame(animationFrameId);
    } else {
        const t = audioInst.currentTime;
        sincronizarPistasAudio(t);
        lastHitTime = t - 0.001;
        const reproducciones = [audioInst, audioVoice1, audioVoice2]
            .filter(Boolean)
            .map((audio) => audio.play());
        Promise.allSettled(reproducciones).then(() => sincronizarPistasAudio(audioInst.currentTime));
        isPlaying = true;
        
        // Cambia a icono de Pausa
        btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
        btn.classList.add("playing");
        animationFrameId = requestAnimationFrame(actualizarPlaybackFiel);
    }
}

function reposicionarScroll() {
    if(!audioInst || !currentChartData) return;
    const tiempoActual = audioInst.currentTime;
    const stepDuration = (60 / currentChartData.bpm) / 4;
    const currentStep = tiempoActual / stepDuration;
    
    const workspace = document.getElementById('scroll-workspace');
    ignorarSiguienteScroll = true; 
    workspace.scrollTop = (currentStep * alturaCelda * globalZoomFactor);
    
    // CORRECCIÓN: Volvemos a pasar el tiempo exacto
    actualizarWaveforms(tiempoActual); 
}

function actualizarPlaybackFiel() {
    if (!audioInst) return;
    const tiempoActual = audioInst.currentTime;
    if (isPlaying) {
        reposicionarScroll();
        if (lastHitTime >= 0 && currentChartData) {
            const stepDuration = 60 / currentChartData.bpm / 4;
            let sonarHitsoundFrame = false;
            const latencia = 0; 
            const tiempoConLatencia = tiempoActual + latencia;
            const lastHitConLatencia = lastHitTime + latencia;
            
            for (let key in currentChartData.notes) {
                const parts = key.split("-");
                const f = parseInt(parts[0]);
                const c = parseInt(parts[1]);
                const noteTime = f * stepDuration;
                if (noteTime > lastHitConLatencia && noteTime <= tiempoConLatencia) {
                    const hitP = document.getElementById("hit-player") && document.getElementById("hit-player").checked && c < 4;
                    const hitE = document.getElementById("hit-enemy") && document.getElementById("hit-enemy").checked && c >= 4;
                    if (hitE || hitP) sonarHitsoundFrame = true;
                }
            }
            if (sonarHitsoundFrame) playHitsound();
        }
        lastHitTime = tiempoActual;
    }
    actualizarContadorDeTiempo(tiempoActual);
    if (isPlaying) {
        if (tiempoActual >= audioInst.duration) {
            togglePlayPause();
            audioInst.currentTime = 0;
            reposicionarScroll();
        } else {
            animationFrameId = requestAnimationFrame(actualizarPlaybackFiel);
        }
    }
}

function manejarScrollManual() {
    if (!audioInst || !currentChartData) return;
    if (ignorarSiguienteScroll) { ignorarSiguienteScroll = false; return; }
    if (isPlaying) togglePlayPause(); 
    
    const workspace = document.getElementById('scroll-workspace');
    const stepDuration = (60 / currentChartData.bpm) / 4;
    let nuevoTiempo = ((workspace.scrollTop / globalZoomFactor) / alturaCelda) * stepDuration;
    if (nuevoTiempo < 0) nuevoTiempo = 0;
    if (nuevoTiempo > audioInst.duration) nuevoTiempo = audioInst.duration;
    
    audioInst.currentTime = nuevoTiempo;
    if (audioVoice1) audioVoice1.currentTime = nuevoTiempo;
    if (audioVoice2) audioVoice2.currentTime = nuevoTiempo;
    
    lastHitTime = nuevoTiempo; 
    actualizarContadorDeTiempo(nuevoTiempo);
    
    // CORRECCIÓN: Volvemos a pasar el tiempo exacto
    actualizarWaveforms(nuevoTiempo); 
}

function actualizarContadorDeTiempo(tiempo) {
    let mins = Math.floor(tiempo / 60);
    let secs = Math.floor(tiempo % 60);
    let ms = Math.floor((tiempo % 1) * 100);
    const stepDuration = 60 / currentChartData.bpm / 4;
    const currentBeat = tiempo / stepDuration / 4;
    document.getElementById("txt-time").innerHTML = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
    document.querySelectorAll(".bottom-playback-bar span")[1].innerText = `Beat: ${currentBeat.toFixed(2)}`;
}

// SPACEBAR PLAY/PAUSE EVENT
window.addEventListener("keydown", function (e) {
    if (e.code === "Space") {
        e.preventDefault();
        togglePlayPause();
    }
});
