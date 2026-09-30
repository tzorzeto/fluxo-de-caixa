const express = require('express');
const bcrypt = require('bcrypt');
const { signToken } = require('../auth');
const db = require('../db');

// Hash de referência para manter tempo de resposta constante quando o email
// não existe (evita enumeração de usuários por timing).
const HASH_DUMMY = '$2b$10$RKMENop/O3RwOZKZrJPRB.LpybhhJeZRLhTkEIhx7ysCFwg2oByvG';

const router = express.Router();

router.post('/login', async (req, res, next) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }
  try {
    const r = await db.query(
      `SELECT u.id, u.email, u.senha_hash, u.comerciante_id, u.perfil,
              c.schema_name, c.fuso, c.hora_fechamento
         FROM usuarios u JOIN comerciantes c ON c.id = u.comerciante_id
        WHERE u.email = $1`,
      [email]
    );
    const usuario = r.rows[0];
    const ok = await bcrypt.compare(senha, usuario ? usuario.senha_hash : HASH_DUMMY);
    if (!usuario || !ok) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    // Snapshot da configuração do tenant no token: fallback para o caminho de
    // escrita continuar aceitando lançamentos se o catálogo estiver fora (RNF-01).
    const token = signToken({
      id: usuario.id,
      email: usuario.email,
      comerciante_id: usuario.comerciante_id,
      perfil: usuario.perfil,
      tenant: {
        id: usuario.comerciante_id,
        schema_name: usuario.schema_name,
        fuso: usuario.fuso,
        hora_fechamento: usuario.hora_fechamento,
      },
    });
    res.json({ token });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
