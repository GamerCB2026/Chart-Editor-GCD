// TODO LO RELACIONADO CON AUDIO, WAVEFORMS, MUTE Y HITSOUNDS
// V0.8.1: audio WA intacto (no tocar playback/seek).
// Visualizer: mismo reloj Y↔tiempo que flechas (reposicionarScroll / manejarScrollManual).
// HTML only for tracks without a buffer; HTML voice sync ≤ every 300ms (never every rAF).

const AUDIO_DRIFT_MAX_SEC = 0.020; // legacy; HTML fallback uses 80ms
const AUDIO_HTML_SYNC_MS = 300;
const AUDIO_HTML_DRIFT_SEC = 0.080;
const WAVE_PEAKS_PPS = 280;
const WAVE_PLAY_MIN_MS = 33;

let wavePeaks = { inst: null, v1: null, v2: null };
let _lastWaveDrawMs = 0;
let _waveCanvasW = 0;
let _waveCanvasH = 0;
let _lastHtmlVoiceSyncMs = 0;

/** Blob URLs creados por crearElementoAudio — revoke en limpiarAudiosExistentes */
let _audioBlobUrls = [];

/** GainNodes: mute 0/1 cuando hay playback WA */
let waGains = { inst: null, v1: null, v2: null };

let _waPlay = {
    playing: false,
    songTimeAtStart: 0,
    ctxTimeAtStart: 0,
    pausedSongTime: 0,
    sources: []
};

async function cargarHitsound() {
    const isLocal = window.location.protocol === 'file:';
    if (!isLocal) {
        try {
            const resp = await fetch('sounds/Hitsound.mp3');
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                hitSoundBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
                return;
            }
        } catch (e) { }
    }
    hitSoundAudio = new Audio('sounds/Hitsound.mp3');
    hitSoundAudio.preload = 'auto';
}

/** Crea HTMLAudioElement audible (volume 1, unmuted). Trackea blob: URLs. */
function crearElementoAudio(fileOrUrl) {
    const url = (fileOrUrl && typeof fileOrUrl === 'object' && fileOrUrl instanceof Blob)
        ? URL.createObjectURL(fileOrUrl)
        : fileOrUrl;
    if (typeof url === 'string' && url.indexOf('blob:') === 0) {
        _audioBlobUrls.push(url);
    }
    const a = new Audio(url);
    a.preload = 'auto';
    a.volume = 1;
    a.muted = false;
    a.playbackRate = 1;
    return a;
}

/** True si hay al menos un AudioBuffer decodificado → reloj WA. */
function usaWebAudioClock() {
    return !!(buffers && (buffers.inst || buffers.v1 || buffers.v2));
}

function ensureWaGains() {
    if (!audioCtx) return;
    ['inst', 'v1', 'v2'].forEach((key) => {
        if (!waGains[key]) {
            const g = audioCtx.createGain();
            g.gain.value = 1;
            g.connect(audioCtx.destination);
            waGains[key] = g;
        }
    });
}

function stopWaSources() {
    if (!_waPlay.sources || !_waPlay.sources.length) {
        _waPlay.sources = [];
        return;
    }
    for (let i = 0; i < _waPlay.sources.length; i++) {
        const s = _waPlay.sources[i];
        try { s.onended = null; } catch (e) { }
        try { s.stop(); } catch (e) { }
        try { s.disconnect(); } catch (e) { }
    }
    _waPlay.sources = [];
}

function resetWaPlaybackState() {
    stopWaSources();
    _waPlay.playing = false;
    _waPlay.songTimeAtStart = 0;
    _waPlay.ctxTimeAtStart = 0;
    _waPlay.pausedSongTime = 0;
    _lastHtmlVoiceSyncMs = 0;
}

/**
 * Pause HTML for tracks that have a WA buffer (avoid double audio).
 * Do NOT mute/silence tracks that lack a buffer — those may play via HTML.
 */
function pauseHtmlForBufferedTracks() {
    if (buffers && buffers.inst && audioInst) {
        try { audioInst.pause(); } catch (e) { }
    }
    if (buffers && buffers.v1 && audioVoice1) {
        try { audioVoice1.pause(); } catch (e) { }
    }
    if (buffers && buffers.v2 && audioVoice2) {
        try { audioVoice2.pause(); } catch (e) { }
    }
}

/** @deprecated name kept; no longer silences all HTML. */
function silenceHtmlAudioElements() {
    pauseHtmlForBufferedTracks();
}

function syncHtmlAudioCurrentTime(t) {
    if (!Number.isFinite(t)) return;
    const clamped = Math.max(0, t);
    [audioInst, audioVoice1, audioVoice2].forEach((a) => {
        if (!a) return;
        try {
            if (Math.abs(a.currentTime - clamped) > 0.01) a.currentTime = clamped;
        } catch (e) { }
    });
}

/** Seek solo pistas HTML que NO tienen buffer WA (híbrido). */
function syncHtmlFallbackTracksToMaster(t, force) {
    if (!Number.isFinite(t)) return;
    const clamped = Math.max(0, t);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!force && (now - _lastHtmlVoiceSyncMs) < AUDIO_HTML_SYNC_MS) return;
    _lastHtmlVoiceSyncMs = now;

    const pairs = [
        { buf: buffers && buffers.inst, audio: audioInst },
        { buf: buffers && buffers.v1, audio: audioVoice1 },
        { buf: buffers && buffers.v2, audio: audioVoice2 }
    ];
    for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i];
        if (p.buf || !p.audio) continue;
        try {
            if (force || Math.abs(p.audio.currentTime - clamped) > AUDIO_HTML_DRIFT_SEC) {
                p.audio.currentTime = clamped;
            }
        } catch (e) { }
    }
}

/**
 * Tiempo de canción (s) para UI (scroll / playhead / visualizer).
 * WA activo: reloj compartido (Inst+voces arrancan juntos) — NO seek en rAF.
 * HTML: prioriza voces (v1/v2); si no hay, Inst. Criterio Detector.
 */
function getMasterSongTime() {
    if (usaWebAudioClock()) {
        if (_waPlay.playing && audioCtx) {
            const t = _waPlay.songTimeAtStart + (audioCtx.currentTime - _waPlay.ctxTimeAtStart);
            return Math.max(0, t);
        }
        return Math.max(0, _waPlay.pausedSongTime || 0);
    }
    // Preferir currentTime de voces (misma pista que oye el chartador)
    if (audioVoice1 && Number.isFinite(audioVoice1.currentTime)) return audioVoice1.currentTime;
    if (audioVoice2 && Number.isFinite(audioVoice2.currentTime)) return audioVoice2.currentTime;
    if (audioInst && Number.isFinite(audioInst.currentTime)) return audioInst.currentTime;
    return 0;
}

/** Duración maestro: buffers preferidos; fallback HTML. */
function getMasterDuration() {
    let d = 0;
    if (buffers) {
        if (buffers.inst) d = Math.max(d, buffers.inst.duration);
        if (buffers.v1) d = Math.max(d, buffers.v1.duration);
        if (buffers.v2) d = Math.max(d, buffers.v2.duration);
    }
    if (d > 0) return d;
    if (audioInst && Number.isFinite(audioInst.duration) && audioInst.duration > 0) {
        return audioInst.duration;
    }
    if (audioVoice1 && Number.isFinite(audioVoice1.duration) && audioVoice1.duration > 0) return audioVoice1.duration;
    if (audioVoice2 && Number.isFinite(audioVoice2.duration) && audioVoice2.duration > 0) return audioVoice2.duration;
    return 0;
}

function _muteGainForKey(key) {
    const muteInst = document.getElementById("mute-inst");
    const muteEnemy = document.getElementById("mute-enemy");
    const mutePlayer = document.getElementById("mute-player");
    if (key === 'inst') return !!(muteInst && muteInst.checked);
    if (key === 'v1') return !!(mutePlayer && mutePlayer.checked);
    if (key === 'v2') return !!(muteEnemy && muteEnemy.checked);
    return false;
}

function _startOneWaSource(key, buffer, when, offsetSec) {
    if (!buffer || !audioCtx) return null;
    const remaining = buffer.duration - offsetSec;
    if (remaining <= 0.001) return null;
    ensureWaGains();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1;
    const gain = waGains[key];
    if (gain) {
        gain.gain.value = _muteGainForKey(key) ? 0 : 1;
        src.connect(gain);
    } else {
        src.connect(audioCtx.destination);
    }
    try {
        src.start(when, Math.max(0, offsetSec));
    } catch (e) {
        try { src.disconnect(); } catch (e2) { }
        return null;
    }
    _waPlay.sources.push(src);
    return src;
}

/**
 * Arranca BufferSources para pistas con buffer; HTML unmuted solo si no hay buffer.
 * Mismo `when` + `offset` para todos los WA.
 */
function startWaPlayback(offsetSec) {
    const t = Math.max(0, Number(offsetSec) || 0);
    fijarVolumenPistas();

    if (!usaWebAudioClock()) {
        // Fallback HTML puro
        sincronizarPistasAudio(t);
        const list = [audioInst, audioVoice1, audioVoice2].filter(Boolean);
        list.forEach((a) => { try { a.playbackRate = 1; a.volume = 1; } catch (e) { } });
        if (typeof aplicarMuteEstadosUI === 'function') aplicarMuteEstadosUI();
        Promise.allSettled(list.map((a) => a.play()));
        _waPlay.playing = false;
        _waPlay.pausedSongTime = t;
        _lastHtmlVoiceSyncMs = 0;
        return list.length > 0;
    }

    if (audioCtx.state === 'suspended') {
        try { audioCtx.resume(); } catch (e) { }
    }

    stopWaSources();
    ensureWaGains();
    aplicarMuteEstadosUI();

    const when = audioCtx.currentTime + 0.03;
    _waPlay.songTimeAtStart = t;
    _waPlay.ctxTimeAtStart = when;
    _waPlay.pausedSongTime = t;
    _waPlay.playing = true;

    if (buffers.inst) _startOneWaSource('inst', buffers.inst, when, t);
    if (buffers.v1) _startOneWaSource('v1', buffers.v1, when, t);
    if (buffers.v2) _startOneWaSource('v2', buffers.v2, when, t);

    // HTML: pausar pistas con buffer; reproducir solo las que no tienen buffer
    pauseHtmlForBufferedTracks();
    const htmlFallbacks = [];
    if (!buffers.inst && audioInst) htmlFallbacks.push(audioInst);
    if (!buffers.v1 && audioVoice1) htmlFallbacks.push(audioVoice1);
    if (!buffers.v2 && audioVoice2) htmlFallbacks.push(audioVoice2);
    htmlFallbacks.forEach((a) => {
        try {
            a.volume = 1;
            a.playbackRate = 1;
            a.currentTime = t;
        } catch (e) { }
    });
    if (typeof aplicarMuteEstadosUI === 'function') aplicarMuteEstadosUI();
    Promise.allSettled(htmlFallbacks.map((a) => a.play()));
    _lastHtmlVoiceSyncMs = 0;

    return _waPlay.sources.length > 0 || htmlFallbacks.length > 0;
}

function pauseWaPlayback() {
    const t = getMasterSongTime();
    stopWaSources();
    _waPlay.playing = false;
    _waPlay.pausedSongTime = Math.max(0, t);

    if (audioInst) try { audioInst.pause(); } catch (e) { }
    if (audioVoice1) try { audioVoice1.pause(); } catch (e) { }
    if (audioVoice2) try { audioVoice2.pause(); } catch (e) { }

    // Alinear HTML al tiempo pausado (sin hard-seek agresivo en rAF)
    syncHtmlAudioCurrentTime(_waPlay.pausedSongTime);
    return _waPlay.pausedSongTime;
}

function seekWaPlayback(t) {
    const dur = getMasterDuration();
    let time = Math.max(0, Number(t) || 0);
    if (dur > 0 && time > dur) time = dur;
    _waPlay.pausedSongTime = time;

    if (_waPlay.playing && usaWebAudioClock()) {
        // Restart WA at new offset
        stopWaSources();
        _waPlay.playing = false;
        startWaPlayback(time);
    } else {
        syncHtmlAudioCurrentTime(time);
        if (usaWebAudioClock()) {
            // keep pausedSongTime; HTML fallback tracks aligned
            syncHtmlFallbackTracksToMaster(time, true);
        }
    }
    return time;
}

/** Volumen 1.0; mute vía GainNode (WA) y/o HTMLAudio.muted. */
function fijarVolumenPistas() {
    if (audioInst) { audioInst.volume = 1; audioInst.playbackRate = 1; }
    if (audioVoice1) { audioVoice1.volume = 1; audioVoice1.playbackRate = 1; }
    if (audioVoice2) { audioVoice2.volume = 1; audioVoice2.playbackRate = 1; }
    aplicarMuteEstadosUI();
}

async function decodeAudioFile(file) {
    if (!file) return null;
    try {
        const arrayBuf = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
        // slice(0) evita detach del ArrayBuffer en algunos browsers tras decodeAudioData
        const copy = arrayBuf.slice(0);
        return await audioCtx.decodeAudioData(copy);
    } catch (e) {
        console.error("No se pudo decodificar el archivo de audio", e);
        alert("Advertencia: El navegador bloqueó la generación de la forma de onda de " + file.name + ". La música sonará, pero la onda no se dibujará.");
        return null;
    }
}

function rebuildWavePeaksForKey(key, buffer) {
    if (!buffer) {
        wavePeaks[key] = null;
        return;
    }
    // Max entre canales (voces stereo a menudo viven en L o R)
    const nCh = buffer.numberOfChannels || 1;
    const channels = [];
    for (let c = 0; c < nCh; c++) channels.push(buffer.getChannelData(c));
    const len = channels[0].length;
    const samplesPerPeak = Math.max(1, Math.floor(buffer.sampleRate / WAVE_PEAKS_PPS));
    const n = Math.ceil(len / samplesPerPeak);
    const peaks = new Float32Array(n);
    let peakMax = 0;
    for (let i = 0; i < n; i++) {
        let maxAmp = 0;
        const start = i * samplesPerPeak;
        const end = Math.min(len, start + samplesPerPeak);
        for (let j = start; j < end; j++) {
            for (let c = 0; c < nCh; c++) {
                const abs = Math.abs(channels[c][j]);
                if (abs > maxAmp) maxAmp = abs;
            }
        }
        peaks[i] = maxAmp;
        if (maxAmp > peakMax) peakMax = maxAmp;
    }
    // Voces bajas: subir un poco para que se vean al chartar (sin inventar ruido)
    if (peakMax > 0.001 && peakMax < 0.45) {
        const boost = 0.85 / peakMax;
        for (let i = 0; i < n; i++) peaks[i] *= boost;
    }
    wavePeaks[key] = { peaks, duration: buffer.duration, pps: WAVE_PEAKS_PPS };
}

/** Llamar tras cargar/decodificar buffers (inst/v1/v2) — solo waveforms. */
function reconstruirCacheWaveforms() {
    // Limpiar picos viejos para que el visualizer refleje LOS audios recien cargados
    wavePeaks = { inst: null, v1: null, v2: null };
    rebuildWavePeaksForKey('inst', buffers.inst);
    rebuildWavePeaksForKey('v1', buffers.v1);
    rebuildWavePeaksForKey('v2', buffers.v2);
    _lastWaveDrawMs = 0;
}

function limpiarAudiosExistentes() {
    resetWaPlaybackState();
    if (audioInst) { try { audioInst.pause(); } catch (e) { } audioInst.removeAttribute('src'); audioInst = null; }
    if (audioVoice1) { try { audioVoice1.pause(); } catch (e) { } audioVoice1.removeAttribute('src'); audioVoice1 = null; }
    if (audioVoice2) { try { audioVoice2.pause(); } catch (e) { } audioVoice2.removeAttribute('src'); audioVoice2 = null; }

    if (_audioBlobUrls && _audioBlobUrls.length) {
        for (let i = 0; i < _audioBlobUrls.length; i++) {
            try { URL.revokeObjectURL(_audioBlobUrls[i]); } catch (e) { }
        }
        _audioBlobUrls = [];
    }

    buffers = { inst: null, v1: null, v2: null };
    wavePeaks = { inst: null, v1: null, v2: null };
    isPlaying = false;
    lastHitTime = -1;
    deseleccionarNotaActual();
    cancelAnimationFrame(animationFrameId);

    const canvas = document.getElementById('wave-canvas');
    if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        _waveCanvasW = 0;
        _waveCanvasH = 0;
    }

    const lblP = document.getElementById("track-player-label");
    const lblE = document.getElementById("track-enemy-label");
    if (lblP) lblP.innerText = "No Player Voice";
    if (lblE) lblE.innerText = "No Enemy Voice";
}

function peakAmpAt(peakData, timeSec) {
    if (!peakData || timeSec < 0 || timeSec >= peakData.duration) return 0;
    const idx = Math.min(peakData.peaks.length - 1, Math.max(0, Math.floor(timeSec * peakData.pps)));
    return peakData.peaks[idx] || 0;
}

/**
 * Misma conversión scroll↔tiempo que reposicionarScroll / manejarScrollManual / flechas.
 * stepDuration = (60/bpm)/4 ; scrollTop = step * alturaCelda * zoom
 */
function stepDurationChart() {
    if (!currentChartData || !currentChartData.bpm) return 0.1;
    return (60 / currentChartData.bpm) / 4;
}

function tiempoCancionDesdeScrollTop(scrollTop) {
    const stepDuration = stepDurationChart();
    const z = (typeof globalZoomFactor === 'number' && globalZoomFactor > 0) ? globalZoomFactor : 1;
    const cell = (typeof alturaCelda === 'number' && alturaCelda > 0) ? alturaCelda : 40;
    return ((Number(scrollTop) || 0) / z / cell) * stepDuration;
}

/**
 * Tiempo en la linea cyan: mismo reloj que scroll/flechas (getMasterSongTime = voces→Inst).
 * Solo UI; no seek de audio aqui.
 */
function centerTimeParaVisualizer(workspace, exactTime) {
    if (exactTime != null && Number.isFinite(Number(exactTime))) {
        return Math.max(0, Number(exactTime));
    }
    const playing = (typeof isPlaying !== 'undefined' && isPlaying);
    if (playing && typeof getMasterSongTime === 'function') {
        return Math.max(0, getMasterSongTime());
    }
    return Math.max(0, tiempoCancionDesdeScrollTop(workspace ? workspace.scrollTop : 0));
}

/**
 * Redibuja waveforms. Y↔time = mismo reloj que las flechas en #playback-line.
 * Playback/seek NO se modifican aqui.
 */
function actualizarWaveforms(exactTime = null, force = false) {
    const canvas = document.getElementById('wave-canvas');
    const workspace = document.getElementById('scroll-workspace');
    if (!canvas || !currentChartData || !workspace) return;
    if (workspace.clientHeight === 0) return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!force && typeof isPlaying !== 'undefined' && isPlaying && (now - _lastWaveDrawMs) < WAVE_PLAY_MIN_MS) {
        return;
    }
    _lastWaveDrawMs = now;

    const targetW = Math.max(1, Math.round(360 * globalZoomFactor));
    const targetH = workspace.clientHeight;
    if (canvas.width !== targetW || canvas.height !== targetH || _waveCanvasW !== targetW || _waveCanvasH !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = targetW + "px";
        _waveCanvasW = targetW;
        _waveCanvasH = targetH;
    }

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const selEnemy = document.getElementById('wave-select-enemy');
    const selPlayer = document.getElementById('wave-select-player');
    if (!selEnemy || !selPlayer) return;

    const valEnemy = selEnemy.value;
    const valPlayer = selPlayer.value;
    const peaksEnemy = valEnemy !== 'none' ? wavePeaks[valEnemy] : null;
    const peaksPlayer = valPlayer !== 'none' ? wavePeaks[valPlayer] : null;

    if ((valEnemy !== 'none' && buffers[valEnemy] && !peaksEnemy) ||
        (valPlayer !== 'none' && buffers[valPlayer] && !peaksPlayer)) {
        reconstruirCacheWaveforms();
    }
    const pEnemy = valEnemy !== 'none' ? wavePeaks[valEnemy] : null;
    const pPlayer = valPlayer !== 'none' ? wavePeaks[valPlayer] : null;
    if (!pEnemy && !pPlayer) return;

    const stepDuration = stepDurationChart();
    const totalHeightPx = currentChartData.totalRows * alturaCelda;
    const scaledGridHeight = totalHeightPx * globalZoomFactor;

    // Mismo tiempo que flechas / hitsounds (exactTime o scrollTop / reloj master)
    const centerTime = centerTimeParaVisualizer(workspace, exactTime);
    const pxPerSec = (alturaCelda * globalZoomFactor) / stepDuration;

    const playing = (typeof isPlaying !== 'undefined' && isPlaying);
    let resolution = playing ? 2 : 1;
    if (currentChartData.bpm >= 200 || globalZoomFactor >= 0.9) {
        resolution = Math.max(resolution, playing ? 3 : 2);
    }
    if (currentChartData.bpm >= 280) {
        resolution = Math.max(resolution, playing ? 4 : 2);
    }

    const gridYTop = (H / 2) - workspace.scrollTop;
    const gridYBottom = gridYTop + scaledGridHeight;
    const halfW = W / 2;

    for (let y = 0; y < H; y += resolution) {
        if (y < gridYTop || y > gridYBottom) continue;
        const timeAtY = centerTime + ((y - H / 2) / pxPerSec);
        if (timeAtY < 0) continue;

        if (pEnemy) {
            const amp = peakAmpAt(pEnemy, timeAtY);
            if (amp > 0.001) {
                const barWidth = amp * halfW * 0.95;
                ctx.fillStyle = 'rgba(255, 91, 132, 0.7)';
                ctx.fillRect((halfW - barWidth) / 2, y, barWidth, resolution);
            }
        }
        if (pPlayer) {
            const amp = peakAmpAt(pPlayer, timeAtY);
            if (amp > 0.001) {
                const barWidth = amp * halfW * 0.95;
                ctx.fillStyle = 'rgba(91, 132, 255, 0.7)';
                ctx.fillRect(halfW + (halfW - barWidth) / 2, y, barWidth, resolution);
            }
        }
    }
}

function playHitsound() {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (hitSoundBuffer) {
        const source = audioCtx.createBufferSource();
        source.buffer = hitSoundBuffer;
        source.connect(audioCtx.destination);
        source.start(0);
    } else if (hitSoundAudio) {
        try {
            const a = hitSoundAudio.cloneNode();
            a.volume = 1;
            a.play().catch(() => synthHitsound());
        } catch (e) { synthHitsound(); }
    } else {
        synthHitsound();
    }
}

function synthHitsound() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

/** Compat: volumen siempre 1.0 (UI de volumen eliminada). */
function actualizarVolumenCancion(_vol) {
    fijarVolumenPistas();
}

/** Mute: GainNode 0/1 si WA; HTMLAudio.muted siempre. */
function toggleMute(track, isMuted) {
    const muted = !!isMuted;
    if (track === "inst") {
        if (audioInst) audioInst.muted = muted;
        if (waGains.inst) waGains.inst.gain.value = muted ? 0 : 1;
    }
    if (track === "v1") {
        if (audioVoice1) audioVoice1.muted = muted;
        if (waGains.v1) waGains.v1.gain.value = muted ? 0 : 1;
    }
    if (track === "v2") {
        if (audioVoice2) audioVoice2.muted = muted;
        if (waGains.v2) waGains.v2.gain.value = muted ? 0 : 1;
    }
}

function aplicarMuteEstadosUI() {
    const muteInst = document.getElementById("mute-inst");
    const muteEnemy = document.getElementById("mute-enemy");
    const mutePlayer = document.getElementById("mute-player");
    const mInst = !!(muteInst && muteInst.checked);
    const mV1 = !!(mutePlayer && mutePlayer.checked);
    const mV2 = !!(muteEnemy && muteEnemy.checked);

    if (audioInst) {
        audioInst.volume = 1;
        audioInst.muted = mInst;
    }
    if (audioVoice1) {
        audioVoice1.volume = 1;
        audioVoice1.muted = mV1;
    }
    if (audioVoice2) {
        audioVoice2.volume = 1;
        audioVoice2.muted = mV2;
    }
    ensureWaGains();
    if (waGains.inst) waGains.inst.gain.value = mInst ? 0 : 1;
    if (waGains.v1) waGains.v1.gain.value = mV1 ? 0 : 1;
    if (waGains.v2) waGains.v2.gain.value = mV2 ? 0 : 1;
}

/**
 * Sync HTML voices al master.
 * - Con WA activo: solo pistas HTML sin buffer, ≤ cada 300ms, umbral 80ms.
 * - Sin buffers: Inst+voces HTML, ≤ cada 300ms, umbral 80ms (nunca cada rAF).
 * umbral 0 fuerza seek (play/pause/seek explícitos).
 */
function sincronizarVocesAlMaster(tiempoMaster, umbral) {
    if (!Number.isFinite(tiempoMaster)) return;
    const t = Math.max(0, tiempoMaster);
    const force = (umbral === 0);

    if (usaWebAudioClock()) {
        syncHtmlFallbackTracksToMaster(t, force);
        return;
    }

    // HTML-only fallback: throttle 300ms, drift 80ms (unless force)
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!force && (now - _lastHtmlVoiceSyncMs) < AUDIO_HTML_SYNC_MS) return;
    _lastHtmlVoiceSyncMs = now;
    const thr = force ? 0 : (umbral != null ? umbral : AUDIO_HTML_DRIFT_SEC);

    if (audioVoice1) {
        try {
            if (thr === 0 || Math.abs(audioVoice1.currentTime - t) > thr) {
                audioVoice1.currentTime = t;
            }
        } catch (e) { }
    }
    if (audioVoice2) {
        try {
            if (thr === 0 || Math.abs(audioVoice2.currentTime - t) > thr) {
                audioVoice2.currentTime = t;
            }
        } catch (e) { }
    }
}

/**
 * Seek de Inst + voces (HTML) y/o restart WA al mismo tiempo.
 */
function sincronizarPistasAudio(tiempo) {
    if (!Number.isFinite(tiempo)) return;
    const t = Math.max(0, tiempo);
    const dur = getMasterDuration();
    const clamped = (dur > 0 && t > dur) ? dur : t;

    if (usaWebAudioClock()) {
        if (_waPlay.playing) {
            seekWaPlayback(clamped);
        } else {
            _waPlay.pausedSongTime = clamped;
            syncHtmlAudioCurrentTime(clamped);
        }
        return;
    }

    if (audioInst) {
        try { audioInst.currentTime = clamped; } catch (e) { }
    }
    if (audioVoice1) {
        try { audioVoice1.currentTime = clamped; } catch (e) { }
    }
    if (audioVoice2) {
        try { audioVoice2.currentTime = clamped; } catch (e) { }
    }
    _waPlay.pausedSongTime = clamped;
}

/** Tras cambiar grilla/BPM/zoom: reloj master + re-scroll + wave. */
function resyncTrasCambioGrilla() {
    if (!currentChartData) return;
    const t = getMasterSongTime();
    if (typeof actualizarAlturaScroll === 'function') actualizarAlturaScroll();
    sincronizarPistasAudio(t);
    if (typeof reposicionarScroll === 'function') {
        reposicionarScroll(true);
    } else if (typeof actualizarWaveforms === 'function') {
        actualizarWaveforms(t, true);
    }
}

function hayAudioCargado() {
    return !!(audioInst || audioVoice1 || audioVoice2 ||
        (buffers && (buffers.inst || buffers.v1 || buffers.v2)));
}

/**
 * Selectores de waveform: cada lado segun el audio cargado
 * (enemy→v2, player→v1; si falta esa voz → Inst).
 */

/** Tras cargar Inst/voces: picos + selectores + redibujo (NO toca playback). */
function refrescarWaveformsTrasCarga() {
    try {
        if (typeof reconstruirCacheWaveforms === 'function') reconstruirCacheWaveforms();
        if (typeof autoAjustarSelectoresDeWaveform === 'function') {
            const hayVoces = !!(buffers && (buffers.v1 || buffers.v2)) || !!(typeof audioVoice1 !== 'undefined' && audioVoice1) || !!(typeof audioVoice2 !== 'undefined' && audioVoice2);
            autoAjustarSelectoresDeWaveform(hayVoces);
        }
        const draw = () => {
            if (typeof actualizarAlturaScroll === 'function') actualizarAlturaScroll();
            if (typeof actualizarWaveforms === 'function') actualizarWaveforms(null, true);
        };
        draw();
        setTimeout(draw, 50);
        setTimeout(draw, 200);
        setTimeout(draw, 500);
        requestAnimationFrame(draw);
    } catch (e) {
        console.warn('[waveforms]', e);
    }
}

function autoAjustarSelectoresDeWaveform(_tieneVoces) {
    const selE = document.getElementById('wave-select-enemy');
    const selP = document.getElementById('wave-select-player');
    if (!selE || !selP) return;
    const hayV1 = !!(buffers && buffers.v1) || !!audioVoice1;
    const hayV2 = !!(buffers && buffers.v2) || !!audioVoice2;
    const hayInst = !!(buffers && buffers.inst) || !!audioInst;
    // Cada lado refleja el audio que haya: voz correspondiente, si no Inst
    selE.value = hayV2 ? 'v2' : (hayInst ? 'inst' : (hayV1 ? 'v1' : 'none'));
    selP.value = hayV1 ? 'v1' : (hayInst ? 'inst' : (hayV2 ? 'v2' : 'none'));
    try {
        selE.dispatchEvent(new Event('change', { bubbles: true }));
        selP.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { }
}

try {
    window.autoAjustarSelectoresDeWaveform = autoAjustarSelectoresDeWaveform;
    window._autoAjustarSelectoresDeWaveformAudio = autoAjustarSelectoresDeWaveform;
    window.refrescarWaveformsTrasCarga = refrescarWaveformsTrasCarga;
    window.centerTimeParaVisualizer = centerTimeParaVisualizer;
    window.tiempoCancionDesdeScrollTop = tiempoCancionDesdeScrollTop;
    window.usaWebAudioClock = usaWebAudioClock;
    window.getMasterSongTime = getMasterSongTime;
    window.getMasterDuration = getMasterDuration;
    window.startWaPlayback = startWaPlayback;
    window.pauseWaPlayback = pauseWaPlayback;
    window.seekWaPlayback = seekWaPlayback;
} catch (e) { }
