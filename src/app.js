const express = require('express');
const cors = require('cors');
const path = require('path');

require('./config/database');

const authRoutes = require('./routes/auth.routes');
const connectionsRoutes = require('./routes/connections.routes');
const authMiddleware = require('./middlewares/auth.middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/connections', authMiddleware, connectionsRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'API de portal administrativo funcionando' });
});

app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({
    message: 'Ruta protegida',
    user: req.user
  });
});

module.exports = app;