// Rotas administrativas: provisionamento de tenants. Só existem quando
// ADMIN_TOKEN está configurado; usadas pelo onboarding e pelos testes de carga.
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const FUSO_RE = /^[A-Za-z_]+\/[A-Za-z_]+$/;

function adminAuth(req, res, next) {
  const [scheme, token] = (req.headers['authorization'] || '').split(' ');
  if (scheme !== 'Bearer' || !token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Token administrativo inválido' });
  }
  next();
}

const router = express.Router();

// POST /admin/tenants { nome, fuso?, hora_fechamento?, usuario: { email, senha } }
router.post('/tenants', adminAuth, async (req, res, next) => {
  const { nome, fuso = 'America/Sao_Paulo', hora_fechamento = '18:00', usuario } = req.body || {};
  if (!nome || !usuario?.email || !usuario?.senha) {
    return res.status(400).json({ error: 'nome e usuario { email, senha } são obrigatórios' });
  }
  if (!FUSO_RE.test(fuso)) {
    return res.status(400).json({ error: 'fuso inválido (ex.: America/Sao_Paulo)' });
  }
  if (!/^\d{2}:\d{2}$/.test(hora_fechamento)) {
    return res.status(400).json({ error: 'hora_fechamento deve ser HH:MM' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query('SELECT criar_tenant($1, $2, $3) AS id', [nome, fuso, hora_fechamento]);
    const comerciante_id = t.rows[0].id;
    const senha_hash = await bcrypt.hash(usuario.senha, 10);
    // O primeiro usuário do tenant é gestor (pode reabrir dias fechados).
    await client.query(
      "INSERT INTO usuarios (comerciante_id, email, senha_hash, perfil) VALUES ($1, $2, $3, 'gestor')",
      [comerciante_id, usuario.email, senha_hash]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: comerciante_id, schema_name: `tenant_${comerciante_id}`, fuso, hora_fechamento });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') return res.status(409).json({ error: 'email já cadastrado' });
    next(e);
  } finally {
    client.release();
  }
});

module.exports = ADMIN_TOKEN ? router : null;
