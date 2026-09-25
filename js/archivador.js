// Archivador: chart JSON en localStorage; audios (Blob) en IndexedDB.
const ARCHIVADOR_DB_NAME = "fnf_gcd_archivador";
const ARCHIVADOR_STORE = "audios";
const ARCHIVADOR_LS_KEY = "fnf_mobile_charts";

function openArchivadorDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(ARCHIVADOR_DB_NAME, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(ARCHIVADOR_STORE)) {
				db.createObjectStore(ARCHIVADOR_STORE, { keyPath: "chartId" });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error || new Error("No se pudo abrir IndexedDB"));
	});
}

async function idbPutAudios(chartId, { inst, v1, v2 }) {
	if (!chartId) throw new Error("chartId requerido para guardar audios");
	const db = await openArchivadorDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(ARCHIVADOR_STORE, "readwrite");
		const store = tx.objectStore(ARCHIVADOR_STORE);
		const value = {
			chartId,
			inst: inst || undefined,
			v1: v1 || undefined,
			v2: v2 || undefined,
			updatedAt: Date.now()
		};
		store.put(value);
		tx.oncomplete = () => {
			db.close();
			resolve(true);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error || new Error("Error al guardar audios en IndexedDB"));
		};
		tx.onabort = () => {
			db.close();
			reject(tx.error || new Error("Transacción IndexedDB abortada"));
		};
	});
}

async function idbGetAudios(chartId) {
	if (!chartId) return null;
	const db = await openArchivadorDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(ARCHIVADOR_STORE, "readonly");
		const store = tx.objectStore(ARCHIVADOR_STORE);
		const req = store.get(chartId);
		req.onsuccess = () => {
			db.close();
			resolve(req.result || null);
		};
		req.onerror = () => {
			db.close();
			reject(req.error || new Error("Error al leer audios de IndexedDB"));
		};
	});
}

async function idbDeleteAudios(chartId) {
	if (!chartId) return;
	const db = await openArchivadorDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(ARCHIVADOR_STORE, "readwrite");
		tx.objectStore(ARCHIVADOR_STORE).delete(chartId);
		tx.oncomplete = () => {
			db.close();
			resolve(true);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error || new Error("Error al eliminar audios de IndexedDB"));
		};
	});
}

function leerProyectosArchivadosLS() {
	try {
		return JSON.parse(localStorage.getItem(ARCHIVADOR_LS_KEY) || "[]") || [];
	} catch (e) {
		console.warn("fnf_mobile_charts corrupto; se reinicia lista", e);
		return [];
	}
}

function guardarProyectosArchivadosLS(proyectos) {
	localStorage.setItem(ARCHIVADOR_LS_KEY, JSON.stringify(proyectos));
}

function clonLimpiarChartParaLS(chart) {
	if (!chart || typeof chart !== "object") {
		throw new Error("No hay datos de chart para guardar.");
	}
	const out = {
		id: chart.id,
		songName: chart.songName || "Untitled",
		bpm: chart.bpm || 160,
		author: chart.author || "",
		charter: chart.charter || "",
		speed: chart.speed || 1,
		player: chart.player || "bf",
		opponent: chart.opponent || "dad",
		girlfriend: chart.girlfriend || "gf",
		album: chart.album || "volume1",
		difficulty: chart.difficulty || 3,
		stage: chart.stage || "stage",
		totalRows: chart.totalRows || 0,
		activeDifficulty: chart.activeDifficulty || "normal",
		archivado: true
	};
	try {
		out.notes = JSON.parse(JSON.stringify(chart.notes || {}));
		out.events = JSON.parse(JSON.stringify(chart.events || {}));
		if (chart.difficulties && typeof chart.difficulties === "object") {
			out.difficulties = JSON.parse(JSON.stringify(chart.difficulties));
		}
	} catch (e) {
		throw new Error("No se pudo serializar el chart (referencias no válidas).");
	}
	return out;
}

function chartEstaEnArchivador() {
	if (!currentChartData?.id) return false;
	const proyectos = leerProyectosArchivadosLS();
	return proyectos.some((p) => p.id === currentChartData.id);
}

function actualizarMenuArchivar() {
	const item = document.getElementById("menu-item-archivar");
	const label = document.getElementById("menu-item-archivar-label");
	if (!item || !label) return;
	if (chartEstaEnArchivador()) {
		label.textContent = "Guardar En El Archivador";
		item.setAttribute("title", "Actualizar el chart archivado (notas + audios)");
	} else {
		label.textContent = "Archivar Chart";
		item.setAttribute("title", "Guardar el chart en este navegador");
	}
}

function dataUrlABlob(dataUrl) {
	if (!dataUrl || typeof dataUrl !== "string") return null;
	const parts = dataUrl.split(",");
	if (parts.length < 2) return null;
	const meta = parts[0];
	const mimeMatch = meta.match(/data:([^;]+)/);
	const mime = mimeMatch ? mimeMatch[1] : "audio/ogg";
	const binary = atob(parts[1]);
	const len = binary.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}

async function migrarAudioBase64AIdb(proyecto) {
	if (!proyecto?.id || !proyecto.audioBase64 || typeof proyecto.audioBase64 !== "object") {
		return false;
	}
	const ab = proyecto.audioBase64;
	const instBlob = ab.inst ? dataUrlABlob(ab.inst) : null;
	const v1Blob = ab.v1 ? dataUrlABlob(ab.v1) : null;
	const v2Blob = ab.v2 ? dataUrlABlob(ab.v2) : null;
	if (!instBlob && !v1Blob && !v2Blob) return false;
	await idbPutAudios(proyecto.id, {
		inst: instBlob || undefined,
		v1: v1Blob || undefined,
		v2: v2Blob || undefined
	});
	delete proyecto.audioBase64;
	try {
		const proyectos = leerProyectosArchivadosLS();
		const idx = proyectos.findIndex((p) => p.id === proyecto.id);
		if (idx !== -1) {
			const limpio = clonLimpiarChartParaLS(proyectos[idx]);
			delete limpio.audioBase64;
			proyectos[idx] = limpio;
			guardarProyectosArchivadosLS(proyectos);
		}
	} catch (e) {
		console.warn("Migración LS tras audioBase64 falló (audios ya en IDB)", e);
	}
	return true;
}

async function restaurarAudiosEnMemoria(chartId, songName, bpm) {
	let record = null;
	try {
		record = await idbGetAudios(chartId);
	} catch (e) {
		console.warn("No se pudieron leer audios de IndexedDB", e);
		return false;
	}
	if (!record || (!record.inst && !record.v1 && !record.v2)) return false;

	const aFile = (blob, name) => {
		if (!blob) return null;
		if (blob instanceof File) return blob;
		let type = blob.type || "";
		if (!type && typeof mimeAudioDesdeNombre === "function") {
			type = mimeAudioDesdeNombre(name) || "";
		}
		if (!type) {
			const n = String(name || "").toLowerCase();
			if (n.endsWith(".mp3")) type = "audio/mpeg";
			else if (n.endsWith(".wav")) type = "audio/wav";
			else if (n.endsWith(".flac")) type = "audio/flac";
			else if (n.endsWith(".ogg") || n.endsWith(".oga")) type = "audio/ogg";
			else type = "application/octet-stream";
		}
		return new File([blob], name, { type });
	};

	fileRawInst = aFile(record.inst, "inst.ogg");
	fileRawV1 = aFile(record.v1, "voices-player.ogg");
	fileRawV2 = aFile(record.v2, "voices-opponent.ogg");

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

	if (typeof autoAjustarSelectoresDeWaveform === "function") {
		autoAjustarSelectoresDeWaveform(!!(fileRawV1 || fileRawV2));
	}
	if (typeof cargarDatosEnMesa === "function") {
		cargarDatosEnMesa(fileRawV1, fileRawV2, songName, bpm);
	}
	if (typeof refrescarWaveformsTrasCarga === "function") {
		refrescarWaveformsTrasCarga();
	} else if (typeof actualizarWaveforms === "function") {
		setTimeout(() => actualizarWaveforms(null, true), 150);
	}
	return true;
}

async function guardarEnArchivador() {
	if (!currentChartData) {
		alert("No hay ningún chart abierto para archivar.");
		return;
	}

	try {
		if (typeof sincronizarChartDesdeInterfaz === "function") {
			sincronizarChartDesdeInterfaz();
		}
		if (typeof guardarDificultadActiva === "function") {
			guardarDificultadActiva();
		}
	} catch (e) {
		console.warn("Sync previa al archivar", e);
	}

	if (!currentChartData.id) {
		currentChartData.id = "chart_" + Date.now();
	}

	const yaExistia = chartEstaEnArchivador();
	let limpio;
	try {
		limpio = clonLimpiarChartParaLS(currentChartData);
	} catch (e) {
		alert("Error al preparar el chart: " + (e.message || e));
		return;
	}

	// Nunca guardar base64 en LS
	delete limpio.audioBase64;
	if (currentChartData.audioBase64) delete currentChartData.audioBase64;
	currentChartData.archivado = true;

	let proyectos = leerProyectosArchivadosLS();
	const index = proyectos.findIndex((p) => p.id === limpio.id);
	if (index !== -1) proyectos[index] = limpio;
	else proyectos.push(limpio);

	try {
		guardarProyectosArchivadosLS(proyectos);
	} catch (e) {
		const msg = e && e.name === "QuotaExceededError"
			? "Espacio insuficiente en localStorage para guardar el chart (notas/eventos)."
			: ("No se pudo guardar el chart en localStorage: " + (e.message || e));
		alert(msg);
		return;
	}

	let audioOk = true;
	let audioMsg = "";
	try {
		await idbPutAudios(limpio.id, {
			inst: fileRawInst || undefined,
			v1: fileRawV1 || undefined,
			v2: fileRawV2 || undefined
		});
	} catch (e) {
		audioOk = false;
		audioMsg = e && e.message ? e.message : String(e);
		console.error("IndexedDB audio save failed", e);
	}

	actualizarMenuArchivar();

	if (!audioOk) {
		alert(
			"El chart (notas/eventos) se guardó, pero no se pudieron guardar los audios en IndexedDB.\n" +
			"Detalle: " + audioMsg + "\n" +
			"Puedes usar Re-vincular Audios más tarde."
		);
		return;
	}

	if (!fileRawInst && !fileRawV1 && !fileRawV2) {
		alert(
			yaExistia
				? "Chart actualizado en el archivador (sin audios cargados en memoria)."
				: "Chart archivado (sin audios cargados; usa Re-vincular si los necesitas)."
		);
	} else if (yaExistia) {
		alert("¡Chart actualizado en el archivador (notas + audios)!");
	} else {
		alert("¡Chart archivado exitosamente (notas en localStorage + audios en IndexedDB)!");
	}
}

// Alias usado por el menú
async function menuArchivarChart() {
	return guardarEnArchivador();
}
