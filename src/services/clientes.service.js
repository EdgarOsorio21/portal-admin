const postgresDb = require('../config/postgres.database');
const mysqlDb = require('../config/mysql.database');
const syncLogsService = require('./syncLogs.service');

function escapeIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function ensurePlainObject(data) {
  return data && typeof data === 'object' && !Array.isArray(data);
}

async function createClientePostgres(data) {
  if (!postgresDb.pool) {
    throw new Error('No hay conexion PostgreSQL configurada');
  }

  if (!ensurePlainObject(data) || Object.keys(data).length === 0) {
    const err = new Error('No se recibieron datos para crear el cliente');
    err.statusCode = 400;
    throw err;
  }

  const columns = Object.keys(data);
  const values = Object.values(data);
  const columnList = columns.map(escapeIdentifier).join(', ');
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

  try {
    const result = await postgresDb.pool.query(
      `INSERT INTO clientes (${columnList}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    console.log('Guardado en PostgreSQL');
    return result.rows[0];
  } catch (err) {
    console.error('Error al guardar cliente en PostgreSQL:', err);
    throw err;
  }
}

async function createClienteMysql(data) {
  if (!ensurePlainObject(data) || Object.keys(data).length === 0) {
    const err = new Error('No se recibieron datos para crear el cliente en MySQL');
    err.statusCode = 400;
    throw err;
  }

  return new Promise((resolve, reject) => {
    mysqlDb.query('INSERT INTO clientes SET ?', data, (err, result) => {
      if (err) {
        return reject(err);
      }

      resolve({
        insertId: result.insertId,
        affectedRows: result.affectedRows,
      });
    });
  });
}

async function createClienteMysqlFromPostgres(data, postgresRecord) {
  const mysqlData = { ...data };
  const postgresId = postgresRecord && postgresRecord.id;

  if (postgresId != null && mysqlData.id == null) {
    mysqlData.id = postgresId;
  }

  try {
    const result = await createClienteMysql(mysqlData);
    return {
      ...result,
      idPreservado: mysqlData.id != null,
    };
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY' || mysqlData.id == null) {
      throw err;
    }

    const fallbackData = { ...mysqlData };
    delete fallbackData.id;
    const fallbackResult = await createClienteMysql(fallbackData);

    return {
      ...fallbackResult,
      idPreservado: false,
      warning: `El id ${mysqlData.id} ya existe en MySQL; se inserto con id ${fallbackResult.insertId}`,
    };
  }
}

async function createCliente(data) {
  const cliente = await createClientePostgres(data);
  const registroId = cliente && cliente.id ? cliente.id : null;

  await syncLogsService.createSyncLog({
    tabla: 'clientes',
    accion: 'create',
    registro_id: registroId,
    motor_destino: 'postgresql',
    estado: 'success',
    mensaje: 'Cliente guardado en PostgreSQL',
  });

  try {
    const mysqlResult = await createClienteMysqlFromPostgres(data, cliente);
    console.log('Guardado en MySQL');
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'create',
      registro_id: registroId,
      motor_destino: 'mysql',
      estado: 'success',
      mensaje: mysqlResult.warning || 'Cliente guardado en MySQL',
    });
  } catch (err) {
    console.error('Error al guardar en MySQL:', err);
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'create',
      registro_id: registroId,
      motor_destino: 'mysql',
      estado: 'error',
      mensaje: err.message,
    });
  }

  return cliente;
}

async function updateClientePostgres(id, data) {
  if (!postgresDb.pool) {
    throw new Error('No hay conexion PostgreSQL configurada');
  }

  if (!ensurePlainObject(data) || Object.keys(data).length === 0) {
    const err = new Error('No se recibieron datos para actualizar el cliente');
    err.statusCode = 400;
    throw err;
  }

  const columns = Object.keys(data);
  const values = Object.values(data);
  const assignments = columns
    .map((column, index) => `${escapeIdentifier(column)} = $${index + 1}`)
    .join(', ');

  try {
    const result = await postgresDb.pool.query(
      `UPDATE clientes SET ${assignments} WHERE id = $${values.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rowCount === 0) {
      const err = new Error('Cliente no encontrado');
      err.statusCode = 404;
      throw err;
    }

    console.log('Actualizado en PostgreSQL');
    return result.rows[0];
  } catch (err) {
    console.error('Error al actualizar cliente en PostgreSQL:', err);
    throw err;
  }
}

async function updateClienteMysql(id, data) {
  if (!ensurePlainObject(data) || Object.keys(data).length === 0) {
    const err = new Error('No se recibieron datos para actualizar el cliente en MySQL');
    err.statusCode = 400;
    throw err;
  }

  return new Promise((resolve, reject) => {
    mysqlDb.query('UPDATE clientes SET ? WHERE id = ?', [data, id], (err, result) => {
      if (err) {
        return reject(err);
      }

      resolve({
        affectedRows: result.affectedRows,
      });
    });
  });
}

async function updateCliente(id, data) {
  let cliente;

  try {
    cliente = await updateClientePostgres(id, data);
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'update',
      registro_id: id,
      motor_destino: 'postgresql',
      estado: 'success',
      mensaje: 'Cliente actualizado en PostgreSQL',
    });
  } catch (err) {
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'update',
      registro_id: id,
      motor_destino: 'postgresql',
      estado: 'error',
      mensaje: err.message,
    });
    throw err;
  }

  try {
    await updateClienteMysql(id, data);
    console.log('Actualizado en MySQL');
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'update',
      registro_id: id,
      motor_destino: 'mysql',
      estado: 'success',
      mensaje: 'Cliente actualizado en MySQL',
    });
  } catch (err) {
    console.error('Error al actualizar en MySQL:', err);
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'update',
      registro_id: id,
      motor_destino: 'mysql',
      estado: 'error',
      mensaje: err.message,
    });
  }

  return cliente;
}

async function deleteClientePostgres(id) {
  if (!postgresDb.pool) {
    throw new Error('No hay conexion PostgreSQL configurada');
  }

  try {
    const result = await postgresDb.pool.query(
      'DELETE FROM clientes WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      const err = new Error('Cliente no encontrado');
      err.statusCode = 404;
      throw err;
    }

    console.log('Eliminado en PostgreSQL');
    return result.rows[0];
  } catch (err) {
    console.error('Error al eliminar cliente en PostgreSQL:', err);
    throw err;
  }
}

async function deleteClienteMysql(id) {
  return new Promise((resolve, reject) => {
    mysqlDb.query('DELETE FROM clientes WHERE id = ?', [id], (err, result) => {
      if (err) {
        return reject(err);
      }

      resolve({
        affectedRows: result.affectedRows,
      });
    });
  });
}

async function deleteCliente(id) {
  let cliente;

  try {
    cliente = await deleteClientePostgres(id);
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'delete',
      registro_id: id,
      motor_destino: 'postgresql',
      estado: 'success',
      mensaje: 'Cliente eliminado en PostgreSQL',
    });
  } catch (err) {
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'delete',
      registro_id: id,
      motor_destino: 'postgresql',
      estado: 'error',
      mensaje: err.message,
    });
    throw err;
  }

  try {
    await deleteClienteMysql(id);
    console.log('Eliminado en MySQL');
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'delete',
      registro_id: id,
      motor_destino: 'mysql',
      estado: 'success',
      mensaje: 'Cliente eliminado en MySQL',
    });
  } catch (err) {
    console.error('Error al eliminar en MySQL:', err);
    await syncLogsService.createSyncLog({
      tabla: 'clientes',
      accion: 'delete',
      registro_id: id,
      motor_destino: 'mysql',
      estado: 'error',
      mensaje: err.message,
    });
  }

  return cliente;
}

async function getClientesPostgres() {
  if (!postgresDb.pool) {
    throw new Error('No hay conexion PostgreSQL configurada');
  }

  try {
    const result = await postgresDb.pool.query('SELECT * FROM clientes');
    return result.rows;
  } catch (err) {
    console.error('Error al listar clientes en PostgreSQL:', err);
    throw err;
  }
}

module.exports = {
  createCliente,
  createClientePostgres,
  createClienteMysql,
  createClienteMysqlFromPostgres,
  updateCliente,
  updateClientePostgres,
  updateClienteMysql,
  deleteCliente,
  deleteClientePostgres,
  deleteClienteMysql,
  getClientesPostgres,
};
