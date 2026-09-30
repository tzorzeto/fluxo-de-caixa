const express = require('express');
const { randomUUID } = require('crypto');
const { authMiddleware } = require('../auth');
const db = require('../db');
const { validarJanela, dataNoFuso, diaFechado, podeReabrir } = require('../tenants');
const { QUEUE_LANCAMENTOS } = require('../rabbit');

const TIPOS = ['CREDITO', 'DEBITO'];

module.exports = ({ rabbit }) => {
  const router = express.Router();

  // Enfileira o lançamento. Responde 202 com o id que o cliente usa para
  // consultar/idempotência; um retry com o mesmo id não duplica no banco.
  router.post('/', authMiddleware, async (req, res) => {
    const { tipo_movimento, valor, descricao, criado_em } = req.body || {};
    if (!TIPOS.includes(tipo_movimento)) {
      return res.status(400).json({ error: 'tipo_movimento deve ser CREDITO ou DEBITO' });
    }
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({ error: 'valor deve ser número > 0' });
    }
    if (criado_em && Number.isNaN(Date.parse(criado_em))) {
      return res.status(400).json({ error: 'criado_em deve ser data ISO 8601' });
    }
    const instante = criado_em || new Date().toISOString();
    const erroJanela = validarJanela(instante, req.tenant);
    if (erroJanela) {
      return res.status(400).json({ error: erroJanela });
    }

    // Lançar em dia fechado reabre o dia: só gestor pode. Aqui a API só
    // recusa o operador na hora, com mensagem clara; quem decide de fato é o
    // worker, usando `pode_reabrir`. Se o banco estiver fora, enfileira
    // mesmo assim (RNF-01).
    const data = dataNoFuso(instante, req.tenant.fuso);
    const pode_reabrir = podeReabrir(req.user);
    if (!pode_reabrir) {
      try {
        if (await db.withTenant(req.tenant, (c) => diaFechado(c, data))) {
          return res.status(409).json({ error: `Dia ${data} está fechado; reabrir exige perfil gestor` });
        }
      } catch (e) {
        console.warn('Não foi possível verificar fechamento; enfileirando mesmo assim:', e.message);
      }
    }

    const ch = rabbit.getChannel();
    if (!ch) {
      return res.status(503).json({ error: 'Serviço de lançamentos temporariamente indisponível' });
    }

    const id = req.get('Idempotency-Key') || randomUUID();
    const msg = {
      id,
      comerciante_id: req.tenant.id,
      tipo_movimento,
      valor,
      descricao: descricao || null,
      criado_em: instante,
      usuario_id: req.user.id,
      pode_reabrir,
    };
    try {
      ch.sendToQueue(QUEUE_LANCAMENTOS, Buffer.from(JSON.stringify(msg)), {
        persistent: true,
        contentType: 'application/json',
        messageId: id,
      });
      return res.status(202).json({ status: 'enfileirado', id, lancamento: msg });
    } catch (e) {
      console.error('Erro ao publicar no RabbitMQ:', e.message);
      return res.status(503).json({ error: 'Falha ao enfileirar lançamento' });
    }
  });

  router.get('/', authMiddleware, async (req, res, next) => {
    try {
      const r = await db.withTenant(req.tenant, (c) => c.query(
        `SELECT id, tipo_movimento, valor, descricao, criado_em
           FROM lancamentos_financeiros
          ORDER BY criado_em DESC
          LIMIT 500`
      ));
      res.json(r.rows);
    } catch (e) {
      next(e);
    }
  });

  router.put('/:id', authMiddleware, async (req, res, next) => {
    const { id } = req.params;
    const { tipo_movimento, valor, descricao } = req.body || {};
    if (tipo_movimento && !TIPOS.includes(tipo_movimento)) {
      return res.status(400).json({ error: 'tipo_movimento deve ser CREDITO ou DEBITO' });
    }
    if (valor !== undefined && (typeof valor !== 'number' || valor <= 0)) {
      return res.status(400).json({ error: 'valor deve ser número > 0' });
    }
    const campos = [];
    const params = [];
    if (tipo_movimento) { params.push(tipo_movimento); campos.push(`tipo_movimento = $${params.length}`); }
    if (valor !== undefined) { params.push(valor); campos.push(`valor = $${params.length}`); }
    if (descricao !== undefined) { params.push(descricao); campos.push(`descricao = $${params.length}`); }
    if (campos.length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }
    params.push(id);
    try {
      const resultado = await db.withTenant(req.tenant, async (c) => {
        const atual = await c.query('SELECT criado_em FROM lancamentos_financeiros WHERE id = $1', [id]);
        if (atual.rows.length === 0) return { status: 404 };
        // Edição respeita a mesma janela retroativa do cadastro.
        const erroJanela = validarJanela(atual.rows[0].criado_em, req.tenant);
        if (erroJanela) return { status: 409, error: `Lançamento fora da janela editável: ${erroJanela}` };

        // Editar em dia fechado reabre o dia: só gestor pode.
        const data = dataNoFuso(atual.rows[0].criado_em, req.tenant.fuso);
        if (await diaFechado(c, data)) {
          if (!podeReabrir(req.user)) return { status: 409, error: `Dia ${data} está fechado; reabrir exige perfil gestor` };
          await c.query('SELECT reabrir_dia($1::date, $2)', [data, req.user.id]);
        }

        const r = await c.query(
          `UPDATE lancamentos_financeiros
              SET ${campos.join(', ')}
            WHERE id = $${params.length}
            RETURNING id, tipo_movimento, valor, descricao, criado_em`,
          params
        );
        // Alterar um lançamento muda o saldo daquele dia e de todos os seguintes.
        await db.reconsolidarAPartirDe(c, dataNoFuso(r.rows[0].criado_em, req.tenant.fuso), req.tenant.fuso);
        return { status: 200, body: r.rows[0] };
      });
      if (resultado.status === 404) return res.status(404).json({ error: 'Lançamento não encontrado' });
      if (resultado.status === 409) return res.status(409).json({ error: resultado.error });
      res.json(resultado.body);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
