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
            if (typeof actualizarPanelPersonajes === "function") actualizarPanelPersonajes();
            
            // Empujoncito extra para forzar a la pantalla a dibujarse
            if (typeof refrescarWaveformsTrasCarga === "function") setTimeout(() => refrescarWaveformsTrasCarga(), 150);
            else setTimeout(() => actualizarWaveforms(null, true), 150);
        }
        intentos++;
    }, 20); 
}

// V0.8.2: panel "Personajes" (port de GCD Plus). Muestra el opponent/player del chart.
function actualizarPanelPersonajes() {
    const datos = typeof currentChartData !== "undefined" && currentChartData ? currentChartData : null;
    const fijar = (id, valor) => {
        const el = document.getElementById(id);
        if (el) { el.textContent = valor || "-"; el.title = valor || ""; }
    };
    fijar("sidebar-name-opponent", datos ? (datos.opponent || "dad") : "");
    fijar("sidebar-name-player", datos ? (datos.player || "bf") : "");
}

// Unifica events en una sola referencia compartida entre chart.events y todas las dificultades.
function asegurarEventosCompartidos(chart) {
    if (!chart || typeof chart !== "object") return;
    const shared = (chart.events && typeof chart.events === "object" && !Array.isArray(chart.events))
        ? chart.events
        : {};
    if (chart.difficulties && typeof chart.difficulties === "object" && !Array.isArray(chart.difficulties)) {
        Object.keys(chart.difficulties).forEach((nombre) => {
            const ev = chart.difficulties[nombre] && chart.difficulties[nombre].events;
            if (ev && typeof ev === "object" && !Array.isArray(ev) && ev !== shared) {
                Object.keys(ev).forEach((clave) => {
                    if (!(clave in shared)) shared[clave] = ev[clave];
                });
            }
        });
        Object.keys(chart.difficulties).forEach((nombre) => {
            if (!chart.difficulties[nombre] || typeof chart.difficulties[nombre] !== "object") {
                chart.difficulties[nombre] = { notes: {}, events: shared };
            } else {
                chart.difficulties[nombre].events = shared;
            }
        });
    }
    chart.events = shared;
}

function asegurarDificultadesChart(chart) {
    const tieneMapaDeDificultades = chart.difficulties && typeof chart.difficulties === "object" && !Array.isArray(chart.difficulties);
    if (!tieneMapaDeDificultades) {
        const sharedEvents = chart.events && typeof chart.events === "object" && !Array.isArray(chart.events)
            ? chart.events
            : {};
        chart.difficulties = {};
        chart.difficulties.normal = {
            notes: chart.notes && typeof chart.notes === "object" ? chart.notes : {},
            events: sharedEvents
        };
        chart.difficulties.hard = { notes: {}, events: sharedEvents };
        chart.difficulties.easy = { notes: {}, events: sharedEvents };
        chart.events = sharedEvents;
    }
    Object.keys(chart.difficulties).forEach((nombre) => {
        chart.difficulties[nombre].notes ||= {};
        chart.difficulties[nombre].events ||= {};
    });
    asegurarEventosCompartidos(chart);
    chart.activeDifficulty = chart.difficulties[chart.activeDifficulty] ? chart.activeDifficulty : (chart.difficulties.normal ? "normal" : Object.keys(chart.difficulties)[0]);
    dificultadActiva = chart.activeDifficulty;
    chart.notes = chart.difficulties[dificultadActiva].notes;
    chart.events = chart.events; // ya compartido
    actualizarIndicadorDificultad();
}

function guardarDificultadActiva() {
    if (!currentChartData || !dificultadActiva) return;
    if (!currentChartData.difficulties || typeof currentChartData.difficulties !== "object") currentChartData.difficulties = {};
    const sharedEvents = currentChartData.events && typeof currentChartData.events === "object"
        ? currentChartData.events
        : {};
    currentChartData.events = sharedEvents;
    currentChartData.difficulties[dificultadActiva] = {
        notes: currentChartData.notes || {},
        events: sharedEvents
    };
    Object.keys(currentChartData.difficulties).forEach((nombre) => {
        currentChartData.difficulties[nombre].events = sharedEvents;
    });
}

// ---------------------------------------------------------------------
// V0.8.2j: ventana Dificultad en carpetas (Default + variaciones).
// La carpeta "Default" muestra easy / normal / hard (y las añadidas);
// cada variación del .fnfc (songVariations) tiene su propia carpeta.
// Las variaciones viven en js/Variaciones.js.
// ---------------------------------------------------------------------
const DIFICULTADES_BASE_GCD = ["easy", "normal", "hard"];
let carpetasDificultadCerradas = {};      // id de variación -> true si está plegada
let carpetaDificultadSeleccionada = null; // carpeta destino de "Añadir dificultad"
let entradaNuevaDificultad = null;        // { carpeta, valor, error } mientras se escribe el nombre
let entradaNuevaVariacion = null;         // { valor, error } mientras se escribe el ID de variación

function variacionActivaGCD() {
    return (currentChartData && currentChartData.variacionActiva) || "default";
}

// Orden en que se muestran las dificultades de una carpeta.
function ordenDificultadesCarpeta(difs, carpeta) {
    const nombres = Object.keys(difs || {});
    if (carpeta !== "default") return nombres;
    return DIFICULTADES_BASE_GCD.concat(nombres.filter((n) => !DIFICULTADES_BASE_GCD.includes(n)));
}

function escaparHTMLDificultad(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function actualizarListaDificultades() {
    const lista = document.getElementById("difficulty-list");
    if (!lista || !currentChartData) return;
    const activa = variacionActivaGCD();
    const carpetas = typeof listaVariacionesGCD === "function" ? listaVariacionesGCD() : ["default"];
    if (!carpetaDificultadSeleccionada || !carpetas.includes(carpetaDificultadSeleccionada)) carpetaDificultadSeleccionada = activa;
    lista.innerHTML = carpetas.map((carpeta) => {
        const datos = typeof datosVariacionGCD === "function" ? datosVariacionGCD(carpeta) : currentChartData;
        const difs = (datos && datos.difficulties) || {};
        const abierta = !carpetasDificultadCerradas[carpeta];
        const esActiva = carpeta === activa;
        const nombreCarpeta = carpeta === "default" ? "Default" : carpeta;
        const filas = ordenDificultadesCarpeta(difs, carpeta).map((nombre) => {
            const existe = Boolean(difs[nombre]);
            const activo = esActiva && nombre === dificultadActiva;
            const notas = existe ? Object.keys((activo ? currentChartData.notes : difs[nombre].notes) || {}).length : 0;
            const detalle = existe ? (notas ? `${notas} ${notas === 1 ? "nota" : "notas"}` : "Vacía") : "Faltante";
            return `<button class="difficulty-item ${activo ? "active" : ""} ${existe ? "" : "missing"}" type="button" data-variacion="${escaparHTMLDificultad(carpeta)}" data-dificultad="${escaparHTMLDificultad(nombre)}" ${existe ? `onclick="seleccionarDificultadGCD('${carpeta}', '${nombre}')"` : "disabled"}>
                <span class="difficulty-item-branch"></span><span class="difficulty-item-name">${escaparHTMLDificultad(nombre)}</span><small>${detalle}</small>
            </button>`;
        }).join("");
        let entrada = "";
        if (entradaNuevaDificultad && entradaNuevaDificultad.carpeta === carpeta) {
            entrada = `<form class="difficulty-new-row" onsubmit="event.preventDefault(); confirmarNuevaDificultad();">
                <span class="difficulty-item-branch"></span>
                <input type="text" id="difficulty-new-name" maxlength="24" autocomplete="off" spellcheck="false" placeholder="Nombre de la dificultad" value="${escaparHTMLDificultad(entradaNuevaDificultad.valor || "")}" oninput="entradaNuevaDificultad && (entradaNuevaDificultad.valor = this.value)" onkeydown="if (event.key === 'Escape') { event.preventDefault(); cancelarNuevaDificultad(); }">
                <button type="submit" class="difficulty-new-ok" title="Añadir" aria-label="Añadir"><i class="fa-solid fa-check"></i></button>
                <button type="button" class="difficulty-new-cancel" title="Cancelar" aria-label="Cancelar" onclick="cancelarNuevaDificultad()"><i class="fa-solid fa-xmark"></i></button>
            </form>
            <div class="difficulty-new-hint ${entradaNuevaDificultad.error ? "error" : ""}">${escaparHTMLDificultad(entradaNuevaDificultad.error || `Se añadirá en «${nombreCarpeta}» debajo de la última.`)}</div>`;
        }
        const cuenta = Object.keys(difs).length;
        return `<div class="difficulty-folder ${abierta ? "open" : ""} ${esActiva ? "current" : ""} ${carpeta === carpetaDificultadSeleccionada ? "selected" : ""}" data-variacion="${escaparHTMLDificultad(carpeta)}">
            <button class="difficulty-folder-row" type="button" onclick="alternarCarpetaDificultad('${carpeta}')" title="${carpeta === "default" ? "Dificultades predeterminadas" : `Variación «${escaparHTMLDificultad(carpeta)}»`}">
                <i class="fa-solid fa-caret-right difficulty-folder-caret"></i>
                <span class="difficulty-folder-icon"><i class="fa-solid ${abierta ? "fa-folder-open" : "fa-folder"}"></i></span>
                <span class="difficulty-folder-name">${escaparHTMLDificultad(nombreCarpeta)}</span>
                ${carpeta === "default" ? "" : '<span class="difficulty-folder-tag">VARIACIÓN</span>'}
                <small class="difficulty-folder-count">${cuenta}</small>
            </button>
            <div class="difficulty-folder-items">${filas}${entrada}</div>
        </div>`;
    }).join("") + (entradaNuevaVariacion ? `<form class="difficulty-variation-new-row" onsubmit="event.preventDefault(); confirmarNuevaVariacion();">
        <input type="text" id="difficulty-variation-new-name" maxlength="32" autocomplete="off" spellcheck="false" placeholder="ID de variación (ej. player)" value="${escaparHTMLDificultad(entradaNuevaVariacion.valor || "")}" oninput="entradaNuevaVariacion && (entradaNuevaVariacion.valor = this.value)" onkeydown="if (event.key === 'Escape') { event.preventDefault(); cancelarNuevaVariacion(); }">
        <button type="submit" class="difficulty-new-ok" title="Crear variación" aria-label="Crear variación"><i class="fa-solid fa-check"></i></button>
        <button type="button" class="difficulty-new-cancel" title="Cancelar" aria-label="Cancelar" onclick="cancelarNuevaVariacion()"><i class="fa-solid fa-xmark"></i></button>
    </form><div class="difficulty-new-hint ${entradaNuevaVariacion.error ? "error" : ""}">${escaparHTMLDificultad(entradaNuevaVariacion.error || "ID V-Slice: empieza con letra minúscula y usa solo letras o números (mínimo 2).")}</div>` : "");
    const estado = document.querySelector("#difficulty-window .events-window-status");
    if (estado) estado.textContent = carpetas.length > 1 ? `MULTI · ${carpetas.length}` : "MULTI";
    const inputNuevo = entradaNuevaDificultad
        ? document.getElementById("difficulty-new-name")
        : document.getElementById("difficulty-variation-new-name");
    if (inputNuevo && document.activeElement !== inputNuevo) {
        inputNuevo.focus();
        try { inputNuevo.setSelectionRange(inputNuevo.value.length, inputNuevo.value.length); } catch (e) { }
    }
}

function alternarCarpetaDificultad(carpeta) {
    if (carpetaDificultadSeleccionada === carpeta || carpetasDificultadCerradas[carpeta]) {
        carpetasDificultadCerradas[carpeta] = !carpetasDificultadCerradas[carpeta];
    }
    carpetaDificultadSeleccionada = carpeta;
    actualizarListaDificultades();
}

// Click en una dificultad de cualquier carpeta.
async function seleccionarDificultadGCD(carpeta, nombre) {
    if (!currentChartData) return false;
    carpetaDificultadSeleccionada = carpeta;
    if (carpeta === variacionActivaGCD()) {
        cambiarDificultad(nombre);
        actualizarListaDificultades();
        return true;
    }
    if (typeof cambiarVariacionGCD === "function") return cambiarVariacionGCD(carpeta, nombre);
    return false;
}

// Velocidad por dificultad (scrollSpeed de V-Slice).
function guardarVelocidadDificultad() {
    if (!currentChartData || !dificultadActiva) return;
    const input = document.getElementById("speed-dummy-input");
    const v = parseFloat(input ? input.value : currentChartData.speed);
    if (Number.isFinite(v) && v > 0) currentChartData.speed = v;
    if (!currentChartData.scrollSpeeds || typeof currentChartData.scrollSpeeds !== "object") currentChartData.scrollSpeeds = {};
    currentChartData.scrollSpeeds[dificultadActiva] = currentChartData.speed || 1;
}

function cargarVelocidadDificultad() {
    if (!currentChartData) return;
    const mapa = currentChartData.scrollSpeeds || {};
    const v = parseFloat(mapa[dificultadActiva]);
    if (Number.isFinite(v) && v > 0) currentChartData.speed = v;
    const input = document.getElementById("speed-dummy-input");
    if (input) input.value = currentChartData.speed || 1;
}

function cambiarDificultad(nombre) {
    if (!currentChartData) return;
    if (!currentChartData.difficulties[nombre] || nombre === dificultadActiva) return;
    guardarVelocidadDificultad();
    guardarDificultadActiva();
    dificultadActiva = nombre;
    currentChartData.activeDifficulty = nombre;
    currentChartData.notes = currentChartData.difficulties[nombre].notes;
    cargarVelocidadDificultad();
    // Events compartidos: no apuntar a otro objeto vacío por dificultad
    asegurarEventosCompartidos(currentChartData);
    deseleccionarNotaActual();
    deseleccionarEventoActual();
    generarEstructuraGrilla(currentChartData.totalRows);
    pintarNotasActuales();
    pintarEventosActuales();
    actualizarListaDificultades();
    actualizarIndicadorDificultad();
    if (typeof actualizarEstadoMenuEditor === "function") actualizarEstadoMenuEditor();
}

function cambiarDificultadSiguiente() {
    if (!currentChartData) return;
    const carpeta = variacionActivaGCD();
    let orden = carpeta === "default"
        ? ["normal", "hard", "easy"].concat(Object.keys(currentChartData.difficulties).filter((n) => !DIFICULTADES_BASE_GCD.includes(n)))
        : Object.keys(currentChartData.difficulties);
    orden = orden.filter((n) => currentChartData.difficulties[n]);
    if (!orden.length) return;
    const indice = orden.indexOf(dificultadActiva);
    cambiarDificultad(orden[(indice + 1) % orden.length]);
}

function actualizarIndicadorDificultad() {
    const indicador = document.getElementById("display-song-difficulty");
    if (!indicador) return;
    const carpeta = variacionActivaGCD();
    indicador.innerText = carpeta === "default"
        ? dificultadActiva.toUpperCase()
        : `${carpeta.toUpperCase()} · ${dificultadActiva.toUpperCase()}`;
}

function abrirVentanaDificultad() {
    const ventana = document.getElementById("difficulty-window");
    const wrapper = document.getElementById("menu-windows-wrapper");
    if (!ventana) return;
    ventana.classList.add("active");
    ventana.classList.remove("minimized");
    ventana.setAttribute("aria-hidden", "false");
    carpetaDificultadSeleccionada = variacionActivaGCD();
    actualizarListaDificultades();
    if (wrapper) wrapper.classList.remove("open");
}

function cerrarVentanaDificultad() {
    const ventana = document.getElementById("difficulty-window");
    if (!ventana) return;
    entradaNuevaDificultad = null;
    entradaNuevaVariacion = null;
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

// ---------- Añadir dificultad (con nombre) ----------
function mostrarEntradaNuevaDificultad() {
    if (!currentChartData) return;
    entradaNuevaVariacion = null;
    const carpeta = carpetaDificultadSeleccionada || variacionActivaGCD();
    carpetasDificultadCerradas[carpeta] = false;
    entradaNuevaDificultad = { carpeta, valor: "", error: "" };
    actualizarListaDificultades();
}

function cancelarNuevaDificultad() {
    entradaNuevaDificultad = null;
    actualizarListaDificultades();
}

// "Hard Plus" -> "hard-plus". Devuelve { nombre } o { error }.
function validarNombreDificultad(texto, carpeta) {
    const nombre = String(texto || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!nombre) return { error: "Escribe el nombre de la dificultad." };
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(nombre)) return { error: "Usa solo letras, números, - o _ (sin acentos)." };
    if (/^\d+$/.test(nombre)) return { error: "El nombre no puede ser solo números." };
    const datos = typeof datosVariacionGCD === "function" ? datosVariacionGCD(carpeta) : currentChartData;
    if (datos && datos.difficulties && datos.difficulties[nombre]) {
        return { error: `«${nombre}» ya existe en ${carpeta === "default" ? "Default" : carpeta}.` };
    }
    return { nombre };
}

async function confirmarNuevaDificultad() {
    if (!entradaNuevaDificultad) return false;
    const input = document.getElementById("difficulty-new-name");
    if (input) entradaNuevaDificultad.valor = input.value;
    const carpeta = entradaNuevaDificultad.carpeta;
    const r = validarNombreDificultad(entradaNuevaDificultad.valor, carpeta);
    if (r.error) {
        entradaNuevaDificultad.error = r.error;
        actualizarListaDificultades();
        return false;
    }
    entradaNuevaDificultad = null;
    return añadirDificultadGCD(carpeta, r.nombre);
}

// Inserta la dificultad (vacía o con notas guardadas) en la carpeta y la selecciona.
async function añadirDificultadGCD(carpeta, nombre, opciones = {}) {
    if (!currentChartData) return false;
    const previa = { variacion: variacionActivaGCD(), dificultad: dificultadActiva };
    if (carpeta === variacionActivaGCD()) guardarDificultadActiva();
    const datos = typeof datosVariacionGCD === "function" ? datosVariacionGCD(carpeta) : currentChartData;
    if (!datos || !datos.difficulties || datos.difficulties[nombre]) return false;
    const eventos = datos.events && typeof datos.events === "object" ? datos.events : (datos.events = {});
    insertarDificultadEnMapa(datos, nombre, { notes: opciones.notas ? JSON.parse(JSON.stringify(opciones.notas)) : {}, events: eventos }, opciones.indice);
    if (opciones.velocidad !== undefined) {
        datos.scrollSpeeds = datos.scrollSpeeds || {};
        datos.scrollSpeeds[nombre] = opciones.velocidad;
    }
    await seleccionarDificultadGCD(carpeta, nombre);
    if (!opciones.sinHistorial && typeof registrarCambioDificultad === "function") {
        registrarCambioDificultad({ accion: "añadir", variacion: carpeta, dificultad: nombre, previa });
    }
    if (!opciones.silencioso && typeof mostrarToastGCD === "function") {
        mostrarToastGCD(`Dificultad «${nombre}» añadida en ${carpeta === "default" ? "Default" : carpeta}`);
    }
    if (typeof programarAutoguardado === "function") programarAutoguardado();
    return true;
}

// Inserta una clave en el mapa difficulties respetando el orden (índice opcional).
function insertarDificultadEnMapa(datos, nombre, valor, indice) {
    const entradas = Object.entries(datos.difficulties).filter(([n]) => n !== nombre);
    const i = Number.isInteger(indice) && indice >= 0 && indice <= entradas.length ? indice : entradas.length;
    entradas.splice(i, 0, [nombre, valor]);
    const nuevo = {};
    entradas.forEach(([n, v]) => { nuevo[n] = v; });
    datos.difficulties = nuevo;
}

// ---------- Añadir variación de canción ----------
function mostrarEntradaNuevaVariacion() {
    if (!currentChartData) return;
    entradaNuevaDificultad = null;
    entradaNuevaVariacion = { valor: "", error: "" };
    actualizarListaDificultades();
}

function cancelarNuevaVariacion() {
    entradaNuevaVariacion = null;
    actualizarListaDificultades();
}

function validarNombreVariacion(texto) {
    const id = String(texto || "").trim().toLowerCase();
    if (!id) return { error: "Escribe el ID de la variación." };
    // Song.validateVariationId() en Funkin acepta IDs no predeterminados con /^[a-z][a-z0-9]+$/.
    if (!/^[a-z][a-z0-9]+$/.test(id)) return { error: "Usa 2 o más caracteres: empieza con letra minúscula y continúa con letras o números." };
    if (typeof listaVariacionesGCD === "function" && listaVariacionesGCD().includes(id)) {
        return { error: `La variación «${id}» ya existe.` };
    }
    return { nombre: id };
}

async function confirmarNuevaVariacion() {
    if (!entradaNuevaVariacion) return false;
    const input = document.getElementById("difficulty-variation-new-name");
    if (input) entradaNuevaVariacion.valor = input.value;
    const validacion = validarNombreVariacion(entradaNuevaVariacion.valor);
    if (validacion.error) {
        entradaNuevaVariacion.error = validacion.error;
        actualizarListaDificultades();
        return false;
    }
    entradaNuevaVariacion = null;
    const creada = await crearVariacionGCD(validacion.nombre);
    if (!creada) actualizarListaDificultades();
    return creada;
}

// ---------- Quitar dificultad ----------
function quitarDificultadActiva(opciones = {}) {
    if (!currentChartData) return false;
    const carpeta = variacionActivaGCD();
    const orden = ordenDificultadesCarpeta(currentChartData.difficulties, carpeta).filter((n) => currentChartData.difficulties[n]);
    if (orden.length <= 1) {
        if (typeof mostrarToastGCD === "function") mostrarToastGCD("La carpeta necesita al menos una dificultad");
        return false;
    }
    guardarVelocidadDificultad();
    guardarDificultadActiva();
    const nombre = dificultadActiva;
    const indiceOrden = orden.indexOf(nombre);
    const indiceMapa = Object.keys(currentChartData.difficulties).indexOf(nombre);
    const guardada = {
        notas: JSON.parse(JSON.stringify(currentChartData.difficulties[nombre].notes || {})),
        velocidad: currentChartData.scrollSpeeds ? currentChartData.scrollSpeeds[nombre] : undefined,
        indice: indiceMapa
    };
    const siguiente = orden[indiceOrden > 0 ? indiceOrden - 1 : 1];
    delete currentChartData.difficulties[nombre];
    if (currentChartData.scrollSpeeds) delete currentChartData.scrollSpeeds[nombre];
    dificultadActiva = siguiente;
    currentChartData.activeDifficulty = siguiente;
    currentChartData.notes = currentChartData.difficulties[siguiente].notes;
    cargarVelocidadDificultad();
    asegurarEventosCompartidos(currentChartData);
    deseleccionarNotaActual();
    deseleccionarEventoActual();
    generarEstructuraGrilla(currentChartData.totalRows);
    pintarNotasActuales();
    pintarEventosActuales();
    actualizarListaDificultades();
    actualizarIndicadorDificultad();
    if (!opciones.sinHistorial && typeof registrarCambioDificultad === "function") {
        registrarCambioDificultad({ accion: "quitar", variacion: carpeta, dificultad: nombre, guardada, siguiente });
    }
    if (!opciones.silencioso && typeof mostrarToastGCD === "function") mostrarToastGCD(`Dificultad «${nombre}» quitada`);
    if (typeof programarAutoguardado === "function") programarAutoguardado();
    if (typeof actualizarEstadoMenuEditor === "function") actualizarEstadoMenuEditor();
    return true;
}

function restaurarDificultadesFaltantes() {
    if (!currentChartData) return;
    if (!currentChartData.difficulties || typeof currentChartData.difficulties !== "object") currentChartData.difficulties = {};
    asegurarEventosCompartidos(currentChartData);
    const sharedEvents = currentChartData.events || {};
    const carpeta = variacionActivaGCD();
    const esperadas = carpeta === "default"
        ? DIFICULTADES_BASE_GCD
        : (Array.isArray(currentChartData.dificultadesOriginales) && currentChartData.dificultadesOriginales.length ? currentChartData.dificultadesOriginales : DIFICULTADES_BASE_GCD);
    const añadidas = [];
    esperadas.forEach((nombre) => {
        if (!currentChartData.difficulties[nombre]) {
            currentChartData.difficulties[nombre] = { notes: {}, events: sharedEvents };
            añadidas.push(nombre);
        } else {
            currentChartData.difficulties[nombre].events = sharedEvents;
        }
    });
    if (carpeta !== "default" && añadidas.length) {
        // Mantener el orden original de la variación.
        const nuevo = {};
        esperadas.forEach((n) => { if (currentChartData.difficulties[n]) nuevo[n] = currentChartData.difficulties[n]; });
        Object.keys(currentChartData.difficulties).forEach((n) => { if (!nuevo[n]) nuevo[n] = currentChartData.difficulties[n]; });
        currentChartData.difficulties = nuevo;
    }
    actualizarListaDificultades();
    if (añadidas.length && typeof mostrarToastGCD === "function") mostrarToastGCD(`Añadidas: ${añadidas.join(", ")}`);
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
    // V0.8.2 Event Update: la grilla se reconstruye sin clases de selección.
    if (typeof notasSeleccionadas !== "undefined") notasSeleccionadas.clear();
    notaSeleccionada = null;
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
    if (!currentChartData.events) {
        currentChartData.events = {};
        asegurarEventosCompartidos(currentChartData);
    }
    const aditivo = (typeof modoMultiSeleccion !== "undefined" && modoMultiSeleccion) || e.shiftKey || e.ctrlKey || e.metaKey;
    const claves = typeof clavesEventosFila === "function" ? clavesEventosFila(f) : (currentChartData.events[f] ? [String(f)] : []);

    // V0.8.2k: Alt + clic en una casilla con eventos añade otro pegado.
    if (claves.length && e.altKey && typeof apilarEventoEnCasillaGCD === "function") {
        seleccionarEvento(claves[claves.length - 1]);
        apilarEventoEnCasillaGCD(typeof tipoEventoNuevoGCD !== "undefined" ? tipoEventoNuevoGCD : undefined);
        return;
    }
    if (claves.length) {
        if (aditivo) alternarSeleccionEvento(claves[0]);
        else seleccionarEvento(claves[0]);
        return;
    }
    // V0.8.2 Event Update: crea el tipo elegido en "Tipo de evento" (js/EventosGCD.js).
    const nuevoEvento = typeof crearEventoPorTipoGCD === "function"
        ? crearEventoPorTipoGCD(typeof tipoEventoNuevoGCD !== "undefined" ? tipoEventoNuevoGCD : "Focus Camera")
        : { type: "Focus Camera", target: "opponent", duration: 4, offsetX: 0, offsetY: 0, effect: "CLASSIC" };
    const clave = String(f);
    // V0.8.2 Event Update: crear un evento entra al historial (Atrasar/Adelantar).
    if (typeof ejecutarEdicionChart === "function") {
        ejecutarEdicionChart("Colocar evento", () => escribirEventoChart(clave, nuevoEvento));
    } else {
        currentChartData.events[clave] = nuevoEvento;
    }
    if (aditivo) alternarSeleccionEvento(clave, true);
    else seleccionarEvento(clave);
}

// V0.8.2k: clic sobre un evento concreto de la casilla (también si hay varios pegados).
function manejarClickEventoApilado(e, clave) {
    if (!currentChartData || !currentChartData.events || !currentChartData.events[clave]) return;
    if (e.altKey && typeof apilarEventoEnCasillaGCD === "function") {
        seleccionarEvento(clave);
        apilarEventoEnCasillaGCD(typeof tipoEventoNuevoGCD !== "undefined" ? tipoEventoNuevoGCD : undefined);
        return;
    }
    const aditivo = (typeof modoMultiSeleccion !== "undefined" && modoMultiSeleccion) || e.shiftKey || e.ctrlKey || e.metaKey;
    if (aditivo) alternarSeleccionEvento(clave);
    else seleccionarEvento(clave);
}

function refrescarMarcasEventos(claves) {
    const filas = new Set();
    claves.forEach((k) => { if (k !== null && k !== undefined) filas.add(parseInt(k, 10)); });
    filas.forEach((f) => {
        if (!Number.isFinite(f)) return;
        if (typeof marcarSeleccionFilaEventosGCD === "function") marcarSeleccionFilaEventosGCD(f);
    });
}

// Selección simple: deja solo este evento (clave "fila" o "fila~n").
function seleccionarEvento(clave) {
    const antes = Array.from(eventosSeleccionados);
    if (eventoSeleccionado !== null) antes.push(String(eventoSeleccionado));
    eventosSeleccionados.clear();
    eventoSeleccionado = clave === null || clave === undefined ? null : String(clave);
    if (eventoSeleccionado !== null) eventosSeleccionados.add(eventoSeleccionado);
    refrescarMarcasEventos(antes.concat(eventoSeleccionado === null ? [] : [eventoSeleccionado]));
    actualizarVentanaEvento();
    if (typeof actualizarEstadoMenuEditor === "function") actualizarEstadoMenuEditor();
}

// Multi-selección de eventos (modo Multi o Shift/Ctrl + clic).
function alternarSeleccionEvento(clave, forzarAgregar) {
    const k = String(clave);
    if (eventosSeleccionados.has(k) && !forzarAgregar) {
        eventosSeleccionados.delete(k);
        if (eventoSeleccionado === k) {
            let ultimo = null;
            eventosSeleccionados.forEach((x) => { ultimo = x; });
            eventoSeleccionado = ultimo;
        }
    } else {
        if (eventoSeleccionado !== null) eventosSeleccionados.add(String(eventoSeleccionado));
        eventosSeleccionados.add(k);
        eventoSeleccionado = k;
    }
    refrescarMarcasEventos([k].concat(Array.from(eventosSeleccionados)));
    actualizarVentanaEvento();
    if (typeof actualizarEstadoMenuEditor === "function") actualizarEstadoMenuEditor();
}

// Claves de los eventos seleccionados que siguen existiendo.
function obtenerClavesEventosSeleccionados() {
    const ev = (currentChartData && currentChartData.events) || {};
    const set = new Set(Array.from(eventosSeleccionados).filter((k) => ev[k]));
    if (eventoSeleccionado !== null && ev[eventoSeleccionado]) set.add(String(eventoSeleccionado));
    return Array.from(set);
}

function deseleccionarEventoActual() {
    const antes = Array.from(eventosSeleccionados);
    if (eventoSeleccionado !== null) antes.push(String(eventoSeleccionado));
    eventosSeleccionados.clear();
    eventoSeleccionado = null;
    refrescarMarcasEventos(antes);
    document.querySelectorAll(".events-column .grid-cell.event-selected").forEach((c) => c.classList.remove("event-selected"));
    actualizarVentanaEvento();
    if (typeof actualizarEstadoMenuEditor === "function") actualizarEstadoMenuEditor();
}

function eliminarEventoSeleccionado() {
    if (eventoSeleccionado === null || !currentChartData?.events?.[eventoSeleccionado]) return;
    // V0.8.2k: con varios eventos seleccionados se eliminan todos.
    const claves = obtenerClavesEventosSeleccionados();
    eventosSeleccionados.clear();
    eventoSeleccionado = null;
    const etiqueta = claves.length === 1 ? "Eliminar evento" : `Eliminar ${claves.length} eventos`;
    if (typeof ejecutarEdicionChart === "function") {
        ejecutarEdicionChart(etiqueta, () => claves.forEach((k) => escribirEventoChart(k, null)));
    } else {
        claves.forEach((k) => { delete currentChartData.events[k]; });
        claves.forEach((k) => typeof pintarFilaEventosGCD === "function" && pintarFilaEventosGCD(k));
    }
    refrescarMarcasEventos(claves);
    actualizarVentanaEvento();
    if (typeof actualizarEstadoMenuEditor === "function") actualizarEstadoMenuEditor();
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
    // V0.8.2 Event Update: Scroll Speed, Camera Bop, Health Icon, Zoom y Play Animation
    // usan el formulario "Event Data" de js/EventosGCD.js.
    if (typeof actualizarFormularioEventoGCD === "function" && actualizarFormularioEventoGCD(evento)) return;
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
    // V0.8.2m: lista oficial de eases (Classic solo en Focus Camera) + valor importado si no está.
    if (effect) {
        if (typeof prepararSelectEaseFocusGCD === "function") prepararSelectEaseFocusGCD(effect, evento);
        else effect.value = evento.effect;
    }
    if (offsetX) offsetX.value = evento.offsetX;
    if (offsetY) offsetY.value = evento.offsetY;
    if (positionFields) positionFields.hidden = evento.target !== "position";
}

function actualizarConfiguracionEvento() {
    if (eventoSeleccionado === null || !currentChartData?.events?.[eventoSeleccionado]) return;
    const evento = currentChartData.events[eventoSeleccionado];
    if (typeof esEventoFocusCamera === "function" && !esEventoFocusCamera(evento)) return;
    const eventoAntes = JSON.parse(JSON.stringify(evento));
    evento.target = document.getElementById("event-target-select")?.value || "opponent";
    evento.duration = Math.max(0, parseFloat(document.getElementById("event-duration-input")?.value) || 0);
    const effectSelect = document.getElementById("event-effect-select");
    if (typeof aplicarEaseFocusDesdeSelectGCD === "function") aplicarEaseFocusDesdeSelectGCD(evento, effectSelect);
    else evento.effect = effectSelect?.value || "CLASSIC";
    evento.offsetX = parseFloat(document.getElementById("event-offset-x")?.value) || 0;
    evento.offsetY = parseFloat(document.getElementById("event-offset-y")?.value) || 0;
    const positionFields = document.getElementById("events-position-fields");
    if (positionFields) positionFields.hidden = evento.target !== "position";
    // V0.8.2 Event Update: los cambios de configuración también se pueden atrasar.
    if (typeof registrarCambioConfigEvento === "function") registrarCambioConfigEvento(eventoSeleccionado, eventoAntes, evento);
}

function deseleccionarNotaActual() {
    // V0.8.2 Event Update: limpia toda la selección (simple o múltiple).
    if (typeof limpiarSeleccionNotas === "function") {
        limpiarSeleccionNotas();
        return;
    }
    if (notaSeleccionada) {
        const prevCell = document.getElementById(notaSeleccionada);
        if (prevCell) prevCell.classList.remove("selected-note");
        notaSeleccionada = null;
    }
}

function manejarClickCelda(e, f, c, cell) {
    e.stopPropagation();
    // Multi-selección: modo activado desde EDITOR (táctil) o Shift/Ctrl + clic (PC).
    const aditivo = (typeof modoMultiSeleccion !== "undefined" && modoMultiSeleccion) || e.shiftKey || e.ctrlKey || e.metaKey;
    // V0.8.2k: en multi-selección se pueden juntar flechas y eventos (para Mover Notas).
    if (!aditivo) deseleccionarEventoActual();
    const libre = typeof modoLibreActivo !== "undefined" && modoLibreActivo;
    let grupo = null;      // claves de la flecha tocada (una o una pila)
    let top = null;        // la flecha que se ve encima (la que se selecciona)
    let filaNueva = f;
    let pLibre = null;     // Modo Libre: punto tocado dentro de la casilla (-0.5 … 0.5)
    if (libre && typeof notaEnPuntoLibreGCD === "function") {
        // V0.8.2l Modo Libre: la hitbox es la FLECHA (tamaño de una casilla, centrada en
        // donde está dibujada), no la casilla. El espacio vacío lo definen las flechas.
        const y = posicionClickCeldaGCD(e, f, cell);
        if (y !== null) {
            const hit = notaEnPuntoLibreGCD(c, y);
            if (hit) { grupo = hit.grupo.claves; top = hit.grupo.top; }
            else {
                const total = parseInt(currentChartData.totalRows, 10) || 0;
                filaNueva = Math.max(0, Math.min(Math.max(0, total - 1), Math.floor(y)));
                pLibre = Math.min(0.5, Math.max(-0.5, y - filaNueva - 0.5));
            }
        }
    } else if (typeof clavesNotasCelda === "function") {
        // Sin Modo Libre la casilla es la hitbox (con todas sus flechas).
        const claves = clavesNotasCelda(f, c);
        if (claves.length) {
            grupo = claves;
            const principal = grupoPrincipalCelda(gruposVisualesNotas(claves));
            top = principal ? principal.top : claves[claves.length - 1];
        }
    } else if (currentChartData.notes[`${f}-${c}`]) {
        grupo = [`${f}-${c}`];
        top = grupo[0];
    }
    if (grupo && grupo.length) {
        if (aditivo) {
            // Shift/Ctrl/Multi sobre una pila: entra (o sale) toda la pila.
            const todas = grupo.every((k) => notasSeleccionadas.has(k));
            if (todas) grupo.forEach((k) => quitarNotaDeSeleccion(k));
            else {
                grupo.filter((k) => k !== top).forEach((k) => agregarNotaASeleccion(k));
                agregarNotaASeleccion(top);
            }
        } else if (notasSeleccionadas.size === 1 && notasSeleccionadas.has(top)) {
            // Segundo toque sobre la única nota seleccionada: se elimina (comportamiento original).
            // En una pila solo se quita la de encima; las demás siguen ahí.
            ejecutarEdicionChart("Quitar flecha", () => escribirNotaChart(top, null));
        } else {
            seleccionarSoloNota(top);
        }
        return;
    }
    if (!aditivo) limpiarSeleccionNotas();
    // Note Events: con un kind activo, la flecha nueva lo lleva (js/NoteEvents.js).
    const notaNueva = typeof nuevaNotaGCD === "function" ? nuevaNotaGCD() : { len: 0 };
    delete notaNueva.off;
    // V0.8.2k/l Modo Libre: la flecha queda donde se toca (según el imán a la casilla).
    if (libre && pLibre !== null && typeof prepararNotaLibreNueva === "function") prepararNotaLibreNueva(notaNueva, pLibre);
    const key = typeof claveLibreNota === "function" ? claveLibreNota(filaNueva, c) : `${filaNueva}-${c}`;
    ejecutarEdicionChart("Colocar flecha", () => escribirNotaChart(key, notaNueva));
    agregarNotaASeleccion(key);
}

function ajustarLongitudNota(dir) {
    // V0.8.2 Event Update: ajusta el sustain de todas las notas seleccionadas.
    const claves = obtenerClavesSeleccionadas();
    if (!claves.length) return;
    ejecutarEdicionChart(dir > 0 ? "Extender sustain" : "Recortar sustain", () => {
        claves.forEach((key) => {
            const nota = currentChartData.notes[key];
            if (!nota) return;
            const lenActual = Math.max(0, parseInt(nota.len, 10) || 0);
            const len = Math.max(0, lenActual + dir);
            if (len === lenActual) return;
            escribirNotaChart(key, Object.assign({}, nota, { len }));
        });
    });
}

// Reloj maestro HTMLAudio: audioInst.currentTime + hard-sync voces (js/audio.js v097)

function syncPlayPauseButtons(playing) {
    const btn = document.getElementById("btn-play-pause");
    const btnMobile = document.getElementById("btn-play-pause-mobile");
    if (playing) {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
            btn.classList.add("playing");
        }
        if (btnMobile) {
            btnMobile.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
            btnMobile.classList.add("playing");
        }
    } else {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Reproducir';
            btn.classList.remove("playing");
        }
        if (btnMobile) {
            btnMobile.innerHTML = '<i class="fa-solid fa-play"></i> Play';
            btnMobile.classList.remove("playing");
        }
    }
}

function togglePlayPause() {
    if (typeof hayAudioCargado === 'function' ? !hayAudioCargado() : !audioInst) return;
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    fijarVolumenPistas();

    if (isPlaying) {
        const t = (typeof pauseWaPlayback === 'function')
            ? pauseWaPlayback()
            : ((typeof getMasterSongTime === 'function') ? getMasterSongTime() : 0);
        isPlaying = false;
        syncPlayPauseButtons(false);
        cancelAnimationFrame(animationFrameId);
        if (typeof actualizarWaveforms === 'function') actualizarWaveforms(t, true);
    } else {
        const t = (typeof getMasterSongTime === 'function') ? getMasterSongTime() : (audioInst ? audioInst.currentTime : 0);
        lastHitTime = t - 0.001;
        lastVoiceResyncMs = 0;
        if (typeof startWaPlayback === 'function') {
            startWaPlayback(t);
        } else {
            sincronizarPistasAudio(t);
            const tracks = [audioInst, audioVoice1, audioVoice2].filter(Boolean);
            tracks.forEach((a) => { try { a.volume = 1; a.playbackRate = 1; } catch (e) { } });
            if (typeof aplicarMuteEstadosUI === 'function') aplicarMuteEstadosUI();
            Promise.allSettled(tracks.map((audio) => audio.play()));
        }
        isPlaying = true;
        syncPlayPauseButtons(true);
        animationFrameId = requestAnimationFrame(actualizarPlaybackFiel);
    }
}

function reposicionarScroll(forceWave = false) {
    if (!currentChartData) return;
    if (typeof hayAudioCargado === 'function' ? !hayAudioCargado() : !audioInst) return;
    const tiempoActual = (typeof getMasterSongTime === 'function') ? getMasterSongTime() : audioInst.currentTime;
    const stepDuration = (60 / currentChartData.bpm) / 4;
    const currentStep = tiempoActual / stepDuration;

    const workspace = document.getElementById('scroll-workspace');
    // Stronger ignore so programmatic scroll during play does NOT pause
    ignorarSiguienteScroll = true;
    if (typeof performance !== 'undefined' && performance.now) {
        ignorarScrollHasta = performance.now() + 80;
    } else {
        ignorarScrollHasta = Date.now() + 80;
    }
    workspace.scrollTop = (currentStep * alturaCelda * globalZoomFactor);

    if (typeof actualizarWaveforms === 'function') actualizarWaveforms(tiempoActual, forceWave);
}

let lastVoiceResyncMs = 0;

function actualizarPlaybackFiel() {
    if (typeof hayAudioCargado === 'function' ? !hayAudioCargado() : !audioInst) return;
    const tiempoActual = (typeof getMasterSongTime === 'function') ? getMasterSongTime() : audioInst.currentTime;
    if (isPlaying) {
        // v098: no per-rAF hard-seek when WA clock is active.
        // HTML-only / hybrid fallback tracks: sync ≤ every 300ms inside sincronizarVocesAlMaster.
        if (typeof sincronizarVocesAlMaster === 'function') sincronizarVocesAlMaster(tiempoActual);
        reposicionarScroll(false);
        if (lastHitTime >= 0 && currentChartData) {
            const hitPEl = document.getElementById("hit-player");
            const hitEEl = document.getElementById("hit-enemy");
            const wantP = hitPEl && hitPEl.checked;
            const wantE = hitEEl && hitEEl.checked;
            if (wantP || wantE) {
                const stepDuration = 60 / currentChartData.bpm / 4;
                let sonarHitsoundFrame = false;
                const tiempoConLatencia = tiempoActual;
                const lastHitConLatencia = lastHitTime;
                for (let key in currentChartData.notes) {
                    const parts = key.split("-");
                    const f = parseInt(parts[0], 10);
                    const c = parseInt(parts[1], 10);
                    // V0.8.2k: las flechas del Modo Libre suenan en su tiempo exacto.
                    const off = Number(currentChartData.notes[key] && currentChartData.notes[key].off) || 0;
                    const noteTime = (f + off) * stepDuration;
                    if (noteTime > lastHitConLatencia && noteTime <= tiempoConLatencia) {
                        if ((wantP && c < 4) || (wantE && c >= 4)) sonarHitsoundFrame = true;
                    }
                }
                if (sonarHitsoundFrame) playHitsound();
            }
            // V0.8.2 Event Update: los personajes cantan con las notas de su lado
            // (mismo intervalo que los hitsounds, aunque estén desactivados).
            if (typeof notificarNotasPersonajes === 'function') {
                try { notificarNotasPersonajes(lastHitTime, tiempoActual); } catch (e) { }
            }
        }
        lastHitTime = tiempoActual;
    }
    actualizarContadorDeTiempo(tiempoActual);
    if (isPlaying) {
        const dur = (typeof getMasterDuration === 'function') ? getMasterDuration() : (audioInst && audioInst.duration);
        if (dur && tiempoActual >= dur - 0.02) {
            togglePlayPause();
            sincronizarPistasAudio(0);
            reposicionarScroll(true);
        } else {
            animationFrameId = requestAnimationFrame(actualizarPlaybackFiel);
        }
    }
}

function manejarScrollManual() {
    if (!currentChartData) return;
    if (typeof hayAudioCargado === 'function' ? !hayAudioCargado() : !audioInst) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (ignorarSiguienteScroll || now < ignorarScrollHasta) {
        ignorarSiguienteScroll = false;
        return;
    }
    if (isPlaying) togglePlayPause();

    const workspace = document.getElementById('scroll-workspace');
    const stepDuration = (60 / currentChartData.bpm) / 4;
    let nuevoTiempo = ((workspace.scrollTop / globalZoomFactor) / alturaCelda) * stepDuration;
    if (nuevoTiempo < 0) nuevoTiempo = 0;
    const dur = (typeof getMasterDuration === 'function') ? getMasterDuration() : (audioInst && audioInst.duration);
    if (dur && nuevoTiempo > dur) nuevoTiempo = dur;

    // Seek all three HTMLAudio tracks to same time
    sincronizarPistasAudio(nuevoTiempo);

    lastHitTime = nuevoTiempo;
    actualizarContadorDeTiempo(nuevoTiempo);
    if (typeof actualizarWaveforms === 'function') actualizarWaveforms(nuevoTiempo, true);
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
        if (typeof esCampoDeTexto === "function" && esCampoDeTexto(e.target)) return;
        e.preventDefault();
        togglePlayPause();
    }
});

// --- Viewport / orientación: reajustar scroll y sync de audio ---
function reajustarTrasCambioViewport() {
    if (!currentChartData) return;
    const t = (typeof getMasterSongTime === 'function') ? getMasterSongTime() : (audioInst ? audioInst.currentTime : 0);
    if (typeof actualizarAlturaScroll === 'function') actualizarAlturaScroll();
    if ((typeof hayAudioCargado === 'function' ? hayAudioCargado() : audioInst) && typeof sincronizarPistasAudio === 'function') {
        sincronizarPistasAudio(t);
    }
    if (typeof reposicionarScroll === 'function') reposicionarScroll(true);
    else if (typeof actualizarWaveforms === 'function') actualizarWaveforms(t, true);
    // Limpiar left/top/width/height inline en portrait para que el CSS de hoja aplique
    if (typeof esPortraitPermitidoActivo === 'function' && esPortraitPermitidoActivo()) {
        document.querySelectorAll('.floating-editor-window').forEach((w) => {
            w.style.left = '';
            w.style.top = '';
            w.style.width = '';
            w.style.height = '';
        });
    }
}

let _viewportAjusteTimer = null;
function programarReajusteViewport() {
    if (_viewportAjusteTimer) clearTimeout(_viewportAjusteTimer);
    _viewportAjusteTimer = setTimeout(() => {
        _viewportAjusteTimer = null;
        reajustarTrasCambioViewport();
    }, 120);
}

window.addEventListener('orientationchange', programarReajusteViewport);
window.addEventListener('resize', programarReajusteViewport);

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (typeof hayAudioCargado === 'function' ? !hayAudioCargado() : !audioInst) return;
    if (audioCtx && audioCtx.state === 'suspended') {
        try { audioCtx.resume(); } catch (e) { }
    }
    const t = (typeof getMasterSongTime === 'function') ? getMasterSongTime() : audioInst.currentTime;
    if (isPlaying) {
        sincronizarVocesAlMaster(t, 0);
    } else {
        sincronizarPistasAudio(t);
    }
});
