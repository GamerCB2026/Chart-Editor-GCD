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

// El Import Center (modal "Importar chart") es el punto de entrada:
// .fnfc (V-Slice con audio) y los tres formatos de otros engines.
function seleccionarImportacion(tipo) {
	cerrarModalImportacion();
	const inputIds = {
		fnfc: "import-fnfc-input",
		codename: "import-codename-input",
		psych: "import-psych-input",
		legacy: "import-legacy-input"
	};
	document.getElementById(inputIds[tipo] || inputIds.fnfc)?.click();
}

function normalizarChartFNFC(data) {
	if (!data || (!data.songName && !data.name) || !data.notes || typeof data.notes !== "object" || Array.isArray(data.notes)) return null;
	const esFormatoInterno = Object.keys(data.notes).every((key) => /^\d+-\d+(~\d+)?$/.test(key)); // V0.8.2l: "~n" = flecha apilada
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
		ratings: copiarRatingsGCD(data.ratings),
		stickerPack: typeof data.stickerPack === "string" ? data.stickerPack : "",
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
	// V0.8.2l: cada casilla se pinta con todas sus flechas (pila / flechas separadas).
	if (typeof pintarTodasLasNotasGCD === "function") { pintarTodasLasNotasGCD(); return; }
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
		if (typeof decorarCeldaNotaKind === "function") decorarCeldaNotaKind(cell, circulo, notes[key], c);
		if (typeof aplicarOffsetLibreCelda === "function") aplicarOffsetLibreCelda(cell, notes[key]);
	}
}

function pintarEventosActuales() {
	document.querySelectorAll(".events-column .event-stack-item, .events-column .event-note-icon, .events-column .event-type-badge").forEach((el) => el.remove());
	document.querySelectorAll(".events-column .grid-cell[title]").forEach((el) => el.removeAttribute("title"));
	document.querySelectorAll(".events-column .grid-cell.event-stack-multi").forEach((el) => el.classList.remove("event-stack-multi"));
	const events = currentChartData && currentChartData.events ? currentChartData.events : {};
	// V0.8.2k: varios eventos por casilla ("fila", "fila~1", ...): se pintan juntos.
	if (typeof pintarFilaEventosGCD === "function") {
		const porFila = new Map();
		Object.keys(events).forEach((k) => {
			if (!events[k]) return;
			const f = parseInt(k, 10);
			if (!Number.isFinite(f)) return;
			if (!porFila.has(f)) porFila.set(f, []);
			porFila.get(f).push(k);
		});
		porFila.forEach((claves, f) => pintarFilaEventosGCD(f, claves.sort((a, b) => indicePilaClaveEvento(a) - indicePilaClaveEvento(b))));
		return;
	}
	for (const row in events) {
		const cell = document.getElementById(`event-cell-${row}`);
		if (!cell) continue;
		// V0.8.2 Event Update: ícono según el tipo (js/EventosGCD.js).
		if (typeof pintarIconoEventoCeldaGCD === "function") { pintarIconoEventoCeldaGCD(cell, events[row]); continue; }
		const icon = document.createElement("img");
		icon.className = "event-note-icon";
		icon.src = "eventassets/FocusCamera.png";
		icon.alt = "Focus Camera";
		cell.appendChild(icon);
	}
}

function agregarNotaImportada(notes, timeMs, lane, sustainMs, stepMs, extra) {
	const laneValue = parseInt(lane, 10);
	const time = parseFloat(timeMs);
	if (Number.isNaN(time) || Number.isNaN(laneValue) || laneValue < 0 || laneValue > 7) return 0;
	const col = laneValue;

	const exacto = time / stepMs;
	const row = Math.max(0, Math.round(exacto));
	const len = Math.max(0, Math.round((parseFloat(sustainMs) || 0) / stepMs));
	const nota = { len: len };
	// V0.8.2k: una flecha fuera de la casilla (Modo Libre / otro editor) conserva su tiempo exacto.
	const off = typeof offsetLibreDesdeTiempo === "function" ? offsetLibreDesdeTiempo(exacto, row) : 0;
	if (off) nota.off = off;
	// V0.8.2 Note Events: kind ("k") y params ("p") de las notas V-Slice.
	const kind = extra && extra.kind !== undefined && extra.kind !== null ? String(extra.kind).trim() : "";
	if (kind && kind.toLowerCase() !== "normal") {
		nota.kind = kind;
		const params = Array.isArray(extra.params)
			? extra.params.filter((p) => p && typeof p === "object" && (typeof p.n === "string" || typeof p.name === "string"))
				.map((p) => ({ name: typeof p.n === "string" ? p.n : p.name, value: p.v !== undefined ? p.v : p.value })) // V-Slice usa {n, v}; GCD antiguo {name, value}
			: [];
		if (params.length) nota.params = params;
	}
	// V0.8.2l: dos flechas en la misma casilla y carril (spam, 1/32...) se conservan TODAS:
	// la segunda va a "fila-carril~1", etc. Nunca se fusionan ni se pierden.
	const clave = typeof claveLibreNota === "function" ? claveLibreNota(row, col, notes) : `${row}-${col}`;
	notes[clave] = nota;
	return row + len;
}

// Kind/params de una nota V-Slice ({t, d, l, k, p}); los arrays (legacy) no tienen.
function extraKindNotaVSlice(note) {
	if (!note || typeof note !== "object" || Array.isArray(note)) return null;
	const kind = note.k ?? note.kind;
	if (kind === undefined || kind === null || kind === "") return null;
	return { kind, params: note.p ?? note.params };
}

function convertirEventosExternos(events, bpm, dificultad = "normal") {
	const resultado = {};
	if (events && !Array.isArray(events) && typeof events === "object") events = events[dificultad] || events.normal || [];
	if (!Array.isArray(events) || !Number.isFinite(bpm) || bpm <= 0) return resultado;
	const stepMs = 60000 / bpm / 4;
	const charToTarget = ["player", "opponent", "gf"]; // 0=player, 1=opponent, 2=gf (match export)

	let descartados = 0;
	events.forEach((evento) => {
		if (!evento) return;
		// V0.8.2 Event Update: ScrollSpeed, SetCameraBop, SetHealthIcon, ZoomCamera y PlayAnimation.
		if (evento.e !== "FocusCamera") {
			const otro = typeof importarEventoVSliceGCD === "function" ? importarEventoVSliceGCD(evento) : null;
			const t = parseFloat(evento.t);
			if (!otro || !Number.isFinite(t)) return;
			const filaOtro = Math.max(0, Math.round(t / stepMs));
			// V0.8.2k: si la casilla ya tiene un evento, el nuevo queda pegado (misma "t").
			agregarEventoImportadoFila(resultado, filaOtro, otro);
			return;
		}
		const tiempo = parseFloat(evento.t);
		if (!Number.isFinite(tiempo)) return;
		const valores = evento.v && typeof evento.v === "object" && !Array.isArray(evento.v) ? evento.v : {};
		const fila = Math.max(0, Math.round(tiempo / stepMs));
		// V0.8.2m: como el juego (FocusCameraSongEvent): char -1 = Position; sin char usa "v" suelto
		// (formato viejo) y si no, 0 (Player). Los charts de GCD <= 082l no escribían char en Position.
		let char = parseInt(valores.char, 10);
		if (!Number.isInteger(char) && typeof evento.v === "number") char = Math.round(evento.v);
		const x = Number(valores.x) || 0, y = Number(valores.y) || 0;
		const target = char === -1 ? "position"
			: charToTarget[char] || (Number.isInteger(char) ? "opponent" : (x || y ? "position" : "player"));
		const dur = parseFloat(valores.duration);
		const focus = {
			type: "Focus Camera",
			target,
			duration: Number.isFinite(dur) ? Math.max(0, dur) : 4,
			offsetX: x,
			offsetY: y,
			effect: valores.ease === undefined || valores.ease === null || valores.ease === "" ? "CLASSIC" : String(valores.ease)
		};
		// Claves extra del chart (easeDir, etc.): se conservan para volver a exportarlas.
		const extraV = {};
		Object.keys(valores).forEach((k) => { if (!["char", "x", "y", "duration", "ease"].includes(k)) extraV[k] = JSON.parse(JSON.stringify(valores[k])); });
		if (Object.keys(extraV).length) focus.extraV = extraV;
		agregarEventoImportadoFila(resultado, fila, focus);
	});
	if (descartados) console.warn(`[Import] ${descartados} evento(s) no se pudieron importar.`);
	return resultado;
}

// Eventos de otros engines que en V-Slice van en la metadata (timeChanges) o no aplican.
const EVENTOS_SIN_EQUIVALENTE_GCD = ["bpm change", "continuous bpm change", "time signature change", "change bpm", ""];

// Añade un evento importado a su fila; si ya hay otro, lo apila ("fila~1", ...).
function agregarEventoImportadoFila(resultado, fila, evento) {
	if (typeof agregarEventoAFilaGCD === "function") return agregarEventoAFilaGCD(resultado, fila, evento);
	if (!resultado[fila]) { resultado[fila] = evento; return String(fila); }
	return null;
}

// ---------------------------------------------------------------------------
// V0.8.2: importadores de otros engines (port de Chart Editor GCD Plus, por Edwin / EdwinrccDEV).
// Codename chart.json, Psych chart.json (psych_v1 y legacy) y Legacy (vanilla / Kade).
// Las notas se cuantizan a la grilla del editor (agregarNotaImportada de GCD).
// ---------------------------------------------------------------------------
// Convierte un chart.json nativo de Codename Engine (formato CODENAME: strumLines + events + meta)
// al formato interno del editor {notes: {"row-col": {len}}, events: {"row": {...}}}.
function convertirChartCodename(data) {
	if (!data || typeof data !== "object" || !Array.isArray(data.strumLines)) return null;

	const bpmRaw = parseFloat(data.meta?.bpm);
	const bpm = Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : 160;
	const stepMs = 60000 / bpm / 4;
	const notes = {};
	let maxRow = 0;

	data.strumLines.forEach((line) => {
		if (!line || !Array.isArray(line.notes)) return;
		// En Codename: type 0 = OPPONENT, type 1 = PLAYER.
		// En este editor: columnas 0-3 = jugador, 4-7 = oponente.
		const offset = line.type === 0 ? 4 : 0;
		line.notes.forEach((note) => {
			if (!note) return;
			const lane = parseInt(note.id, 10);
			if (Number.isNaN(lane)) return;
			const col = offset + (lane % 4);
			maxRow = Math.max(maxRow, agregarNotaImportada(notes, note.time, col, note.sLen, stepMs));
		});
	});
	if (Object.keys(notes).length === 0) return null;

	const meta = data.meta && typeof data.meta === "object" ? data.meta : {};
	const charToTarget = ["opponent", "player", "gf"];
	const events = {};
	(Array.isArray(data.events) ? data.events : []).forEach((evento) => {
		if (!evento || !Number.isFinite(parseFloat(evento.time))) return;
		const fila = Math.max(0, Math.round(parseFloat(evento.time) / stepMs));
		// Solo se representa el evento de cámara; el resto queda disponible en currentChartData.events.
		if (evento.name === "Camera Movement") {
			const valores = Array.isArray(evento.params) ? evento.params : [];
			agregarEventoImportadoFila(events, fila, {
				type: "Focus Camera",
				target: charToTarget[valores[0]] || "opponent",
				// Codename: [target, tween?, tweenTime, ease, tweenType, offsetX, offsetY]
				duration: Number(valores[2]) || 4,
				offsetX: Number(valores[5]) || 0,
				offsetY: Number(valores[6]) || 0,
				// V0.8.2m: ease + tipo de Codename ('quad' + 'InOut') -> 'quadInOut'; sin tween = CLASSIC.
				effect: valores[1] === false || !valores[3] ? "CLASSIC"
					: (typeof easeDesdeExternoGCD === "function" ? easeDesdeExternoGCD(valores[3], valores[4], true) : String(valores[3]))
			});
		} else if (evento.name && typeof importarEventoVSliceGCD === "function" && !EVENTOS_SIN_EQUIVALENTE_GCD.includes(String(evento.name).trim().toLowerCase())) {
			// V0.8.2k: los demás eventos de Codename se conservan con sus params.
			const otro = importarEventoVSliceGCD({ e: String(evento.name).trim(), v: { params: Array.isArray(evento.params) ? evento.params : [] } });
			if (otro) agregarEventoImportadoFila(events, fila, otro);
		}
	});

	return {
		id: "chart_" + Date.now(),
		songName: meta.displayName || meta.name || "Imported Chart",
		bpm: bpm,
		author: "",
		charter: "",
		speed: parseFloat(data.scrollSpeed) || 1,
		player: obtenerNombrePersonaje(data.strumLines.find((l) => l && l.type === 1)?.characters, "bf"),
		opponent: obtenerNombrePersonaje(data.strumLines.find((l) => l && l.type === 0)?.characters, "dad"),
		girlfriend: "gf",
		album: "volume1",
		difficulty: 3,
		stage: data.stage || "stage",
		totalRows: Math.max(16, Math.ceil((maxRow + 16) / 16) * 16),
		notes: notes,
		events: events,
	};
}

// Replica la semantica de secciones del FNF clasico (vanilla / Kade Engine /
// Psych 0.1-0.3, equivalente a Song.convert de Psych): las lanes 0-3 son del
// dueno de la seccion segun mustHitSection (true = jugador, false = oponente)
// y las 4-7 del otro lado.
function remapearLaneLegacy(lane, mustHit) {
	const lanePos = ((lane % 4) + 4) % 4;
	// En charts legacy las lanes 4-7 pertenecen al cuadrante contrario al de
	// la seccion: lanes 0-3 van al dueno de mustHitSection y 4-7 al otro lado
	// (equivalente exacto a Song.convert de Psych).
	const ladoJugador = lane >= 4 ? !mustHit : mustHit;
	return ladoJugador ? lanePos : lanePos + 4;
}

// Convierte un chart por secciones (FNF vanilla / Kade Engine / Psych Engine)
// al formato interno del editor {notes: {"row-col": {len}}, events: {"row": {...}}}.
// Los charts psych_v1 traen lanes absolutas; los legacy usan lanes relativas a
// la seccion que se normalizan con remapearLaneLegacy.
function convertirChartSecciones(data) {
	if (!data || typeof data !== "object") return null;
	// Los charts se pueden exportar envueltos ("song": {...}) o con el objeto directo.
	const root = data.song && typeof data.song === "object" ? data.song : data;
	if (!root || typeof root !== "object" || !Array.isArray(root.notes) || !root.notes.length || !root.notes[0] || !Array.isArray(root.notes[0].sectionNotes)) return null;

	const bpmRaw = parseFloat(root.bpm);
	const bpm = Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : 160;
	const stepMs = 60000 / bpm / 4;
	// Charts psych_v1 traen lanes absolutas (0-3 jugador, 4-7 oponente). Los
	// charts viejos (0.1-0.3 / Week 7 / vanilla) traen lanes relativas a la
	// seccion: replicamos Song.convert de Psych para normalizarlas.
	const esChartViejo = !String(root.format || "").startsWith("psych_v1");
	const notes = {};
	let maxRow = 0;
	let avisoBpmDado = false;

	root.notes.forEach((section) => {
		if (!section || !Array.isArray(section.sectionNotes)) return;
		// mustHitSection define de que lado de la seccion son las lanes 0-3.
		const mustHit = section.mustHitSection !== false;
		// Los charts legacy pueden cambiar el BPM por seccion; el editor usa un
		// BPM unico, asi que se conserva el base y se avisa (los tiempos en ms
		// exactos de las notas se preservan igual, solo la grilla queda orientativa).
		if (esChartViejo && section.changeBPM) {
			const bpmSeccion = parseFloat(section.bpm);
			if (Number.isFinite(bpmSeccion) && bpmSeccion > 0 && bpmSeccion !== bpm && !avisoBpmDado) {
				avisoBpmDado = true;
				console.warn("[Import] Este chart cambia de BPM a mitad de cancion (" + bpmSeccion + "). El editor usa un BPM unico (" + bpm + "); las notas conservan su tiempo exacto pero la grilla queda orientativa.");
			}
		}
		section.sectionNotes.forEach((note) => {
			if (!Array.isArray(note) && (typeof note !== "object" || note === null)) return;
			const time = parseFloat(Array.isArray(note) ? note[0] : note.time);
			let lane = parseInt(Array.isArray(note) ? note[1] : note.noteData, 10);
			const sustain = parseFloat(Array.isArray(note) ? note[2] : note.sustainLength) || 0;
			if (!Number.isFinite(time)) return;
			// Lane negativa en charts viejos = evento embebido (Psych lo mueve a
			// song.events en su convert()). Se procesa abajo con los demas eventos.
			if (lane < 0) return;
			// Charts viejos: las lanes son relativas a la seccion (repl. de
			// Song.convert de Psych); psych_v1 ya trae lanes absolutas.
			if (esChartViejo) lane = remapearLaneLegacy(lane, mustHit);
			else if (lane > 3) lane = 4 + (lane % 4);
			if (lane < 0 || lane > 7) return;
			maxRow = Math.max(maxRow, agregarNotaImportada(notes, time, lane, sustain, stepMs));
		});
	});
	if (Object.keys(notes).length === 0) return null;

	// Psych: events = [time, [[nombre, value1, value2], ...]]. Solo se representa
	// el evento de camara; el resto queda disponible en currentChartData.events.
	const charToTarget = ["opponent", "player", "gf"];
	const events = {};
	const procesarEvento = (tiempo, nombre, v1, v2) => {
		if (!Number.isFinite(tiempo)) return;
		const fila = Math.max(0, Math.round(tiempo / stepMs));
		const nombreNorm = String(nombre || "").trim().toLowerCase();
		const puedeVSlice = typeof importarEventoVSliceGCD === "function";
		const nuevos = [];
		if (nombreNorm === "focus camera" || nombreNorm === "focus camera (psych)") {
			nuevos.push({
				type: "Focus Camera",
				target: charToTarget[parseInt(v1, 10)] || "opponent",
				duration: Number(v2) || 4,
				offsetX: 0,
				offsetY: 0,
				effect: "CLASSIC"
			});
		} else if (nombreNorm === "camera follow pos") {
			// V0.8.2k: Psych "Camera Follow Pos" (x, y) -> Focus Camera en Position.
			const x = parseFloat(v1), y = parseFloat(v2);
			if (Number.isFinite(x) || Number.isFinite(y)) nuevos.push({ type: "Focus Camera", target: "position", duration: 4, offsetX: Number.isFinite(x) ? x : 0, offsetY: Number.isFinite(y) ? y : 0, effect: "CLASSIC" });
		} else if (!puedeVSlice) {
			return;
		} else if (nombreNorm === "change scroll speed") {
			// V0.8.2 Event Update: equivalentes de Psych para Scroll Speed y Play Animation.
			const mult = parseFloat(v1);
			const segundos = parseFloat(v2);
			nuevos.push(importarEventoVSliceGCD({ e: "ScrollSpeed", v: {
				duration: Number.isFinite(segundos) && segundos > 0 ? Math.round((segundos * 1000 / stepMs) * 100) / 100 : 0,
				scroll: Number.isFinite(mult) ? mult : 1,
				strumline: "both", ease: "linear", absolute: false
			} }));
		} else if (nombreNorm === "play animation") {
			const quien = String(v2 || "").trim().toLowerCase();
			const target = ["bf", "boyfriend", "1"].includes(quien) ? "boyfriend"
				: ["gf", "girlfriend", "2"].includes(quien) ? "girlfriend" : "dad";
			nuevos.push(importarEventoVSliceGCD({ e: "PlayAnimation", v: { target, anim: String(v1 || "idle"), force: true } }));
		} else if (nombreNorm === "hey!") {
			// V0.8.2l: un "Hey!" de Psych es UN evento -> UN Play Animation (antes 082k creaba dos
			// pegados, BF "hey" + GF "cheer", y se veía repetido). "gf"/"girlfriend"/"1" -> GF "cheer";
			// cualquier otro valor (vacío, "bf", "0") -> BF "hey".
			const quien = String(v1 || "").trim().toLowerCase();
			const soloGf = ["gf", "girlfriend", "1"].includes(quien);
			nuevos.push(importarEventoVSliceGCD({ e: "PlayAnimation", v: soloGf ? { target: "girlfriend", anim: "cheer", force: true } : { target: "boyfriend", anim: "hey", force: true } }));
		} else if (nombreNorm && !EVENTOS_SIN_EQUIVALENTE_GCD.includes(nombreNorm)) {
			// V0.8.2k: cualquier otro evento se conserva (sale con "?" hasta importar su .hxc).
			nuevos.push(importarEventoVSliceGCD({ e: String(nombre).trim(), v: { value1: v1 === undefined || v1 === null ? "" : String(v1), value2: v2 === undefined || v2 === null ? "" : String(v2) } }));
		}
		nuevos.filter(Boolean).forEach((ev) => agregarEventoImportadoFila(events, fila, ev));
	};
	// V0.8.2l: un mismo evento que viene en "events" y además embebido como nota con lane
	// negativa (charts convertidos a medias) se cuenta una sola vez.
	const firmaEvento = (tiempo, nombre, v1, v2) => `${Math.round(tiempo / stepMs)}|${String(nombre || "").trim().toLowerCase()}|${v1 ?? ""}|${v2 ?? ""}`;
	const vistosEnEvents = new Set();
	(Array.isArray(root.events) ? root.events : []).forEach((evento) => {
		if (!Array.isArray(evento)) return;
		const tiempo = parseFloat(evento[0]);
		const subeventos = Array.isArray(evento[1]) ? evento[1] : [];
		subeventos.forEach((sub) => {
			if (!Array.isArray(sub)) return;
			if (Number.isFinite(tiempo)) vistosEnEvents.add(firmaEvento(tiempo, sub[0], sub[1], sub[2]));
			procesarEvento(tiempo, sub[0], sub[1], sub[2]);
		});
	});
	// Charts 0.1-0.3: eventos embebidos como notas con lane negativa.
	root.notes.forEach((section) => {
		if (!section || !Array.isArray(section.sectionNotes)) return;
		section.sectionNotes.forEach((note) => {
			if (!Array.isArray(note)) return;
			const lane = parseInt(note[1], 10);
			if (!Number.isFinite(lane) || lane >= 0) return;
			const tiempo = parseFloat(note[0]);
			if (Number.isFinite(tiempo) && vistosEnEvents.has(firmaEvento(tiempo, note[2], note[3], note[4]))) return;
			procesarEvento(tiempo, note[2], note[3], note[4]);
		});
	});
	// Kade Engine formato KE1: eventObjects = [{name, position (beats), value, type}].
	(Array.isArray(root.eventObjects) ? root.eventObjects : []).forEach((ev) => {
		if (!ev || typeof ev !== "object") return;
		const bpmEv = parseFloat(ev.value);
		if (String(ev.type || "").toLowerCase() === "bpm change" && Number.isFinite(bpmEv) && bpmEv > 0 && bpmEv !== bpm && !avisoBpmDado) {
			avisoBpmDado = true;
			console.warn("[Import] Este chart cambia de BPM a mitad de cancion (" + bpmEv + "). El editor usa un BPM unico (" + bpm + "); las notas conservan su tiempo exacto pero la grilla queda orientativa.");
		}
	});
	// Camara derivada: en el FNF clasico (vanilla/Kade/Psych) la camara sigue a
	// mustHitSection (y gfSection). Genera Focus Camera solo en los cambios de
	// lado (y en el inicio), sin pisar eventos explicitos ya mapeados.
	let mustHitPrevio = null;
	let beatAcumulado = 0;
	root.notes.forEach((section) => {
		if (!section) return;
		const mustHit = section.mustHitSection !== false;
		// sectionBeats ya viene en beats (4 por defecto en vanilla/Kade/Psych).
		const beats = parseFloat(section.sectionBeats) || 4;
		const tiempo = beatAcumulado * (stepMs * 4);
		beatAcumulado += beats;
		if (mustHit === mustHitPrevio && !section.gfSection) return;
		mustHitPrevio = mustHit;
		const fila = Math.max(0, Math.round(tiempo / stepMs));
		// V0.8.2l: la cámara deducida (mustHitSection) NO es un evento del chart: solo se pone
		// en casillas vacías. En 082k se apilaba encima de los eventos reales y se veía repetido.
		const clavesFila = typeof clavesEventosFila === "function" ? clavesEventosFila(fila, events) : (events[fila] ? [String(fila)] : []);
		if (clavesFila.length) return;
		agregarEventoImportadoFila(events, fila, {
			type: "Focus Camera",
			target: section.gfSection ? "gf" : mustHit ? "player" : "opponent",
			duration: 4,
			offsetX: 0,
			offsetY: 0,
			effect: "CLASSIC"
		});
	});

	return {
		id: "chart_" + Date.now(),
		songName: root.song || root.songName || "Imported Chart",
		bpm: bpm,
		author: "",
		charter: "",
		speed: parseFloat(root.speed) || 1,
		player: root.player1 || "bf",
		opponent: root.player2 || "dad",
		// FNF vanilla y Kade usan player3; Psych moderno usa gfVersion.
		girlfriend: root.gfVersion || root.player3 || "gf",
		album: "volume1",
		difficulty: 3,
		stage: root.stage || "stage",
		totalRows: Math.max(16, Math.ceil((maxRow + 16) / 16) * 16),
		notes: notes,
		events: events,
	};
}

// Ambos menus usan el mismo conversor por secciones: la deteccion de
// psych_v1 (format) decide si las lanes ya son absolutas o se remapean.
function convertirChartPsych(data) {
	return convertirChartSecciones(data);
}

function convertirChartKade(data) {
	return convertirChartSecciones(data);
}

function convertirChartExterno(data) {
	if (!data || typeof data !== "object") return null;

	// Formato nativo de Codename Engine (strumLines con type 0/1 + codenameChart/meta).
	if (Array.isArray(data.strumLines) && (data.codenameChart === true || data.codenameChart === "true" || data.meta)) {
		const codename = convertirChartCodename(data);
		if (codename) return codename;
	}

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
	const agregar = (n, timeMs, lane, sus, extra) => agregarNotaImportada(n, (parseFloat(timeMs) || 0) - offsetMs, lane, sus, stepMs, extra);
	const notes = {};
	let maxRow = 0;

	if (Array.isArray(root.notes) && root.notes.length && root.notes[0] && root.notes[0].sectionNotes) {
		// Charts por secciones (vanilla/Kade/Psych): mismo conversor que los botones
		// dedicados del Import Center, con remap de mustHitSection incluido.
		const porSecciones = convertirChartSecciones(data);
		if (porSecciones) return porSecciones;
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
				maxRow = Math.max(maxRow, agregar(notes, note.time ?? note.t, col, note.sLen ?? note.l ?? note.sustainLength, extraKindNotaVSlice(note)));
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
				maxRow = Math.max(maxRow, agregar(notes, time, col, sustain, extraKindNotaVSlice(note)));
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
		ratings: copiarRatingsGCD(data.ratings),
		stickerPack: typeof data.stickerPack === "string" ? data.stickerPack : "",
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
		ratings: copiarRatingsGCD(playData.ratings),
		stickerPack: typeof playData.stickerPack === "string" ? playData.stickerPack : "",
		stage: playData.stage || meta.stage || "stage",
	};
}

// V0.8.2n: playData.ratings → { dificultad: 1..15 }
function copiarRatingsGCD(r) {
	const out = {};
	if (r && typeof r === "object" && !Array.isArray(r)) {
		Object.keys(r).forEach((k) => { const n = parseInt(r[k], 10); if (Number.isFinite(n) && n > 0) out[k] = Math.min(15, n); });
	}
	return out;
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
	if (typeof adoptarVariacionesDe === "function") adoptarVariacionesDe(currentChartData, data);
	asegurarDificultadesChart(currentChartData);
	const velocidadDif = parseFloat(currentChartData.scrollSpeeds && currentChartData.scrollSpeeds[dificultadActiva]);
	if (Number.isFinite(velocidadDif) && velocidadDif > 0) currentChartData.speed = velocidadDif;
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
	if (typeof avisarKindsNoImportados === "function") avisarKindsNoImportados();
	return true;
}

async function procesarArchivoFNFC(input) {
	const file = input.files[0];
	if (!file) return;

	try {
		limpiarAudiosExistentes();
		const zip = await JSZip.loadAsync(file);
		// V0.8.2j: <id>-metadata.json / <id>-chart.json (sin confundirlos con los de una variación).
		const localizados = typeof localizarJsonVSliceZip === "function" ? localizarJsonVSliceZip(zip) : null;
		const metaFile = (localizados && localizados.meta) || buscarEntradaZip(zip, ["song-metadata.json", "metadata.json"]) || buscarEntradaZipPorPalabra(zip, "metadata");
		const chartFile = (localizados && localizados.chart) || buscarEntradaZip(zip, ["song-chart.json", "chart.json"]) || buscarEntradaZipPorPalabra(zip, "chart");

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

			// V0.8.2j: scrollSpeed por dificultad, datos extra y variaciones (songVariations).
			const velocidades = {};
			if (chartJson.scrollSpeed && typeof chartJson.scrollSpeed === "object") {
				Object.keys(chartJson.scrollSpeed).forEach((n) => {
					const v = parseFloat(chartJson.scrollSpeed[n]);
					if (Number.isFinite(v) && v > 0) velocidades[n] = v;
				});
			}
			const personajesMeta = (metaJson.playData && metaJson.playData.characters) || {};
			chart.scrollSpeeds = velocidades;
			chart.metaExtra = {
				variacion: "default",
				instrumental: String(personajesMeta.instrumental || ""),
				playerVocals: Array.isArray(personajesMeta.playerVocals) ? personajesMeta.playerVocals.map(String) : null,
				opponentVocals: Array.isArray(personajesMeta.opponentVocals) ? personajesMeta.opponentVocals.map(String) : null
			};
			chart.dificultadesOriginales = chart.difficulties ? Object.keys(chart.difficulties) : [];
			let lecturaVariaciones = null;
			if (localizados && typeof leerVariacionesFNFC === "function") {
				lecturaVariaciones = await leerVariacionesFNFC(zip, metaJson, localizados, { inst: fileRawInst, v1: fileRawV1, v2: fileRawV2 });
				chart.variaciones = lecturaVariaciones.variaciones;
				chart.ordenVariaciones = lecturaVariaciones.orden;
				chart.variacionActiva = "default";
				window.ultimaLecturaVariacionesGCD = { orden: lecturaVariaciones.orden, archivosAudio: lecturaVariaciones.archivosAudio, avisos: lecturaVariaciones.avisos };
			}

			if (!abrirChartEnEditor(chart, true)) throw new Error("Chart sin notas reconocibles");
			if (lecturaVariaciones && typeof prepararAudiosVariaciones === "function") {
				await prepararAudiosVariaciones(lecturaVariaciones.audios);
			}

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
			// V0.8.2k: eventos del chart que GCD no reconoce -> ofrecer importar su .hxc.
			setTimeout(revisarChartImportadoGCD, 250);
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

// Lee un .json y lo abre con el conversor indicado (con convertirChartExterno de respaldo).
function _procesarArchivoJsonChart(input, convertir, mensajeFormato) {
	const file = input.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const data = JSON.parse(e.target.result);
			const chart = convertir(data) || convertirChartExterno(data);
			if (!chart || !abrirChartEnEditor(chart)) alert(mensajeFormato);
			else setTimeout(revisarChartImportadoGCD, 250);
		} catch (err) {
			console.error(err);
			alert("Error al leer el archivo JSON del chart.");
		}
	};
	reader.readAsText(file);
	input.value = "";
}

function procesarArchivoCodename(input) {
	_procesarArchivoJsonChart(input, convertirChartCodename,
		"Este archivo no parece un chart.json de Codename Engine (se espera un JSON con \"strumLines\").");
}

function procesarArchivoPsych(input) {
	_procesarArchivoJsonChart(input, convertirChartPsych,
		"Este archivo no parece un chart de Psych Engine (se espera un JSON con \"notes\" por secciones y \"sectionNotes\").");
}

function procesarArchivoLegacy(input) {
	_procesarArchivoJsonChart(input, convertirChartKade,
		"Este archivo no parece un chart de FNF Legacy/Kade Engine (se espera un JSON con \"notes\" por secciones y \"sectionNotes\").");
}

function renderizarProyectosArchivados() {
	const grid = document.getElementById("lista-proyectos-grid");
	if (!grid) return;

	grid.innerHTML = `
		<div class="folder-card new-project" onclick="abrirModalNuevoChart()">
			<img class="folder-icon new-project-icon" src="Icons/Carpeta.png" alt="">
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
				<img class="audioguard-icon audioguard-card" src="Icons/AudioGuard.PNG" alt="">
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
	const borrado = proyectos.find((proyecto) => proyecto.id === id);
	const idsVariaciones = borrado && Array.isArray(borrado.ordenVariaciones) ? ["default"].concat(borrado.ordenVariaciones) : [];
	if (idsVariaciones.length && typeof borrarAudiosVariacionesArchivador === "function") borrarAudiosVariacionesArchivador(id, idsVariaciones);
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
			if (typeof restaurarAudiosVariacionesArchivador === "function") await restaurarAudiosVariacionesArchivador(proyecto.id);
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

// V0.8.2k: tras importar un chart: eventos que GCD no conoce y flechas fuera de casilla.
function revisarChartImportadoGCD() {
	if (typeof revisarNotasLibresImportadas === "function") { try { revisarNotasLibresImportadas(); } catch (e) { console.warn(e); } }
	if (typeof avisarEventosNoReconocidosGCD === "function") { try { avisarEventosNoReconocidosGCD(); } catch (e) { console.warn(e); } }
}
