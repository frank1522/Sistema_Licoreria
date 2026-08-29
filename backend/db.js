const mysql = require('mysql2');

// Configuración de la conexión a MySQL de XAMPP
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',      // Usuario por defecto de XAMPP
  password: '',      // Contraseña por defecto de XAMPP (vacía)
  database: 'licoreria_db'
});

connection.connect((err) => {
  if (err) {
    console.error('Error conectando a la base de datos: ' + err.stack);
    return;
  }
  console.log('Conectado a la base de datos de XAMPP con el ID ' + connection.threadId);
});

module.exports = connection;