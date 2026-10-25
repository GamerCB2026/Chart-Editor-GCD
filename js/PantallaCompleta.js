// V0.8.2 Ronda 6 — Pantalla completa (Ajustes App). Fullscreen API con prefijos webkit.
function elementoPantallaCompletaGCD() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
}
function actualizarBotonPantallaCompletaGCD() {
    const activo = !!elementoPantallaCompletaGCD();
    const lbl = document.getElementById("fullscreen-btn-label");
    if (lbl) lbl.textContent = activo ? "Salir" : "Activar";
    const btn = document.getElementById("fullscreen-btn");
    if (btn) {
        btn.classList.toggle("active-theme", activo);
        const ic = btn.querySelector("i");
        if (ic) ic.className = activo ? "fa-solid fa-compress" : "fa-solid fa-expand";
    }
}
async function alternarPantallaCompletaGCD() {
    const el = document.documentElement;
    try {
        if (!elementoPantallaCompletaGCD()) {
            const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
            if (!req) { if (typeof mostrarToastGCD === "function") mostrarToastGCD("Este navegador no permite pantalla completa"); return; }
            await Promise.resolve(req.call(el, { navigationUI: "hide" }));
            const movil = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
            const horizontal = window.innerWidth > window.innerHeight;
            if (movil && horizontal && screen.orientation && screen.orientation.lock) {
                try { await screen.orientation.lock("landscape"); } catch (e) { /* se ignora */ }
            }
        } else {
            const salir = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
            try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
            if (salir) await Promise.resolve(salir.call(document));
        }
    } catch (e) {
        if (typeof mostrarToastGCD === "function") mostrarToastGCD("No se pudo cambiar a pantalla completa");
    }
    actualizarBotonPantallaCompletaGCD();
}
document.addEventListener("fullscreenchange", actualizarBotonPantallaCompletaGCD);
document.addEventListener("webkitfullscreenchange", actualizarBotonPantallaCompletaGCD);
actualizarBotonPantallaCompletaGCD();
