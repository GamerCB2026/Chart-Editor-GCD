/** Compat: carga el gate de clave (js/membresia.js). */
(function () {
  if (typeof window.iniciarSistemaMembresia === "function") {
    window.iniciarSistemaMembresia();
  }
})();
