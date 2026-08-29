-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 29-08-2026 a las 20:45:05
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `licoreria_db`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ajustes_inventario`
--

CREATE TABLE `ajustes_inventario` (
  `id_ajuste` int(11) NOT NULL,
  `id_producto` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `tipo_ajuste` enum('Entrada','Salida') NOT NULL,
  `cantidad` int(11) NOT NULL,
  `motivo` varchar(255) NOT NULL,
  `fecha_ajuste` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `ajustes_inventario`
--

INSERT INTO `ajustes_inventario` (`id_ajuste`, `id_producto`, `id_usuario`, `tipo_ajuste`, `cantidad`, `motivo`, `fecha_ajuste`) VALUES
(1, 5, 1, 'Salida', 2, 'regalo de chuleta', '2026-08-20 16:31:31'),
(2, 5, 1, 'Salida', 2, 'consumo', '2026-08-20 16:32:40');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `caja`
--

CREATE TABLE `caja` (
  `id_caja` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `fecha_apertura` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_cierre` datetime DEFAULT NULL,
  `monto_inicial` decimal(10,2) NOT NULL,
  `total_efectivo` decimal(10,2) DEFAULT 0.00,
  `total_yape` decimal(10,2) DEFAULT 0.00,
  `total_plin` decimal(10,2) DEFAULT 0.00,
  `total_tarjeta` decimal(10,2) DEFAULT 0.00,
  `total_gastos` decimal(10,2) DEFAULT 0.00,
  `monto_final_real` decimal(10,2) DEFAULT 0.00,
  `estado` enum('Abierta','Cerrada') NOT NULL DEFAULT 'Abierta'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `caja`
--

INSERT INTO `caja` (`id_caja`, `id_usuario`, `fecha_apertura`, `fecha_cierre`, `monto_inicial`, `total_efectivo`, `total_yape`, `total_plin`, `total_tarjeta`, `total_gastos`, `monto_final_real`, `estado`) VALUES
(3, 1, '2026-08-14 08:50:59', '2026-08-14 08:51:09', 240.00, 0.00, 0.00, 0.00, 0.00, 0.00, 400.00, 'Cerrada'),
(4, 1, '2026-08-14 09:04:56', '2026-08-14 09:05:07', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 200.00, 'Cerrada'),
(5, 1, '2026-08-15 17:26:17', '2026-08-17 19:52:04', 200.00, 0.00, 0.00, 0.00, 0.00, 0.00, 200.00, 'Cerrada'),
(6, 1, '2026-08-17 19:52:22', '2026-08-22 18:02:27', 10.00, 0.00, 0.00, 0.00, 0.00, 0.00, 520.00, 'Cerrada'),
(7, 1, '2026-08-28 13:58:43', '2026-08-28 13:58:47', 10.00, 0.00, 0.00, 0.00, 0.00, 0.00, 100.00, 'Cerrada'),
(8, 1, '2026-08-28 13:59:17', NULL, 100.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'Cerrada'),
(9, 1, '2026-08-29 11:52:07', NULL, 100.00, 237.00, 20.00, 20.00, 150.00, 0.00, 0.00, 'Abierta');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `categorias`
--

CREATE TABLE `categorias` (
  `id_categoria` int(11) NOT NULL,
  `nombre` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `categorias`
--

INSERT INTO `categorias` (`id_categoria`, `nombre`) VALUES
(1, 'Cervezas Botella'),
(2, 'Cervezas Lata'),
(3, 'Licores y Destilados'),
(4, 'Vinos'),
(5, 'Cigarros'),
(6, 'Hielo y Complementos'),
(7, 'Combos / Promociones');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `clientes`
--

CREATE TABLE `clientes` (
  `id_cliente` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `documento` varchar(15) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `clientes`
--

INSERT INTO `clientes` (`id_cliente`, `nombre`, `documento`, `telefono`) VALUES
(1, 'Cliente Varios (Público General)', NULL, NULL),
(2, 'Ceron Deudor', '01010101', '1111111'),
(3, 'jesus', '00000001', '22222');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `compras`
--

CREATE TABLE `compras` (
  `id_compra` int(11) NOT NULL,
  `numero_comprobante` varchar(50) DEFAULT NULL,
  `id_proveedor` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `fecha_compra` datetime NOT NULL DEFAULT current_timestamp(),
  `total` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `compras`
--

INSERT INTO `compras` (`id_compra`, `numero_comprobante`, `id_proveedor`, `id_usuario`, `fecha_compra`, `total`) VALUES
(1, 'f001-2020', 2, 1, '2026-08-20 18:40:10', 130.00),
(2, 'f001-2021', 1, 1, '2026-08-20 18:40:41', 30.00),
(3, 'f001-2023', 1, 1, '2026-08-20 19:44:24', 350.00),
(4, 'f001-2021', 1, 1, '2026-08-20 21:15:03', 1260.00);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cuentas`
--

CREATE TABLE `cuentas` (
  `id_cuenta` int(11) NOT NULL,
  `tipo` varchar(20) NOT NULL,
  `identificador` varchar(100) NOT NULL,
  `estado` varchar(20) DEFAULT 'Abierta',
  `total` decimal(10,2) DEFAULT 0.00,
  `fecha_apertura` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `cuentas`
--

INSERT INTO `cuentas` (`id_cuenta`, `tipo`, `identificador`, `estado`, `total`, `fecha_apertura`) VALUES
(1, 'cliente', '1', 'Cerrada', 122.00, '2026-08-28 13:50:05'),
(2, 'mesa', '5', 'Cerrada', 30.00, '2026-08-29 11:11:57'),
(3, 'cliente', 'jesus', 'Cerrada', 119.00, '2026-08-29 11:32:53'),
(4, 'mesa', 'jechu', 'Cerrada', 16.00, '2026-08-29 12:34:51'),
(5, 'mesa', '5', 'Cerrada', 32.00, '2026-08-29 12:36:04'),
(6, 'mesa', '6', 'Cerrada', 50.00, '2026-08-29 12:38:55'),
(7, 'cliente', 'tinoco', 'Cerrada', 150.00, '2026-08-29 12:39:54'),
(8, 'mesa', 'GOMES', 'Cerrada', 30.00, '2026-08-29 12:44:52');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cuentas_detalle`
--

CREATE TABLE `cuentas_detalle` (
  `id_detalle` int(11) NOT NULL,
  `id_cuenta` int(11) DEFAULT NULL,
  `id_producto` int(11) DEFAULT NULL,
  `cantidad` int(11) DEFAULT NULL,
  `precio_unitario` decimal(10,2) DEFAULT NULL,
  `subtotal` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `cuentas_detalle`
--

INSERT INTO `cuentas_detalle` (`id_detalle`, `id_cuenta`, `id_producto`, `cantidad`, `precio_unitario`, `subtotal`) VALUES
(1, 1, 1, 3, 8.00, 24.00),
(2, 1, 4, 2, 2.00, 4.00),
(3, 1, 1, 1, 8.00, 8.00),
(4, 1, 1, 1, 8.00, 8.00),
(5, 1, 1, 2, 8.00, 16.00),
(6, 1, 4, 1, 2.00, 2.00),
(7, 1, 4, 1, 2.00, 2.00),
(8, 1, 8, 2, 25.00, 50.00),
(9, 3, 3, 1, 115.00, 115.00),
(10, 1, 1, 1, 8.00, 8.00),
(11, 3, 7, 2, 2.00, 4.00),
(12, 2, 2, 6, 5.00, 30.00),
(13, 4, 5, 1, 8.00, 8.00),
(14, 4, 1, 1, 8.00, 8.00),
(15, 5, 1, 4, 8.00, 32.00),
(16, 6, 8, 2, 25.00, 50.00),
(17, 7, 6, 3, 50.00, 150.00),
(18, 8, 9, 1, 30.00, 30.00);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_compras`
--

CREATE TABLE `detalle_compras` (
  `id_detalle` int(11) NOT NULL,
  `id_compra` int(11) NOT NULL,
  `id_producto` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `precio_compra_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `detalle_compras`
--

INSERT INTO `detalle_compras` (`id_detalle`, `id_compra`, `id_producto`, `cantidad`, `precio_compra_unitario`, `subtotal`) VALUES
(1, 1, 1, 20, 6.50, 130.00),
(2, 2, 4, 15, 2.00, 30.00),
(3, 3, 5, 100, 3.50, 350.00),
(4, 4, 1, 200, 6.30, 1260.00);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_ventas`
--

CREATE TABLE `detalle_ventas` (
  `id_detalle` int(11) NOT NULL,
  `id_venta` int(11) NOT NULL,
  `id_producto` int(11) NOT NULL,
  `tipo_empaque` enum('Unidad','Sixpack','Caja') NOT NULL DEFAULT 'Unidad',
  `cantidad` int(11) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `detalle_ventas`
--

INSERT INTO `detalle_ventas` (`id_detalle`, `id_venta`, `id_producto`, `tipo_empaque`, `cantidad`, `precio_unitario`, `subtotal`) VALUES
(16, 15, 4, 'Unidad', 1, 1.00, 1.00),
(17, 16, 1, 'Unidad', 1, 6.00, 6.00),
(18, 16, 4, 'Unidad', 1, 1.00, 1.00),
(19, 16, 5, 'Unidad', 1, 8.00, 8.00),
(20, 17, 4, 'Unidad', 1, 1.00, 1.00),
(21, 18, 3, 'Unidad', 2, 115.00, 230.00),
(22, 19, 1, 'Unidad', 1, 8.00, 8.00),
(23, 20, 3, 'Unidad', 1, 115.00, 115.00),
(24, 20, 7, 'Unidad', 2, 2.00, 4.00),
(26, 21, 2, 'Unidad', 6, 5.00, 30.00),
(27, 22, 5, 'Unidad', 1, 8.00, 8.00),
(28, 22, 1, 'Unidad', 1, 8.00, 8.00),
(30, 23, 1, 'Unidad', 4, 8.00, 32.00),
(31, 24, 8, 'Unidad', 2, 25.00, 50.00),
(32, 25, 6, 'Unidad', 3, 50.00, 150.00),
(33, 26, 2, 'Unidad', 3, 5.00, 15.00),
(34, 27, 6, 'Unidad', 1, 50.00, 50.00),
(35, 28, 6, 'Unidad', 1, 50.00, 50.00),
(36, 29, 9, 'Unidad', 1, 30.00, 30.00);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `logs_auditoria`
--

CREATE TABLE `logs_auditoria` (
  `id_log` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `accion` varchar(255) NOT NULL,
  `fecha` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `logs_auditoria`
--

INSERT INTO `logs_auditoria` (`id_log`, `id_usuario`, `accion`, `fecha`) VALUES
(1, 1, 'Ajuste de inventario (Salida): 2 uds del producto ID 5. Motivo: regalo de chuleta', '2026-08-20 16:31:31'),
(2, 1, 'Ajuste de inventario (Salida): 2 uds del producto ID 5. Motivo: consumo', '2026-08-20 16:32:40'),
(3, 1, 'Registró compra #1 por S/ 130', '2026-08-20 18:40:10'),
(4, 1, 'Registró compra #2 por S/ 30', '2026-08-20 18:40:41'),
(5, 1, 'Registró compra #3 por S/ 350', '2026-08-20 19:44:24'),
(6, 1, 'Registró compra #4 por S/ 1260', '2026-08-20 21:15:03');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `movimientos_caja`
--

CREATE TABLE `movimientos_caja` (
  `id_movimiento` int(11) NOT NULL,
  `id_caja` int(11) NOT NULL,
  `tipo` enum('Ingreso','Gasto') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `motivo` varchar(255) NOT NULL,
  `fecha` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `movimientos_caja`
--

INSERT INTO `movimientos_caja` (`id_movimiento`, `id_caja`, `tipo`, `monto`, `motivo`, `fecha`) VALUES
(1, 5, 'Gasto', 40.00, 'comida del dia siguiente 15-08', '2026-08-15 17:26:43'),
(2, 5, 'Ingreso', 20.00, 'punto', '2026-08-15 17:28:35'),
(3, 5, 'Ingreso', 10.00, 'a', '2026-08-15 17:29:57'),
(4, 5, 'Ingreso', 200.00, 'punto', '2026-08-15 17:30:18'),
(5, 5, 'Ingreso', 300.00, 'punto', '2026-08-15 17:36:09'),
(6, 5, 'Ingreso', 300.00, 'punto', '2026-08-15 17:36:09'),
(7, 6, 'Gasto', 10.00, 'comida del dia siguiente 15-08', '2026-08-18 12:15:06'),
(8, 6, 'Gasto', 10.00, 'comida del dia siguiente 15-08', '2026-08-18 12:15:06'),
(9, 6, 'Ingreso', 20.00, 'a', '2026-08-18 12:15:44'),
(10, 6, 'Ingreso', 20.00, 'a', '2026-08-18 12:15:44'),
(11, 6, 'Ingreso', 10.00, 'comida del dia siguiente 15-09', '2026-08-18 12:16:15'),
(12, 6, 'Ingreso', 10.00, 'comida del dia siguiente 15-09', '2026-08-18 12:16:15'),
(13, 6, 'Gasto', 10.00, 'a', '2026-08-19 17:47:06'),
(14, 6, 'Gasto', 10.00, 'a', '2026-08-19 17:47:06'),
(15, 6, 'Ingreso', 20.00, 'c', '2026-08-19 17:47:24'),
(16, 6, 'Ingreso', 20.00, 'c', '2026-08-19 17:47:24'),
(17, 6, 'Gasto', 10.00, 'c', '2026-08-19 17:58:11'),
(18, 6, 'Ingreso', 15.00, 'comida del dia siguiente 15-09', '2026-08-19 17:58:22'),
(19, 6, 'Gasto', 100.00, 'pago a frank', '2026-08-19 18:19:24'),
(20, 6, 'Gasto', 120.00, 'pago a frank', '2026-08-19 19:29:57'),
(21, 9, 'Ingreso', 10.00, 'regalo', '2026-08-29 12:18:54');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `productos`
--

CREATE TABLE `productos` (
  `id_producto` int(11) NOT NULL,
  `codigo_barras` varchar(50) DEFAULT NULL,
  `nombre` varchar(150) NOT NULL,
  `id_categoria` int(11) NOT NULL,
  `precio_costo_unitario` decimal(10,2) NOT NULL DEFAULT 0.00,
  `precio_venta_unitario` decimal(10,2) NOT NULL,
  `precio_venta_sixpack` decimal(10,2) DEFAULT NULL,
  `precio_venta_caja` decimal(10,2) DEFAULT NULL,
  `unidades_por_caja` int(11) DEFAULT 12,
  `stock_unidades` int(11) NOT NULL DEFAULT 0,
  `stock_minimo` int(11) NOT NULL DEFAULT 10
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `productos`
--

INSERT INTO `productos` (`id_producto`, `codigo_barras`, `nombre`, `id_categoria`, `precio_costo_unitario`, `precio_venta_unitario`, `precio_venta_sixpack`, `precio_venta_caja`, `unidades_por_caja`, `stock_unidades`, `stock_minimo`) VALUES
(1, '7750123456789', 'Cerveza Pilsen Callao Botella 630ml', 1, 6.30, 8.00, NULL, 65.00, 12, 318, 70),
(2, '7750123456000', 'Cerveza Pilsen Callao Lata 355ml', 2, 3.50, 5.00, 36.00, NULL, 6, 79, 10),
(3, '5000281005409', 'Whisky Johnnie Walker Black Label 750ml', 3, 85.00, 115.00, NULL, NULL, 1, 12, 10),
(4, '7751234567890', 'Cigarro Lucky Strike Red (Unidad / Cajetilla)', 5, 1.30, 2.00, NULL, NULL, 20, 105, 10),
(5, '0000000000001', 'Bolsa de Hielo Comercial 3Kg', 6, 3.50, 8.00, NULL, NULL, 1, 109, 10),
(6, '0000000000002', 'Ron Bacardi 750 ml', 3, 30.00, 50.00, NULL, NULL, 7, 10, 10),
(7, '0011', 'Cigarro Lucky Strike Sandria', 5, 1.00, 2.00, NULL, NULL, 20, 98, 30),
(8, NULL, 'Bolsa de Hielo Comercial 5Kg', 6, 20.00, 25.00, NULL, NULL, 12, 26, 10),
(9, '0000000000004', 'VOCDA RUS KAYA', 3, 20.00, 30.00, NULL, NULL, 20, 19, 10);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `proveedores`
--

CREATE TABLE `proveedores` (
  `id_proveedor` int(11) NOT NULL,
  `ruc_dni` varchar(15) DEFAULT NULL,
  `razon_social` varchar(150) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `proveedores`
--

INSERT INTO `proveedores` (`id_proveedor`, `ruc_dni`, `razon_social`, `telefono`) VALUES
(1, '201022504128', 'Distribuidora San Juan (Backus)', ''),
(2, '201050504155', 'Mayorista Licores Chiclayo', NULL),
(3, '201050504128', 'RAY MAX PERU', '965544135');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `roles`
--

CREATE TABLE `roles` (
  `id_rol` int(11) NOT NULL,
  `descripcion` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `roles`
--

INSERT INTO `roles` (`id_rol`, `descripcion`) VALUES
(1, 'Administrador'),
(2, 'Cajero'),
(3, 'Vendedor');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id_usuario` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `usuario` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `id_rol` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id_usuario`, `nombre`, `usuario`, `password`, `id_rol`) VALUES
(1, 'Administrador', 'admin', '123', 1),
(2, 'Cajero Principal', 'cajero1', '123456', 2),
(3, 'vendedor', 'jesus', '1234', 2);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ventas`
--

CREATE TABLE `ventas` (
  `id_venta` int(11) NOT NULL,
  `numero_comprobante` varchar(20) NOT NULL,
  `id_caja` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `id_cliente` int(11) NOT NULL DEFAULT 1,
  `fecha_venta` datetime NOT NULL DEFAULT current_timestamp(),
  `total` decimal(10,2) NOT NULL,
  `pago_efectivo` decimal(10,2) DEFAULT 0.00,
  `pago_yape` decimal(10,2) DEFAULT 0.00,
  `pago_plin` decimal(10,2) DEFAULT 0.00,
  `pago_tarjeta` decimal(10,2) DEFAULT 0.00,
  `monto_recibido` decimal(10,2) NOT NULL,
  `vuelto` decimal(10,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `ventas`
--

INSERT INTO `ventas` (`id_venta`, `numero_comprobante`, `id_caja`, `id_usuario`, `id_cliente`, `fecha_venta`, `total`, `pago_efectivo`, `pago_yape`, `pago_plin`, `pago_tarjeta`, `monto_recibido`, `vuelto`) VALUES
(15, 'NV-000015', 6, 1, 1, '2026-08-19 16:54:57', 1.00, 0.00, 0.00, 0.00, 0.00, 1.00, 0.00),
(16, 'NV-000016', 6, 1, 1, '2026-08-19 17:27:55', 15.00, 10.00, 4.00, 0.00, 1.00, 15.00, 0.00),
(17, 'NV-000017', 6, 1, 1, '2026-08-19 18:18:59', 1.00, 1.00, 0.00, 0.00, 0.00, 10.00, 9.00),
(18, 'NV-000018', 6, 1, 1, '2026-08-19 18:20:21', 230.00, 230.00, 0.00, 0.00, 0.00, 1000.00, 770.00),
(19, 'NV-000019', 8, 1, 1, '2026-08-28 13:59:40', 8.00, 0.00, 8.00, 0.00, 0.00, 8.00, 0.00),
(20, 'MESA-3-7357', 9, 1, 1, '2026-08-29 12:14:47', 119.00, 119.00, 0.00, 0.00, 0.00, 119.00, 0.00),
(21, 'MESA-2-0638', 9, 1, 1, '2026-08-29 12:27:30', 30.00, 0.00, 0.00, 0.00, 0.00, 30.00, 0.00),
(22, 'MESA-4-5947', 9, 1, 1, '2026-08-29 12:35:25', 16.00, 0.00, 0.00, 0.00, 0.00, 16.00, 0.00),
(23, 'MESA-5-7754', 9, 1, 1, '2026-08-29 12:36:17', 32.00, 0.00, 0.00, 0.00, 0.00, 32.00, 0.00),
(24, 'MESA-6-6717', 9, 1, 1, '2026-08-29 12:39:16', 50.00, 30.00, 10.00, 10.00, 0.00, 50.00, 0.00),
(25, 'MESA-7-6731', 9, 1, 1, '2026-08-29 12:40:06', 150.00, 0.00, 0.00, 0.00, 150.00, 150.00, 0.00),
(26, 'NV-000026', 9, 1, 1, '2026-08-29 12:42:34', 15.00, 15.00, 0.00, 0.00, 0.00, 15.00, 0.00),
(27, 'NV-000027', 9, 1, 1, '2026-08-29 12:42:51', 50.00, 0.00, 50.00, 0.00, 0.00, 50.00, 0.00),
(28, 'NV-000028', 9, 1, 1, '2026-08-29 12:43:45', 50.00, 0.00, 0.00, 0.00, 50.00, 50.00, 0.00),
(29, 'MESA-8-0635', 9, 1, 1, '2026-08-29 12:45:10', 30.00, 10.00, 10.00, 10.00, 0.00, 30.00, 0.00);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `ajustes_inventario`
--
ALTER TABLE `ajustes_inventario`
  ADD PRIMARY KEY (`id_ajuste`),
  ADD KEY `id_producto` (`id_producto`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Indices de la tabla `caja`
--
ALTER TABLE `caja`
  ADD PRIMARY KEY (`id_caja`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Indices de la tabla `categorias`
--
ALTER TABLE `categorias`
  ADD PRIMARY KEY (`id_categoria`);

--
-- Indices de la tabla `clientes`
--
ALTER TABLE `clientes`
  ADD PRIMARY KEY (`id_cliente`);

--
-- Indices de la tabla `compras`
--
ALTER TABLE `compras`
  ADD PRIMARY KEY (`id_compra`),
  ADD KEY `id_proveedor` (`id_proveedor`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Indices de la tabla `cuentas`
--
ALTER TABLE `cuentas`
  ADD PRIMARY KEY (`id_cuenta`);

--
-- Indices de la tabla `cuentas_detalle`
--
ALTER TABLE `cuentas_detalle`
  ADD PRIMARY KEY (`id_detalle`),
  ADD KEY `id_cuenta` (`id_cuenta`);

--
-- Indices de la tabla `detalle_compras`
--
ALTER TABLE `detalle_compras`
  ADD PRIMARY KEY (`id_detalle`),
  ADD KEY `id_compra` (`id_compra`),
  ADD KEY `id_producto` (`id_producto`);

--
-- Indices de la tabla `detalle_ventas`
--
ALTER TABLE `detalle_ventas`
  ADD PRIMARY KEY (`id_detalle`),
  ADD KEY `id_venta` (`id_venta`),
  ADD KEY `id_producto` (`id_producto`);

--
-- Indices de la tabla `logs_auditoria`
--
ALTER TABLE `logs_auditoria`
  ADD PRIMARY KEY (`id_log`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Indices de la tabla `movimientos_caja`
--
ALTER TABLE `movimientos_caja`
  ADD PRIMARY KEY (`id_movimiento`),
  ADD KEY `id_caja` (`id_caja`);

--
-- Indices de la tabla `productos`
--
ALTER TABLE `productos`
  ADD PRIMARY KEY (`id_producto`),
  ADD UNIQUE KEY `codigo_barras` (`codigo_barras`),
  ADD KEY `id_categoria` (`id_categoria`);

--
-- Indices de la tabla `proveedores`
--
ALTER TABLE `proveedores`
  ADD PRIMARY KEY (`id_proveedor`);

--
-- Indices de la tabla `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id_rol`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id_usuario`),
  ADD UNIQUE KEY `usuario` (`usuario`),
  ADD KEY `id_rol` (`id_rol`);

--
-- Indices de la tabla `ventas`
--
ALTER TABLE `ventas`
  ADD PRIMARY KEY (`id_venta`),
  ADD UNIQUE KEY `numero_comprobante` (`numero_comprobante`),
  ADD KEY `id_caja` (`id_caja`),
  ADD KEY `id_usuario` (`id_usuario`),
  ADD KEY `id_cliente` (`id_cliente`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `ajustes_inventario`
--
ALTER TABLE `ajustes_inventario`
  MODIFY `id_ajuste` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de la tabla `caja`
--
ALTER TABLE `caja`
  MODIFY `id_caja` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT de la tabla `categorias`
--
ALTER TABLE `categorias`
  MODIFY `id_categoria` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT de la tabla `clientes`
--
ALTER TABLE `clientes`
  MODIFY `id_cliente` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `compras`
--
ALTER TABLE `compras`
  MODIFY `id_compra` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `cuentas`
--
ALTER TABLE `cuentas`
  MODIFY `id_cuenta` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT de la tabla `cuentas_detalle`
--
ALTER TABLE `cuentas_detalle`
  MODIFY `id_detalle` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT de la tabla `detalle_compras`
--
ALTER TABLE `detalle_compras`
  MODIFY `id_detalle` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `detalle_ventas`
--
ALTER TABLE `detalle_ventas`
  MODIFY `id_detalle` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT de la tabla `logs_auditoria`
--
ALTER TABLE `logs_auditoria`
  MODIFY `id_log` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de la tabla `movimientos_caja`
--
ALTER TABLE `movimientos_caja`
  MODIFY `id_movimiento` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- AUTO_INCREMENT de la tabla `productos`
--
ALTER TABLE `productos`
  MODIFY `id_producto` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT de la tabla `proveedores`
--
ALTER TABLE `proveedores`
  MODIFY `id_proveedor` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `roles`
--
ALTER TABLE `roles`
  MODIFY `id_rol` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id_usuario` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `ventas`
--
ALTER TABLE `ventas`
  MODIFY `id_venta` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=30;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `ajustes_inventario`
--
ALTER TABLE `ajustes_inventario`
  ADD CONSTRAINT `ajustes_inventario_ibfk_1` FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`),
  ADD CONSTRAINT `ajustes_inventario_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`);

--
-- Filtros para la tabla `caja`
--
ALTER TABLE `caja`
  ADD CONSTRAINT `caja_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`);

--
-- Filtros para la tabla `compras`
--
ALTER TABLE `compras`
  ADD CONSTRAINT `compras_ibfk_1` FOREIGN KEY (`id_proveedor`) REFERENCES `proveedores` (`id_proveedor`),
  ADD CONSTRAINT `compras_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`);

--
-- Filtros para la tabla `cuentas_detalle`
--
ALTER TABLE `cuentas_detalle`
  ADD CONSTRAINT `cuentas_detalle_ibfk_1` FOREIGN KEY (`id_cuenta`) REFERENCES `cuentas` (`id_cuenta`) ON DELETE CASCADE;

--
-- Filtros para la tabla `detalle_compras`
--
ALTER TABLE `detalle_compras`
  ADD CONSTRAINT `detalle_compras_ibfk_1` FOREIGN KEY (`id_compra`) REFERENCES `compras` (`id_compra`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_compras_ibfk_2` FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`);

--
-- Filtros para la tabla `detalle_ventas`
--
ALTER TABLE `detalle_ventas`
  ADD CONSTRAINT `detalle_ventas_ibfk_1` FOREIGN KEY (`id_venta`) REFERENCES `ventas` (`id_venta`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_ventas_ibfk_2` FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`);

--
-- Filtros para la tabla `logs_auditoria`
--
ALTER TABLE `logs_auditoria`
  ADD CONSTRAINT `logs_auditoria_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`);

--
-- Filtros para la tabla `movimientos_caja`
--
ALTER TABLE `movimientos_caja`
  ADD CONSTRAINT `movimientos_caja_ibfk_1` FOREIGN KEY (`id_caja`) REFERENCES `caja` (`id_caja`);

--
-- Filtros para la tabla `productos`
--
ALTER TABLE `productos`
  ADD CONSTRAINT `productos_ibfk_1` FOREIGN KEY (`id_categoria`) REFERENCES `categorias` (`id_categoria`);

--
-- Filtros para la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`id_rol`) REFERENCES `roles` (`id_rol`);

--
-- Filtros para la tabla `ventas`
--
ALTER TABLE `ventas`
  ADD CONSTRAINT `ventas_ibfk_1` FOREIGN KEY (`id_caja`) REFERENCES `caja` (`id_caja`),
  ADD CONSTRAINT `ventas_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`),
  ADD CONSTRAINT `ventas_ibfk_3` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id_cliente`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
