const mysql = require('mysql2');

// Configuración de la conexión a MySQL de XAMPP
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',    
  password: '',     
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