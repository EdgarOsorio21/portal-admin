const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const db = require('../config/database');
const mysqlDb = require('../config/mysql.database');
const connectionManager = require('../helpers/connectionManager');
const clientesService = require('../services/clientes.service');
const syncLogsService = require('../services/syncLogs.service');

function escapePostgresIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function sanitizeSheetName(sheetName, fallbackName) {
  const cleaned = String(sheetName || fallbackName || 'Hoja')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31);

  return cleaned || fallbackName || 'Hoja';
}

function buildExportFileName(connectionName, databaseName) {
  const sourceName = connectionName || databaseName || 'conexion';
  const safeName = String(sourceName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'conexion';

  return `reporte-${safeName}.xlsx`;
}

const AUTO_TIMESTAMP_FIELDS = ['created_at', 'fecha_creacion', 'fecha_de_creacion'];

function removeAutoTimestampFields(data) {
  AUTO_TIMESTAMP_FIELDS.forEach((fieldName) => {
    if (Object.prototype.hasOwnProperty.call(data, fieldName)) {
      delete data[fieldName];
    }
  });
}

function openConnectionAsync(engine, credentials) {
  return new Promise((resolve, reject) => {
    connectionManager.openConnection(engine, credentials, (err, connection) => {
      if (err) return reject(err);
      resolve(connection);
    });
  });
}

function insertRecordAsync(connection, table, data) {
  return new Promise((resolve, reject) => {
    connectionManager.insertRecord(connection, table, data, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function mysqlQueryAsync(sql, params) {
  return new Promise((resolve, reject) => {
    mysqlDb.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function buildMysqlDataForSync(table, data, postgresRecord = null) {
  const mysqlData = { ...data };
  const tableName = String(table || '').toLowerCase();

  removeAutoTimestampFields(mysqlData);

  if (postgresRecord?.id != null && mysqlData.id == null) {
    mysqlData.id = postgresRecord.id;
  }

  if (tableName === 'ventas') {
    const cantidad = parseFloat(mysqlData.cantidad);
    const precioUnitario = parseFloat(mysqlData.precio_unitario);
    if (!Number.isNaN(cantidad) && !Number.isNaN(precioUnitario)) {
      mysqlData.total = cantidad * precioUnitario;
    }
    if (!mysqlData.fecha) {
      mysqlData.fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  return mysqlData;
}

function closeConnectionAsync(connection) {
  return new Promise((resolve, reject) => {
    connectionManager.closeConnection(connection, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function assertConnectionExists(engine, credentials) {
  let tempConnection;

  try {
    tempConnection = await openConnectionAsync(engine, credentials);
  } finally {
    if (tempConnection) {
      await closeConnectionAsync(tempConnection);
    }
  }
}

async function syncClienteInsertToMysql(table, data, insertedRecord) {
  const registroId = insertedRecord && insertedRecord.id ? insertedRecord.id : null;
  const mysqlData = buildMysqlDataForSync(table, data, insertedRecord);

  try {
    let mysqlResult = await mysqlQueryAsync('INSERT INTO ?? SET ?', [table, mysqlData]);
    let warning = null;

    if (mysqlData.id != null && mysqlResult.insertId !== Number(mysqlData.id)) {
      warning = `Registro guardado en MySQL con id ${mysqlResult.insertId}`;
    }

    await syncLogsService.createSyncLog({
      tabla: table,
      accion: 'create',
      registro_id: registroId,
      motor_destino: 'mysql',
      estado: 'success',
      mensaje: warning || 'Registro guardado en MySQL desde insercion dinamica',
    });

    return {
      motor: 'mysql',
      estado: 'success',
      insertId: mysqlResult.insertId,
      affectedRows: mysqlResult.affectedRows,
      idPreservado: mysqlData.id != null && mysqlResult.insertId === Number(mysqlData.id),
      warning,
    };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && mysqlData.id != null) {
      try {
        const fallbackData = { ...mysqlData };
        delete fallbackData.id;
        const fallbackResult = await mysqlQueryAsync('INSERT INTO ?? SET ?', [table, fallbackData]);
        const warning = `El id ${mysqlData.id} ya existe en MySQL; se inserto con id ${fallbackResult.insertId}`;

        await syncLogsService.createSyncLog({
          tabla: table,
          accion: 'create',
          registro_id: registroId,
          motor_destino: 'mysql',
          estado: 'success',
          mensaje: warning,
        });

        return {
          motor: 'mysql',
          estado: 'warning',
          insertId: fallbackResult.insertId,
          affectedRows: fallbackResult.affectedRows,
          idPreservado: false,
          warning,
        };
      } catch (fallbackErr) {
        err = fallbackErr;
      }
    }

    console.error('Error al sincronizar registro en MySQL:', err);
    await syncLogsService.createSyncLog({
      tabla: table,
      accion: 'create',
      registro_id: registroId,
      motor_destino: 'mysql',
      estado: 'error',
      mensaje: err.message,
    });

    return {
      motor: 'mysql',
      estado: 'error',
      mensaje: err.message,
    };
  }
}

async function syncClienteUpdateToMysql(table, recordId, data) {
  const mysqlData = buildMysqlDataForSync(table, data);
  delete mysqlData.id;

  try {
    const mysqlResult = await mysqlQueryAsync('UPDATE ?? SET ? WHERE id = ?', [table, mysqlData, recordId]);
    await syncLogsService.createSyncLog({
      tabla: table,
      accion: 'update',
      registro_id: recordId,
      motor_destino: 'mysql',
      estado: 'success',
      mensaje: mysqlResult.affectedRows > 0
        ? 'Registro actualizado en MySQL desde edicion dinamica'
        : 'No se encontro un registro equivalente en MySQL para actualizar',
    });

    return {
      motor: 'mysql',
      estado: mysqlResult.affectedRows > 0 ? 'success' : 'warning',
      affectedRows: mysqlResult.affectedRows,
      mensaje: mysqlResult.affectedRows > 0
        ? 'Registro actualizado en MySQL'
        : 'No se encontro un registro equivalente en MySQL',
    };
  } catch (err) {
    console.error('Error al sincronizar update de registro en MySQL:', err);
    await syncLogsService.createSyncLog({
      tabla: table,
      accion: 'update',
      registro_id: recordId,
      motor_destino: 'mysql',
      estado: 'error',
      mensaje: err.message,
    });

    return {
      motor: 'mysql',
      estado: 'error',
      mensaje: err.message,
    };
  }
}

async function syncRecordDeleteToMysql(table, recordId) {
  try {
    const mysqlResult = await mysqlQueryAsync('DELETE FROM ?? WHERE id = ?', [table, recordId]);
    await syncLogsService.createSyncLog({
      tabla: table,
      accion: 'delete',
      registro_id: recordId,
      motor_destino: 'mysql',
      estado: 'success',
      mensaje: mysqlResult.affectedRows > 0
        ? 'Registro eliminado en MySQL desde eliminacion dinamica'
        : 'No se encontro un registro equivalente en MySQL para eliminar',
    });

    return {
      motor: 'mysql',
      estado: mysqlResult.affectedRows > 0 ? 'success' : 'warning',
      affectedRows: mysqlResult.affectedRows,
      mensaje: mysqlResult.affectedRows > 0
        ? 'Registro eliminado en MySQL'
        : 'No se encontro un registro equivalente en MySQL',
    };
  } catch (err) {
    console.error('Error al sincronizar delete de registro en MySQL:', err);
    await syncLogsService.createSyncLog({
      tabla: table,
      accion: 'delete',
      registro_id: recordId,
      motor_destino: 'mysql',
      estado: 'error',
      mensaje: err.message,
    });

    return {
      motor: 'mysql',
      estado: 'error',
      mensaje: err.message,
    };
  }
}

// POST / - Crear conexión
router.post('/', async (req, res) => {
  try {
    const { name, host, port, user, password, database_name, engine } = req.body;
    const selectedEngine = engine || 'postgres';

    if (!name || !host || !user || !password || !database_name) {
      return res.status(400).json({ error: 'name, host, user, password y database_name son requeridos' });
    }

    if (selectedEngine === 'sqlserver') {
      return res.status(400).json({ error: 'SQL Server todavia no esta disponible en el portal' });
    }

    try {
      await assertConnectionExists(selectedEngine, {
        host,
        port,
        user,
        password,
        database: database_name,
      });
    } catch (connectErr) {
      console.error('No se pudo validar la conexion antes de guardarla:', connectErr);
      return res.status(400).json({
        error: 'La conexion no existe o no se pudo abrir. Revisa host, puerto, usuario, password, base de datos y motor.',
      });
    }

    const result = await db.query(
      `INSERT INTO connections (name, host, port, "user", password, database_name, engine)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, name, host, port, "user", database_name, engine`,
      [name, host, port || 5432, user, password, database_name, selectedEngine]

    );
    return res.status(201).json({
      message: 'Conexion creada',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Error al crear conexion:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET / - Listar conexiones
router.get('/', (req, res) => {
  db.query(
    'SELECT id, name, host, port, "user", database_name, engine FROM connections',
    (err, results) => {
      if (err) {
        console.error('Error al listar conexiones:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      res.json(results);
    }
  );
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM connections WHERE id = ? RETURNING id, name',
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexion no encontrada' });
    }

    return res.json({
      message: 'Conexion eliminada',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Error al eliminar conexion:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /test/:id - Probar conexión
router.post('/test/:id', (req, res) => {
  const { id } = req.params;

  db.query(
    'SELECT host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al buscar conexión:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      const connData = results[0];
      const engine = connData.engine || 'mysql';

      connectionManager.openConnection(engine, {
        host: connData.host,
        port: connData.port,
        user: connData.user,
        password: connData.password,
        database: connData.database_name,
      }, (connectErr, tempConn) => {
        if (connectErr) {
          console.error('Error al conectar:', connectErr);
          return res.status(500).json({ error: 'No se pudo conectar' });
        }

        connectionManager.closeConnection(tempConn, (closeErr) => {
          if (closeErr) {
            console.error('Error al cerrar conexión:', closeErr);
            return res.status(500).json({ error: 'Error al cerrar la conexión' });
          }

          res.json({ message: 'Conexión exitosa' });
        });
      });
    }
  );
});

// GET /query/:id - Ejecutar SHOW TABLES / information_schema
router.get('/query/:id', (req, res) => {
  const { id } = req.params;

  db.query(
    'SELECT host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al buscar conexión:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      const connData = results[0];
      const engine = connData.engine || 'mysql';

      connectionManager.openConnection(engine, {
        host: connData.host,
        port: connData.port,
        user: connData.user,
        password: connData.password,
        database: connData.database_name,
      }, (connectErr, tempConn) => {
        if (connectErr) {
          console.error('Error al conectar:', connectErr);
          return res.status(500).json({ error: 'No se pudo conectar' });
        }

        connectionManager.getTables(tempConn, engine, (tableErr, tableNames) => {
          connectionManager.closeConnection(tempConn, (closeErr) => {
            if (closeErr) {
              console.error('Error al cerrar conexión:', closeErr);
            }

            if (tableErr) {
              console.error('Error al ejecutar consulta de tablas:', tableErr);
              return res.status(500).json({ error: 'Error al ejecutar la consulta' });
            }

            res.json({ tables: tableNames });
          });
        });
      });
    }
  );
});

// GET /stats/:id - Métricas de la conexión (tablas + filas)
router.get('/stats/:id', (req, res) => {
  const { id } = req.params;

  db.query(
    'SELECT host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al buscar conexión:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      const connData = results[0];
      const engine = connData.engine || 'mysql';

      connectionManager.openConnection(engine, {
        host: connData.host,
        port: connData.port,
        user: connData.user,
        password: connData.password,
        database: connData.database_name,
      }, (connectErr, tempConn) => {
        if (connectErr) {
          console.error('Error al conectar:', connectErr);
          return res.status(500).json({ error: 'No se pudo conectar' });
        }

        connectionManager.getTables(tempConn, engine, (tableErr, tableNames) => {
          if (tableErr) {
            connectionManager.closeConnection(tempConn);
            console.error('Error al obtener tablas:', tableErr);
            return res.status(500).json({ error: 'Error al ejecutar la consulta' });
          }

          if (tableNames.length === 0) {
            connectionManager.closeConnection(tempConn);
            return res.json({ tableCount: 0, tablesWithRows: 0, totalRows: 0, tableNames: [] });
          }

          let completed = 0;
          let totalRows = 0;
          let tablesWithRows = 0;
          const perTable = [];

          tableNames.forEach((tableName) => {
            connectionManager.getTableRowCount(tempConn, tableName, (countErr, cnt) => {
              const rowCount = !countErr ? cnt : 0;
              perTable.push({ tableName, rowCount });
              totalRows += rowCount;
              if (rowCount > 0) tablesWithRows += 1;

              completed += 1;
              if (completed === tableNames.length) {
                connectionManager.closeConnection(tempConn);
                res.json({
                  tableCount: tableNames.length,
                  tablesWithRows,
                  totalRows,
                  tableNames,
                  perTable,
                });
              }
            });
          });
        });
      });
    }
  );
});

// GET /table/:id/:table - Consultar tabla específica
router.get('/columns/:id/:table', (req, res) => {
  const { id, table } = req.params;

  db.query(
    'SELECT host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al buscar conexion:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Conexion no encontrada' });
      }

      const connData = results[0];
      const engine = connData.engine || 'mysql';

      connectionManager.openConnection(engine, {
        host: connData.host,
        port: connData.port,
        user: connData.user,
        password: connData.password,
        database: connData.database_name,
      }, (connectErr, tempConn) => {
        if (connectErr) {
          console.error('Error al conectar:', connectErr);
          return res.status(500).json({ error: 'No se pudo conectar' });
        }

        connectionManager.getTableColumns(tempConn, table, (columnsErr, columns) => {
          connectionManager.closeConnection(tempConn);

          if (columnsErr) {
            console.error('Error al obtener columnas:', columnsErr);
            return res.status(500).json({ error: 'Error al obtener columnas de la tabla' });
          }

          res.json({ columns });
        });
      });
    }
  );
});

router.get('/table/:id/:table', (req, res) => {
  const { id, table } = req.params;

  db.query(
    'SELECT host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al buscar conexión:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      const connData = results[0];
      const engine = connData.engine || 'mysql';

      connectionManager.openConnection(engine, {
        host: connData.host,
        port: connData.port,
        user: connData.user,
        password: connData.password,
        database: connData.database_name,
      }, (connectErr, tempConn) => {
        if (connectErr) {
          console.error('Error al conectar:', connectErr);
          return res.status(500).json({ error: 'No se pudo conectar' });
        }

        // Ejecutar SELECT * FROM tabla LIMIT 20
        let query = '';
        if (engine === 'postgres' || engine === 'postgresql') {
          query = `SELECT * FROM "${table}" LIMIT 20`;
        } else {
          query = 'SELECT * FROM ?? LIMIT 20';
        }

        connectionManager.executeQuery(tempConn, query, engine === 'mysql' ? [table] : [], (queryErr, rows) => {
          connectionManager.closeConnection(tempConn, (closeErr) => {
            if (closeErr) {
              console.error('Error al cerrar conexión:', closeErr);
            }

            if (queryErr) {
              console.error('Error al ejecutar consulta:', queryErr);
              return res.status(500).json({ error: 'Error al ejecutar la consulta' });
            }

            res.json({ data: rows, count: rows.length });
          });
        });
      });
    }
  );
});

// POST /insert/:id/:table - Insertar datos dinamicos
router.post('/insert/:id/:table', async (req, res) => {
  const { id, table } = req.params;
  const data = { ...req.body };
  let tempConn;

  try {
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No se recibieron datos para insertar' });
    }

    const results = await db.query(
      'SELECT host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
      [id]
    );

    if (!results || results.length === 0) {
      return res.status(404).json({ error: 'Conexion no encontrada' });
    }

    const connData = results[0];
    const engine = connData.engine || 'postgres';
    const isPostgres = engine === 'postgres' || engine === 'postgresql';

    removeAutoTimestampFields(data);

    if (table.toLowerCase() === 'ventas') {
      const cantidad = parseFloat(data.cantidad);
      const precioUnitario = parseFloat(data.precio_unitario);
      if (!isPostgres && !Number.isNaN(cantidad) && !Number.isNaN(precioUnitario)) {
        data.total = cantidad * precioUnitario;
      } else if (isPostgres) {
        delete data.total;
      }
      if (!data.fecha) {
        data.fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
      }
    }

    removeAutoTimestampFields(data);

    tempConn = await openConnectionAsync(engine, {
      host: connData.host,
      port: connData.port,
      user: connData.user,
      password: connData.password,
      database: connData.database_name,
    });

    const result = await insertRecordAsync(tempConn, table, data);
    const sync = isPostgres
      ? await syncClienteInsertToMysql(table, data, result.record)
      : null;

    return res.status(201).json({
      message: 'Registro insertado',
      data: result.record || { insertId: result.insertId, affectedRows: result.affectedRows },
      sync,
    });
  } catch (err) {
    console.error('Error al insertar datos:', err);
    return res.status(500).json({ error: 'Error al insertar datos' });
  } finally {
    if (tempConn) {
      try {
        await closeConnectionAsync(tempConn);
      } catch (closeErr) {
        console.error('Error al cerrar conexion:', closeErr);
      }
    }
  }
});
// PUT /update/:id/:table/:recordId - Actualizar registro dinámico
router.put('/update/:id/:table/:recordId', (req, res) => {
  const { id, table, recordId } = req.params;
  const data = req.body;

  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No se recibieron datos para actualizar' });
  }

  removeAutoTimestampFields(data);

  db.query(
    'SELECT host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al buscar conexión:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      const connData = results[0];
      const engine = connData.engine || 'mysql';

      connectionManager.openConnection(engine, {
        host: connData.host,
        port: connData.port,
        user: connData.user,
        password: connData.password,
        database: connData.database_name,
      }, (connectErr, tempConn) => {
        if (connectErr) {
          console.error('Error al conectar:', connectErr);
          return res.status(500).json({ error: 'No se pudo conectar' });
        }

        connectionManager.executeQuery(tempConn, 'UPDATE ?? SET ? WHERE id = ?', [table, data, recordId], async (updateErr, result) => {
          connectionManager.closeConnection(tempConn, (closeErr) => {
            if (closeErr) {
              console.error('Error al cerrar conexión:', closeErr);
            }

          });

          if (updateErr) {
              console.error('Error al ejecutar UPDATE:', updateErr);
              return res.status(500).json({ error: 'Error al actualizar datos' });
            }

            const isPostgres = engine === 'postgres' || engine === 'postgresql';
            const sync = isPostgres
              ? await syncClienteUpdateToMysql(table, recordId, data)
              : null;

            res.json({
              message: 'Registro actualizado',
              affectedRows: result.affectedRows,
              sync,
            });
        });
      });
    }
  );
});

// DELETE /delete/:id/:table/:recordId - Eliminar registro dinámico
router.delete('/delete/:id/:table/:recordId', (req, res) => {
  const { id, table, recordId } = req.params;

  db.query(
    'SELECT host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al buscar conexión:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      const connData = results[0];
      const engine = connData.engine || 'mysql';

      connectionManager.openConnection(engine, {
        host: connData.host,
        port: connData.port,
        user: connData.user,
        password: connData.password,
        database: connData.database_name,
      }, (connectErr, tempConn) => {
        if (connectErr) {
          console.error('Error al conectar:', connectErr);
          return res.status(500).json({ error: 'No se pudo conectar' });
        }

        connectionManager.executeQuery(tempConn, 'DELETE FROM ?? WHERE id = ?', [table, recordId], async (deleteErr, result) => {
          connectionManager.closeConnection(tempConn, (closeErr) => {
            if (closeErr) {
              console.error('Error al cerrar conexión:', closeErr);
            }

          });

          if (deleteErr) {
              console.error('Error al ejecutar DELETE:', deleteErr);
              return res.status(500).json({ error: 'Error al eliminar datos' });
            }

            const isPostgres = engine === 'postgres' || engine === 'postgresql';
            const sync = isPostgres
              ? await syncRecordDeleteToMysql(table, recordId)
              : null;

            res.json({
              message: 'Registro eliminado',
              affectedRows: result.affectedRows,
              sync,
            });
        });
      });
    }
  );
});

// GET /export/:id - Exportar todas las tablas a Excel
router.get('/export/:id', (req, res) => {
  const { id } = req.params;

  db.query(
    'SELECT name, host, port, "user", password, database_name, engine FROM connections WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al buscar conexiÃ³n para exportaciÃ³n:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'ConexiÃ³n no encontrada' });
      }

      const connData = results[0];
      const engine = connData.engine || 'mysql';

      connectionManager.openConnection(engine, {
        host: connData.host,
        port: connData.port,
        user: connData.user,
        password: connData.password,
        database: connData.database_name,
      }, (connectErr, tempConn) => {
        if (connectErr) {
          console.error('Error al conectar para exportaciÃ³n:', connectErr);
          return res.status(500).json({ error: 'No se pudo conectar' });
        }

        connectionManager.getTables(tempConn, engine, (tableErr, tableNames) => {
          if (tableErr) {
            connectionManager.closeConnection(tempConn);
            console.error('Error al obtener tablas para exportaciÃ³n:', tableErr);
            return res.status(500).json({ error: 'Error al obtener las tablas' });
          }

          const workbook = XLSX.utils.book_new();

          if (!Array.isArray(tableNames) || tableNames.length === 0) {
            const emptySheet = XLSX.utils.json_to_sheet([{ mensaje: 'La base de datos no contiene tablas.' }]);
            XLSX.utils.book_append_sheet(workbook, emptySheet, 'Resumen');
            connectionManager.closeConnection(tempConn);

            const emptyBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            const emptyFileName = buildExportFileName(connData.name, connData.database_name);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${emptyFileName}"`);
            return res.send(emptyBuffer);
          }

          let pendingTables = tableNames.length;
          let requestHandled = false;
          const usedSheetNames = new Set();

          const finishWithWorkbook = () => {
            connectionManager.closeConnection(tempConn, (closeErr) => {
              if (closeErr) {
                console.error('Error al cerrar conexiÃ³n tras exportaciÃ³n:', closeErr);
              }

              const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
              const fileName = buildExportFileName(connData.name, connData.database_name);
              res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
              res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
              res.send(fileBuffer);
            });
          };

          tableNames.forEach((tableName, index) => {
            const isPostgres = engine === 'postgres' || engine === 'postgresql';
            const sql = isPostgres
              ? `SELECT * FROM ${escapePostgresIdentifier(tableName)}`
              : 'SELECT * FROM ??';
            const params = isPostgres ? [] : [tableName];

            connectionManager.executeQuery(tempConn, sql, params, (queryErr, rows) => {
              if (requestHandled) return;

              if (queryErr) {
                requestHandled = true;
                connectionManager.closeConnection(tempConn);
                console.error(`Error al exportar tabla ${tableName}:`, queryErr);
                return res.status(500).json({ error: `Error al exportar la tabla ${tableName}` });
              }

              const baseSheetName = sanitizeSheetName(tableName, `Tabla${index + 1}`);
              let finalSheetName = baseSheetName;
              let suffix = 1;

              while (usedSheetNames.has(finalSheetName)) {
                finalSheetName = sanitizeSheetName(`${baseSheetName.slice(0, 28)}_${suffix}`, `Tabla${index + 1}`);
                suffix += 1;
              }

              usedSheetNames.add(finalSheetName);

              const normalizedRows = Array.isArray(rows)
                ? rows.map((row) => {
                    const normalized = {};
                    Object.entries(row || {}).forEach(([key, value]) => {
                      normalized[key] = Buffer.isBuffer(value) ? value.toString('utf8') : value;
                    });
                    return normalized;
                  })
                : [];

              const worksheetData = normalizedRows.length > 0
                ? normalizedRows
                : [{ mensaje: `La tabla ${tableName} no contiene registros.` }];
              const worksheet = XLSX.utils.json_to_sheet(worksheetData);
              XLSX.utils.book_append_sheet(workbook, worksheet, finalSheetName);

              pendingTables -= 1;
              if (pendingTables === 0) {
                requestHandled = true;
                finishWithWorkbook();
              }
            });
          });
        });
      });
    }
  );
});

module.exports = router;
