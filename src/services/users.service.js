const postgresDb = require('../config/postgres.database');
const mysqlDb = require('../config/mysql.database');

async function createUserPostgres({ name, email, password }) {
  try {
    const result = await postgresDb.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?) RETURNING id, name, email',
      [name, email, password]
    );

    console.log('Guardado en PostgreSQL');
    return result.rows[0];
  } catch (err) {
    console.error('Error en PostgreSQL:', err);
    throw err;
  }
}

async function createUserMysql({ name, email, password }) {
  return new Promise((resolve, reject) => {
    mysqlDb.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, password],
      (err, result) => {
        if (err) {
          return reject(err);
        }

        resolve({
          id: result.insertId,
          name,
          email,
        });
      }
    );
  });
}

async function createUser({ name, email, password }) {
  const createdUser = await createUserPostgres({ name, email, password });

  try {
    await createUserMysql({ name, email, password });
    console.log('Guardado en MySQL');
  } catch (err) {
    console.error('Error en MySQL:', err);
  }

  return createdUser;
}

module.exports = {
  createUser,
  createUserPostgres,
  createUserMysql,
};
