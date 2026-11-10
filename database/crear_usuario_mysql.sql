-- ============================================================
-- OPCIONAL (recomendado): crear un usuario de MySQL SOLO para este sistema
-- en lugar de usar "root". Si alguien robara la clave, solo podría tocar esta base.
--
-- Cómo usarlo: phpMyAdmin → pestaña SQL → pegar → Continuar.
-- ANTES cambia  CAMBIA_ESTA_CLAVE  por una clave tuya.
-- Luego, en backend/.env pon:
--     DB_USER=licoreria
--     DB_PASSWORD=la_clave_que_elegiste
-- ============================================================
CREATE USER IF NOT EXISTS 'licoreria'@'localhost' IDENTIFIED BY 'CAMBIA_ESTA_CLAVE';
CREATE USER IF NOT EXISTS 'licoreria'@'127.0.0.1' IDENTIFIED BY 'CAMBIA_ESTA_CLAVE';

-- ALTER/INDEX/CREATE hacen falta para que el sistema pueda aplicar sus mejoras automáticas al actualizarse.
GRANT SELECT, INSERT, UPDATE, DELETE, ALTER, CREATE, INDEX, REFERENCES, LOCK TABLES ON `licoreria_db`.* TO 'licoreria'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, ALTER, CREATE, INDEX, REFERENCES, LOCK TABLES ON `licoreria_db`.* TO 'licoreria'@'127.0.0.1';
FLUSH PRIVILEGES;
