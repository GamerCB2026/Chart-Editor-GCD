// =====================================================================
// V0.8.2j — Variaciones (songVariations de V-Slice)
// Un .fnfc puede traer, además de song-chart.json / song-metadata.json,
// song-chart-<var>.json y song-metadata-<var>.json (p. ej. "erect", "player").
// Cada variación es una carpeta en la ventana Dificultad con sus propias
// dificultades, notas, eventos, BPM, scrollSpeed y audios (Inst / Voices).
//
// currentChartData siempre tiene los datos de la variación ACTIVA (como antes).
// Las demás se guardan en currentChartData.variaciones[id] (incluida "default"
// cuando la activa es otra). Sus audios esperan en audiosVariacionesGCD[id].
// Cambiar de variación pausa si estaba sonando, cambia las pistas y vuelve al
// mismo segundo de la canción (un solo seek, nunca por frame).
// =====================================================================

const CAMPOS_VARIACION_GCD = ["songName", "author", "charter", "bpm", "speed", "player", "opponent", "girlfriend", "album", "difficulty", "ratings", "stickerPack", "stage",
    "totalRows", "activeDifficulty", "difficulties", "events", "scrollSpeeds", "metaExtra", "dificultadesOriginales"];
let audiosVariacionesGCD = {}; // id -> { inst, v1, v2, buffers: { inst, v1, v2 } }
let cambiandoVariacionGCD = false;

function listaVariacionesGCD() {
    if (!currentChartData) return ["default"];
    const orden = Array.isArray(currentChartData.ordenVariaciones) ? currentChartData.ordenVariaciones : [];
    const activa = variacionActivaGCD();
    const ids = ["default"];
    orden.forEach((id) => {
        if (id && id !== "default" && !ids.includes(id) && (id === activa || (currentChartData.variaciones && currentChartData.variaciones[id]))) ids.push(id);
    });
    return ids;
}

function datosVariacionGCD(id) {
    if (!currentChartData) return null;
    if ((id || "default") === variacionActivaGCD()) return currentChartData;
    return (currentChartData.variaciones && currentChartData.variaciones[id]) || null;
}

function hayVariacionesGCD() {
    return listaVariacionesGCD().length > 1;
}

// Copia los campos de variación al abrir un chart (archivado o importado).
function adoptarVariacionesDe(chart, data) {
    if (!chart) return;
    const v = data && data.variaciones && typeof data.variaciones === "object" && !Array.isArray(data.variaciones) ? data.variaciones : {};
    chart.variaciones = v;
    Object.keys(v).forEach((id) => enlazarEventosVariacion(v[id]));
    chart.ordenVariaciones = Array.isArray(data && data.ordenVariaciones) ? data.ordenVariaciones.slice() : [];
    chart.variacionActiva = (data && typeof data.variacionActiva === "string" && data.variacionActiva) || "default";
    if (chart.variacionActiva !== "default" && !chart.ordenVariaciones.includes(chart.variacionActiva)) chart.ordenVariaciones.push(chart.variacionActiva);
    chart.scrollSpeeds = data && data.scrollSpeeds && typeof data.scrollSpeeds === "object" ? data.scrollSpeeds : {};
    chart.metaExtra = data && data.metaExtra && typeof data.metaExtra === "object" ? data.metaExtra : {};        if (data && Array.isArray(data.dificultadesOriginales)) chart.dificultadesOriginales = data.dificultadesOriginales.slice();

    audiosVariacionesGCD = {};
    carpetasDificultadCerradas = {};
    carpetaDificultadSeleccionada = null;
    entradaNuevaDificultad = null;
    entradaNuevaVariacion = null;
}

// Crea una variación con la misma lista de dificultades y velocidad inicial,
// pero sin notas ni eventos; las pistas usan el fallback de Default hasta cambiarse.
async function crearVariacionGCD(id) {
    if (!currentChartData || !/^[a-z][a-z0-9]+$/.test(String(id || ""))) return false;
    if (listaVariacionesGCD().includes(id)) return false;

    try {
        const actual = variacionActivaGCD();
        const foto = fotoVariacionActiva();
        const origen = datosVariacionGCD(actual);
        if (!origen) return false;

        currentChartData.variaciones ||= {};
        currentChartData.ordenVariaciones ||= [];
        currentChartData.variaciones[actual] = foto;
        if (!currentChartData.ordenVariaciones.includes(actual) && actual !== "default") currentChartData.ordenVariaciones.push(actual);
        delete currentChartData.variaciones[id];
        const dificultadNueva = foto.activeDifficulty || dificultadActiva || "normal";
        const nueva = JSON.parse(JSON.stringify(foto));
        // Conserva los nombres/velocidades de las dificultades, pero no copia notas ni eventos.
        const nombresDificultad = Object.keys(foto.difficulties || {});
        if (!nombresDificultad.includes(dificultadNueva)) nombresDificultad.push(dificultadNueva);
        const eventosNuevos = {};
        nueva.difficulties = {};
        nombresDificultad.forEach((nombre) => { nueva.difficulties[nombre] = { notes: {}, events: eventosNuevos }; });
        nueva.activeDifficulty = dificultadNueva;
        nueva.notes = nueva.difficulties[dificultadNueva].notes;
        nueva.events = eventosNuevos;
        nueva.dificultadesOriginales = nombresDificultad.slice();
        nueva.scrollSpeeds = Object.fromEntries(nombresDificultad.map((nombre) => [
            nombre,
            Number(foto.scrollSpeeds && foto.scrollSpeeds[nombre]) > 0
                ? Number(foto.scrollSpeeds[nombre])
                : (Number(foto.speed) > 0 ? Number(foto.speed) : 1)
        ]));
        nueva.metaExtra = { ...(nueva.metaExtra || {}), variacion: id, instrumental: "" };
        currentChartData.variaciones[id] = nueva;
        enlazarEventosVariacion(nueva);
        currentChartData.ordenVariaciones.push(id);
        // Empezar con el audio Default (fallback V-Slice), nunca con el de otra variación.
        audiosVariacionesGCD[id] = audiosDeVariacionGCD("default");
        const cambioCorrecto = await cambiarVariacionGCD(id, dificultadNueva);
        if (!cambioCorrecto) {
            delete currentChartData.variaciones[id];
            currentChartData.ordenVariaciones = currentChartData.ordenVariaciones.filter((v) => v !== id);
            delete audiosVariacionesGCD[id];
            currentChartData.variacionActiva = actual;
            return false;
        }
        carpetaDificultadSeleccionada = id;
        carpetasDificultadCerradas[id] = false;
        actualizarListaDificultades();
        if (typeof programarAutoguardado === "function") programarAutoguardado();
        if (typeof mostrarToastGCD === "function") mostrarToastGCD(`Variación «${id}» creada desde ${actual === "default" ? "Default" : actual}`);
        return true;
    } catch (err) {
        console.error("[Variaciones] No se pudo crear la variación", err);
        if (typeof mostrarToastGCD === "function") mostrarToastGCD("No se pudo crear la variación");
        return false;
    }
}

// Eventos compartidos dentro de una variación guardada (una sola referencia).
function enlazarEventosVariacion(datos) {
    if (!datos || typeof datos !== "object") return;
    if (!datos.difficulties || typeof datos.difficulties !== "object") datos.difficulties = {};
    if (typeof asegurarEventosCompartidos === "function") asegurarEventosCompartidos(datos);
}

// Foto de la variación activa (las mismas referencias, sin clonar).
function fotoVariacionActiva() {
    if (typeof sincronizarChartDesdeInterfaz === "function") sincronizarChartDesdeInterfaz();
    guardarVelocidadDificultad();
    guardarDificultadActiva();
    const foto = {};
    CAMPOS_VARIACION_GCD.forEach((c) => { if (currentChartData[c] !== undefined) foto[c] = currentChartData[c]; });
    foto.activeDifficulty = dificultadActiva;
    return foto;
}

function aplicarFotoVariacion(foto) {
    CAMPOS_VARIACION_GCD.forEach((c) => { delete currentChartData[c]; });
    Object.assign(currentChartData, foto);
    if (!currentChartData.scrollSpeeds) currentChartData.scrollSpeeds = {};
    if (!currentChartData.metaExtra) currentChartData.metaExtra = {};
    asegurarDificultadesChart(currentChartData);
    cargarVelocidadDificultad();
    const fijar = (id, valor) => { const el = document.getElementById(id); if (el) el.value = valor; };
    fijar("song-name", currentChartData.songName || "");
    fijar("song-bpm", currentChartData.bpm || 160);
    fijar("song-author", currentChartData.author || "");
    fijar("song-charter", currentChartData.charter || "");
    // V0.8.2n: cada variación tiene su metadata → refrescar la ventana Metadata.
    if (typeof actualizarMetadataEnInterfaz === "function") actualizarMetadataEnInterfaz();
}

function audiosActivosGCD() {
    return {
        inst: typeof fileRawInst !== "undefined" ? fileRawInst : null,
        v1: typeof fileRawV1 !== "undefined" ? fileRawV1 : null,
        v2: typeof fileRawV2 !== "undefined" ? fileRawV2 : null,
        buffers: { inst: buffers.inst || null, v1: buffers.v1 || null, v2: buffers.v2 || null }
    };
}

function audiosDeVariacionGCD(id) {
    if ((id || "default") === variacionActivaGCD()) return audiosActivosGCD();
    return audiosVariacionesGCD[id] || { inst: null, v1: null, v2: null, buffers: {} };
}

// Pone las pistas de una variación en el reproductor y deja el reloj en t.
async function ponerAudiosVariacion(a, t) {
    limpiarAudiosExistentes();
    fileRawInst = a.inst || null;
    fileRawV1 = a.v1 || null;
    fileRawV2 = a.v2 || null;
    if (fileRawInst) audioInst = crearElementoAudio(fileRawInst);
    if (fileRawV1) audioVoice1 = crearElementoAudio(fileRawV1);
    if (fileRawV2) audioVoice2 = crearElementoAudio(fileRawV2);
    const b = a.buffers || {};
    buffers.inst = b.inst || (fileRawInst ? await decodeAudioFile(fileRawInst) : null);
    buffers.v1 = b.v1 || (fileRawV1 ? await decodeAudioFile(fileRawV1) : null);
    buffers.v2 = b.v2 || (fileRawV2 ? await decodeAudioFile(fileRawV2) : null);
    if (typeof reconstruirCacheWaveforms === "function") reconstruirCacheWaveforms();
    if (typeof fijarVolumenPistas === "function") fijarVolumenPistas();
    if (typeof resetWaPlaybackState === "function") resetWaPlaybackState();
    if (typeof sincronizarPistasAudio === "function") sincronizarPistasAudio(t || 0);
    if (typeof aplicarMuteEstadosUI === "function") aplicarMuteEstadosUI();
}

async function cambiarVariacionGCD(id, dificultad) {
    if (!currentChartData || cambiandoVariacionGCD) return false;
    const actual = variacionActivaGCD();
    if (id === actual) {
        if (dificultad) cambiarDificultad(dificultad);
        return true;
    }
    const destino = currentChartData.variaciones && currentChartData.variaciones[id];
    if (!destino) return false;
    cambiandoVariacionGCD = true;
    try {
        if (typeof isPlaying !== "undefined" && isPlaying && typeof togglePlayPause === "function") togglePlayPause();
        const t = typeof getMasterSongTime === "function" ? getMasterSongTime() : 0;
        // Guardar la activa
        currentChartData.variaciones[actual] = fotoVariacionActiva();
        audiosVariacionesGCD[actual] = audiosActivosGCD();
        // Traer la nueva
        delete currentChartData.variaciones[id];
        if (dificultad && destino.difficulties && destino.difficulties[dificultad]) destino.activeDifficulty = dificultad;
        currentChartData.variacionActiva = id;
        if (!currentChartData.ordenVariaciones.includes(id)) currentChartData.ordenVariaciones.push(id);
        aplicarFotoVariacion(destino);
        const a = audiosVariacionesGCD[id] || { inst: null, v1: null, v2: null, buffers: {} };
        delete audiosVariacionesGCD[id];
        await ponerAudiosVariacion(a, t);
        const dur = typeof getMasterDuration === "function" ? getMasterDuration() : 0;
        if (typeof calcularFilasDesdeDuracion === "function") {
            currentChartData.totalRows = Math.max(currentChartData.totalRows || 0, calcularFilasDesdeDuracion(dur, currentChartData.bpm));
        }
        deseleccionarNotaActual();
        deseleccionarEventoActual();
        generarEstructuraGrilla(currentChartData.totalRows);
        pintarNotasActuales();
        pintarEventosActuales();
        if (typeof cargarDatosEnMesa === "function") cargarDatosEnMesa(fileRawV1, fileRawV2, currentChartData.songName, currentChartData.bpm);
        if (typeof actualizarPanelPersonajes === "function") actualizarPanelPersonajes();
        if (typeof resyncTrasCambioGrilla === "function") resyncTrasCambioGrilla();
        if (typeof refrescarWaveformsTrasCarga === "function") refrescarWaveformsTrasCarga();
        carpetaDificultadSeleccionada = id;
        actualizarListaDificultades();
        actualizarIndicadorDificultad();
        if (typeof actualizarEstadoMenuEditor === "function") actualizarEstadoMenuEditor();
        if (typeof mostrarToastGCD === "function") {
            mostrarToastGCD(`Variación: ${id === "default" ? "Default" : id} · ${dificultadActiva}`);
        }
        return true;
    } catch (err) {
        console.error("[Variaciones]", err);
        if (typeof mostrarToastGCD === "function") mostrarToastGCD("No se pudo cambiar de variación");
        return false;
    } finally {
        cambiandoVariacionGCD = false;
    }
}

// ---------------------------------------------------------------------
// Importar (.fnfc)
// ---------------------------------------------------------------------

// Busca los JSON de V-Slice en el zip: <id>-metadata.json, <id>-chart.json y los de cada variación.
function localizarJsonVSliceZip(zip) {
    const jsons = [];
    zip.forEach((ruta, entrada) => {
        if (entrada.dir) return;
        const nombre = ruta.split("/").pop();
        if (/\.json$/i.test(nombre)) jsons.push({ nombre, low: nombre.toLowerCase(), entrada });
    });
    const esVariacion = (low, tipo) => new RegExp(`(^|[-_])${tipo}-([a-z0-9_]+(?:-[a-z0-9_]+)*)\\.json$`).exec(low);
    const base = (tipo) => {
        const exactos = jsons.filter((j) => j.low === `song-${tipo}.json` || j.low === `${tipo}.json`);
        if (exactos.length) return exactos[0].entrada;
        const sufijo = jsons.filter((j) => j.low.endsWith(`-${tipo}.json`));
        if (sufijo.length) return sufijo.sort((a, b) => a.low.length - b.low.length)[0].entrada;
        const palabra = jsons.filter((j) => j.low.includes(tipo) && !esVariacion(j.low, tipo));
        return palabra.length ? palabra[0].entrada : null;
    };
    const variacion = (tipo, id) => {
        const buscado = `${tipo}-${String(id).toLowerCase()}.json`;
        const hit = jsons.find((j) => j.low === `song-${buscado}` || j.low.endsWith(`-${buscado}`) || j.low === buscado);
        return hit ? hit.entrada : null;
    };
    return { meta: base("metadata"), chart: base("chart"), variacion };
}

function idsVariacionesDeMetadata(metaJson) {
    const lista = metaJson && metaJson.playData && Array.isArray(metaJson.playData.songVariations) ? metaJson.playData.songVariations : [];
    const ids = [];
    lista.forEach((v) => {
        const id = String(v || "").trim().toLowerCase();
        if (id && id !== "default" && /^[a-z0-9_-]+$/.test(id) && !ids.includes(id)) ids.push(id);
    });
    return ids;
}

// Convierte un par metadata/chart de V-Slice en los datos de una carpeta.
function datosVariacionDesdeVSlice(metaJson, chartJson, id) {
    const metadata = cargarMetadatosImportados(metaJson, chartJson);
    const offsetInstMs = parseFloat(metaJson && metaJson.offsets && metaJson.offsets.instrumental) || 0;
    const bpm = extraerBpmDesdeMetadata(metaJson, metadata.bpm);
    metadata.bpm = bpm;
    const notasPorDificultad = chartJson.notes && typeof chartJson.notes === "object" && !Array.isArray(chartJson.notes)
        ? chartJson.notes
        : { normal: chartJson.notes || [] };
    const listadas = metaJson && metaJson.playData && Array.isArray(metaJson.playData.difficulties) ? metaJson.playData.difficulties.map(String) : [];
    const orden = listadas.slice();
    Object.keys(notasPorDificultad).forEach((n) => { if (!orden.includes(n)) orden.push(n); });
    const difficulties = {};
    const scrollSpeeds = {};
    let totalRows = 0;
    let eventos = null;
    orden.forEach((nombre) => {
        const vel = parseFloat(chartJson.scrollSpeed && typeof chartJson.scrollSpeed === "object" ? (chartJson.scrollSpeed[nombre] ?? chartJson.scrollSpeed.default) : chartJson.scrollSpeed);
        if (Number.isFinite(vel) && vel > 0) scrollSpeeds[nombre] = vel;
        const convertida = convertirChartExterno({
            ...metadata,
            notes: notasPorDificultad[nombre] || [],
            events: chartJson.events?.[nombre] || chartJson.events,
            difficultyName: nombre,
            importOffsetMs: offsetInstMs,
            scrollSpeed: scrollSpeeds[nombre] ?? metadata.speed
        });
        const notas = convertida && convertida.notes ? convertida.notes : {};
        if (!eventos && convertida && convertida.events) eventos = convertida.events;
        difficulties[nombre] = { notes: notas, events: null };
        totalRows = Math.max(totalRows, (convertida && convertida.totalRows) || 0);
    });
    if (!orden.length) difficulties.normal = { notes: {}, events: null };
    if (!eventos && typeof convertirEventosExternos === "function" && chartJson.events) {
        eventos = convertirEventosExternos(chartJson.events, bpm, orden[0] || "normal");
    }
    const events = eventos || {};
    Object.keys(difficulties).forEach((n) => { difficulties[n].events = events; });
    const primera = difficulties.normal ? "normal" : Object.keys(difficulties)[0];
    const ch = (metaJson.playData && metaJson.playData.characters) || {};
    return {
        songName: metadata.songName,
        author: metadata.author,
        charter: metadata.charter,
        bpm,
        speed: scrollSpeeds[primera] || metadata.speed || 1,
        player: metadata.player,
        opponent: metadata.opponent,
        girlfriend: metadata.girlfriend,
        album: metadata.album,
        difficulty: parseInt(metaJson.playData?.ratings?.[primera], 10) || metadata.difficulty || 3,
        ratings: metadata.ratings || {},
        stickerPack: metadata.stickerPack || "",
        stage: metadata.stage,
        totalRows: Math.max(16, totalRows),
        activeDifficulty: primera,
        difficulties,
        events,
        scrollSpeeds,
        dificultadesOriginales: Object.keys(difficulties),
        metaExtra: {
            variacion: id,
            instrumental: String(ch.instrumental || ""),
            playerVocals: Array.isArray(ch.playerVocals) ? ch.playerVocals.map(String) : null,
            opponentVocals: Array.isArray(ch.opponentVocals) ? ch.opponentVocals.map(String) : null
        }
    };
}

function primeraEntradaZip(zip, nombres) {
    for (const n of nombres) {
        if (!n) continue;
        const hit = buscarEntradaZip(zip, n);
        if (hit) return hit;
    }
    return null;
}

// Nombres de audio de una variación (convenciones de V-Slice, sin distinguir mayúsculas).
//   Inst: Inst-<instrumental>.ogg (o Inst-<var>.ogg); si no hay, el Inst de Default.
//   Voces: Voices-<personaje>-<var>.ogg; luego Voices-<personaje>.ogg; luego las de Default.
function nombresAudioVariacion(metaJson, id) {
    const ch = (metaJson && metaJson.playData && metaJson.playData.characters) || {};
    const inst = String(ch.instrumental || "").trim();
    const player = String(ch.player || "").trim();
    const opponent = String(ch.opponent || "").trim();
    const pv = Array.isArray(ch.playerVocals) && ch.playerVocals.length ? ch.playerVocals.map(String) : [];
    const ov = Array.isArray(ch.opponentVocals) && ch.opponentVocals.length ? ch.opponentVocals.map(String) : [];
    const unicos = (l) => l.filter((x, i) => x && l.indexOf(x) === i);
    const voces = (ids, rol) => unicos([
        ...ids.map((c) => `Voices-${c}-${id}.ogg`),
        rol === "player" && player ? `Voices-${player}-${id}.ogg` : null,
        rol === "opponent" && opponent ? `Voices-${opponent}-${id}.ogg` : null,
        rol === "player" ? `Voices-Player-${id}.ogg` : `Voices-Opponent-${id}.ogg`,
        rol === "player" ? `Voices-${id}.ogg` : null,
        ...ids.map((c) => `Voices-${c}.ogg`),
        rol === "player" && player ? `Voices-${player}.ogg` : null,
        rol === "opponent" && opponent ? `Voices-${opponent}.ogg` : null
    ].filter(Boolean));
    return {
        inst: unicos([inst ? `Inst-${inst}.ogg` : null, `Inst-${id}.ogg`].filter(Boolean)),
        player: voces(pv, "player"),
        opponent: voces(ov, "opponent")
    };
}

// Agrupa variaciones que en realidad son dificultades de una misma carpeta:
//   - "gooey-easy", "gooey-normal", "gooey-hard" (2+ con el mismo prefijo)
//     → una sola carpeta "gooey" con dificultades easy/normal/hard.
//   - "nightmare" se une a la carpeta "erect" (convención de V-Slice vanilla:
//     las dificultades erect y nightmare viven en la variación erect).
// Solo agrupa si cada miembro está presente (metadata+chart leídos).
function agruparVariacionesLeidas(salida) {
    const ids = salida.orden.filter((id) => salida.variaciones[id]);
    if (ids.length < 2) return;

    // destino -> [miembros en orden]
    const grupos = new Map();

    // 1) nightmare → erect
    if (ids.includes("erect") && ids.includes("nightmare")) {
        grupos.set("erect", ["erect", "nightmare"]);
    }

    // 2) prefijo común: "<prefijo>-<algo>" con 2+ miembros → carpeta "<prefijo>"
    const porPrefijo = new Map();
    ids.forEach((id) => {
        const guion = id.indexOf("-");
        if (guion <= 0 || guion === id.length - 1) return;
        const pref = id.slice(0, guion);
        if (!porPrefijo.has(pref)) porPrefijo.set(pref, []);
        porPrefijo.get(pref).push(id);
    });
    porPrefijo.forEach((miembros, pref) => {
        if (miembros.length >= 2 && !grupos.has(pref)) grupos.set(pref, miembros);
    });
    if (!grupos.size) return;

    grupos.forEach((miembros, destino) => {
        const presentes = miembros.filter((id) => salida.variaciones[id]);
        if (presentes.length < 2) return;
        if (destino === "erect" && !salida.variaciones["erect"]) return;

        // Base: la variación destino si existe (erect); si no, el primer miembro (gooey-easy).
        const idBase = salida.variaciones[destino] ? destino : presentes[0];
        const base = salida.variaciones[idBase];
        const fusion = Object.assign({}, base);
        fusion.difficulties = {};
        fusion.scrollSpeeds = Object.assign({}, base.scrollSpeeds || {});
        fusion.events = base.events || {};

        let primera = null;
        let totalRows = 0;
        presentes.forEach((id) => {
            const datos = salida.variaciones[id];
            Object.keys(datos.difficulties || {}).forEach((nombre) => {
                // "gooey-easy" (mismo nombre que la variación) → "easy" dentro de la carpeta
                const nuevo = id !== destino && nombre === id ? id.slice(id.indexOf("-") + 1) : nombre;
                if (fusion.difficulties[nuevo]) return;
                fusion.difficulties[nuevo] = datos.difficulties[nombre];
                if (!primera) primera = nuevo;
                totalRows = Math.max(totalRows, datos.totalRows || 0);
            });
            // scrollSpeeds renombrados igual que las dificultades
            Object.keys(datos.scrollSpeeds || {}).forEach((nombre) => {
                const nuevo = id !== destino && nombre === id ? id.slice(id.indexOf("-") + 1) : nombre;
                if (fusion.scrollSpeeds[nombre] !== undefined && fusion.scrollSpeeds[nuevo] === undefined) {
                    fusion.scrollSpeeds[nuevo] = datos.scrollSpeeds[nombre];
                    if (nuevo !== nombre) delete fusion.scrollSpeeds[nombre];
                }
            });
        });

        // songName: "Slimeball (GOOEY-EASY)" → "Slimeball (GOOEY)"
        let songName = String(base.songName || "");
        if (idBase !== destino) {
            const re = new RegExp(idBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            songName = songName.replace(re, destino);
        }
        fusion.songName = songName;
        fusion.activeDifficulty = primera || base.activeDifficulty;
        fusion.dificultadesOriginales = Object.keys(fusion.difficulties);
        fusion.totalRows = Math.max(base.totalRows || 0, totalRows);
        fusion.metaExtra = Object.assign({}, base.metaExtra || {}, { variacion: destino });

        // Audios: los del primer miembro presente (normalmente caen al Default).
        const idAudio = presentes[0];

        // Reemplaza en el orden y limpia los miembros (sin borrar el destino
        // cuando el destino es a la vez miembro, p. ej. erect+nightmare → erect).
        const pos = salida.orden.indexOf(presentes[0]);
        presentes.forEach((id) => {
            if (id === destino) return;
            delete salida.variaciones[id];
            delete salida.audios[id];
            if (salida.archivosAudio) delete salida.archivosAudio[id];
            const i = salida.orden.indexOf(id);
            if (i !== -1) salida.orden.splice(i, 1);
        });
        if (salida.audios[idAudio]) salida.audios[destino] = salida.audios[idAudio];
        if (salida.archivosAudio && salida.archivosAudio[idAudio]) salida.archivosAudio[destino] = salida.archivosAudio[idAudio];

        salida.variaciones[destino] = fusion;
        if (!salida.orden.includes(destino)) salida.orden.splice(pos === -1 ? salida.orden.length : pos, 0, destino);
        salida.avisos.push(`Variaciones ${presentes.map((id) => `«${id}»`).join(", ")} agrupadas en la carpeta «${destino}».`);
    });
}

// Audios de la canción que terminan en "-<id>" (.ogg/.mp3/.wav) → a qué pista de esa variación van.
function audiosPorSufijoVariacion(zip, id, todosIds, metaJson, yaUsados) {
    const out = { inst: null, player: null, opponent: null };
    const suf = "-" + String(id).toLowerCase();
    const ch = (metaJson && metaJson.playData && metaJson.playData.characters) || {};
    const pj = String(ch.player || "").toLowerCase();
    const op = String(ch.opponent || "").toLowerCase();
    const pv = (Array.isArray(ch.playerVocals) ? ch.playerVocals : []).map((v) => String(v).toLowerCase());
    const ov = (Array.isArray(ch.opponentVocals) ? ch.opponentVocals : []).map((v) => String(v).toLowerCase());
    // Otra variación con sufijo más largo que también termina igual (p. ej. "pico-erect" vs "erect").
    const masLargas = (todosIds || []).map((v) => "-" + String(v).toLowerCase()).filter((v) => v !== suf && v.endsWith(suf));
    const sueltas = [];
    zip.forEach((ruta, entrada) => {
        if (entrada.dir || (yaUsados && yaUsados.has(entrada.name))) return;
        const nombre = ruta.split("/").pop();
        const m = /^(.*)\.(ogg|mp3|wav)$/i.exec(nombre);
        if (!m) return;
        const base = m[1].toLowerCase();
        if (!base.endsWith(suf) || masLargas.some((l) => base.endsWith(l))) return;
        const cuerpo = base.slice(0, -suf.length);
        if (cuerpo === "inst" || cuerpo.startsWith("inst-")) { if (!out.inst) out.inst = entrada; return; }
        if (!cuerpo.startsWith("voices")) return;
        const quien = cuerpo.replace(/^voices-?/, "");
        if (quien === "player" || (quien && (quien === pj || pv.includes(quien)))) { if (!out.player) out.player = entrada; return; }
        if (quien === "opponent" || (quien && (quien === op || ov.includes(quien)))) { if (!out.opponent) out.opponent = entrada; return; }
        sueltas.push(entrada);
    });
    sueltas.forEach((e) => {
        if (!out.player) out.player = e;
        else if (!out.opponent) out.opponent = e;
    });
    return out;
}

// Lee las variaciones del zip. Devuelve { variaciones: { id: datos }, orden: [], audios: { id: {inst, v1, v2} }, avisos: [] }.
async function leerVariacionesFNFC(zip, metaJson, localizados, audiosDefault) {
    const salida = { variaciones: {}, orden: [], audios: {}, avisos: [], archivosAudio: {} };
    const ids = idsVariacionesDeMetadata(metaJson);
    const cacheArchivos = new Map();
    // Si la variación cae en el mismo archivo que Default, se usa el mismo (no se duplica al exportar).
    const nombreBase = (n) => String(n || "").split("/").pop().toLowerCase();
    [audiosDefault.inst, audiosDefault.v1, audiosDefault.v2].forEach((f) => {
        if (!f || !f.name) return;
        zip.forEach((ruta, entrada) => { if (!entrada.dir && nombreBase(ruta) === nombreBase(f.name)) cacheArchivos.set(entrada.name, f); });
    });
    const archivoDe = async (entrada) => {
        if (!entrada) return null;
        if (cacheArchivos.has(entrada.name)) return cacheArchivos.get(entrada.name);
        const f = archivoDesdeBlobZip(await entrada.async("blob"), entrada);
        cacheArchivos.set(entrada.name, f);
        return f;
    };
    for (const id of ids) {
        const metaE = localizados.variacion("metadata", id);
        const chartE = localizados.variacion("chart", id);
        if (!metaE || !chartE) {
            salida.avisos.push(`Variación «${id}»: falta ${!metaE ? "su metadata" : "su chart"}`);
            continue;
        }
        let metaVar, chartVar;
        try {
            metaVar = JSON.parse(await metaE.async("string"));
            chartVar = JSON.parse(await chartE.async("string"));
        } catch (e) {
            salida.avisos.push(`Variación «${id}»: JSON dañado`);
            continue;
        }
        const datos = datosVariacionDesdeVSlice(metaVar, chartVar, id);
        const nombres = nombresAudioVariacion(metaVar, id);
        // V0.8.2n-2: primero los nombres con el sufijo "-<variación>"; si no están, se detecta
        // el sufijo en cualquier audio de la canción (Inst-erect.ogg, Voices-<lo-que-sea>-erect.ogg);
        // recién después los nombres sin sufijo (que comparten audio con el Default).
        const conSuf = (l) => l.filter((n) => n.toLowerCase().endsWith(`-${String(id).toLowerCase()}.ogg`));
        const sinSuf = (l) => l.filter((n) => !n.toLowerCase().endsWith(`-${String(id).toLowerCase()}.ogg`));
        let instE = primeraEntradaZip(zip, conSuf(nombres.inst));
        let pE = primeraEntradaZip(zip, conSuf(nombres.player));
        let oE = primeraEntradaZip(zip, conSuf(nombres.opponent));
        if (!instE || !pE || !oE) {
            const det = audiosPorSufijoVariacion(zip, id, ids, metaVar, cacheArchivos);
            if (!instE) instE = det.inst;
            if (!pE && det.player !== oE) pE = det.player;
            if (!oE && det.opponent !== pE) oE = det.opponent;
        }
        if (!instE) instE = primeraEntradaZip(zip, sinSuf(nombres.inst));
        if (!pE) pE = primeraEntradaZip(zip, sinSuf(nombres.player));
        if (!oE) oE = primeraEntradaZip(zip, sinSuf(nombres.opponent));
        salida.archivosAudio[id] = { inst: instE ? instE.name : null, player: pE ? pE.name : null, opponent: oE ? oE.name : null };
        salida.audios[id] = {
            inst: instE ? await archivoDe(instE) : (audiosDefault.inst || null),
            v1: pE ? await archivoDe(pE) : (audiosDefault.v1 || null),
            v2: oE ? await archivoDe(oE) : (audiosDefault.v2 || null),
            propios: { inst: !!instE, v1: !!pE, v2: !!oE }
        };
        salida.variaciones[id] = datos;
        salida.orden.push(id);
    }
    agruparVariacionesLeidas(salida);
    return salida;
}

// Decodifica los audios de las variaciones (una sola vez por archivo) y los deja listos.
async function prepararAudiosVariaciones(audios) {
    const cache = new Map();
    const activos = audiosActivosGCD();
    [["inst", activos.inst], ["v1", activos.v1], ["v2", activos.v2]].forEach(([k, f]) => { if (f && activos.buffers[k]) cache.set(f, activos.buffers[k]); });
    const decodificar = async (f) => {
        if (!f) return null;
        if (!cache.has(f)) cache.set(f, await decodeAudioFile(f));
        return cache.get(f);
    };
    audiosVariacionesGCD = {};
    for (const id of Object.keys(audios)) {
        const a = audios[id];
        audiosVariacionesGCD[id] = { inst: a.inst, v1: a.v1, v2: a.v2, propios: a.propios, buffers: { inst: await decodificar(a.inst), v1: await decodificar(a.v1), v2: await decodificar(a.v2) } };
    }
}

// ---------------------------------------------------------------------
// Archivador (IndexedDB): audios de las variaciones no activas
// ---------------------------------------------------------------------

function claveAudiosVariacion(chartId, id) {
    return `${chartId}::var::${id}`;
}

async function guardarAudiosVariacionesArchivador(chartId) {
    if (!chartId || typeof idbPutAudios !== "function") return;
    const ids = listaVariacionesGCD().filter((id) => id !== variacionActivaGCD() && audiosVariacionesGCD[id]);
    for (const id of ids) {
        const a = audiosVariacionesGCD[id];
        await idbPutAudios(claveAudiosVariacion(chartId, id), { inst: a.inst || undefined, v1: a.v1 || undefined, v2: a.v2 || undefined });
    }
}

async function restaurarAudiosVariacionesArchivador(chartId) {
    if (!chartId || !currentChartData || typeof idbGetAudios !== "function") return;
    const ids = listaVariacionesGCD().filter((id) => id !== variacionActivaGCD());
    if (!ids.length) return;
    const audios = {};
    for (const id of ids) {
        let r = null;
        try { r = await idbGetAudios(claveAudiosVariacion(chartId, id)); } catch (e) { r = null; }
        const aFile = (blob, nombre) => (!blob ? null : (blob instanceof File ? blob : new File([blob], nombre, { type: blob.type || "audio/ogg" })));
        if (!r || (!r.inst && !r.v1 && !r.v2)) {
            // Sin audios propios guardados → fallback a los de Default (como V-Slice), nunca silencio.
            const d = id !== "default" ? (audios.default || audiosDeVariacionGCD("default")) : null;
            audios[id] = { inst: (d && d.inst) || null, v1: (d && d.v1) || null, v2: (d && d.v2) || null };
            continue;
        }
        audios[id] = {
            inst: aFile(r.inst, `Inst-${id}.ogg`),
            v1: aFile(r.v1, `Voices-Player-${id}.ogg`),
            v2: aFile(r.v2, `Voices-Opponent-${id}.ogg`)
        };
    }
    await prepararAudiosVariaciones(audios);
}

async function borrarAudiosVariacionesArchivador(chartId, ids) {
    if (!chartId || typeof idbDeleteAudios !== "function") return;
    for (const id of ids || []) {
        try { await idbDeleteAudios(claveAudiosVariacion(chartId, id)); } catch (e) { }
    }
}

// Estado legible (pruebas / consola).
function estadoVariacionesGCD() {
    if (!currentChartData) return null;
    const carpetas = {};
    listaVariacionesGCD().forEach((id) => {
        const d = datosVariacionGCD(id);
        const a = audiosDeVariacionGCD(id);
        carpetas[id] = {
            dificultades: d ? ordenDificultadesCarpeta(d.difficulties, id).filter((n) => d.difficulties[n]) : [],
            bpm: d ? d.bpm : null,
            audios: { inst: a.inst ? a.inst.name : null, v1: a.v1 ? a.v1.name : null, v2: a.v2 ? a.v2.name : null }
        };
    });
    return { activa: variacionActivaGCD(), dificultad: dificultadActiva, orden: listaVariacionesGCD(), carpetas };
}
