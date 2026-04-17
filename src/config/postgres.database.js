const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL no esta configurada. Agrega la connection string de Supabase en el archivo .env.');
}

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: process.env.DB_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
    })
  : null;

if (pool) {
  pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
  });
}

function prepareQuery(sql, params = []) {
  let index = 0;
  const text = sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });

  return { text, values: params };
}

function query(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const { text, values } = prepareQuery(sql, params || []);

  if (!pool) {
    const err = new Error('DATABASE_URL no esta configurada');
    console.error('No se puede ejecutar la consulta PostgreSQL porque DATABASE_URL no esta configurada.');

    if (callback) {
      callback(err);
      return null;
    }

    return Promise.reject(err);
  }

  const executeQuery = () => pool.query(text, values)
    .then((result) => {
      const isSelect = /^\s*(SELECT|WITH|SHOW)\b/i.test(text);
      return isSelect
        ? result.rows
        : {
            rows: result.rows,
            rowCount: result.rowCount,
            affectedRows: result.rowCount,
          };
    })
    .catch((err) => {
      console.error('Error ejecutando consulta PostgreSQL:', {
        message: err.message,
        code: err.code,
        query: text,
      });

      throw err;
    });

  if (callback) {
    executeQuery()
      .then((response) => {
        callback(null, response);
      })
      .catch((err) => {
        callback(err);
      });
    return null;
  }

  return executeQuery();
}

if (pool) {
  pool.query('SELECT NOW()', (err) => {
    if (err) {
      console.error('Error de conexion a PostgreSQL/Supabase:', err.message);
      return;
    }

    console.log('Conectado a PostgreSQL/Supabase');
  });
}

module.exports = {
  pool,
  query,
};
