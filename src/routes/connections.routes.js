const express = require('express');
const router = express.Router();
const db = require('../config/database');
const connectionManager = require('../helpers/connectionManager');

// POST / - Crear conexión
router.post('/', (req, res) => {
  const { name, host, port, user, password, database_name, engine } = req.body;
  const selectedEngine = engine || 'mysql'; // Default a MySQL

  db.query(
    'INSERT INTO connections (name, host, port, user, password, database_name, engine) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, host, port, user, password, database_name, selectedEngine],
    (err, result) => {
      if (err) {
        console.error('Error al crear conexión:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      res.json({ message: 'Conexión creada' });
    }
  );
});

// GET / - Listar conexiones
router.get('/', (req, res) => {
  db.query(
    'SELECT id, name, host, port, user, database_name, engine FROM connections',
    (err, results) => {
      if (err) {
        console.error('Error al listar conexiones:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      res.json(results);
    }
  );
});

// POST /test/:id - Probar conexión
router.post('/test/:id', (req, res) => {
  const { id } = req.params;

  db.query(
    'SELECT host, port, user, password, database_name, engine FROM connections WHERE id = ?',
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
    'SELECT host, port, user, password, database_name, engine FROM connections WHERE id = ?',
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
    'SELECT host, port, user, password, database_name, engine FROM connections WHERE id = ?',
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
router.get('/table/:id/:table', (req, res) => {
  const { id, table } = req.params;

  db.query(
    'SELECT host, port, user, password, database_name, engine FROM connections WHERE id = ?',
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

// POST /insert/:id/:table - Insertar datos dinámicos
router.post('/insert/:id/:table', (req, res) => {
  const { id, table } = req.params;
  const data = req.body;

  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No se recibieron datos para insertar' });
  }

  db.query(
    'SELECT host, port, user, password, database_name, engine FROM connections WHERE id = ?',
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

      if (table.toLowerCase() === 'ventas') {
        const cantidad = parseFloat(data.cantidad);
        const precioUnitario = parseFloat(data.precio_unitario);
        if (engine === 'mysql' && !Number.isNaN(cantidad) && !Number.isNaN(precioUnitario)) {
          data.total = cantidad * precioUnitario;
        } else if (engine === 'postgres' || engine === 'postgresql') {
          delete data.total; // En PostgreSQL total es columna generada
        }
        if (!data.fecha) {
          data.fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
      }

      if ((engine === 'postgres' || engine === 'postgresql') && table.toLowerCase() === 'usuarios') {
        delete data.fecha_creacion;
        delete data.fecha_de_creacion;
        delete data.created_at;
      }

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

        connectionManager.insertRecord(tempConn, table, data, (insertErr, result) => {
          connectionManager.closeConnection(tempConn, (closeErr) => {
            if (closeErr) {
              console.error('Error al cerrar conexión:', closeErr);
            }

            if (insertErr) {
              console.error('Error al ejecutar INSERT:', insertErr);
              return res.status(500).json({ error: 'Error al insertar datos' });
            }

            res.json({ message: 'Registro insertado', insertId: result.insertId, affectedRows: result.affectedRows });
          });
        });
      });
    }
  );
});

// PUT /update/:id/:table/:recordId - Actualizar registro dinámico
router.put('/update/:id/:table/:recordId', (req, res) => {
  const { id, table, recordId } = req.params;
  const data = req.body;

  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No se recibieron datos para actualizar' });
  }

  db.query(
    'SELECT host, port, user, password, database_name, engine FROM connections WHERE id = ?',
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

        connectionManager.executeQuery(tempConn, 'UPDATE ?? SET ? WHERE id = ?', [table, data, recordId], (updateErr, result) => {
          connectionManager.closeConnection(tempConn, (closeErr) => {
            if (closeErr) {
              console.error('Error al cerrar conexión:', closeErr);
            }

            if (updateErr) {
              console.error('Error al ejecutar UPDATE:', updateErr);
              return res.status(500).json({ error: 'Error al actualizar datos' });
            }

            res.json({ message: 'Registro actualizado', affectedRows: result.affectedRows });
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
    'SELECT host, port, user, password, database_name, engine FROM connections WHERE id = ?',
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

        connectionManager.executeQuery(tempConn, 'DELETE FROM ?? WHERE id = ?', [table, recordId], (deleteErr, result) => {
          connectionManager.closeConnection(tempConn, (closeErr) => {
            if (closeErr) {
              console.error('Error al cerrar conexión:', closeErr);
            }

            if (deleteErr) {
              console.error('Error al ejecutar DELETE:', deleteErr);
              return res.status(500).json({ error: 'Error al eliminar datos' });
            }

            res.json({ message: 'Registro eliminado', affectedRows: result.affectedRows });
          });
        });
      });
    }
  );
});

module.exports = router;