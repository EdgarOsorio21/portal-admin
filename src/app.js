const express = require('express');
const cors = require('cors');
const path = require('path');

const postgresDb = require('./config/postgres.database');

const authRoutes = require('./routes/auth.routes');
const connectionsRoutes = require('./routes/connections.routes');
const clientesRoutes = require('./routes/clientes.routes');
const authMiddleware = require('./middlewares/auth.middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/connections', authMiddleware, connectionsRoutes);
app.use('/api/clientes', clientesRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'API de portal administrativo funcionando' });
});

app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({
    message: 'Ruta protegida',
    user: req.user
  });
});

app.get('/api/test-db', (req, res) => {
  postgresDb.query('SELECT NOW()', (err, results) => {
    if (err) {
      console.error('Error al probar la conexion con PostgreSQL/Supabase:', err);
      return res.status(500).json({ error: 'No se pudo conectar a la base de datos' });
    }

    res.json({ ok: true, now: results[0].now });
  });
});

module.exports = app;
