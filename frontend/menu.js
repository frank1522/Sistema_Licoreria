document.addEventListener("DOMContentLoaded", () => {
    // 1. El HTML del Menú y la Barra Superior
    const menuHTML = `
        <nav class="navbar navbar-custom navbar-dark px-4 py-3">
            <div class="d-flex align-items-center">
                <button class="btn btn-outline-light me-3 border-0 fs-4" type="button" data-bs-toggle="offcanvas" data-bs-target="#menuLateral">
                    ☰
                </button>
                <a class="navbar-brand fw-bold m-0" href="#">🍾 Licorería POS</a>
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
                    <li class="nav-item mb-3"><a class="nav-link text-white" href="venta.html">🛒 Punto de Venta</a></li>
                    <li class="nav-item mb-3"><a class="nav-link text-white" href="caja.html">💰 Control de Caja</a></li>
                    
                    <!-- ¡AQUÍ ESTÁ EL CAMBIO! Le quitamos el admin-only al Inventario -->
                    <li class="nav-item mb-3"><a class="nav-link text-white" href="inventario.html">📦 Gestión de Inventario</a></li>
                    
                    <li class="nav-item mb-3 admin-only"><a class="nav-link text-white" href="reportes.html">📊 Reportes y Movimientos</a></li>
                    <li class="nav-item mb-3 admin-only"><a class="nav-link text-white" href="cuentas.html">📀 Gestión de mesas</a></li>
                    <li class="nav-item mb-3 admin-only"><a class="nav-link text-white" href="configuracion.html">⚙️ Configuración</a></li>
                    
                    <hr class="border-light mt-4 mb-4">
                    <li class="nav-item"><a class="nav-link text-warning fw-bold" href="#" id="btnCerrarSesionGlobal">🚪 Cerrar Sesión</a></li>
                </ul>
            </div>
        </div>
    `;

    // 2. Inyectar el menú en la pantalla
    const contenedor = document.getElementById("menu-container");
    if (contenedor) {
        contenedor.innerHTML = menuHTML;
    }

    // 3. Lógica Global: Seguridad, Roles y Nombre
    const nombreUsuario = localStorage.getItem('nombre_usuario');
    const rolUsuario = localStorage.getItem('rol');

    if (!nombreUsuario) {
        window.location.href = 'login.html'; // Lo patea si no está logueado
    } else {
        const spanNombre = document.getElementById('userNombreGlobal');
        if (spanNombre) spanNombre.innerText = nombreUsuario + " (" + rolUsuario + ")";
        
        // Esconde opciones si es Cajero
        if (rolUsuario !== 'Administrador') {
            const opcionesAdmin = document.querySelectorAll('.admin-only');
            opcionesAdmin.forEach(opcion => opcion.style.display = 'none');
        }
    }

    // 4. Botón Cerrar Sesión
    const btnCerrar = document.getElementById('btnCerrarSesionGlobal');
    if (btnCerrar) {
        btnCerrar.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }
});