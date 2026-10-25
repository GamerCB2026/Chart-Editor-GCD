// =====================================================================
// V0.8.2n-3: compatibilidad ASTC (.astc / .ktx / .ktx2 con ASTC) en TODO lo
// que carga imágenes del editor: visualizador de personajes (Sparrow,
// Animate atlas, V-Slice / Psych / Codename / Kade), personajes guardados,
// skins de notas (NoteKinds / NoteStyles) e íconos de eventos importados.
// El navegador no muestra ASTC en <img>: se decodifica (js/astc.js: GPU con
// WEBGL_compressed_texture_astc si hay, si no por software en Workers, LDR,
// bloques 4x4…12x12) y se convierte a PNG en memoria. Se reconoce por el
// CONTENIDO, así que un .astc renombrado a .png también sirve.
// =====================================================================
const cacheImagenesASTC = new WeakMap();

async function esBlobASTC(blob) {
    if (!blob || typeof blob.slice !== "function" || typeof ASTC === "undefined") return false;
    try { return !!ASTC.sniff(new Uint8Array(await blob.slice(0, 16).arrayBuffer())); } catch (e) { return false; }
}

// Blob/File → el mismo blob si es una imagen normal, o un PNG decodificado si es ASTC.
async function normalizarImagenGCD(blob) {
    if (!(await esBlobASTC(blob))) return blob;
    if (cacheImagenesASTC.has(blob)) return cacheImagenesASTC.get(blob);
    const nombre = blob.name || "textura.astc";
    const tarea = (async () => {
        let r;
        try {
            r = await ASTC.decode(await blob.arrayBuffer(), nombre, { allowGpu: true });
        } catch (e) {
            throw new Error(`No se pudo leer la textura ASTC "${nombre}": ${e && e.message ? e.message : e}`);
        }
        const c = document.createElement("canvas");
        c.width = r.width; c.height = r.height;
        c.getContext("2d").putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
        const png = await new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error("No se pudo convertir la textura ASTC."))), "image/png"));
        c.width = c.height = 0;
        return png;
    })();
    cacheImagenesASTC.set(blob, tarea);
    tarea.catch(() => cacheImagenesASTC.delete(blob));
    return tarea;
}

(function engancharCargadoresASTC() {
    if (typeof cargarImagenPersonaje === "function") {
        const original = cargarImagenPersonaje;
        cargarImagenPersonaje = async function (archivo) { return original(await normalizarImagenGCD(archivo)); };
    }
    if (typeof nkCargarImagen === "function") {
        const original = nkCargarImagen;
        nkCargarImagen = async function (blob) { return original(await normalizarImagenGCD(blob)); };
    }
})();
