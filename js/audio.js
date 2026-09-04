// TODO LO RELACIONADO CON AUDIO, WAVEFORMS, MUTE Y HITSOUNDS
async function cargarHitsound() {
    const isLocal = window.location.protocol === 'file:';
    if (!isLocal) {
        try {
            const resp = await fetch('sounds/Hitsound.mp3');
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                hitSoundBuffer = await audioCtx.decodeAudioData(arrayBuf);
                return;
            }
        } catch (e) { }
    }
    hitSoundAudio = new Audio('sounds/Hitsound.mp3');
    hitSoundAudio.preload = 'auto';
}

async function decodeAudioFile(file) {
    if (!file) return null;
    try {
        // CORRECCIÓN: Eliminamos el 'audioCtx.resume()' de aquí.
        // No hace falta despertar el contexto solo para matemáticas internas,
        // lo que evita bloqueos del navegador si el usuario aún no hace clic.
        
        const arrayBuf = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
        
        return await audioCtx.decodeAudioData(arrayBuf);
    } catch (e) {
        console.error("No se pudo decodificar el archivo de audio", e);
        alert("Advertencia: El navegador bloqueó la generación de la forma de onda de " + file.name + ". La música sonará, pero la onda no se dibujará.");
        return null;
    }
}

function limpiarAudiosExistentes() {
    // Destruimos por completo los reproductores
    if (audioInst) { audioInst.pause(); audioInst.removeAttribute('src'); audioInst = null; }
    if (audioVoice1) { audioVoice1.pause(); audioVoice1.removeAttribute('src'); audioVoice1 = null; }
    if (audioVoice2) { audioVoice2.pause(); audioVoice2.removeAttribute('src'); audioVoice2 = null; }
    
    buffers = { inst: null, v1: null, v2: null };
    isPlaying = false;
    lastHitTime = -1;
    deseleccionarNotaActual();
    cancelAnimationFrame(animationFrameId);
    
    const canvas = document.getElementById('wave-canvas');
    if(canvas) {
        // Restablecemos el lienzo para forzar a la tarjeta gráfica a purgar la memoria
        canvas.width = 0;
        canvas.height = 0;
    }
    
    const lblP = document.getElementById("track-player-label");
    const lblE = document.getElementById("track-enemy-label");
    if(lblP) lblP.innerText = "No Player Voice";
    if(lblE) lblE.innerText = "No Enemy Voice";
}

function actualizarWaveforms(exactTime = null) {
    const canvas = document.getElementById('wave-canvas');
    const workspace = document.getElementById('scroll-workspace');
    if(!canvas || !currentChartData || !workspace) return;
    
    // Si la pantalla no tiene tamaño aún, abortamos
    if (workspace.clientHeight === 0) return;
    
    // SOLUCIÓN DEFINITIVA: Forzar tamaño dinámicamente reconecta el Canvas a la pantalla.
    canvas.width = 360 * globalZoomFactor;
    canvas.height = workspace.clientHeight;
    canvas.style.width = (360 * globalZoomFactor) + "px";
    
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    
    const valEnemy = document.getElementById('wave-select-enemy').value;
    const valPlayer = document.getElementById('wave-select-player').value;
    const bufEnemy = valEnemy !== 'none' ? buffers[valEnemy] : null;
    const bufPlayer = valPlayer !== 'none' ? buffers[valPlayer] : null;
    
    if (!bufEnemy && !bufPlayer) return;
    
    const stepDuration = (60 / currentChartData.bpm) / 4;
    const totalHeightPx = currentChartData.totalRows * alturaCelda;
    const scaledGridHeight = totalHeightPx * globalZoomFactor;
    
    let centerTime = exactTime !== null ? exactTime : ((workspace.scrollTop / globalZoomFactor) / alturaCelda) * stepDuration;
    const pxPerSec = (alturaCelda * globalZoomFactor) / stepDuration;
    const resolution = 2; 
    
    const gridYTop = (H / 2) - workspace.scrollTop;
    const gridYBottom = gridYTop + scaledGridHeight;
    
    for(let y = 0; y < H; y += resolution) {
        if (y < gridYTop || y > gridYBottom) continue;
        const timeAtY = centerTime + ((y - H/2) / pxPerSec);
        if (timeAtY < 0) continue;
        
        if (bufEnemy && timeAtY < bufEnemy.duration) {
            drawWaveSlice(ctx, bufEnemy, timeAtY, resolution, pxPerSec, 0, W/2, y, 'rgba(255, 91, 132, 0.7)');
        }
        if (bufPlayer && timeAtY < bufPlayer.duration) {
            drawWaveSlice(ctx, bufPlayer, timeAtY, resolution, pxPerSec, W/2, W/2, y, 'rgba(91, 132, 255, 0.7)');
        }
    }
}

function drawWaveSlice(ctx, buffer, timeCenter, resolution, pxPerSec, xOffset, width, y, colorStr) {
    const data = buffer.getChannelData(0);
    const timeWindow = resolution / pxPerSec;
    const sampleCenter = Math.floor(timeCenter * buffer.sampleRate);
    const sampleWindow = Math.floor(timeWindow * buffer.sampleRate);
    let start = Math.max(0, sampleCenter - sampleWindow / 2);
    let end = Math.min(data.length, sampleCenter + sampleWindow / 2);
    let maxAmp = 0;
    for (let i = start; i < end; i++) {
        let abs = Math.abs(data[i]);
        if (abs > maxAmp) maxAmp = abs;
    }
    const barWidth = maxAmp * width * 0.95;
    ctx.fillStyle = colorStr;
    ctx.fillRect(xOffset + (width - barWidth) / 2, y, barWidth, resolution);
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
            a.play().catch(e => synthHitsound());
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

function actualizarVolumenCancion(vol) {
    if (audioInst) audioInst.volume = vol;
    if (audioVoice1) audioVoice1.volume = vol;
    if (audioVoice2) audioVoice2.volume = vol;
}

function toggleMute(track, isMuted) {
    if (track === "inst" && audioInst) audioInst.muted = isMuted;
    if (track === "v1" && audioVoice1) audioVoice1.muted = isMuted;
    if (track === "v2" && audioVoice2) audioVoice2.muted = isMuted;
}

function aplicarMuteEstadosUI() {
    const muteInst = document.getElementById("mute-inst");
    const muteEnemy = document.getElementById("mute-enemy");
    const mutePlayer = document.getElementById("mute-player");
    if (audioInst && muteInst) audioInst.muted = muteInst.checked;
    if (audioVoice1 && mutePlayer) audioVoice1.muted = mutePlayer.checked;
    if (audioVoice2 && muteEnemy) audioVoice2.muted = muteEnemy.checked;
    const sliderVolumen = document.getElementById("song-volume-slider");
    if (sliderVolumen) actualizarVolumenCancion(sliderVolumen.value);
}