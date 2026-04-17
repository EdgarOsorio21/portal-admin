const clientesService = require('../services/clientes.service');

async function createCliente(req, res) {
  try {
    const cliente = await clientesService.createCliente(req.body);

    return res.status(201).json({
      message: 'Cliente creado',
      data: cliente,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const message = statusCode === 400
      ? err.message
      : 'Error interno del servidor';

    return res.status(statusCode).json({ error: message });
  }
}

async function getClientes(req, res) {
  try {
    const clientes = await clientesService.getClientesPostgres();

    return res.json({
      data: clientes,
      count: clientes.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function updateCliente(req, res) {
  try {
    const cliente = await clientesService.updateCliente(req.params.id, req.body);

    return res.json({
      message: 'Cliente actualizado',
      data: cliente,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const message = statusCode === 400 || statusCode === 404
      ? err.message
      : 'Error interno del servidor';

    return res.status(statusCode).json({ error: message });
  }
}

async function deleteCliente(req, res) {
  try {
    const cliente = await clientesService.deleteCliente(req.params.id);

    return res.json({
      message: 'Cliente eliminado',
      data: cliente,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const message = statusCode === 404
      ? err.message
      : 'Error interno del servidor';

    return res.status(statusCode).json({ error: message });
  }
}

module.exports = {
  createCliente,
  getClientes,
  updateCliente,
  deleteCliente,
};
