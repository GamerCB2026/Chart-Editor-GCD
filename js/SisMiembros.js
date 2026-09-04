// js/SisMiembros.js

(function () {
    const SECRET_CODE = "DB2012";
    const MAX_ATTEMPTS = 3;
    const LOCK_TIME_MS = 2 * 60 * 60 * 1000; // 2 horas en milisegundos

    const STORAGE_KEY_ATTEMPTS = "sm_failed_attempts";
    const STORAGE_KEY_LOCK_TIME = "sm_lock_until";

    document.addEventListener("DOMContentLoaded", function () {
        const loginLayer = document.getElementById("sismiembros-login-layer");
        const codeInput = document.getElementById("sismiembros-code-input");
        const submitBtn = document.getElementById("sismiembros-submit-btn");
        const msgDiv = document.getElementById("sismiembros-msg");
        const attemptsDiv = document.getElementById("sismiembros-attempts");

        if (!loginLayer || !codeInput || !submitBtn || !msgDiv || !attemptsDiv) return;

        // Verificar si existe un bloqueo activo de 2 horas
        function checkLockStatus() {
            const lockUntil = localStorage.getItem(STORAGE_KEY_LOCK_TIME);
            if (lockUntil) {
                const now = Date.now();
                const timeLeft = parseInt(lockUntil, 10) - now;

                if (timeLeft > 0) {
                    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
                    const minutesLeft = Math.ceil((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                    
                    codeInput.disabled = true;
                    submitBtn.disabled = true;
                    msgDiv.className = "sm-msg-error";
                    msgDiv.innerText = `Has superado los 3 intentos. Espera ${hoursLeft}h ${minutesLeft}m para reintentar.`;
                    attemptsDiv.innerText = "Intentos restantes: 0";
                    return true;
                } else {
                    // El bloqueo ya expirió, limpiar registros
                    localStorage.removeItem(STORAGE_KEY_LOCK_TIME);
                    localStorage.removeItem(STORAGE_KEY_ATTEMPTS);
                }
            }
            return false;
        }

        // Obtener cantidad de intentos restantes
        function getRemainingAttempts() {
            const failed = parseInt(localStorage.getItem(STORAGE_KEY_ATTEMPTS) || "0", 10);
            return Math.max(0, MAX_ATTEMPTS - failed);
        }

        // Actualizar la interfaz con los intentos disponibles
        function updateAttemptsUI() {
            if (checkLockStatus()) return;

            const remaining = getRemainingAttempts();
            attemptsDiv.innerText = `Intentos restantes: ${remaining}`;

            if (remaining <= 0) {
                // Aplicar bloqueo de 2 horas
                const lockUntil = Date.now() + LOCK_TIME_MS;
                localStorage.setItem(STORAGE_KEY_LOCK_TIME, lockUntil.toString());
                checkLockStatus();
            }
        }

        // Función para validar y desbloquear el Chart Editor
        function attemptLogin() {
            if (checkLockStatus()) return;

            const inputVal = codeInput.value.trim();

            if (inputVal === SECRET_CODE) {
                // CÓDIGO CORRECTO
                msgDiv.className = "sm-msg-info";
                msgDiv.innerText = "¡Acceso concedido! Entrando...";

                // Restablecer contador de fallos
                localStorage.removeItem(STORAGE_KEY_ATTEMPTS);

                // Desbloquear interfaz removiendo el bloqueo del body y ocultando la capa de login
                document.body.classList.remove("sm-locked");
                loginLayer.style.display = "none";
            } else {
                // CÓDIGO INCORRECTO
                let failed = parseInt(localStorage.getItem(STORAGE_KEY_ATTEMPTS) || "0", 10) + 1;
                localStorage.setItem(STORAGE_KEY_ATTEMPTS, failed.toString());

                msgDiv.className = "sm-msg-error";
                msgDiv.innerText = "Código incorrecto. Inténtalo de nuevo.";
                codeInput.value = "";
                codeInput.focus();

                updateAttemptsUI();
            }
        }

        // Eventos
        submitBtn.addEventListener("click", attemptLogin);

        codeInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                attemptLogin();
            }
        });

        // Inicializar estado al cargar
        updateAttemptsUI();
    });
})();