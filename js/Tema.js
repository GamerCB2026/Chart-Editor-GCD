// V0.8.2 Ronda 5b — Tema Oscuro / Claro (por defecto Oscuro), guardado en localStorage.
const CLAVE_TEMA_GCD = "gcd_tema_v1";
function temaActualGCD() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
function aplicarTemaGCD(tema, guardar) {
    tema = tema === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", tema);
    document.querySelectorAll(".theme-select-card:not(.portrait-select-card)").forEach((c) => c.classList.remove("active-theme"));
    document.getElementById(`theme-${tema}-btn`)?.classList.add("active-theme");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", tema === "light" ? "#f2f1f6" : "#000000");
    const item = document.getElementById("menu-item-tema");
    if (item) {
        item.classList.toggle("checked", tema === "light");
        const lbl = item.querySelector(".dropdown-label");
        if (lbl) lbl.textContent = `Tema: ${tema === "light" ? "Claro" : "Oscuro"}`;
    }
    if (guardar) { try { localStorage.setItem(CLAVE_TEMA_GCD, tema); } catch (e) {} }
}
function setTheme(themeName) { aplicarTemaGCD(themeName, true); }
function alternarTemaGCD() {
    aplicarTemaGCD(temaActualGCD() === "light" ? "dark" : "light", true);
    document.getElementById("menu-vista-wrapper")?.classList.remove("open");
    if (typeof mostrarToastGCD === "function") mostrarToastGCD(`Tema ${temaActualGCD() === "light" ? "Claro" : "Oscuro"}`);
}
(function () {
    let t = "dark";
    try { t = localStorage.getItem(CLAVE_TEMA_GCD) || "dark"; } catch (e) {}
    aplicarTemaGCD(t, false);
})();
