// ============================================================
// MENÚ LATERAL + BARRA SUPERIOR (se inyecta en <div id="menu-container">)
// Las opciones con la clase "admin-only" solo las ve el Administrador.
// (Aunque alguien las muestre a la fuerza, el servidor igual rechaza la acción.)
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    const menuHTML = `
        <nav class="navbar navbar-custom navbar-dark px-4 py-3">
            <div class="d-flex align-items-center">
                <button class="btn btn-outline-light me-3 border-0 fs-4" type="button" data-bs-toggle="offcanvas" data-bs-target="#menuLateral">
                    ☰
                </button>
                <a class="navbar-brand fw-bold m-0" href="index.html">🍾 Licorería POS</a>
            </div>
            <div class="text-white">
                Usuario: <span id="userNombreGlobal" class="fw-bold text-gold">...</span>
            </div>
        </nav>

        <div class="offcanvas offcanvas-start" tabindex="-1" id="menuLateral" style="background-color: #006D5B; color: white;">
            <div class="offcanvas-header border-bottom" style="border-color: #D4AF37 !important;">
                <h5 class="offcanvas-title fw-bold text-gold">Menú Principal</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas"></button>
            </div>
            <div class="offcanvas-body">
                <ul class="nav flex-column fs-5 mt-3">
                    <li class="nav-item mb-3"><a class="nav-link text-white" href="index.html">🔴 Dashboard</a></li>
                    <li class="nav-item mb-3"><a class="nav-link text-white" href="venta.html">🛒 Punto de Venta</a></li>
                    <li class="nav-item mb-3"><a class="nav-link text-white" href="caja.html">💰 Control de Caja</a></li>
                    <li class="nav-item mb-3"><a class="nav-link text-white" href="cuentas.html">📀 Gestión de mesas</a></li>
                    <li class="nav-item mb-3"><a class="nav-link text-white" href="inventario.html">📦 Gestión de Inventario</a></li>

                    <li class="nav-item mb-3 admin-only"><a class="nav-link text-white" href="reporte.html">📊 Reportes y Movimientos</a></li>
                    <li class="nav-item mb-3 admin-only"><a class="nav-link text-white" href="fiados.html">💳 Clientes con Fiado</a></li>
                    <li class="nav-item mb-3 admin-only"><a class="nav-link text-white" href="auditoria.html">🛡️ Auditoría y respaldos</a></li>
                    <li class="nav-item mb-3 admin-only"><a class="nav-link text-white" href="configuracion.html">⚙️ Configuración</a></li>

                    <hr class="border-light mt-4 mb-4">
                    <li class="nav-item"><a class="nav-link text-warning fw-bold" href="#" id="btnCerrarSesionGlobal">🚪 Cerrar Sesión</a></li>
                </ul>
            </div>
        </div>
    `;

    const contenedor = document.getElementById("menu-container");
    if (contenedor) contenedor.innerHTML = menuHTML;

    // La verificación de sesión la hace auth.js; aquí solo se muestra el nombre y se ocultan opciones
    const nombreUsuario = localStorage.getItem('nombre_usuario');
    const rolUsuario = localStorage.getItem('rol');

    const spanNombre = document.getElementById('userNombreGlobal');
    if (spanNombre) spanNombre.textContent = (nombreUsuario || '') + " (" + (rolUsuario || '') + ")";

    if (rolUsuario !== 'Administrador') {
        document.querySelectorAll('.admin-only').forEach(opcion => opcion.style.display = 'none');
    }

    const btnCerrar = document.getElementById('btnCerrarSesionGlobal');
    if (btnCerrar) {
        btnCerrar.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }
});
