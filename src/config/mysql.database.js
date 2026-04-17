const mysql = require('mysql2');
require('dotenv').config();

let connection = null;

function getConnection() {
  if (connection) {
    return connection;
  }

  connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  connection.connect((err) => {
    if (err) {
      console.error('Error de conexion MySQL:', err);
      return;
    }

    console.log('Conectado a MySQL');
  });

  return connection;
}

module.exports = {
  getConnection,
  query: (...args) => getConnection().query(...args),
};
