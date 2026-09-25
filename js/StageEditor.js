// Stage Editor — panel del menú principal (placeholder "Próximamente")

function abrirStageEditor() {
    if (typeof switchTab === "function") switchTab("stage");
}

function cerrarStageEditor() {
    if (typeof switchTab === "function") switchTab("recientes");
}
