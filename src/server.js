require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./db');

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('[db] MySQL connection OK');
  } catch (err) {
    console.error('[db] MySQL connection FAILED:', err.message);
    console.error('     The API will still start, but DB-backed routes will fail.');
  }

  app.listen(PORT, () => {
    console.log(`[api] Mekky ERP API listening on http://localhost:${PORT}`);
  });
})();
