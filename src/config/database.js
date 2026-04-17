// PostgreSQL/Supabase es la base principal de la aplicacion.
// Este archivo mantiene el import historico require('../config/database')
// para no romper rutas existentes.
module.exports = require('./postgres.database');
