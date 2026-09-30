const express = require('express');
const { authMiddleware } = require('../auth');
const db = require('../db');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const router = express.Router();

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const r = await db.withTenant(req.tenant, (c) => c.query(
      `SELECT data, saldo_inicio, total_creditos, total_debitos, saldo_fim, status, fechado_em, reaberto_em
         FROM saldos_diarios
        ORDER BY data`
    ));
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:data', authMiddleware, async (req, res, next) => {
  const { data } = req.params;
  if (!ISO_DATE.test(data)) {
    return res.status(400).json({ error: 'Data inválida (YYYY-MM-DD)' });
  }
  try {
    const r = await db.withTenant(req.tenant, (c) => c.query(
      `SELECT data, saldo_inicio, total_creditos, total_debitos, saldo_fim, status, fechado_em, reaberto_em
         FROM saldos_diarios
        WHERE data = $1`,
      [data]
    ));
    if (r.rows.length === 0) {
      return res.status(404).json({ error: `Nenhum saldo encontrado para ${data}` });
    }
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// Reprocessa a data informada e todos os dias seguintes.
router.post('/:data/reprocessar', authMiddleware, async (req, res, next) => {
  const { data } = req.params;
  if (!ISO_DATE.test(data)) {
    return res.status(400).json({ error: 'Data inválida (YYYY-MM-DD)' });
  }
  try {
    await db.withTenant(req.tenant, (c) => db.reconsolidarAPartirDe(c, data, req.tenant.fuso));
    res.json({ status: 'ok', message: `Saldo reprocessado a partir de ${data}` });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
