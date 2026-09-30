require('dotenv').config({ quiet: true });
const { Pool, types } = require('pg');

// DATE (oid 1082) volta como 'YYYY-MM-DD', não como Date no fuso do processo.
types.setTypeParser(1082, (v) => v);

// Pool único por processo. Cada request/worker pega uma conexão emprestada
// em vez de abrir e fechar um Client por query.
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Erro em conexão ociosa do pool:', err.message);
});

// Consultas no schema public (catálogo de tenants, usuários).
function query(text, params) {
  return pool.query(text, params);
}

const SCHEMA_RE = /^tenant_\d+$/;

// Executa `fn(client)` numa transação assumindo a role do tenant e com
// search_path apontando para o schema dele. Dois níveis de proteção: sem o
// search_path a tabela não é encontrada; com a role, outro schema dá
// "permission denied". SET LOCAL é desfeito no COMMIT/ROLLBACK, então a
// conexão volta limpa para o pool.
async function withTenant(tenant, fn) {
  if (!SCHEMA_RE.test(tenant.schema_name)) {
    throw new Error(`schema inválido: ${tenant.schema_name}`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${tenant.schema_name}_role`);
    await client.query(`SET LOCAL search_path TO ${tenant.schema_name}, public`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Recalcula o saldo da data informada e de todos os dias seguintes do tenant.
// Deve ser chamado dentro de withTenant.
function reconsolidarAPartirDe(client, data, fuso) {
  return client.query('SELECT consolidar_saldo_a_partir_de($1::date, $2)', [data, fuso]);
}

module.exports = { pool, query, withTenant, reconsolidarAPartirDe };
