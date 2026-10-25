// =====================================================================
// V0.8.2 "Event Update" — Tipos de evento de la ventana Events
// Focus Camera (formulario propio en charter.js) + Scroll Speed,
// Set Camera Bop, Set Health Icon, Zoom Camera y Play Animation.
// Cada evento nuevo se guarda en currentChartData.events[fila] como
//   { type: "Scroll Speed", v: { ...valores V-Slice... } }
// y se exporta tal cual al song-chart.json: { t, e: "ScrollSpeed", v }.
// Nunca toca el audio ni la reproducción.
// =====================================================================

const EVENTO_ICONO_RESPALDO = "eventassets/Default.png";
// V0.8.2m: EASES_GCD / EASES_FOCUS_CAMERA_GCD (lista oficial de V-Slice) están en js/EasingGCD.js.

const EVENTOS_GCD = {
    "Focus Camera": {
        id: "FocusCamera", label: "Focus Camera", icon: "eventassets/FocusCamera.png",
        desc: "Evento de cámara", corto: "FC"
    },
    "Scroll Speed": {
        id: "ScrollSpeed", label: "Scroll Speed", icon: "eventassets/Default.png",
        desc: "Cambia la velocidad de las flechas", corto: "SS", principal: "scroll",
        orden: ["duration", "scroll", "strumline", "ease", "absolute"],
        campos: [
            { key: "scroll", label: "Target Value", tipo: "number", def: 1, step: 0.1, min: 0, unidad: "x" },
            { key: "duration", label: "Duration", tipo: "number", def: 4, step: 0.5, min: 0, unidad: "steps" },
            { key: "ease", label: "Easing Type", tipo: "select", def: "linear", opciones: EASES_GCD, ease: true },
            { key: "strumline", label: "Target Strumline", tipo: "select", def: "both", opciones: [["both", "Both"], ["opponent", "Opponent"], ["player", "Player"]] },
            { key: "absolute", label: "Absolute", tipo: "bool", def: false }
        ]
    },
    "Set Camera Bop": {
        id: "SetCameraBop", label: "Set Camera Bop", icon: "eventassets/Default.png",
        desc: "Intensidad y ritmo del bop de cámara", corto: "CB", principal: "intensity",
        orden: ["rate", "intensity"],
        campos: [
            { key: "intensity", label: "Intensity", tipo: "number", def: 1, step: 0.1, min: 0, unidad: "x" },
            { key: "rate", label: "Rate", tipo: "number", def: 4, step: 1, min: 0, unidad: "beats/zoom" }
        ]
    },
    "Set Health Icon": {
        id: "SetHealthIcon", label: "Set Health Icon", icon: "eventassets/Default.png",
        desc: "Cambia el ícono de vida", corto: "HI", principal: "id",
        orden: ["isPixel", "offsetX", "scale", "offsetY", "char", "id", "flipX"],
        campos: [
            { key: "char", label: "Character", tipo: "selectNum", def: 0, opciones: [[0, "Player"], [1, "Opponent"]] },
            { key: "id", label: "Health Icon ID", tipo: "text", def: "bf", placeholder: "bf" },
            { key: "scale", label: "Scale", tipo: "number", def: 1, step: 0.1, min: 0 },
            { key: "flipX", label: "Flip X?", tipo: "bool", def: false },
            { key: "isPixel", label: "Is Pixel?", tipo: "bool", def: false },
            { key: "offsetX", label: "X Offset", tipo: "number", def: 0, step: 1, mitad: true },
            { key: "offsetY", label: "Y Offset", tipo: "number", def: 0, step: 1, mitad: true }
        ]
    },
    "Zoom Camera": {
        id: "ZoomCamera", label: "Zoom Camera", icon: "eventassets/Default.png",
        desc: "Cambia el zoom de la cámara", corto: "ZC", principal: "zoom",
        orden: ["ease", "duration", "zoom", "mode"],
        campos: [
            { key: "zoom", label: "Zoom Level", tipo: "number", def: 1, step: 0.05, min: 0, unidad: "x" },
            { key: "duration", label: "Duration", tipo: "number", def: 4, step: 0.5, min: 0, unidad: "steps" },
            // V-Slice (ZoomCameraSongEvent.hx): 'Stage zoom' => 'stage', 'Absolute zoom' => 'direct'
            { key: "mode", label: "Mode", tipo: "select", def: "stage", opciones: [["stage", "Stage Zoom"], ["direct", "Absolute Zoom"]] },
            { key: "ease", label: "Easing Type", tipo: "select", def: "linear", opciones: EASES_GCD, ease: true }
        ]
    },
    "Play Animation": {
        id: "PlayAnimation", label: "Play Animation", icon: "eventassets/PlayAnimation.png",
        desc: "Hace que un personaje haga una animación", corto: "PA", principal: "anim",
        orden: ["target", "anim", "force"],
        campos: [
            { key: "target", label: "Target", tipo: "text", def: "boyfriend", placeholder: "boyfriend", mitad: true },
            { key: "anim", label: "Animation", tipo: "text", def: "idle", placeholder: "idle", mitad: true },
            { key: "force", label: "Force", tipo: "bool", def: false }
        ]
    }
};

// V0.8.2i: "clave" del tipo (lo que guarda el <select>). Los integrados usan su label;
// los importados (js/ImportarEventos.js) usan "ext:<EventId>".
Object.values(EVENTOS_GCD).forEach((d) => { d.clave = d.label; });

// Eventos importados / desconocidos en currentChartData.events: { type: IE_TIPO_EXTERNO, e: "EventId", v: {...} }
const IE_TIPO_EXTERNO = "~vslice~";

let tipoEventoNuevoGCD = "Focus Camera";

// ---------- registro ----------
function definicionEventoGCD(evento) {
    if (evento && typeof evento === "object" && evento.type === IE_TIPO_EXTERNO && typeof ieDefinicionGCD === "function") return ieDefinicionGCD(evento.e);
    const tipo = evento && typeof evento === "object" ? evento.type : null;
    return (tipo && EVENTOS_GCD[tipo]) || EVENTOS_GCD["Focus Camera"];
}

// Definición por clave del <select> (label integrado o "ext:<EventId>").
function definicionPorClaveGCD(clave) {
    if (clave && EVENTOS_GCD[clave]) return EVENTOS_GCD[clave];
    if (typeof clave === "string" && clave.startsWith("ext:") && typeof ieDefinicionGCD === "function") {
        const d = ieDefinicionGCD(clave.slice(4));
        if (!d.noImportado) return d;
    }
    return EVENTOS_GCD["Focus Camera"];
}

function esEventoFocusCamera(evento) {
    return definicionEventoGCD(evento).id === "FocusCamera";
}

function definicionEventoPorIdVSlice(id) {
    const buscado = String(id || "").trim().toLowerCase();
    return Object.values(EVENTOS_GCD).find((d) => d.id.toLowerCase() === buscado) || null;
}

function valorCampoEventoGCD(campo, crudo) {
    switch (campo.tipo) {
        case "number": {
            const n = typeof crudo === "number" ? crudo : parseFloat(crudo);
            return Number.isFinite(n) ? n : campo.def;
        }
        case "bool":
            return crudo === true || crudo === "true" || crudo === 1;
        case "selectNum": {
            const n = parseInt(crudo, 10);
            return Number.isInteger(n) ? n : campo.def;
        }
        case "select":
            return crudo === undefined || crudo === null || crudo === "" ? campo.def : String(crudo);
        default:
            return crudo === undefined || crudo === null ? campo.def : String(crudo);
    }
}

// Normaliza v con los tipos correctos; conserva las claves extra (easeDir, etc.).
function normalizarValoresEventoGCD(def, v) {
    if (def && def.externo) return ieNormalizarValores(def, v);
    const origen = v && typeof v === "object" && !Array.isArray(v) ? v : {};
    const salida = {};
    (def.orden || []).forEach((key) => {
        const campo = def.campos.find((c) => c.key === key);
        salida[key] = valorCampoEventoGCD(campo, origen[key]);
    });
    Object.keys(origen).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(salida, key)) salida[key] = origen[key];
    });
    return salida;
}

function crearEventoPorTipoGCD(tipo) {
    const def = definicionPorClaveGCD(tipo);
    if (def.externo) return { type: IE_TIPO_EXTERNO, e: def.id, v: ieNormalizarValores(def, {}) };
    if (def.id === "FocusCamera") {
        return { type: "Focus Camera", target: "opponent", duration: 4, offsetX: 0, offsetY: 0, effect: "CLASSIC" }; // 082m: duración predeterminada del juego (4 steps)
    }
    return { type: def.label, v: normalizarValoresEventoGCD(def, {}) };
}

// ---------- exportar / importar (song-chart.json) ----------
function exportarEventoVSliceGCD(evento, tiempoMs) {
    const def = definicionEventoGCD(evento);
    if (def.id === "FocusCamera") return null;
    if (def.externo) {
        // Importado: v con los tipos del schema. No importado: v tal cual vino.
        const v = def.noImportado ? (evento.v === undefined ? {} : JSON.parse(JSON.stringify(evento.v))) : normalizarValoresEventoGCD(def, evento.v);
        return { "t": tiempoMs, "e": String(evento.e), "v": v };
    }
    return { "t": tiempoMs, "e": def.id, "v": normalizarValoresEventoGCD(def, evento.v) };
}

function importarEventoVSliceGCD(evento) {
    if (!evento || typeof evento !== "object") return null;
    const def = definicionEventoPorIdVSlice(evento.e);
    if (!def) {
        // V0.8.2i: eventos importados (.hxc) o desconocidos: se conservan con su id y su v.
        const id = typeof evento.e === "string" ? evento.e.trim() : "";
        if (!id || id === "FocusCamera") return null;
        const v = evento.v === undefined ? {} : JSON.parse(JSON.stringify(evento.v));
        const ext = typeof ieDefinicionGCD === "function" ? ieDefinicionGCD(id) : null;
        return { type: IE_TIPO_EXTERNO, e: id, v: ext && !ext.noImportado ? ieNormalizarValores(ext, v) : v };
    }
    if (def.id === "FocusCamera") return null;
    let v = evento.v;
    // Formato viejo: valor suelto (p. ej. ZoomCamera con "v": 1.3)
    if (v !== null && v !== undefined && typeof v !== "object") v = { [def.principal]: v };
    return { type: def.label, v: normalizarValoresEventoGCD(def, v) };
}

// ---------- ícono en la grilla ----------
function rutaIconoEventoGCD(evento) {
    return definicionEventoGCD(evento).icon;
}

function crearImagenIconoEventoGCD(src, clase, alFallar) {
    const img = document.createElement("img");
    img.className = clase;
    img.alt = "";
    img.onerror = () => {
        if (!img.dataset.respaldo && !img.src.endsWith(EVENTO_ICONO_RESPALDO)) {
            img.dataset.respaldo = "1";
            img.src = EVENTO_ICONO_RESPALDO;
        } else {
            img.onerror = null;
            img.style.visibility = "hidden";
            if (alFallar) alFallar();
        }
    };
    img.src = src;
    return img;
}

function quitarIconoEventoCeldaGCD(cell) {
    if (!cell) return;
    cell.querySelectorAll(".event-stack-item, .event-note-icon, .event-type-badge").forEach((el) => el.remove());
    cell.removeAttribute("title");
    cell.classList.remove("event-stack-multi");
    delete cell.dataset.eventCount;
}

function tituloEventoGCD(def, evento) {
    let datos = "";
    try { datos = JSON.stringify(normalizarValoresEventoGCD(def, evento.v)); } catch (e) { }
    return def.id === "FocusCamera" ? def.label : `${def.label} ${datos ?? ""}`;
}

// Un evento dentro de la casilla (ícono + etiqueta corta).
function crearItemEventoGCD(evento, clave) {
    const def = definicionEventoGCD(evento);
    const item = document.createElement("span");
    item.className = "event-stack-item";
    if (clave !== undefined && clave !== null) item.dataset.evkey = String(clave);
    let icon;
    if (def.externo && typeof ieCrearIconoEvento === "function") icon = ieCrearIconoEvento(def, "event-note-icon");
    else {
        icon = crearImagenIconoEventoGCD(def.icon, "event-note-icon");
        icon.alt = def.label;
        icon.dataset.eventType = def.id;
    }
    item.appendChild(icon);
    if (def.id !== "FocusCamera" && def.corto) {
        // Varios eventos comparten Default.png: una etiqueta corta los distingue.
        const badge = document.createElement("span");
        badge.className = "event-type-badge" + (def.noImportado ? " unknown" : "");
        badge.textContent = def.corto;
        item.appendChild(badge);
    }
    item.title = tituloEventoGCD(def, evento);
    if (clave !== undefined && clave !== null) {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            if (typeof manejarClickEventoApilado === "function") manejarClickEventoApilado(e, String(clave));
        });
    }
    return item;
}

// Compatibilidad: pinta UN evento en la casilla (sin pila).
function pintarIconoEventoCeldaGCD(cell, evento, clave) {
    if (!cell) return;
    quitarIconoEventoCeldaGCD(cell);
    if (!evento) return;
    const item = crearItemEventoGCD(evento, clave);
    cell.appendChild(item);
    cell.title = item.title;
    cell.dataset.eventCount = "1";
}

// ---------------------------------------------------------------------
// V0.8.2k: varios eventos en la misma casilla ("pegados").
// currentChartData.events usa la clave "fila" para el primero y
// "fila~1", "fila~2"... para los demás de esa misma casilla. En el
// song-chart.json cada uno sale por separado con el mismo "t".
// ---------------------------------------------------------------------
const SEP_PILA_EVENTO = "~";

function filaClaveEvento(clave) {
    const n = parseInt(clave, 10);
    return Number.isFinite(n) ? n : null;
}

function indicePilaClaveEvento(clave) {
    const s = String(clave);
    const i = s.indexOf(SEP_PILA_EVENTO);
    if (i < 0) return 0;
    const n = parseInt(s.slice(i + 1), 10);
    return Number.isFinite(n) ? n : 0;
}

function claveEventoPila(fila, indice) {
    return indice > 0 ? `${fila}${SEP_PILA_EVENTO}${indice}` : String(fila);
}

function ordenarClavesEventos(claves) {
    return claves.slice().sort((a, b) => (filaClaveEvento(a) - filaClaveEvento(b)) || (indicePilaClaveEvento(a) - indicePilaClaveEvento(b)));
}

// Claves de los eventos de una fila, en orden de la pila.
function clavesEventosFila(fila, events) {
    const ev = events || (currentChartData && currentChartData.events) || {};
    const f = String(fila);
    const pref = f + SEP_PILA_EVENTO;
    return Object.keys(ev).filter((k) => ev[k] && (k === f || k.startsWith(pref)))
        .sort((a, b) => indicePilaClaveEvento(a) - indicePilaClaveEvento(b));
}

// Primera clave libre de la fila ("fila", luego "fila~1", ...).
function claveLibreEventoFila(fila, events) {
    const ev = events || (currentChartData && currentChartData.events) || {};
    for (let i = 0; i < 10000; i++) {
        const k = claveEventoPila(fila, i);
        if (!ev[k]) return k;
    }
    return claveEventoPila(fila, Date.now());
}

// Añade un evento a un mapa {clave: evento} apilándolo si la fila ya tiene otro.
function agregarEventoAFilaGCD(events, fila, evento) {
    const k = claveLibreEventoFila(fila, events);
    events[k] = evento;
    return k;
}

function eventoClaveSeleccionadaGCD(clave) {
    const k = String(clave);
    if (eventoSeleccionado !== null && String(eventoSeleccionado) === k) return true;
    return typeof eventosSeleccionados !== "undefined" && eventosSeleccionados.has(k);
}

// Pinta todos los eventos de una fila (uno o varios pegados).
function pintarFilaEventosGCD(fila, clavesDadas) {
    const f = filaClaveEvento(fila);
    if (f === null) return;
    const cell = document.getElementById(`event-cell-${f}`);
    if (!cell) return;
    quitarIconoEventoCeldaGCD(cell);
    const ev = (currentChartData && currentChartData.events) || {};
    const claves = clavesDadas || clavesEventosFila(f, ev);
    if (!claves.length) { cell.classList.remove("event-selected"); return; }
    let algunoSel = false;
    claves.forEach((k) => {
        const item = crearItemEventoGCD(ev[k], k);
        const sel = eventoClaveSeleccionadaGCD(k);
        if (sel) algunoSel = true;
        item.classList.toggle("event-item-selected", sel && claves.length > 1);
        cell.appendChild(item);
    });
    cell.dataset.eventCount = String(claves.length);
    cell.classList.toggle("event-stack-multi", claves.length > 1);
    cell.title = claves.length === 1 ? cell.firstElementChild.title : `${claves.length} eventos en esta casilla`;
    cell.classList.toggle("event-selected", algunoSel);
}

// Resalta (sin repintar íconos) la selección de eventos de una fila.
function marcarSeleccionFilaEventosGCD(fila) {
    const f = filaClaveEvento(fila);
    if (f === null) return;
    const cell = document.getElementById(`event-cell-${f}`);
    if (!cell) return;
    const items = cell.querySelectorAll(".event-stack-item");
    let algunoSel = false;
    items.forEach((item) => {
        const sel = eventoClaveSeleccionadaGCD(item.dataset.evkey);
        if (sel) algunoSel = true;
        item.classList.toggle("event-item-selected", sel && items.length > 1);
    });
    cell.classList.toggle("event-selected", algunoSel);
}

// ---------- ventana Events ----------
function actualizarCabeceraEventoGCD(evento) {
    const def = evento ? definicionEventoGCD(evento) : definicionPorClaveGCD(tipoEventoNuevoGCD);
    const icon = document.getElementById("event-preview-icon");
    const animado = typeof ieMostrarIconoCabecera === "function" ? ieMostrarIconoCabecera(icon, def) : false;
    if (icon && !animado && icon.dataset.src !== def.icon) {
        icon.dataset.src = def.icon;
        icon.style.visibility = "";
        delete icon.dataset.respaldo;
        icon.onerror = () => {
            if (!icon.dataset.respaldo && !icon.src.endsWith(EVENTO_ICONO_RESPALDO)) { icon.dataset.respaldo = "1"; icon.src = EVENTO_ICONO_RESPALDO; }
            else { icon.onerror = null; icon.style.visibility = "hidden"; }
        };
        icon.src = def.icon;
    }
    const nombre = document.getElementById("event-preview-name");
    if (nombre) nombre.textContent = def.label;
    const desc = document.getElementById("event-preview-desc");
    if (desc) desc.textContent = def.desc;
    const select = document.getElementById("event-type-select");
    if (select) {
        select.disabled = false;
        if (typeof ieActualizarSelectTipo === "function") ieActualizarSelectTipo(select, def);
        select.value = def.clave;
    }
    const hint = document.getElementById("event-type-hint");
    if (hint) {
        let pila = "";
        if (evento && eventoSeleccionado !== null) {
            const claves = clavesEventosFila(filaClaveEvento(eventoSeleccionado));
            if (claves.length > 1) pila = `Casilla con ${claves.length} eventos (este es el ${claves.indexOf(String(eventoSeleccionado)) + 1}º). `;
        }
        hint.textContent = evento
            ? `${pila}Cambiar el tipo reemplaza este evento por uno nuevo con valores predeterminados.`
            : `Las casillas vacías de Events crean un ${def.label}.`;
    }
    return def;
}

// Muestra el formulario que corresponde al evento (o ninguno).
// Devuelve true si el evento NO es Focus Camera (charter.js ya no sigue).
function actualizarFormularioEventoGCD(evento) {
    const def = actualizarCabeceraEventoGCD(evento);
    const bloqueFC = document.getElementById("focus-camera-fields");
    const bloqueData = document.getElementById("event-data-fields");
    const esNuevo = !!evento && def.id !== "FocusCamera";
    if (bloqueFC) bloqueFC.hidden = esNuevo;
    if (bloqueData) {
        bloqueData.hidden = !esNuevo;
        if (esNuevo && def.externo && typeof ieRenderizarFormulario === "function") ieRenderizarFormulario(bloqueData, def, evento);
        else if (esNuevo) renderizarCamposEventoGCD(bloqueData, def, evento);
        else { bloqueData.innerHTML = ""; delete bloqueData.dataset.renderKey; }
    }
    const vacio = document.querySelector("#events-window .events-empty-state");
    if (vacio) vacio.hidden = !!evento;
    const apilar = document.getElementById("event-stack-button");
    if (apilar) apilar.disabled = !evento;
    if (typeof ieRefrescarVentana === "function") ieRefrescarVentana();
    if (esNuevo) {
        ["event-target-select", "event-duration-input", "event-effect-select", "event-offset-x", "event-offset-y"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        const del = document.getElementById("event-delete-button");
        if (del) del.disabled = false;
    }
    return esNuevo;
}

function renderizarCamposEventoGCD(contenedor, def, evento) {
    evento.v = normalizarValoresEventoGCD(def, evento.v);
    const v = evento.v;
    contenedor.innerHTML = "";
    contenedor.dataset.renderKey = def.id;
    let fila = null;
    def.campos.forEach((campo) => {
        const wrap = document.createElement("div");
        wrap.className = "event-data-field" + (campo.tipo === "bool" ? " is-bool" : "");
        const id = `event-field-${def.id}-${campo.key}`;
        const label = document.createElement("label");
        label.className = "events-field-label";
        label.htmlFor = id;
        label.textContent = campo.label;
        let control;
        if (campo.tipo === "select" || campo.tipo === "selectNum") {
            control = document.createElement("select");
            control.className = "events-field";
            const opciones = campo.opciones.slice();
            const actual = v[campo.key];
            // V0.8.2m: Easing Type — 'sine' + easeDir 'InOut' (formato 0.8.x) se muestra como "Sine In/Out".
            const mostrado = campo.ease ? easeCanonicoGCD(actual, v.easeDir, opciones) : null;
            if (!mostrado && !opciones.some(([val]) => String(val) === String(actual))) opciones.push([actual, `${actual} (importado)`]);
            opciones.forEach(([val, texto]) => {
                const op = document.createElement("option");
                op.value = String(val);
                op.textContent = texto;
                control.appendChild(op);
            });
            control.value = String(mostrado || actual);
            control.addEventListener("change", () => cambiarCampoEventoGCD(campo, control));
            if (campo.ease && typeof hacerSelectBuscableGCD === "function") hacerSelectBuscableGCD(control);
        } else if (campo.tipo === "bool") {
            control = document.createElement("input");
            control.type = "checkbox";
            control.className = "event-data-check";
            control.checked = v[campo.key] === true;
            control.addEventListener("change", () => cambiarCampoEventoGCD(campo, control));
        } else {
            control = document.createElement("input");
            control.className = "events-field";
            if (campo.tipo === "number") {
                control.type = "number";
                control.step = String(campo.step ?? "any");
                if (campo.min !== undefined) control.min = String(campo.min);
            } else {
                control.type = "text";
                control.spellcheck = false;
                control.autocomplete = "off";
                if (campo.placeholder) control.placeholder = campo.placeholder;
            }
            control.value = String(v[campo.key]);
            control.addEventListener("input", () => cambiarCampoEventoGCD(campo, control));
        }
        control.id = id;
        control.dataset.eventField = campo.key;
        if (campo.tipo === "bool") {
            const linea = document.createElement("label");
            linea.className = "event-data-bool";
            linea.htmlFor = id;
            linea.appendChild(control);
            const span = document.createElement("span");
            span.textContent = campo.label;
            linea.appendChild(span);
            wrap.appendChild(linea);
        } else {
            wrap.appendChild(label);
            if (campo.unidad) {
                const grupo = document.createElement("div");
                grupo.className = "event-data-unit-row";
                grupo.appendChild(control);
                const u = document.createElement("span");
                u.className = "event-data-unit";
                u.textContent = campo.unidad;
                grupo.appendChild(u);
                wrap.appendChild(grupo);
            } else {
                wrap.appendChild(control);
            }
        }
        if (campo.nota) {
            const nota = document.createElement("div");
            nota.className = "events-classic-hint";
            nota.textContent = campo.nota;
            wrap.appendChild(nota);
        }
        if (campo.mitad) {
            if (!fila) {
                fila = document.createElement("div");
                fila.className = "events-position-row event-data-pair";
                contenedor.appendChild(fila);
            }
            fila.appendChild(wrap);
            if (fila.children.length >= 2) fila = null;
        } else {
            fila = null;
            contenedor.appendChild(wrap);
        }
    });
}

function cambiarCampoEventoGCD(campo, control) {
    if (eventoSeleccionado === null || !currentChartData?.events?.[eventoSeleccionado]) return;
    const evento = currentChartData.events[eventoSeleccionado];
    const def = definicionEventoGCD(evento);
    if (def.id === "FocusCamera") return;
    const antes = JSON.parse(JSON.stringify(evento));
    const crudo = campo.tipo === "bool" ? control.checked : control.value;
    let valor = valorCampoEventoGCD(campo, crudo);
    if (campo.tipo === "number" && campo.min !== undefined && valor < campo.min) valor = campo.min;
    const extra = {};
    if (campo.ease) {
        // V0.8.2m: si sigue mostrando lo mismo, el ease guardado no se toca.
        const vAct = evento.v || {};
        if (valor === easeCanonicoGCD(vAct.ease, vAct.easeDir, campo.opciones)) return;
        // Si el chart trae "easeDir" aparte, se mantiene coherente con el ease elegido.
        const dir = direccionEaseGCD(valor);
        if (dir && Object.prototype.hasOwnProperty.call(vAct, "easeDir")) extra.easeDir = dir;
    }
    evento.v = normalizarValoresEventoGCD(def, { ...evento.v, [campo.key]: valor, ...extra });
    actualizarTituloEventoGCD(eventoSeleccionado, `${def.label} ${JSON.stringify(evento.v)}`);
    if (typeof registrarCambioConfigEvento === "function") registrarCambioConfigEvento(eventoSeleccionado, antes, evento);
}

// V0.8.2k: "Añadir otro evento en esta casilla" (queda pegado al seleccionado).
function apilarEventoEnCasillaGCD(tipoForzado) {
    if (!currentChartData || eventoSeleccionado === null || !currentChartData.events?.[eventoSeleccionado]) {
        if (typeof mostrarToastGCD === "function") mostrarToastGCD("Selecciona un evento para añadir otro en su casilla");
        return null;
    }
    const fila = filaClaveEvento(eventoSeleccionado);
    const actual = currentChartData.events[eventoSeleccionado];
    const defActual = definicionEventoGCD(actual);
    const nuevo = crearEventoPorTipoGCD(typeof tipoForzado === "string" && tipoForzado ? tipoForzado : (defActual.noImportado ? tipoEventoNuevoGCD : defActual.clave));
    const clave = claveLibreEventoFila(fila);
    if (typeof ejecutarEdicionChart === "function") ejecutarEdicionChart("Añadir evento en la misma casilla", () => escribirEventoChart(clave, nuevo));
    else { currentChartData.events[clave] = nuevo; pintarFilaEventosGCD(fila); }
    seleccionarEvento(clave);
    const n = clavesEventosFila(fila).length;
    if (typeof mostrarToastGCD === "function") mostrarToastGCD(`Evento añadido en la misma casilla (${n} en total)`);
    return clave;
}

// Título (tooltip) del evento en la grilla tras editar su Event Data.
function actualizarTituloEventoGCD(clave, texto) {
    const cell = document.getElementById(`event-cell-${filaClaveEvento(clave)}`);
    if (!cell) return;
    const item = cell.querySelector(`.event-stack-item[data-evkey="${String(clave)}"]`);
    if (item) item.title = texto;
    if (cell.querySelectorAll(".event-stack-item").length <= 1) cell.title = texto;
}

function cambiarTipoEventoGCD() {
    const select = document.getElementById("event-type-select");
    const tipo = select ? definicionPorClaveGCD(select.value).clave : "Focus Camera";
    tipoEventoNuevoGCD = tipo;
    if (eventoSeleccionado !== null && currentChartData?.events?.[eventoSeleccionado]) {
        const fila = eventoSeleccionado;
        const actual = currentChartData.events[fila];
        if (definicionEventoGCD(actual).clave !== tipo) {
            const nuevo = crearEventoPorTipoGCD(tipo);
            if (typeof ejecutarEdicionChart === "function") {
                ejecutarEdicionChart("Cambiar tipo de evento", () => escribirEventoChart(fila, nuevo));
            } else {
                currentChartData.events[fila] = nuevo;
                pintarFilaEventosGCD(fila);
            }
            marcarSeleccionFilaEventosGCD(fila);
        }
    }
    actualizarVentanaEvento();
}
