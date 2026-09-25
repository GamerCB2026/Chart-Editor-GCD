/**
 * Gate de acceso por clave de miembro (sin Google).
 * La clave SOLO vive en el Worker (secret ACCESS_CODE). Nunca en este archivo.
 * v098: sesión = { token, exp, ts } firmada por Worker (HMAC). No confiar en {ok:true,ts}.
 */
const MEMBRESIA_CONFIG = {
  enabled: true,
  // URL del Worker
  verifyUrl: "https://gcd-membresia.saltorgaming.workers.dev/verificar-clave",
  sessionUrl: "https://gcd-membresia.saltorgaming.workers.dev/verificar-sesion",
  sessionHours: 72,
  appName: "FNF Chart Editor GCD",
  channelHandle: "@GamerCB2026",
  creatorChannelId: "UCA-nQeq52AxDtdQYWVi3dxQ" // solo para link "Unirme"
};

const MEMBRESIA_STORAGE_KEY = "gcd_membresia_sesion_v4";
const MEMBRESIA_STORAGE_KEY_LEGACY = "gcd_membresia_sesion_v3";

let _membresiaSesion = null;

function _memEsLocalHost() {
  const h = location.hostname;
  return (
    location.protocol === "file:" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]"
  );
}

function _memConfigCompleta() {
  const c = MEMBRESIA_CONFIG;
  if (!c.enabled) return false;
  const url = (c.verifyUrl || "").trim();
  return !!(url && !url.includes("TU-WORKER"));
}

function _memSessionUrl() {
  const u = (MEMBRESIA_CONFIG.sessionUrl || "").trim();
  if (u && !u.includes("TU-WORKER")) return u;
  // Fallback: same endpoint accepts { token }
  return (MEMBRESIA_CONFIG.verifyUrl || "").trim();
}

function _memJoinUrl() {
  const id = (MEMBRESIA_CONFIG.creatorChannelId || "").trim();
  if (id && id.startsWith("UC")) {
    return "https://www.youtube.com/channel/" + id + "/join";
  }
  const handle = (MEMBRESIA_CONFIG.channelHandle || "").replace(/^@/, "");
  if (handle) return "https://www.youtube.com/@" + handle + "/join";
  return "https://www.youtube.com/";
}

function _escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _memSetStatus(msg, tipo) {
  const el = document.getElementById("membresia-status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "membresia-status membresia-status--" + (tipo || "info");
}

function _memBorrarLegacy() {
  try {
    localStorage.removeItem(MEMBRESIA_STORAGE_KEY_LEGACY);
    sessionStorage.removeItem(MEMBRESIA_STORAGE_KEY_LEGACY);
  } catch (_) {}
}

/** Solo lee sesión v4 con token+exp. Ignora {ok:true,ts} legado. */
function _memLeerSesionLocal() {
  try {
    _memBorrarLegacy();
    const raw =
      sessionStorage.getItem(MEMBRESIA_STORAGE_KEY) ||
      localStorage.getItem(MEMBRESIA_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.token || !data.exp) return null;
    if (Date.now() > Number(data.exp)) {
      _memBorrarSesion();
      return null;
    }
    return data;
  } catch (_) {
    return null;
  }
}

function _memGuardarSesion(token, exp) {
  const data = {
    token: String(token || ""),
    exp: Number(exp) || 0,
    ts: Date.now()
  };
  if (!data.token || !data.exp) return;
  const json = JSON.stringify(data);
  try {
    localStorage.setItem(MEMBRESIA_STORAGE_KEY, json);
    sessionStorage.setItem(MEMBRESIA_STORAGE_KEY, json);
  } catch (_) {}
  _membresiaSesion = data;
  _memBorrarLegacy();
}

function _memBorrarSesion() {
  try {
    localStorage.removeItem(MEMBRESIA_STORAGE_KEY);
    sessionStorage.removeItem(MEMBRESIA_STORAGE_KEY);
  } catch (_) {}
  _memBorrarLegacy();
  _membresiaSesion = null;
}

function _memDesbloquear() {
  document.body.classList.remove("sm-locked");
  const gate = document.getElementById("membresia-gate");
  if (gate) gate.setAttribute("aria-hidden", "true");
  _memActualizarChip();
}

function _memBloquear() {
  document.body.classList.add("sm-locked");
  const gate = document.getElementById("membresia-gate");
  if (gate) gate.setAttribute("aria-hidden", "false");
  _memActualizarChip();
}

function _memActualizarChip() {
  let chip = document.getElementById("membresia-account-chip");
  if (!_membresiaSesion || document.body.classList.contains("sm-locked")) {
    if (chip) chip.style.display = "none";
    return;
  }
  if (!chip) {
    chip = document.createElement("div");
    chip.id = "membresia-account-chip";
    chip.className = "membresia-account-chip";
    chip.innerHTML =
      '<span class="membresia-chip-email">Miembro</span>' +
      '<button type="button" class="membresia-chip-logout" title="Cerrar sesión">Salir</button>';
    chip.querySelector(".membresia-chip-logout").addEventListener("click", () => {
      cerrarSesionMembresia();
    });
    const host =
      document.querySelector("#main-menu .sidebar-tabs") ||
      document.getElementById("main-menu") ||
      document.body;
    host.appendChild(chip);
  }
  chip.style.display = "flex";
}

function _memAsegurarGateDOM() {
  let gate = document.getElementById("membresia-gate");
  if (!gate) {
    gate = document.createElement("div");
    gate.id = "membresia-gate";
    document.body.prepend(gate);
  }
  gate.setAttribute("role", "dialog");
  gate.setAttribute("aria-modal", "true");
  gate.setAttribute("aria-labelledby", "membresia-gate-title");

  if (gate.querySelector("#membresia-btn-unlock") && gate.querySelector("#membresia-code-input")) {
    return gate;
  }

  gate.innerHTML = `
    <div class="membresia-gate-card">
      <div class="membresia-gate-badge">MIEMBROS</div>
      <h1 id="membresia-gate-title">Acceso para miembros del canal</h1>
      <p class="membresia-gate-sub">
        <strong>${_escapeHtml(MEMBRESIA_CONFIG.appName)}</strong> está reservado
        a miembros de <strong>${_escapeHtml(MEMBRESIA_CONFIG.channelHandle)}</strong>.
      </p>
      <p id="membresia-status" class="membresia-status membresia-status--info" aria-live="polite"></p>
      <label class="membresia-channel-label" for="membresia-code-input">Clave de miembro</label>
      <input type="password" id="membresia-code-input" class="membresia-channel-input"
        placeholder="Clave que te dio el canal" autocomplete="current-password" />
      <button type="button" id="membresia-btn-unlock" class="membresia-btn-verify">
        Entrar
      </button>
      <button type="button" id="membresia-btn-dev" class="membresia-btn-dev" hidden>
        Modo desarrollo: entrar sin clave
      </button>
      <div id="membresia-setup-help" class="membresia-setup-help" hidden></div>
      <a id="membresia-join-link" class="membresia-join-link" href="#" target="_blank" rel="noopener noreferrer">
        Unirme a la membresía del canal
      </a>
      <p class="membresia-gate-foot">La clave la reciben los miembros del canal. No está en el código público.</p>
    </div>
  `;

  const join = gate.querySelector("#membresia-join-link");
  if (join) join.href = _memJoinUrl();

  gate.querySelector("#membresia-btn-unlock").addEventListener("click", () => {
    verificarClaveMembresia();
  });
  gate.querySelector("#membresia-code-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") verificarClaveMembresia();
  });
  gate.querySelector("#membresia-btn-dev").addEventListener("click", () => {
    _memEntrarDev();
  });

  return gate;
}

function _memMostrarAyudaSetup() {
  const box = document.getElementById("membresia-setup-help");
  const btn = document.getElementById("membresia-btn-unlock");
  const btnDev = document.getElementById("membresia-btn-dev");
  if (!box) return;

  const local = _memEsLocalHost();

  if (!MEMBRESIA_CONFIG.enabled) {
    box.hidden = false;
    box.innerHTML = "<p><strong>Gate desactivado</strong>.</p>";
    if (btn) btn.disabled = true;
    if (btnDev && local) btnDev.hidden = false;
    return;
  }

  if (!_memConfigCompleta()) {
    box.hidden = false;
    box.innerHTML =
      "<p>Falta <code>verifyUrl</code> del Worker en <code>js/membresia.js</code>.</p>";
    if (btn) btn.disabled = true;
    if (btnDev) btnDev.hidden = !local;
    _memSetStatus("Config incompleta.", "warn");
    return;
  }

  box.hidden = true;
  if (btn) btn.disabled = false;
  if (btnDev) btnDev.hidden = true;
}

function _memEntrarDev() {
  if (!_memEsLocalHost()) {
    _memSetStatus("El bypass solo funciona en localhost.", "error");
    return;
  }
  // Dev-only local unlock (no server token). Cleared on reload if gate re-checks.
  const fakeExp = Date.now() + 12 * 3600 * 1000;
  _memGuardarSesion("dev.local", fakeExp);
  _membresiaSesion = { token: "dev.local", exp: fakeExp, ts: Date.now(), dev: true };
  _memSetStatus("Modo desarrollo: acceso concedido.", "ok");
  _memDesbloquear();
}

async function _memVerificarSesionRemota(sesion) {
  if (!sesion || !sesion.token) return false;
  // Localhost dev token: allow without network
  if (sesion.token === "dev.local" && _memEsLocalHost()) return true;
  if (sesion.legacy || sesion.token === "legacy.worker") return false; // fuerza re-login hasta redeploy
  const url = _memSessionUrl();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: sesion.token, exp: sesion.exp })
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) return false;
    return !!(data && data.member);
  } catch (err) {
    console.warn("[membresia] session verify failed", err);
    return false;
  }
}

async function verificarClaveMembresia() {
  if (!_memConfigCompleta()) {
    _memMostrarAyudaSetup();
    return;
  }
  const input = document.getElementById("membresia-code-input");
  const code = input ? String(input.value || "").trim() : "";
  if (!code) {
    _memSetStatus("Escribe la clave de miembro.", "warn");
    return;
  }

  const btn = document.getElementById("membresia-btn-unlock");
  if (btn) btn.disabled = true;
  _memSetStatus("Comprobando clave…", "info");

  try {
    const res = await fetch(MEMBRESIA_CONFIG.verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code })
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}

    if (!res.ok) {
      _memSetStatus(
        (data && data.message) || "Error del servidor (" + res.status + ").",
        "error"
      );
      return;
    }

    if (!(data && data.member)) {
      _memSetStatus(
        (data && data.message) || "Clave incorrecta.",
        "error"
      );
      if (input) {
        input.select();
      }
      return;
    }

    if (input) input.value = "";
    // Worker nuevo: token+exp. Worker viejo (pre-v098): member sin token → entra igual (sesión solo en memoria).
    if (data.token && data.exp) {
      _memGuardarSesion(data.token, data.exp);
      _memSetStatus("¡Bienvenido!", "ok");
    } else {
      _membresiaSesion = {
        token: "legacy.worker",
        exp: Date.now() + 12 * 3600 * 1000,
        ts: Date.now(),
        legacy: true
      };
      _memSetStatus(
        "¡Bienvenido! (Worker viejo: redeploy para sesión permanente)",
        "ok"
      );
    }
    _memDesbloquear();
  } catch (err) {
    console.warn("[membresia]", err);
    _memSetStatus(
      (err && err.message) || "No se pudo contactar el servidor.",
      "error"
    );
  } finally {
    if (btn && document.body.classList.contains("sm-locked")) {
      btn.disabled = !_memConfigCompleta();
    }
  }
}

function cerrarSesionMembresia() {
  _memBorrarSesion();
  _memBloquear();
  _memSetStatus("Sesión cerrada. Introduce la clave para continuar.", "info");
  _memMostrarAyudaSetup();
}

async function iniciarSistemaMembresia() {
  _memAsegurarGateDOM();

  if (MEMBRESIA_CONFIG.enabled === false) {
    _memDesbloquear();
    return;
  }

  const sesion = _memLeerSesionLocal();
  if (sesion && _memConfigCompleta()) {
    _memSetStatus("Comprobando sesión…", "info");
    const ok = await _memVerificarSesionRemota(sesion);
    if (ok) {
      _membresiaSesion = sesion;
      _memDesbloquear();
      return;
    }
    // Offline / fail / invalid → keep locked; clear bad token
    _memBorrarSesion();
  }

  _memBloquear();
  _memMostrarAyudaSetup();
  if (_memConfigCompleta()) {
    _memSetStatus("Introduce la clave de miembro del canal.", "info");
  }
}

window.MEMBRESIA_CONFIG = MEMBRESIA_CONFIG;
window.iniciarSistemaMembresia = iniciarSistemaMembresia;
window.verificarClaveMembresia = verificarClaveMembresia;
window.cerrarSesionMembresia = cerrarSesionMembresia;
// compat nombres viejos
window.iniciarLoginMembresia = verificarClaveMembresia;
