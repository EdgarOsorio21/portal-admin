const postgresDb = require('../config/postgres.database');

let tableReady = false;

async function ensureSyncLogsTable() {
  if (tableReady) {
    return;
  }

  if (!postgresDb.pool) {
    throw new Error('No hay conexion PostgreSQL configurada');
  }

  await postgresDb.pool.query(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id SERIAL PRIMARY KEY,
      tabla VARCHAR(100) NOT NULL,
      accion VARCHAR(50) NOT NULL,
      registro_id TEXT,
      motor_destino VARCHAR(50) NOT NULL,
      estado VARCHAR(50) NOT NULL,
      mensaje TEXT,
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  tableReady = true;
}

async function createSyncLog({ tabla, accion, registro_id, motor_destino, estado, mensaje }) {
  try {
    await ensureSyncLogsTable();

    await postgresDb.pool.query(
      `INSERT INTO sync_logs (tabla, accion, registro_id, motor_destino, estado, mensaje, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        tabla,
        accion,
        registro_id == null ? null : String(registro_id),
        motor_destino,
        estado,
        mensaje || null,
      ]
    );
  } catch (err) {
    console.error('Error al registrar log de sincronizacion:', err);
  }
}

module.exports = {
  ensureSyncLogsTable,
  createSyncLog,
};
