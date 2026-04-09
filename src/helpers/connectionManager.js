const mysql = require('mysql2');
const { Client } = require('pg');

/**
 * Abre una conexión según el engine especificado
 * @param {string} engine - 'mysql' o 'postgres'
 * @param {object} credentials - {host, port, user, password, database}
 * @param {function} callback - (err, connection) => {}
 */
function openConnection(engine, credentials, callback) {
  if (engine === 'postgres' || engine === 'postgresql') {
    // PostgreSQL
    const client = new Client({
      host: credentials.host,
      port: credentials.port || 5432,
      user: credentials.user,
      password: credentials.password,
      database: credentials.database,
    });

    client.connect((err) => {
      if (err) {
        return callback(err, null);
      }
      // Agregar propiedades para compatibilidad
      client._isPostgres = true;
      callback(null, client);
    });
  } else {
    // MySQL (default)
    const connection = mysql.createConnection({
      host: credentials.host,
      port: credentials.port || 3306,
      user: credentials.user,
      password: credentials.password,
      database: credentials.database,
    });

    connection.connect((err) => {
      if (err) {
        return callback(err, null);
      }
      connection._isPostgres = false;
      callback(null, connection);
    });
  }
}

/**
 * Ejecuta una query en la conexión especificada
 * @param {object} connection - Conexión MySQL o PostgreSQL
 * @param {string} sql - SQL query
 * @param {array} params - Parámetros de la query (opcionales)
 * @param {function} callback - (err, results) => {}
 */
function escapePostgresIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function preparePostgresQuery(sql, params) {
  const values = [];
  let idx = 1;
  let paramIndex = 0;
  let resultSql = '';
  const placeholderRegex = /\?\?|\?/g;
  let lastIndex = 0;
  let match;

  while ((match = placeholderRegex.exec(sql)) !== null) {
    resultSql += sql.slice(lastIndex, match.index);
    const token = match[0];
    const currentParam = params[paramIndex];

    if (token === '??') {
      resultSql += escapePostgresIdentifier(currentParam);
      paramIndex += 1;
    } else {
      const beforeText = sql.slice(Math.max(0, match.index - 4), match.index).toUpperCase();
      const isSetObject = /SET\s*$/i.test(beforeText) && currentParam && typeof currentParam === 'object' && !Array.isArray(currentParam);
      if (isSetObject) {
        const columns = Object.keys(currentParam);
        const assignments = columns.map((col) => `${escapePostgresIdentifier(col)} = $${idx++}`);
        resultSql += assignments.join(', ');
        values.push(...columns.map((col) => currentParam[col]));
        paramIndex += 1;
      } else {
        resultSql += `$${idx++}`;
        values.push(currentParam);
        paramIndex += 1;
      }
    }

    lastIndex = placeholderRegex.lastIndex;
  }

  resultSql += sql.slice(lastIndex);
  return { sql: resultSql, values };
}

function executeQuery(connection, sql, params, callback) {
  // Si params no se proporciona y callback es el 3er argumento
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (!params) params = [];

  if (connection._isPostgres) {
    // PostgreSQL
    const prepared = preparePostgresQuery(sql, params);
    connection.query(prepared.sql, prepared.values, (err, result) => {
      if (err) {
        return callback(err, null);
      }
      // Normalizar resultado para compatibilidad
      callback(null, result.rows || []);
    });
  } else {
    // MySQL
    connection.query(sql, params, callback);
  }
}

/**
 * Cierra una conexión
 * @param {object} connection - Conexión MySQL o PostgreSQL
 * @param {function} callback - (err) => {}
 */
function closeConnection(connection, callback) {
  if (!callback) callback = () => {};

  if (connection._isPostgres) {
    // PostgreSQL
    connection.end((err) => {
      callback(err);
    });
  } else {
    // MySQL
    connection.end((err) => {
      callback(err);
    });
  }
}

/**
 * Obtiene lista de tablas según el engine
 * @param {object} connection - Conexión MySQL o PostgreSQL
 * @param {string} engine - 'mysql' o 'postgres'
 * @param {function} callback - (err, tableNames) => {}
 */
function getTables(connection, engine, callback) {
  let query = '';

  if (engine === 'postgres' || engine === 'postgresql') {
    // Usar pg_tables que es más directo y confiable
    query = `
      SELECT tablename as table_name
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY tablename
    `;
  } else {
    query = 'SHOW TABLES';
  }

  executeQuery(connection, query, [], (err, results) => {
    if (err) {
      // Si falla la primera consulta para PostgreSQL, intentar con information_schema
      if (engine === 'postgres' || engine === 'postgresql') {
        const fallbackQuery = `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_name
        `;
        executeQuery(connection, fallbackQuery, [], (fallbackErr, fallbackResults) => {
          if (fallbackErr) {
            return callback(fallbackErr, null);
          }
          const tableNames = fallbackResults.map((row) => row.table_name);
          callback(null, tableNames);
        });
        return;
      }
      return callback(err, null);
    }

    let tableNames = [];

    if (engine === 'postgres' || engine === 'postgresql') {
      // PostgreSQL: results es array de objetos {table_name: '...'}
      tableNames = results.map((row) => row.table_name);
    } else {
      // MySQL: results es array de objetos {Tables_in_dbname: '...'}
      tableNames = results.map((row) => {
        const key = Object.keys(row)[0];
        return row[key];
      });
    }

    callback(null, tableNames);
  });
}

/**
 * Inserta un registro en una tabla
 * @param {object} connection - Conexión MySQL o PostgreSQL
 * @param {string} tableName - Nombre de la tabla
 * @param {object} data - Objeto con los datos a insertar {column: value}
 * @param {function} callback - (err, result) => {}
 */
function insertRecord(connection, tableName, data, callback) {
  if (connection._isPostgres) {
    // PostgreSQL: INSERT INTO table (col1, col2) VALUES ($1, $2)
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`);
    
    const sql = `INSERT INTO "${tableName}" (${columns.map(col => `"${col}"`).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    
    executeQuery(connection, sql, values, (err, results) => {
      if (err) {
        return callback(err, null);
      }
      // PostgreSQL retorna las filas insertadas
      callback(null, { insertId: results[0] ? results[0].id : null, affectedRows: results.length });
    });
  } else {
    // MySQL: INSERT INTO table SET col1 = ?, col2 = ?
    const sql = 'INSERT INTO ?? SET ?';
    executeQuery(connection, sql, [tableName, data], callback);
  }
}

/**
 * Obtiene el conteo de filas de una tabla
 * @param {object} connection - Conexión MySQL o PostgreSQL
 * @param {string} tableName - Nombre de la tabla
 * @param {function} callback - (err, count) => {}
 */
function getTableRowCount(connection, tableName, callback) {
  if (connection._isPostgres) {
    // PostgreSQL
    const query = `SELECT COUNT(*) AS cnt FROM "${tableName}"`;
    executeQuery(connection, query, [], (err, results) => {
      if (err) {
        return callback(err, 0);
      }
      const count = results[0] ? parseInt(results[0].cnt, 10) : 0;
      callback(null, count);
    });
  } else {
    // MySQL
    const sql = 'SELECT COUNT(*) AS cnt FROM ??';
    executeQuery(connection, sql, [tableName], (err, results) => {
      if (err) {
        return callback(err, 0);
      }
      const count = results[0] ? parseInt(results[0].cnt, 10) : 0;
      callback(null, count);
    });
  }
}

module.exports = {
  openConnection,
  executeQuery,
  closeConnection,
  getTables,
  getTableRowCount,
  insertRecord,
};
