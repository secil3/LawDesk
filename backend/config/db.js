const { Pool } = require("pg");
const dotenv = require("dotenv");
const { getDatabaseConfig } = require("./database");

dotenv.config();

const pool = new Pool(getDatabaseConfig());

const query = (text, params) => {
  return pool.query(text, params);
};

const connect = () => {
  return pool.connect();
};

const withTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await callback((text, params) =>
      client.query(text, params),
    );

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const close = () => {
  return pool.end();
};

const testConnection = async () => {
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
};

module.exports = {
  connect,
  query,
  withTransaction,
  close,
  testConnection,
};
