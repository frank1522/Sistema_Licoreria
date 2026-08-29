const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db'); //

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================================
// 1. RUTA DE AUTENTICACIÓN (LOGIN)
// ============================================================
app.post('/api/auth/login', (req, res) => {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
        return res.status(400).json({ success: false, message: "Por favor, ingrese usuario y contraseña." });
    }

    const sql = `
        SELECT u.id_usuario, u.nombre, u.usuario, u.password, r.descripcion AS rol 
        FROM usuarios u
        INNER JOIN roles r ON u.id_rol = r.id_rol
        WHERE u.usuario = ?
    `;
    
    db.query(sql, [usuario], (err, results) => {
        if (err) {
            console.error("Error en MySQL:", err);
            return res.status(500).json({ success: false, message: "Error interno en el servidor." });
        }

        if (results.length === 0 || results[0].password !== contrasena) {
            return res.status(401).json({ success: false, message: "Usuario o contraseña incorrectos." });
        }

        const user = results[0];
        return res.json({
            success: true,
            message: `¡Bienvenido, ${user.nombre}!`,
            usuario: {
                id_usuario: user.id_usuario,
                nombre: user.nombre,
                rol: user.rol
            }
        });
    }); 
});

// ============================================================
// 2. RUTAS DE CAJA (ESTADO Y APERTURA)
// ============================================================
app.get('/api/caja/estado', (req, res) => {
    const sql = `
        SELECT id_caja, id_usuario, fecha_apertura, monto_inicial 
        FROM caja 
        WHERE estado = 'Abierta' 
        LIMIT 1
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Error al consultar el estado de la caja." });

        if (results.length > 0) {
            return res.json({ success: true, cajaAbierta: true, datosCaja: results[0] });
        }

        res.json({
            success: true, cajaAbierta: false,
            message: "La caja del día se encuentra cerrada. Debe realizar la apertura."
        });
    });
});

app.post('/api/caja/apertura', (req, res) => {
    const { id_usuario, monto_inicial } = req.body;

    if (id_usuario === undefined || monto_inicial === undefined || monto_inicial < 0) {
        return res.status(400).json({ success: false, message: "Datos inválidos para apertura." });
    }

    const sqlVerificar = "SELECT id_caja FROM caja WHERE estado = 'Abierta' LIMIT 1";
    db.query(sqlVerificar, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Error al verificar cajas." });

        if (results.length > 0) {
            return res.status(400).json({ success: false, message: "Ya existe una sesión de caja abierta." });
        }

        const sqlInsertar = "INSERT INTO caja (id_usuario, monto_inicial, estado) VALUES (?, ?, 'Abierta')";
        db.query(sqlInsertar, [id_usuario, monto_inicial], (err, insertResult) => {
            if (err) return res.status(500).json({ success: false, message: "Error al abrir la caja." });
            
            res.json({
                success: true, message: "¡Caja abierta exitosamente!", id_caja: insertResult.insertId
            });
        });
    });
});

// ============================================================
// RUTA PARA REGISTRAR MOVIMIENTOS DE CAJA (GASTOS / INGRESOS)
// ============================================================
app.post('/api/caja/movimiento', (req, res) => {
    const { id_caja, tipo, monto, motivo } = req.body;

    if (!id_caja || !tipo || !monto || !motivo || monto <= 0) {
        return res.status(400).json({ success: false, message: "Datos incompletos o monto inválido." });
    }

    const sqlVerificarCaja = "SELECT estado FROM caja WHERE id_caja = ?";
    db.query(sqlVerificarCaja, [id_caja], (err, results) => {
        if (err || results.length === 0 || results[0].estado !== 'Abierta') {
            return res.status(400).json({ success: false, message: "No se pueden registrar movimientos en una caja cerrada." });
        }

        const sqlInsertarMov = `
            INSERT INTO movimientos_caja (id_caja, tipo, monto, motivo) 
            VALUES (?, ?, ?, ?)
        `;
        db.query(sqlInsertarMov, [id_caja, tipo, monto, motivo], (err, insertResult) => {
            if (err) return res.status(500).json({ success: false, message: "Error al registrar el movimiento." });
            
            res.json({ 
                success: true, 
                message: `¡Movimiento de [${tipo}] registrado con éxito!`, 
                id_movimiento: insertResult.insertId 
            });
        });
    });
});
// ============================================================
// RUTA PARA OBTENER EL ARQUEO EN TIEMPO REAL (ACTUALIZADO CON VENTAS)
// ============================================================
app.get('/api/caja/arqueo/:id_caja', async (req, res) => {
    const { id_caja } = req.params;

    try {
        const [caja] = await db.promise().query("SELECT monto_inicial, estado FROM caja WHERE id_caja = ?", [id_caja]);
        if (caja.length === 0) return res.status(404).json({ success: false, message: "Caja no encontrada." });

        const montoInicial = Number(caja[0].monto_inicial);

        const [egresos] = await db.promise().query("SELECT IFNULL(SUM(monto), 0) AS total_gastos FROM movimientos_caja WHERE id_caja = ? AND tipo = 'Gasto'", [id_caja]);
        const totalGastos = Number(egresos[0].total_gastos);

        const [ingresos] = await db.promise().query("SELECT IFNULL(SUM(monto), 0) AS total_ingresos FROM movimientos_caja WHERE id_caja = ? AND tipo = 'Ingreso'", [id_caja]);
        const totalIngresos = Number(ingresos[0].total_ingresos);

        // 🌟 NUEVO: Sumar todas las ventas cobradas en EFECTIVO en este turno
        const [ventas] = await db.promise().query("SELECT IFNULL(SUM(pago_efectivo), 0) AS total_ventas_efectivo FROM ventas WHERE id_caja = ?", [id_caja]);
        const totalVentasEfectivo = Number(ventas[0].total_ventas_efectivo);

        // El saldo neto ahora incluye las ventas
        const saldoNeto = (montoInicial + totalIngresos + totalVentasEfectivo) - totalGastos;

        res.json({
            success: true,
            monto_inicial: montoInicial,
            total_gastos: totalGastos,
            total_ingresos: totalIngresos,
            total_ventas: totalVentasEfectivo,
            saldo_neto: saldoNeto
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// ============================================================
// MÓDULO POS: BUSCADOR DE PRODUCTOS (POR NOMBRE O CÓDIGO)
// ============================================================
app.get('/api/productos/buscar', (req, res) => {
    // Recibimos la palabra o código que el cajero escribió
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ 
            success: false, 
            message: "Por favor ingrese un nombre o código de barras." 
        });
    }

    // Buscamos coincidencia exacta en código de barras, o coincidencia parcial en el nombre
    const sqlBuscar = `
        SELECT 
            id_producto, 
            codigo_barras, 
            nombre, 
            precio_venta_unitario, 
            stock_unidades 
        FROM productos 
        WHERE codigo_barras = ? OR nombre LIKE ?
        LIMIT 15
    `;

    // Los comodines % sirven para que encuentre la palabra aunque esté en medio del texto
    const parametroLike = `%${q}%`;

    db.query(sqlBuscar, [q, parametroLike], (err, results) => {
        if (err) {
            console.error("Error al buscar el producto:", err);
            return res.status(500).json({ success: false, message: "Error interno del servidor." });
        }

        // Devolvemos la lista de productos encontrados al frontend
        res.json({
            success: true,
            productos: results
        });
    });
});
// ============================================================
// RUTA PARA EL CIERRE DE CAJA (ARQUEO FINAL)
// ============================================================
app.put('/api/caja/cierre/:id_caja', (req, res) => {
    const { id_caja } = req.params;
    const { monto_final_real } = req.body;

    if (monto_final_real === undefined || monto_final_real < 0) {
        return res.status(400).json({ 
            success: false, 
            message: "Por favor, ingrese un monto final real válido." 
        });
    }

    const sqlCerrar = `
        UPDATE caja 
        SET estado = 'Cerrada', monto_final_real = ?, fecha_cierre = CURRENT_TIMESTAMP 
        WHERE id_caja = ? AND estado = 'Abierta'
    `;

    db.query(sqlCerrar, [monto_final_real, id_caja], (err, updateResult) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Error al procesar el cierre de caja." });
        }

        if (updateResult.affectedRows === 0) {
            return res.status(400).json({ success: false, message: "La caja ya estaba cerrada o no existe." });
        }

        res.json({
            success: true,
            message: "¡Caja cerrada exitosamente! Turno finalizado."
        });
    });
});
// ============================================================
// MÓDULO POS: PROCESAR VENTA (MULTIPAGO Y DESCUENTO DE STOCK CORREGIDO)
// ============================================================
app.post('/api/ventas/procesar', async (req, res) => {
    // 1. Recibimos TODOS los datos directamente desde el frontend nuevo
    const { 
        id_caja, id_usuario, total, 
        pago_efectivo, pago_yape, pago_tarjeta, 
        monto_recibido, vuelto, carrito 
    } = req.body;

    if (!id_caja || !carrito || carrito.length === 0) {
        return res.status(400).json({ success: false, message: "Faltan datos o el carrito está vacío." });
    }

    try {
        // 2. MAGIA DEL CORRELATIVO SECUENCIAL (Ej: NV-000014)
        const [rows] = await db.promise().query("SELECT IFNULL(MAX(id_venta), 0) + 1 AS siguiente_ticket FROM ventas");
        const siguienteTicket = rows[0].siguiente_ticket;
        const numero_comprobante = "NV-" + String(siguienteTicket).padStart(6, '0');

        // 3. INSERTAMOS LA VENTA (Con los montos exactos de Efectivo, Yape y Tarjeta)
        const [resultVenta] = await db.promise().query(`
            INSERT INTO ventas 
            (numero_comprobante, id_caja, id_usuario, total, pago_efectivo, pago_yape, pago_tarjeta, monto_recibido, vuelto) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [numero_comprobante, id_caja, id_usuario, total, pago_efectivo, pago_yape, pago_tarjeta, monto_recibido, vuelto]);
        
        const idVenta = resultVenta.insertId;

        // 4. GUARDAMOS EL DETALLE Y RESTAMOS EL STOCK EN BUCLE
        for (let item of carrito) {
            // Guardar qué licores se llevó
            await db.promise().query(`
                INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario, subtotal)
                VALUES (?, ?, ?, ?, ?)
            `, [idVenta, item.id_producto, item.cantidad, item.precio, (item.cantidad * item.precio)]);

            // ¡DESCUENTO DE STOCK DIRECTO A LA BASE DE DATOS!
            await db.promise().query(`
                UPDATE productos 
                SET stock_unidades = stock_unidades - ? 
                WHERE id_producto = ?
            `, [item.cantidad, item.id_producto]);
        }
        
        res.json({ success: true, message: `¡Venta procesada con éxito! Ticket: ${numero_comprobante}` });
        
    } catch (error) {
        console.error("Error al procesar la venta:", error);
        res.status(500).json({ success: false, message: "Error interno al guardar la venta." });
    }
});

// ============================================================
// 5. CATÁLOGO DE PRODUCTOS (Para el Punto de Venta)
// ============================================================
app.get('/api/productos', (req, res) => {
    const sql = `
        SELECT p.id_producto, p.codigo_barras, p.nombre, c.nombre AS categoria, 
               p.precio_venta_unitario, p.stock_unidades 
        FROM productos p
        INNER JOIN categorias c ON p.id_categoria = c.id_categoria
        WHERE p.stock_unidades > 0
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});
// ============================================================
// 6. MÓDULO INVENTARIO: LISTADO PRO CON SEMÁFORO
// ============================================================
app.get('/api/inventario', async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.id_producto, p.codigo_barras, p.nombre, p.precio_costo_unitario, 
                p.precio_venta_unitario, p.stock_unidades, p.stock_minimo,
                p.precio_venta_sixpack, p.precio_venta_caja, p.unidades_por_caja,
                c.nombre AS categoria,
                CASE 
                    WHEN p.stock_unidades <= 0 THEN 'Agotado'
                    WHEN p.stock_unidades <= p.stock_minimo THEN 'Bajo'
                    ELSE 'Saludable'
                END as estado_stock
            FROM productos p
            INNER JOIN categorias c ON p.id_categoria = c.id_categoria
            ORDER BY p.stock_unidades ASC
        `;
        const [resultados] = await db.promise().query(sql);
        res.json({ success: true, inventario: resultados });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al cargar el inventario." });
    }
});
// ============================================================
// 7. MÓDULO INVENTARIO: REGISTRAR COMPRA AL PROVEEDOR
// ============================================================
app.post('/api/compras/registrar', async (req, res) => {
    const { id_proveedor, id_usuario, numero_comprobante, total, detalles } = req.body;

    if (!id_proveedor || !detalles || detalles.length === 0) {
        return res.status(400).json({ success: false, message: "Faltan datos de la compra." });
    }

    try {
        // 1. Guardar la cabecera de la compra
        const [resultCompra] = await db.promise().query(`
            INSERT INTO compras (id_proveedor, id_usuario, numero_comprobante, total) 
            VALUES (?, ?, ?, ?)
        `, [id_proveedor, id_usuario, numero_comprobante, total]);
        
        const idCompra = resultCompra.insertId;

        // 2. Guardar el detalle y sumar el stock a los productos
        for (let item of detalles) {
            await db.promise().query(`
                INSERT INTO detalle_compras (id_compra, id_producto, cantidad, precio_compra_unitario, subtotal)
                VALUES (?, ?, ?, ?, ?)
            `, [idCompra, item.id_producto, item.cantidad, item.precio_compra, (item.cantidad * item.precio_compra)]);

            // ¡SUMAMOS AL STOCK EN LA BASE DE DATOS!
            await db.promise().query(`
                UPDATE productos 
                SET stock_unidades = stock_unidades + ?, precio_costo_unitario = ? 
                WHERE id_producto = ?
            `, [item.cantidad, item.precio_compra, item.id_producto]);
        }

        // 3. Dejar huella en la auditoría
        await db.promise().query(`INSERT INTO logs_auditoria (id_usuario, accion) VALUES (?, ?)`, 
            [id_usuario, `Registró compra #${idCompra} por S/ ${total}`]
        );

        res.json({ success: true, message: "¡Compra registrada y stock actualizado!" });
    } catch (error) {
        console.error("Error al registrar compra:", error);
        res.status(500).json({ success: false, message: "Error interno al procesar la compra." });
    }
});

// ============================================================
// 8. MÓDULO INVENTARIO: AJUSTE DE STOCK FÍSICO (Roturas / Mermas)
// ============================================================
app.post('/api/inventario/ajuste', async (req, res) => {
    const { id_producto, id_usuario, tipo_ajuste, cantidad, motivo } = req.body;

    if (!id_producto || !tipo_ajuste || !cantidad || cantidad <= 0 || !motivo) {
        return res.status(400).json({ success: false, message: "Datos incompletos para el ajuste." });
    }

    try {
        // 1. Registrar el movimiento fantasma
        await db.promise().query(`
            INSERT INTO ajustes_inventario (id_producto, id_usuario, tipo_ajuste, cantidad, motivo) 
            VALUES (?, ?, ?, ?, ?)
        `, [id_producto, id_usuario, tipo_ajuste, cantidad, motivo]);

        // 2. Aplicar la suma o resta al producto
        const operador = tipo_ajuste === 'Entrada' ? '+' : '-';
        await db.promise().query(`
            UPDATE productos 
            SET stock_unidades = stock_unidades ${operador} ? 
            WHERE id_producto = ?
        `, [cantidad, id_producto]);

        // 3. Dejar huella en la auditoría
        await db.promise().query(`INSERT INTO logs_auditoria (id_usuario, accion) VALUES (?, ?)`, 
            [id_usuario, `Ajuste de inventario (${tipo_ajuste}): ${cantidad} uds del producto ID ${id_producto}. Motivo: ${motivo}`]
        );

        res.json({ success: true, message: "¡Inventario ajustado correctamente!" });
    } catch (error) {
        console.error("Error al ajustar inventario:", error);
        res.status(500).json({ success: false, message: "Error interno al ajustar el stock." });
    }
});
// ============================================================
// 9. MÓDULO COMPRAS: CARGAR PROVEEDORES
// ============================================================
app.get('/api/proveedores', async (req, res) => {
    try {
        const [proveedores] = await db.promise().query("SELECT * FROM proveedores");
        res.json({ success: true, proveedores });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al cargar proveedores." });
    }
});
// ============================================================
// 10. MÓDULO INVENTARIO: CARGAR CATEGORÍAS
// ============================================================
app.get('/api/categorias', async (req, res) => {
    try {
        const [categorias] = await db.promise().query("SELECT * FROM categorias");
        res.json({ success: true, categorias });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al cargar categorías." });
    }
});

// ============================================================
// 11. MÓDULO INVENTARIO: CREAR NUEVO PRODUCTO
// ============================================================
app.post('/api/productos/nuevo', async (req, res) => {
    const { codigo_barras, nombre, id_categoria, precio_costo, precio_venta, stock_inicial, stock_minimo, precio_sixpack, precio_caja, unidades_caja } = req.body;

    try {
        await db.promise().query(`
            INSERT INTO productos (codigo_barras, nombre, id_categoria, precio_costo_unitario, precio_venta_unitario, stock_unidades, stock_minimo, precio_venta_sixpack, precio_venta_caja, unidades_por_caja)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [codigo_barras, nombre, id_categoria, precio_costo, precio_venta, stock_inicial, stock_minimo, precio_sixpack, precio_caja, unidades_caja]);
        
        res.json({ success: true, message: "¡Producto creado exitosamente!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al guardar el producto." });
    }
});

// ============================================================
// 12. MÓDULO INVENTARIO: EDITAR PRODUCTO EXISTENTE
// ============================================================
app.put('/api/productos/editar/:id', async (req, res) => {
    const { id } = req.params;
    const { codigo_barras, nombre, id_categoria, precio_costo, precio_venta, stock_minimo, precio_sixpack, precio_caja, unidades_caja } = req.body;

    try {
        await db.promise().query(`
            UPDATE productos 
            SET codigo_barras = ?, nombre = ?, id_categoria = ?, precio_costo_unitario = ?, precio_venta_unitario = ?, stock_minimo = ?, precio_venta_sixpack = ?, precio_venta_caja = ?, unidades_por_caja = ?
            WHERE id_producto = ?
        `, [codigo_barras, nombre, id_categoria, precio_costo, precio_venta, stock_minimo, precio_sixpack, precio_caja, unidades_caja, id]);
        
        res.json({ success: true, message: "¡Producto actualizado correctamente!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al actualizar el producto." });
    }
});
// ============================================================
// 13. MÓDULO CONFIG: CRUD CATEGORÍAS
// ============================================================
app.post('/api/categorias/nuevo', async (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: "El nombre es obligatorio." });

    try {
        await db.promise().query("INSERT INTO categorias (nombre) VALUES (?)", [nombre]);
        res.json({ success: true, message: "Categoría agregada con éxito." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al crear categoría." });
    }
});

app.put('/api/categorias/editar/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre } = req.body;
    try {
        await db.promise().query("UPDATE categorias SET nombre = ? WHERE id_categoria = ?", [nombre, id]);
        res.json({ success: true, message: "Categoría actualizada." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al actualizar." });
    }
});

// ============================================================
// 14. MÓDULO CONFIG: CRUD PROVEEDORES
// ============================================================
app.post('/api/proveedores/nuevo', async (req, res) => {
    const { razon_social, ruc_dni, telefono } = req.body;
    if (!razon_social) return res.status(400).json({ success: false, message: "La razón social es obligatoria." });

    try {
        await db.promise().query("INSERT INTO proveedores (razon_social, ruc_dni, telefono) VALUES (?, ?, ?)", [razon_social, ruc_dni, telefono]);
        res.json({ success: true, message: "Proveedor registrado." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al registrar proveedor." });
    }
});

app.put('/api/proveedores/editar/:id', async (req, res) => {
    const { id } = req.params;
    const { razon_social, ruc_dni, telefono } = req.body;
    try {
        await db.promise().query("UPDATE proveedores SET razon_social = ?, ruc_dni = ?, telefono = ? WHERE id_proveedor = ?", [razon_social, ruc_dni, telefono, id]);
        res.json({ success: true, message: "Proveedor actualizado." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al actualizar." });
    }
});

// ============================================================
// 15. MÓDULO CONFIG: CRUD CLIENTES
// ============================================================
app.get('/api/clientes', async (req, res) => {
    try {
        const [clientes] = await db.promise().query("SELECT * FROM clientes");
        res.json({ success: true, clientes });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al cargar clientes." });
    }
});

app.post('/api/clientes/nuevo', async (req, res) => {
    const { nombre, documento, telefono } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: "El nombre es obligatorio." });
    try {
        await db.promise().query("INSERT INTO clientes (nombre, documento, telefono) VALUES (?, ?, ?)", [nombre, documento, telefono]);
        res.json({ success: true, message: "Cliente registrado." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al registrar cliente." });
    }
});

app.put('/api/clientes/editar/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, documento, telefono } = req.body;
    try {
        await db.promise().query("UPDATE clientes SET nombre = ?, documento = ?, telefono = ? WHERE id_cliente = ?", [nombre, documento, telefono, id]);
        res.json({ success: true, message: "Cliente actualizado." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al actualizar." });
    }
});

app.delete('/api/clientes/eliminar/:id', async (req, res) => {
    if (req.params.id == 1) return res.status(400).json({ success: false, message: "No puedes eliminar al Cliente General." });
    try {
        await db.promise().query("DELETE FROM clientes WHERE id_cliente = ?", [req.params.id]);
        res.json({ success: true, message: "Cliente eliminado." });
    } catch (error) {
        res.status(500).json({ success: false, message: "No se puede eliminar porque tiene ventas registradas." });
    }
});
// ============================================================
// 16. MÓDULO CONFIG: CRUD USUARIOS Y ROLES
// ============================================================
app.get('/api/roles', async (req, res) => {
    try {
        const [roles] = await db.promise().query("SELECT * FROM roles");
        res.json({ success: true, roles });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/usuarios', async (req, res) => {
    try {
        const [usuarios] = await db.promise().query(`
            SELECT u.id_usuario, u.nombre, u.usuario, u.id_rol, r.descripcion as rol 
            FROM usuarios u INNER JOIN roles r ON u.id_rol = r.id_rol
        `);
        res.json({ success: true, usuarios });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al cargar usuarios." });
    }
});

app.post('/api/usuarios/nuevo', async (req, res) => {
    const { nombre, usuario, password, id_rol } = req.body;
    if (!nombre || !usuario || !password || !id_rol) return res.status(400).json({ success: false, message: "Faltan datos." });
    try {
        await db.promise().query("INSERT INTO usuarios (nombre, usuario, password, id_rol) VALUES (?, ?, ?, ?)", [nombre, usuario, password, id_rol]);
        res.json({ success: true, message: "Usuario creado." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error (El usuario ya existe)." });
    }
});

app.put('/api/usuarios/editar/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, usuario, password, id_rol } = req.body;
    try {
        if (password) {
            // Si mandó contraseña, la actualizamos
            await db.promise().query("UPDATE usuarios SET nombre=?, usuario=?, password=?, id_rol=? WHERE id_usuario=?", [nombre, usuario, password, id_rol, id]);
        } else {
            // Si la dejó en blanco, conservamos la antigua
            await db.promise().query("UPDATE usuarios SET nombre=?, usuario=?, id_rol=? WHERE id_usuario=?", [nombre, usuario, id_rol, id]);
        }
        res.json({ success: true, message: "Usuario actualizado." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al actualizar." });
    }
});

app.delete('/api/usuarios/eliminar/:id', async (req, res) => {
    if (req.params.id == 1) return res.status(400).json({ success: false, message: "¡No puedes borrar al Administrador principal!" });
    try {
        await db.promise().query("DELETE FROM usuarios WHERE id_usuario = ?", [req.params.id]);
        res.json({ success: true, message: "Usuario eliminado." });
    } catch (error) {
        res.status(500).json({ success: false, message: "No se puede eliminar porque este cajero tiene ventas o cajas registradas. Mejor cámbiale la contraseña." });
    }
});
// ============================================================
// 17. MÓDULO CUENTAS: GESTIÓN DE MESAS Y FIADOS
// ============================================================

// Leer las mesas o fiados pendientes
app.get('/api/cuentas', async (req, res) => {
    try {
        const sql = "SELECT * FROM cuentas WHERE estado = 'Abierta' ORDER BY fecha_apertura DESC";
        const [cuentas] = await db.promise().query(sql);
        res.json({ success: true, cuentas });
    } catch (error) {
        console.error("Error cargando cuentas:", error);
        res.status(500).json({ success: false, message: "Error al cargar las cuentas abiertas." });
    }
});
// ==========================================
// RUTA BLINDADA: GUARDAR, DESCONTAR Y RECALCULAR TOTAL
// ==========================================
app.post('/api/cuentas/guardar', (req, res) => {
    // Ya no necesitamos traer el total_cuenta desde el frontend, la BD lo calculará
    const { id_cuenta, productos } = req.body;

    if (!id_cuenta || !productos || productos.length === 0) {
        return res.status(400).json({ success: false, message: 'Faltan datos para guardar.' });
    }

    let errores = 0;
    let procesados = 0;

    // 1. Guardamos cada producto nuevo en el detalle y descontamos stock
    productos.forEach(prod => {
        const subtotal = prod.cantidad * prod.precio;
        const sqlInsertDetalle = `INSERT INTO cuentas_detalle (id_cuenta, id_producto, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)`;
        
        db.query(sqlInsertDetalle, [id_cuenta, prod.id_producto, prod.cantidad, prod.precio, subtotal], (errDetalle) => {
            if (errDetalle) errores++;

            const sqlRestarStock = `UPDATE productos SET stock_unidades = stock_unidades - ? WHERE id_producto = ?`;
            db.query(sqlRestarStock, [prod.cantidad, prod.id_producto], (errStock) => {
                if (errStock) errores++;
                
                procesados++;
                
                // 2. CUANDO TERMINE DE GUARDAR TODO, OBLIGAMOS A LA BD A RECALCULAR EL TOTAL EXACTO
                if (procesados === productos.length) {
                    const sqlRecalcular = `
                        UPDATE cuentas 
                        SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM cuentas_detalle WHERE id_cuenta = ?) 
                        WHERE id_cuenta = ?
                    `;
                    
                    db.query(sqlRecalcular, [id_cuenta, id_cuenta], (errRecalcular) => {
                        if (errRecalcular) console.error("Error recalculando:", errRecalcular);
                        
                        if (errores > 0) {
                            res.json({ success: false, message: 'Se guardó con algunos errores menores.' });
                        } else {
                            res.json({ success: true, message: 'Mesa guardada y sincronizada perfectamente.' });
                        }
                    });
                }
            });
        });
    });
});
// Crear una nueva mesa o fiado
app.post('/api/cuentas/nueva', async (req, res) => {
    const { tipo, identificador } = req.body;
    
    if (!tipo || !identificador) {
        return res.status(400).json({ success: false, message: "Faltan datos de la cuenta." });
    }

    try {
        const sql = "INSERT INTO cuentas (tipo, identificador) VALUES (?, ?)";
        await db.promise().query(sql, [tipo, identificador]);
        res.json({ success: true, message: "¡Cuenta aperturada con éxito!" });
    } catch (error) {
        console.error("Error creando cuenta:", error);
        res.status(500).json({ success: false, message: "Error al abrir la cuenta." });
    }
});
// ==========================================
// RUTA PARA CARGAR EL HISTORIAL DE LA MESA
// ==========================================
app.get('/api/cuentas/:id/detalle', (req, res) => {
    const id_cuenta = req.params.id;
    
    // Buscamos qué productos ya están amarrados a esta mesa
    const sql = `
        SELECT cd.id_producto, p.nombre, cd.cantidad, cd.precio_unitario as precio, cd.subtotal
        FROM cuentas_detalle cd
        JOIN productos p ON cd.id_producto = p.id_producto
        WHERE cd.id_cuenta = ?
    `;
    
    db.query(sql, [id_cuenta], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error base de datos' });
        res.json({ success: true, detalles: results });
    });
});
app.post('/api/cuentas/cobrar', (req, res) => {
    // 🔍 Esto va a imprimir en tu terminal negra lo que manda la pantalla
    console.log("DATOS RECIBIDOS DEL MODAL:", req.body);

    const { id_cuenta, id_caja, monto, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, id_usuario } = req.body;

    if (!id_cuenta || !id_caja || monto === undefined) {
        return res.status(400).json({ success: false, message: 'Faltan datos para procesar el pago.' });
    }

    const numeroComprobante = `MESA-${id_cuenta}-${Date.now().toString().slice(-4)}`;

    // Nos aseguramos de convertir a número por si llegan como texto o undefined
    const efec = parseFloat(pago_efectivo) || 0;
    const yape = parseFloat(pago_yape) || 0;
    const plin = parseFloat(pago_plin) || 0;
    const tarj = parseFloat(pago_tarjeta) || 0;

    const sqlVenta = `
        INSERT INTO ventas (numero_comprobante, id_caja, id_usuario, id_cliente, total, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, monto_recibido, vuelto) 
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0.00)
    `;

    db.query(sqlVenta, [numeroComprobante, id_caja, id_usuario || 1, monto, efec, yape, plin, tarj, monto], (errVenta, resultadoVenta) => {
        if (errVenta) {
            console.error("Error al registrar venta:", errVenta);
            return res.status(500).json({ success: false, message: 'Error al registrar la venta.' });
        }

        const idVentaGenerada = resultadoVenta.insertId;

        const sqlCopiarDetalle = `
            INSERT INTO detalle_ventas (id_venta, id_producto, tipo_empaque, cantidad, precio_unitario, subtotal)
            SELECT ?, id_producto, 'Unidad', cantidad, precio_unitario, subtotal 
            FROM cuentas_detalle 
            WHERE id_cuenta = ?
        `;

        db.query(sqlCopiarDetalle, [idVentaGenerada, id_cuenta], (errDetalle) => {
            if (errDetalle) {
                console.error("Error al copiar detalle:", errDetalle);
                return res.status(500).json({ success: false, message: 'Venta creada pero falló el detalle.' });
            }

            const sqlCerrarMesa = `UPDATE cuentas SET estado = 'Cerrada' WHERE id_cuenta = ?`;
            db.query(sqlCerrarMesa, [id_cuenta], (errCerrar) => {
                if (errCerrar) console.error("Error cerrando cuenta:", errCerrar);

                const sqlActualizarCaja = `
                    UPDATE caja 
                    SET total_efectivo = total_efectivo + ?, 
                        total_yape = total_yape + ?, 
                        total_plin = total_plin + ?, 
                        total_tarjeta = total_tarjeta + ? 
                    WHERE id_caja = ?
                `;
                
                db.query(sqlActualizarCaja, [efec, yape, plin, tarj, id_caja], (errCaja) => {
                    if (errCaja) console.error("Error actualizando caja:", errCaja);

                    res.json({ success: true, message: '¡Cobro procesado con éxito!' });
                });
            });
        });
    });
});
// ==========================================
// RUTA DE COBRO OFICIAL CON SOPORTE PARA PAGO MIXTO
// ==========================================
app.post('/api/cuentas/cobrar', (req, res) => {
    const { id_cuenta, id_caja, monto, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, id_usuario } = req.body;

    if (!id_cuenta || !id_caja || monto === undefined) {
        return res.status(400).json({ success: false, message: 'Faltan datos para procesar el pago.' });
    }

    const numeroComprobante = `MESA-${id_cuenta}-${Date.now().toString().slice(-4)}`;

    // 1. Insertar en la tabla 'ventas' con sus respectivos montos desglosados
    const sqlVenta = `
        INSERT INTO ventas (numero_comprobante, id_caja, id_usuario, id_cliente, total, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, monto_recibido, vuelto) 
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0.00)
    `;

    db.query(sqlVenta, [numeroComprobante, id_caja, id_usuario || 1, monto, pago_efectivo || 0, pago_yape || 0, pago_plin || 0, pago_tarjeta || 0, monto], (errVenta, resultadoVenta) => {
        if (errVenta) {
            console.error("Error al registrar venta:", errVenta);
            return res.status(500).json({ success: false, message: 'Error al registrar la venta.' });
        }

        const idVentaGenerada = resultadoVenta.insertId;

        // 2. Copiar los productos de 'cuentas_detalle' a 'detalle_ventas'
        const sqlCopiarDetalle = `
            INSERT INTO detalle_ventas (id_venta, id_producto, tipo_empaque, cantidad, precio_unitario, subtotal)
            SELECT ?, id_producto, 'Unidad', cantidad, precio_unitario, subtotal 
            FROM cuentas_detalle 
            WHERE id_cuenta = ?
        `;

        db.query(sqlCopiarDetalle, [idVentaGenerada, id_cuenta], (errDetalle) => {
            if (errDetalle) {
                console.error("Error al copiar detalle:", errDetalle);
                return res.status(500).json({ success: false, message: 'Venta creada pero falló el detalle.' });
            }

            // 3. Cerrar la mesa en la tabla 'cuentas'
            const sqlCerrarMesa = `UPDATE cuentas SET estado = 'Cerrada' WHERE id_cuenta = ?`;
            db.query(sqlCerrarMesa, [id_cuenta], (errCerrar) => {
                if (errCerrar) console.error("Error cerrando cuenta:", errCerrar);

                // 4. Sumar cada monto en su respectiva columna acumuladora de la tabla 'caja'
                const sqlActualizarCaja = `
                    UPDATE caja 
                    SET total_efectivo = total_efectivo + ?, 
                        total_yape = total_yape + ?, 
                        total_plin = total_plin + ?, 
                        total_tarjeta = total_tarjeta + ? 
                    WHERE id_caja = ?
                `;
                
                db.query(sqlActualizarCaja, [pago_efectivo || 0, pago_yape || 0, pago_plin || 0, pago_tarjeta || 0, id_caja], (errCaja) => {
                    if (errCaja) console.error("Error actualizando caja:", errCaja);

                    res.json({ success: true, message: '¡Cobro mixto procesado, ventas y caja cuadrados con éxito!' });
                });
            });
        });
    });
});
// Lanzar el servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de Licorería corriendo en http://localhost:${PORT}`);
});