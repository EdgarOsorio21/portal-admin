const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createUser } = require('../services/users.service');

const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y password son requeridos' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await createUser({
      name,
      email,
      password: hashedPassword,
    });

    return res.status(201).json({
      message: 'Usuario creado',
      data: createdUser,
    });
  } catch (err) {
    if (err.code === '23505') {
      console.error('Error al crear usuario: email duplicado', err.detail || err.message);
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }

    console.error('Error al crear usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  db.query(
    'SELECT * FROM users WHERE email = ?',
    [email],
    async (err, results) => {
      if (err) {
        console.error('Error al iniciar sesion:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

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
