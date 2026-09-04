let fileRawInst = null;
let fileRawV1 = null;
let fileRawV2 = null;
let currentChartData = null;
let audioInst = null;
let audioVoice1 = null;
let audioVoice2 = null;

let buffers = { inst: null, v1: null, v2: null };
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let isPlaying = false;
let animationFrameId = null;
let ignorarSiguienteScroll = false;
 
const alturaCelda = 45;
const CARRILES_JUGADOR = [0, 1, 2, 3];
const CARRILES_OPONENTE = [4, 5, 6, 7];
let globalZoomFactor = 0.65;
let notaSeleccionada = null;
let eventoSeleccionado = null;
let metadataSeleccionada = false;
let dificultadActiva = "normal";

let lastHitTime = -1;
let hitSoundBuffer = null;
let hitSoundAudio = null;
