const express = require('express');
const clientesController = require('../controllers/clientes.controller');

const router = express.Router();

router.get('/', clientesController.getClientes);
router.post('/', clientesController.createCliente);
router.put('/:id', clientesController.updateCliente);
router.delete('/:id', clientesController.deleteCliente);

module.exports = router;
