const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';

// REGISTER
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
    [name, email, hashedPassword],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Usuario creado' });
    }
  );
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  db.query(
    'SELECT * FROM users WHERE email = ?',
    [email],
    async (err, results) => {
      if (err) return res.status(500).json(err);

      if (results.length === 0) {
        return res.status(400).json({ message: 'Usuario no encontrado' });
      }

      const user = results[0];

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(400).json({ message: 'Contraseña incorrecta' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.json({ token });
    }
  );
});

module.exports = router;