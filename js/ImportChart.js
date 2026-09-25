// Toda la importacion de charts (.fnfc, JSON y proyectos archivados) vive aqui.

function mostrarModalImportacion() {
	const modal = document.getElementById("modal-importar-chart");
	if (modal) modal.classList.add("active");
}

function cerrarModalImportacion() {
	const modal = document.getElementById("modal-importar-chart");
	if (modal) modal.classList.remove("active");
}

function menuAbrirChart() {
	mostrarModalImportacion();
}

function menuAbrirCodename() {
	mostrarModalImportacion();
}

function seleccionarImportacion(tipo) {
	cerrarModalImportacion();
	const inputId = tipo === "fnfc" ? "import-fnfc-input" : "import-codename-input";
	document.getElementById(inputId)?.click();
}

function normalizarChartFNFC(data) {
	if (!data || (!data.songName && !data.name) || !data.notes || typeof data.notes !== "object" || Array.isArray(data.notes)) return null;
	const esFormatoInterno = Object.keys(data.notes).every((key) => /^\d+-\d+$/.test(key));
	if (!esFormatoInterno) return null;
	const notes = data.notes || {};
	return {
		id: data.id || "chart_" + Date.now(),
		songName: data.songName || data.name || "Imported Chart",
		bpm: parseFloat(data.bpm) || 160,
		author: data.author || data.composer || data.artist || "",
		charter: data.charter || "",
		speed: parseFloat(data.speed) || 1,
		player: data.player || "bf",
		opponent: data.opponent || "dad",
		girlfriend: data.girlfriend || "gf",
		album: data.album || "volume1",
		difficulty: parseInt(data.difficulty, 10) || 3,
		stage: data.stage || "stage",
		audioBase64: data.audioBase64 || undefined,
		totalRows: parseInt(data.totalRows, 10) || calcularFilasDesdeNotas(notes),
		notes: notes,
		events: data.events && typeof data.events === "object" && !Array.isArray(data.events) ? data.events : {},
	};
}

function calcularFilasDesdeNotas(notes) {
	let maxRow = 0;
	for (const key in notes) {
		const parts = key.split("-");
		const row = parseInt(parts[0], 10);
		const len = parseInt(notes[key].len, 10) || 0;
		if (!Number.isNaN(row)) maxRow = Math.max(maxRow, row + len);
	}
	return Math.max(16, Math.ceil((maxRow + 16) / 16) * 16);
}

function calcularFilasDesdeDuracion(duracion, bpm) {
	if (!Number.isFinite(duracion) || duracion <= 0 || !Number.isFinite(bpm) || bpm <= 0) return 0;
	const totalSteps = Math.ceil(duracion / ((60 / bpm) / 4));
	return Math.max(16, Math.ceil(totalSteps / 16) * 16);
}

function pintarNotasActuales() {
	const notes = currentChartData && currentChartData.notes ? currentChartData.notes : {};
	for (const key in notes) {
		const parts = key.split("-");
		const f = parseInt(parts[0], 10);
		const c = parseInt(parts[1], 10);
		if (Number.isNaN(f) || Number.isNaN(c)) continue;

		const cell = document.getElementById(`cell-${f}-${c}`);
		if (!cell) continue;
		const circulo = document.createElement("div");
		circulo.className = `grid-note-circle note-col-${c % 4}`;
		cell.appendChild(circulo);

		const len = Math.max(0, parseInt(notes[key].len, 10) || 0);
		if (len > 0) {
			const line = document.createElement("div");
			line.className = "sustain-line";
			line.style.height = len * alturaCelda + "px";
			cell.appendChild(line);
		}
	}
}

function pintarEventosActuales() {
	document.querySelectorAll(".event-note-icon").forEach((el) => el.remove());
	const events = currentChartData && currentChartData.events ? currentChartData.events : {};
	for (const row in events) {
		const cell = document.getElementById(`event-cell-${row}`);
		if (!cell) continue;
		const icon = document.createElement("img");
		icon.className = "event-note-icon";
		icon.src = "eventassets/FocusCamera.png";
		icon.alt = "Focus Camera";
		cell.appendChild(icon);
	}
}

function agregarNotaImportada(notes, timeMs, lane, sustainMs, stepMs) {
	const laneValue = parseInt(lane, 10);
	const time = parseFloat(timeMs);
	if (Number.isNaN(time) || Number.isNaN(laneValue) || laneValue < 0 || laneValue > 7) return 0;
	const col = laneValue;

	const row = Math.max(0, Math.round(time / stepMs));
	const len = Math.max(0, Math.round((parseFloat(sustainMs) || 0) / stepMs));
	notes[`${row}-${col}`] = { len: len };
	return row + len;
}

function convertirEventosExternos(events, bpm, dificultad = "normal") {
	const resultado = {};
	if (events && !Array.isArray(events) && typeof events === "object") events = events[dificultad] || events.normal || [];
	if (!Array.isArray(events) || !Number.isFinite(bpm) || bpm <= 0) return resultado;
	const stepMs = 60000 / bpm / 4;
	const charToTarget = ["player", "opponent", "gf"]; // 0=player, 1=opponent, 2=gf (match export)

	events.forEach((evento) => {
		if (!evento || evento.e !== "FocusCamera") return;
		const tiempo = parseFloat(evento.t);
		if (!Number.isFinite(tiempo)) return;
		const valores = evento.v && typeof evento.v === "object" ? evento.v : {};
		const fila = Math.max(0, Math.round(tiempo / stepMs));
		const char = parseInt(valores.char, 10);
		resultado[fila] = {
			type: "Focus Camera",
			target: charToTarget[char] || "opponent",
			duration: Number(valores.duration) || 4,
			offsetX: Number(valores.x) || 0,
			offsetY: Number(valores.y) || 0,
			effect: valores.ease || "CLASSIC"
		};
	});
	return resultado;
}

function convertirChartExterno(data) {
	if (!data || typeof data !== "object") return null;

	const interno = normalizarChartFNFC(data);
	if (interno) return interno;

	const root = data.song && typeof data.song === "object" ? data.song : data;
	const bpm = parseFloat(root.bpm || data.bpm) || 160;
	const speedValue = typeof root.scrollSpeed === "object" ? root.scrollSpeed.normal : root.scrollSpeed;
	const stepMs = 60000 / bpm / 4;
	// Offset del instrumental (V-Slice metadata.offsets.instrumental, ms).
	// En el juego la musica suena en (tiempoNota - offset), asi que se resta para que
	// cada flecha caiga donde suena en el archivo de audio.
	const offsetMs = parseFloat(data.importOffsetMs) || 0;
	const agregar = (n, timeMs, lane, sus) => agregarNotaImportada(n, (parseFloat(timeMs) || 0) - offsetMs, lane, sus, stepMs);
	const notes = {};
	let maxRow = 0;

	if (Array.isArray(root.notes) && root.notes.length && root.notes[0].sectionNotes) {
		root.notes.forEach((section) => {
			(section.sectionNotes || []).forEach((note) => {
				const noteData = parseInt(note[1], 10);
				if (Number.isNaN(noteData) || noteData < 0 || noteData > 7) return;
				maxRow = Math.max(maxRow, agregar(notes, note[0], noteData, note[2]));
			});
		});
	} else if (Array.isArray(root.strumLines || root.strumlines)) {
		const strumLines = root.strumLines || root.strumlines;
		strumLines.forEach((line, lineIndex) => {
			const tag = `${line.type || ""} ${line.position || ""} ${line.name || ""} ${line.characters || ""}`.toLowerCase();
			let offset = lineIndex === 0 ? 0 : 4;
			if (tag.includes("opponent") || tag.includes("enemy") || tag.includes("dad") || line.type === 1) offset = 4;
			if (tag.includes("player") || tag.includes("boyfriend") || tag.includes("bf") || line.type === 0) offset = 0;

			(line.notes || []).forEach((note) => {
				const lane = parseInt(note.id ?? note.d ?? note.lane ?? note.noteData, 10);
				if (Number.isNaN(lane)) return;
				const col = lane > 3 ? lane % 8 : offset + lane;
				maxRow = Math.max(maxRow, agregar(notes, note.time ?? note.t, col, note.sLen ?? note.l ?? note.sustainLength));
			});
		});
	} else {
		const noteList = Array.isArray(root.notes) ? root.notes : root.notes && (root.notes.normal || root.notes.hard || root.notes.easy);
		if (Array.isArray(noteList)) {
			noteList.forEach((note) => {
				const lane = parseInt(note.d ?? note.id ?? note.lane ?? note.noteData ?? note[1], 10);
				const time = note.t ?? note.time ?? note[0];
				const sustain = note.l ?? note.sLen ?? note.sustainLength ?? note[2];
				if (Number.isNaN(lane)) return;
				const col = lane % 8;
				maxRow = Math.max(maxRow, agregar(notes, time, col, sustain));
			});
		}
	}

	if (Object.keys(notes).length === 0) return null;
	return {
		id: "chart_" + Date.now(),
		songName: root.songName || root.song || root.name || data.songName || "Imported Chart",
		bpm: bpm,
		author: root.artist || root.author || "",
		charter: root.charter || root.chartedBy || "",
		speed: parseFloat(speedValue) || parseFloat(data.speed) || 1,
		player: data.player || "bf",
		opponent: data.opponent || "dad",
		girlfriend: data.girlfriend || "gf",
		album: data.album || "volume1",
		difficulty: parseInt(data.difficulty, 10) || 3,
		stage: data.stage || "stage",
		totalRows: Math.max(16, Math.ceil((maxRow + 16) / 16) * 16),
		notes: notes,
		events: convertirEventosExternos(data.events, bpm, data.difficultyName),
	};
}

function buscarEntradaZip(zip, nombres) {
	const candidatos = Array.isArray(nombres) ? nombres : [nombres];
	let encontrada = null;
	zip.forEach((relativePath, zipEntry) => {
		if (encontrada || zipEntry.dir) return;
		const nombre = relativePath.split("/").pop().toLowerCase();
		if (candidatos.some((candidato) => nombre === candidato.toLowerCase())) encontrada = zipEntry;
	});
	return encontrada;
}

function buscarEntradaZipPorPalabra(zip, palabra) {
	let encontrada = null;
	zip.forEach((relativePath, zipEntry) => {
		if (encontrada || zipEntry.dir) return;
		const nombre = relativePath.split("/").pop().toLowerCase();
		if (nombre.includes(palabra) && nombre.endsWith(".json")) encontrada = zipEntry;
	});
	return encontrada;
}

function mimeAudioDesdeNombre(nombre) {
	const n = String(nombre || "").toLowerCase();
	if (n.endsWith(".mp3")) return "audio/mpeg";
	if (n.endsWith(".wav")) return "audio/wav";
	if (n.endsWith(".flac")) return "audio/flac";
	if (n.endsWith(".ogg") || n.endsWith(".oga")) return "audio/ogg";
	if (n.endsWith(".m4a") || n.endsWith(".mp4")) return "audio/mp4";
	return ""; // no forzar
}

function archivoDesdeBlobZip(blob, zipEntryOrName) {
	if (!blob) return null;
	const name = typeof zipEntryOrName === "string"
		? zipEntryOrName
		: (zipEntryOrName && zipEntryOrName.name) || "audio.ogg";
	const inferred = mimeAudioDesdeNombre(name);
	const type = inferred || blob.type || "application/octet-stream";
	return new File([blob], name.split("/").pop(), { type });
}

/** Match Voices.ogg, Player.ogg, Voices-Player.*, Voices-Opponent.*, case-insensitive. */
function buscarEntradaZipPatron(zip, predicado) {
	let encontrada = null;
	zip.forEach((relativePath, zipEntry) => {
		if (encontrada || zipEntry.dir) return;
		const nombre = relativePath.split("/").pop();
		if (predicado(nombre, nombre.toLowerCase())) encontrada = zipEntry;
	});
	return encontrada;
}

function buscarVocesPlayerZip(zip, metadata) {
	const player = metadata && metadata.player ? String(metadata.player) : "";
	const exact = [
		"Voices-Player.ogg",
		"voices-player.ogg",
		"Player.ogg",
		"player.ogg",
		"Voices.ogg",
		"voices.ogg"
	];
	if (player) exact.push(`voices-${player}.ogg`, `Voices-${player}.ogg`);
	let hit = buscarEntradaZip(zip, exact);
	if (hit) return hit;
	return buscarEntradaZipPatron(zip, (name, low) => {
		if (/^voices-player\./i.test(name)) return true;
		if (low === "voices.ogg" || low === "player.ogg") return true;
		if (player && low === `voices-${player.toLowerCase()}.ogg`) return true;
		return false;
	});
}

function buscarVocesOpponentZip(zip, metadata) {
	const opponent = metadata && metadata.opponent ? String(metadata.opponent) : "";
	const exact = [
		"Voices-Opponent.ogg",
		"voices-opponent.ogg",
		"Opponent.ogg",
		"opponent.ogg"
	];
	if (opponent) exact.push(`voices-${opponent}.ogg`, `Voices-${opponent}.ogg`);
	let hit = buscarEntradaZip(zip, exact);
	if (hit) return hit;
	return buscarEntradaZipPatron(zip, (name, low) => {
		if (/^voices-opponent\./i.test(name)) return true;
		if (low === "opponent.ogg") return true;
		if (opponent && low === `voices-${opponent.toLowerCase()}.ogg`) return true;
		return false;
	});
}

function buscarAudioZip(zip, prefijo, nombre) {
	const nombreNormalizado = String(nombre || "").trim().toLowerCase();
	const esperado = nombreNormalizado ? `${prefijo}-${nombreNormalizado}.ogg` : `${prefijo}.ogg`;
	return buscarEntradaZip(zip, esperado);
}

function obtenerNombrePersonaje(valor, respaldo) {
	if (Array.isArray(valor)) valor = valor[0];
	if (valor && typeof valor === "object") valor = valor.name || valor.id || valor.character;
	return String(valor || respaldo).trim().toLowerCase();
}

function extraerBpmDesdeMetadata(metaJson, fallback = 160) {
	const meta = metaJson && typeof metaJson === "object" ? metaJson : {};
	const fromTime = meta.timeChanges && Array.isArray(meta.timeChanges) && meta.timeChanges[0]
		? parseFloat(meta.timeChanges[0].bpm)
		: NaN;
	const fromMeta = parseFloat(meta.bpm);
	const fromFallback = parseFloat(fallback);
	if (Number.isFinite(fromTime) && fromTime > 0) return fromTime;
	if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
	if (Number.isFinite(fromFallback) && fromFallback > 0) return fromFallback;
	return 160;
}

function cargarMetadatosImportados(meta, chart) {
	const playData = meta.playData || {};
	const characters = playData.characters || {};
	const speedValue = typeof chart.scrollSpeed === "object" ? chart.scrollSpeed.normal : chart.scrollSpeed;
	const bpm = extraerBpmDesdeMetadata(meta, chart && chart.bpm);
	return {
		songName: meta.songName || meta.song || "Imported Chart",
		author: meta.artist || meta.composer || "",
		charter: meta.charter || meta.credit || "",
		bpm: bpm,
		speed: parseFloat(speedValue) || 1,
		player: obtenerNombrePersonaje(characters.player || playData.player || meta.player || playData.playerVocals || meta.playerVocals, "bf"),
		opponent: obtenerNombrePersonaje(characters.opponent || playData.opponent || meta.opponent || playData.opponentVocals || meta.opponentVocals, "dad"),
		girlfriend: obtenerNombrePersonaje(characters.girlfriend || playData.girlfriend || meta.girlfriend, "gf"),
		album: meta.album || playData.album || "volume1",
		difficulty: parseInt(playData.ratings?.normal || meta.difficulty, 10) || 3,
		stage: playData.stage || meta.stage || "stage",
	};
}

function abrirChartEnEditor(data, conservarAudios = false) {
	const dificultadesPreservadas = data && data.difficulties && typeof data.difficulties === "object" && !Array.isArray(data.difficulties)
		? JSON.parse(JSON.stringify(data.difficulties))
		: null;
	const dificultadActivaPreservada = data && typeof data.activeDifficulty === "string" ? data.activeDifficulty : null;
	const chart = normalizarChartFNFC(data) || convertirChartExterno(data);
	if (!chart) return false;

	if (dificultadesPreservadas && Object.keys(dificultadesPreservadas).length) {
		chart.difficulties = dificultadesPreservadas;
		const preferidaOriginal = dificultadActivaPreservada && dificultadesPreservadas[dificultadActivaPreservada]
			? dificultadActivaPreservada
			: (dificultadesPreservadas.normal ? "normal" : Object.keys(dificultadesPreservadas)[0]);
		chart.notes = dificultadesPreservadas[preferidaOriginal].notes || chart.notes || {};
		chart.events = dificultadesPreservadas[preferidaOriginal].events || chart.events || {};
		chart.activeDifficulty = preferidaOriginal;
	}

	currentChartData = chart;
	asegurarDificultadesChart(currentChartData);
	if (!conservarAudios) limpiarAudiosExistentes();
	generarEstructuraGrilla(currentChartData.totalRows);
	pintarNotasActuales();
	pintarEventosActuales();
	cargarDatosEnMesa(null, null, currentChartData.songName, currentChartData.bpm);
	const speedInput = document.getElementById("speed-dummy-input");
	if (speedInput) speedInput.value = currentChartData.speed || 1;
	const songNameInput = document.getElementById("song-name");
	if (songNameInput) songNameInput.value = currentChartData.songName || "";
	const bpmInput = document.getElementById("song-bpm");
	if (bpmInput) bpmInput.value = currentChartData.bpm || 160;
	const authorInput = document.getElementById("song-author");
	if (authorInput && currentChartData.author) authorInput.value = currentChartData.author;
	const charterInput = document.getElementById("song-charter");
	if (charterInput && currentChartData.charter) charterInput.value = currentChartData.charter;
	inicializarWorkspace();
	actualizarListaDificultades();
	actualizarIndicadorDificultad();
	if (typeof actualizarMenuArchivar === "function") actualizarMenuArchivar();
	return true;
}

async function procesarArchivoFNFC(input) {
	const file = input.files[0];
	if (!file) return;

	try {
		limpiarAudiosExistentes();
		const zip = await JSZip.loadAsync(file);
		const metaFile = buscarEntradaZip(zip, ["song-metadata.json", "metadata.json"]) || buscarEntradaZipPorPalabra(zip, "metadata");
		const chartFile = buscarEntradaZip(zip, ["song-chart.json", "chart.json"]) || buscarEntradaZipPorPalabra(zip, "chart");

		if (metaFile && chartFile) {
			const metaJson = JSON.parse(await metaFile.async("string"));
			const chartJson = JSON.parse(await chartFile.async("string"));

			const metadata = cargarMetadatosImportados(metaJson, chartJson);
			const offsetInstMs = parseFloat(metaJson && metaJson.offsets && metaJson.offsets.instrumental) || 0;
			const notasPorDificultad = chartJson.notes && typeof chartJson.notes === "object" && !Array.isArray(chartJson.notes)
				? chartJson.notes
				: { normal: chartJson.notes };

			const dificultadesImportadas = {};
			let maxFilasGlobales = 0;
			Object.keys(notasPorDificultad).forEach((nombre) => {
				const dificultad = convertirChartExterno({
					...metadata,
					notes: notasPorDificultad[nombre],
					events: chartJson.events?.[nombre] || chartJson.events,
					difficultyName: nombre,
					importOffsetMs: offsetInstMs,
					scrollSpeed: chartJson.scrollSpeed?.[nombre] ?? metadata.speed
				});
				if (dificultad) {
					dificultadesImportadas[nombre] = { notes: dificultad.notes, events: dificultad.events };
					maxFilasGlobales = Math.max(maxFilasGlobales, dificultad.totalRows || 0);
				}
			});

			const chart = convertirChartExterno({
				...metadata,
				notes: notasPorDificultad.normal || notasPorDificultad[Object.keys(notasPorDificultad)[0]] || {},
				events: chartJson.events?.normal || chartJson.events,
				importOffsetMs: offsetInstMs,
				scrollSpeed: chartJson.scrollSpeed ?? metadata.speed
			});
			if (!chart) throw new Error("Chart sin notas reconocibles");

			// Metadata BPM siempre gana sobre bpm del chart.json
			const bpmMeta = extraerBpmDesdeMetadata(metaJson, metadata.bpm);
			metadata.bpm = bpmMeta;
			chart.bpm = bpmMeta;

			if (Object.keys(dificultadesImportadas).length) {
				chart.difficulties = dificultadesImportadas;
				const primeraDificultad = Object.keys(dificultadesImportadas).find((n) => n === "normal") || Object.keys(dificultadesImportadas)[0];
				chart.notes = dificultadesImportadas[primeraDificultad].notes;
				chart.events = dificultadesImportadas[primeraDificultad].events;
				chart.activeDifficulty = primeraDificultad;
				chart.totalRows = Math.max(chart.totalRows || 0, maxFilasGlobales);
			}
			const instrumentalName = metaJson.playData?.characters?.instrumental || metaJson.playData?.inst || metaJson.inst || "";
			const instZip = buscarAudioZip(zip, "inst", instrumentalName) || buscarAudioZip(zip, "inst", "");
			const playerZip = buscarVocesPlayerZip(zip, metadata);
			const opponentZip = buscarVocesOpponentZip(zip, metadata);
			const blobInst = instZip ? await instZip.async("blob") : null;
			const blobPlayer = playerZip ? await playerZip.async("blob") : null;
			const blobOpponent = opponentZip ? await opponentZip.async("blob") : null;
			fileRawInst = archivoDesdeBlobZip(blobInst, instZip);
			fileRawV1 = archivoDesdeBlobZip(blobPlayer, playerZip);
			fileRawV2 = archivoDesdeBlobZip(blobOpponent, opponentZip);
			if (fileRawInst) audioInst = crearElementoAudio(fileRawInst);
			if (fileRawV1) audioVoice1 = crearElementoAudio(fileRawV1);
			if (fileRawV2) audioVoice2 = crearElementoAudio(fileRawV2);
			buffers.inst = await decodeAudioFile(fileRawInst);
			buffers.v1 = await decodeAudioFile(fileRawV1);
			buffers.v2 = await decodeAudioFile(fileRawV2);
			if (typeof reconstruirCacheWaveforms === "function") reconstruirCacheWaveforms();
			if (typeof fijarVolumenPistas === "function") fijarVolumenPistas();
			if (typeof resetWaPlaybackState === "function") resetWaPlaybackState();
			if (typeof sincronizarPistasAudio === "function") sincronizarPistasAudio(0);
			const duracionAudio = Math.max(
				buffers.inst?.duration || 0,
				buffers.v1?.duration || 0,
				buffers.v2?.duration || 0
			);
			chart.totalRows = Math.max(
				chart.totalRows || 0,
				calcularFilasDesdeDuracion(duracionAudio, bpmMeta)
			);

			const dificultadesPreservadas = chart.difficulties && Object.keys(chart.difficulties).length
				? JSON.parse(JSON.stringify(chart.difficulties))
				: null;
			const dificultadActivaPreservada = chart.activeDifficulty || null;

			if (!abrirChartEnEditor(chart, true)) throw new Error("Chart sin notas reconocibles");

			// Reafirmar BPM de metadata tras abrir (por si normalización/UI lo alteró)
			if (currentChartData) {
				currentChartData.bpm = bpmMeta;
				const bpmInputForce = document.getElementById("song-bpm");
				if (bpmInputForce) bpmInputForce.value = bpmMeta;
				const bpmDisplay = document.getElementById("display-song-bpm");
				if (bpmDisplay) bpmDisplay.innerText = "BPM: " + bpmMeta;
			}

			if (dificultadesPreservadas && currentChartData) {
				currentChartData.difficulties = dificultadesPreservadas;
				Object.keys(currentChartData.difficulties).forEach((nombre) => {
					currentChartData.difficulties[nombre].notes ||= {};
					currentChartData.difficulties[nombre].events ||= {};
				});
				const diffKeys = Object.keys(currentChartData.difficulties);
				let preferida;
				if (dificultadActivaPreservada && currentChartData.difficulties[dificultadActivaPreservada]) {
					preferida = dificultadActivaPreservada;
				} else if (currentChartData.difficulties.normal) {
					preferida = "normal";
				} else {
					preferida = diffKeys[0];
				}
				dificultadActiva = preferida;
				currentChartData.activeDifficulty = preferida;
				currentChartData.notes = currentChartData.difficulties[preferida].notes;
				// Fusionar events de todas las dif. en una sola referencia compartida
				asegurarEventosCompartidos(currentChartData);
				notaSeleccionada = null;
				deseleccionarEventoActual();
				generarEstructuraGrilla(currentChartData.totalRows);
				pintarNotasActuales();
				pintarEventosActuales();
				actualizarListaDificultades();
				actualizarIndicadorDificultad();
			}

			aplicarMuteEstadosUI();
			autoAjustarSelectoresDeWaveform(!!(fileRawV1 || fileRawV2));
			cargarDatosEnMesa(fileRawV1, fileRawV2, metadata.songName, metadata.bpm);
			if (typeof refrescarWaveformsTrasCarga === "function") refrescarWaveformsTrasCarga();
			else if (typeof actualizarWaveforms === "function") setTimeout(() => actualizarWaveforms(null, true), 150);
			if (typeof cerrarModalNuevoChart === "function") cerrarModalNuevoChart();
			if (typeof cerrarModalImportacion === "function") cerrarModalImportacion();
			if (typeof actualizarMenuArchivar === "function") actualizarMenuArchivar();
			return;
		}

		const data = JSON.parse(await file.text());
		if (!abrirChartEnEditor(data)) {
			alert("Archivo .fnfc invalido.");
		} else {
			if (typeof cerrarModalNuevoChart === "function") cerrarModalNuevoChart();
			if (typeof cerrarModalImportacion === "function") cerrarModalImportacion();
			if (typeof actualizarMenuArchivar === "function") actualizarMenuArchivar();
		}
	} catch (err) {
		console.error(err);
		alert("Error al leer y decodificar el archivo del chart.");
	} finally {
		input.value = "";
	}
}

function procesarArchivoCodename(input) {
	const file = input.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const chart = convertirChartExterno(JSON.parse(e.target.result));
			if (!chart || !abrirChartEnEditor(chart)) alert("Formato JSON/Codename no reconocido.");
		} catch (err) {
			alert("Error al leer archivo JSON/Codename.");
		}
	};
	reader.readAsText(file);
	input.value = "";
}

function renderizarProyectosArchivados() {
	const grid = document.getElementById("lista-proyectos-grid");
	if (!grid) return;

	grid.innerHTML = `
		<div class="folder-card new-project" onclick="abrirModalNuevoChart()">
			<div class="folder-icon"><i class="fa-solid fa-folder-plus"></i></div>
			<h3>Nuevo Chart</h3>
		</div>`;

	const proyectos = (typeof leerProyectosArchivadosLS === "function")
		? leerProyectosArchivadosLS()
		: (JSON.parse(localStorage.getItem("fnf_mobile_charts") || "[]") || []);
	proyectos.forEach((proy) => {
		const card = document.createElement("div");
		card.className = "folder-card";
		card.innerHTML = `
			<button class="delete-project-btn" onclick="eliminarProyectoArchivado(event, '${proy.id}')">
				<i class="fa-solid fa-trash"></i>
			</button>
			<div class="folder-icon" onclick="cargarProyectoDesdeArchivo('${proy.id}')">
				<i class="fa-solid fa-file-audio" style="color: #5b84ff;"></i>
			</div>
			<h3 onclick="cargarProyectoDesdeArchivo('${proy.id}')">${proy.songName}</h3>
			<p style="font-size:11px; color:var(--text-sub);">BPM: ${proy.bpm}</p>`;
		grid.appendChild(card);
	});
}

function eliminarProyectoArchivado(event, id) {
	event.stopPropagation();
	if (!confirm("¿Eliminar chart?")) return;
	let proyectos = (typeof leerProyectosArchivadosLS === "function")
		? leerProyectosArchivadosLS()
		: (JSON.parse(localStorage.getItem("fnf_mobile_charts") || "[]") || []);
	proyectos = proyectos.filter((proyecto) => proyecto.id !== id);
	if (typeof guardarProyectosArchivadosLS === "function") {
		guardarProyectosArchivadosLS(proyectos);
	} else {
		localStorage.setItem("fnf_mobile_charts", JSON.stringify(proyectos));
	}
	if (typeof idbDeleteAudios === "function") {
		idbDeleteAudios(id).catch((e) => console.warn("No se pudieron borrar audios IDB", e));
	}
	renderizarProyectosArchivados();
}

async function cargarProyectoDesdeArchivo(id) {
	const proyectos = (typeof leerProyectosArchivadosLS === "function")
		? leerProyectosArchivadosLS()
		: (JSON.parse(localStorage.getItem("fnf_mobile_charts") || "[]") || []);
	const proyecto = proyectos.find((item) => item.id === id);
	if (!proyecto) {
		alert("No se encontró el chart archivado.");
		return;
	}

	// Migrar audioBase64 legado → IndexedDB (una vez)
	if (proyecto.audioBase64 && typeof migrarAudioBase64AIdb === "function") {
		try {
			await migrarAudioBase64AIdb(proyecto);
		} catch (e) {
			console.warn("Migración audioBase64 falló", e);
		}
	}

	// Evitar audios residuales de otra sesión si este archivado no tiene IDB
	fileRawInst = null;
	fileRawV1 = null;
	fileRawV2 = null;

	if (!abrirChartEnEditor(proyecto)) {
		alert("No se pudo abrir el chart archivado.");
		return;
	}

	// Restaurar audios desde IndexedDB (o restos de migración)
	let restaurado = false;
	if (typeof restaurarAudiosEnMemoria === "function") {
		try {
			restaurado = await restaurarAudiosEnMemoria(
				proyecto.id,
				currentChartData?.songName || proyecto.songName,
				currentChartData?.bpm || proyecto.bpm
			);
		} catch (e) {
			console.warn("Restaurar audios IDB falló", e);
		}
	}

	// Fallback: si aún hay audioBase64 en memoria (migración parcial)
	if (!restaurado && proyecto.audioBase64 && typeof dataUrlABlob === "function") {
		try {
			const ab = proyecto.audioBase64;
			const instBlob = ab.inst ? dataUrlABlob(ab.inst) : null;
			const v1Blob = ab.v1 ? dataUrlABlob(ab.v1) : null;
			const v2Blob = ab.v2 ? dataUrlABlob(ab.v2) : null;
			fileRawInst = instBlob ? archivoDesdeBlobZip(instBlob, "inst.ogg") : null;
			fileRawV1 = v1Blob ? archivoDesdeBlobZip(v1Blob, "voices-player.ogg") : null;
			fileRawV2 = v2Blob ? archivoDesdeBlobZip(v2Blob, "voices-opponent.ogg") : null;
			if (fileRawInst) audioInst = crearElementoAudio(fileRawInst);
			if (fileRawV1) audioVoice1 = crearElementoAudio(fileRawV1);
			if (fileRawV2) audioVoice2 = crearElementoAudio(fileRawV2);
			buffers.inst = await decodeAudioFile(fileRawInst);
			buffers.v1 = await decodeAudioFile(fileRawV1);
			buffers.v2 = await decodeAudioFile(fileRawV2);
			if (typeof reconstruirCacheWaveforms === "function") reconstruirCacheWaveforms();
			if (typeof fijarVolumenPistas === "function") fijarVolumenPistas();
			if (typeof resetWaPlaybackState === "function") resetWaPlaybackState();
			if (typeof sincronizarPistasAudio === "function") sincronizarPistasAudio(0);
			autoAjustarSelectoresDeWaveform(!!(fileRawV1 || fileRawV2));
			cargarDatosEnMesa(fileRawV1, fileRawV2, currentChartData.songName, currentChartData.bpm);
			if (typeof refrescarWaveformsTrasCarga === "function") refrescarWaveformsTrasCarga();
			else if (typeof actualizarWaveforms === "function") setTimeout(() => actualizarWaveforms(null, true), 150);
			restaurado = !!(fileRawInst || fileRawV1 || fileRawV2);
			if (restaurado && typeof idbPutAudios === "function") {
				await idbPutAudios(proyecto.id, {
					inst: fileRawInst || undefined,
					v1: fileRawV1 || undefined,
					v2: fileRawV2 || undefined
				}).catch(() => {});
			}
		} catch (e) {
			console.warn("Fallback audioBase64 falló", e);
		}
	}

	if (typeof actualizarMenuArchivar === "function") actualizarMenuArchivar();
}
