// soporte de variantes: audio por dificultad
// Aqui vive el audio de CADA variante (inst/v1/v2 por nombre de dificultad).
// La pista que se esta escuchando (audioInst/audioVoice1/audioVoice2 + buffers)
// sigue siendo la de siempre; solo cambia segun la dificultad activa :p

// { nombreDificultad: { inst: File|null, v1: File|null, v2: File|null } }
let audioPack = {};

// asegura que exista el slot de una dificultad
function audioPackSlot(nombre) {
	if (!audioPack || typeof audioPack !== "object") audioPack = {};
	if (!audioPack[nombre]) audioPack[nombre] = { inst: null, v1: null, v2: null };
	return audioPack[nombre];
}

// limpia todo el pack (al importar de cero o salir)
function audioPackReset() {
	audioPack = {};
}

// deja solo las dificultades que existen en el chart
function audioPackSincronizarConChart() {
	if (!audioPack) return;
	const dificultades = currentChartData && currentChartData.difficulties ? Object.keys(currentChartData.difficulties) : [];
	Object.keys(audioPack).forEach((nombre) => {
		if (dificultades.length && dificultades.indexOf(nombre) === -1) delete audioPack[nombre];
	});
}

// copia los blobs al File global que usa el reproductor
function audioPackAplicarArchivos(nombre) {
	const pack = audioPack && audioPack[nombre] ? audioPack[nombre] : null;
	fileRawInst = pack && pack.inst ? pack.inst : null;
	fileRawV1 = pack && pack.v1 ? pack.v1 : null;
	fileRawV2 = pack && pack.v2 ? pack.v2 : null;
	return pack;
}

// mete los audios ya cargados (variables globales) al slot de una dificultad
function audioPackCapturarDesdeGlobales(nombre) {
	const slot = audioPackSlot(nombre);
	slot.inst = fileRawInst || null;
	slot.v1 = fileRawV1 || null;
	slot.v2 = fileRawV2 || null;
	return slot;
}

// decodifica los 3 audios de un slot en los buffers del reproductor
async function audioPackDecodificarSlot(pack) {
	buffers.inst = pack && pack.inst ? await decodeAudioFile(pack.inst) : null;
	buffers.v1 = pack && pack.v1 ? await decodeAudioFile(pack.v1) : null;
	buffers.v2 = pack && pack.v2 ? await decodeAudioFile(pack.v2) : null;
}

// cambia la musica a la dificultad indicada, conservando el tiempo actual
// (si estaba sonando, sigue sonando sin reiniciarse)
async function aplicarAudioDeDificultad(nombre, { conservarTiempo = true } = {}) {
	if (!currentChartData || !currentChartData.difficulties) return false;
	if (!currentChartData.difficulties[nombre]) return false;
	const pack = audioPack && audioPack[nombre] ? audioPack[nombre] : null;
	if (!pack || (!pack.inst && !pack.v1 && !pack.v2)) return false;

	// si ya esta sonando este audio, no hacer nada
	const yaActivo = fileRawInst === (pack.inst || null) && fileRawV1 === (pack.v1 || null) && fileRawV2 === (pack.v2 || null);
	if (yaActivo && (buffers.inst || buffers.v1 || buffers.v2 || (!pack.inst && !pack.v1 && !pack.v2))) return true;

	// tiempo actual para continuar donde va
	const estabaSonando = typeof isPlaying !== "undefined" && isPlaying;
	const tiempo = (typeof getMasterSongTime === "function") ? getMasterSongTime() : 0;

	// pausa y libera lo que suena
	if (typeof resetWaPlaybackState === "function") resetWaPlaybackState();
	if (audioInst) { try { audioInst.pause(); } catch (e) { } audioInst = null; }
	if (audioVoice1) { try { audioVoice1.pause(); } catch (e) { } audioVoice1 = null; }
	if (audioVoice2) { try { audioVoice2.pause(); } catch (e) { } audioVoice2 = null; }
	if (typeof _audioBlobUrls !== "undefined" && _audioBlobUrls && _audioBlobUrls.length) {
		_audioBlobUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { } });
		_audioBlobUrls = [];
	}

	// pone los archivos de esta variante
	audioPackAplicarArchivos(nombre);

	// crea reproductores y decodifica
	if (fileRawInst) audioInst = crearElementoAudio(fileRawInst);
	if (fileRawV1) audioVoice1 = crearElementoAudio(fileRawV1);
	if (fileRawV2) audioVoice2 = crearElementoAudio(fileRawV2);
	// actualizar las etiquetas de voces del panel
	const lblP = document.getElementById("track-player-label");
	const lblE = document.getElementById("track-enemy-label");
	if (lblP) lblP.innerText = fileRawV1 ? fileRawV1.name : "No Player Voice";
	if (lblE) lblE.innerText = fileRawV2 ? fileRawV2.name : "No Enemy Voice";
	await audioPackDecodificarSlot(pack);
	if (typeof reconstruirCacheWaveforms === "function") reconstruirCacheWaveforms();
	if (typeof fijarVolumenPistas === "function") fijarVolumenPistas();
	if (typeof resetWaPlaybackState === "function") resetWaPlaybackState();
	if (typeof sincronizarPistasAudio === "function") sincronizarPistasAudio(conservarTiempo ? Math.max(0, tiempo) : 0);

	// sigue la musica donde iba
	if (estabaSonando && typeof togglePlayPause === "function") {
		// marcar pausado para que togglePlayPause entre por el lado de reproducir
		if (typeof isPlaying !== "undefined") isPlaying = false;
		togglePlayPause();
	} else if (typeof refrescarWaveformsTrasCarga === "function") {
		refrescarWaveformsTrasCarga();
	}
	return true;
}
