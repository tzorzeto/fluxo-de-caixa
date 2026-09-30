// Consome a fila de lançamentos, grava no schema do tenant e reconsolida o
// saldo do dia, tudo na mesma transação.
require('dotenv').config({ quiet: true });
const db = require('../db');
const { getTenant, dataNoFuso, diaFechado } = require('../tenants');
const { createRabbit, QUEUE_LANCAMENTOS } = require('../rabbit');

const PREFETCH = Number(process.env.WORKER_PREFETCH || 10);
// Pausa antes de devolver uma mensagem à fila em erro transitório. Sem isso,
// com o banco fora, o worker gira em loop quente (medido: ~260 requeues/s).
const RETRY_DELAY_MS = Number(process.env.WORKER_RETRY_DELAY_MS || 2000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Erros de dados (mensagem malformada, tenant inexistente, violação de
// constraint) não adiantam reprocessar: vão direto para a DLQ. Erros de
// infraestrutura voltam para a fila.
class MensagemInvalida extends Error {}

async function processar(msg) {
  let dados;
  try {
    dados = JSON.parse(msg.content.toString());
  } catch {
    throw new MensagemInvalida('JSON inválido');
  }
  const { id, comerciante_id, tipo_movimento, valor, descricao, criado_em, usuario_id, pode_reabrir } = dados;
  if (!id || !comerciante_id || !tipo_movimento || typeof valor !== 'number') {
    throw new MensagemInvalida('Campos obrigatórios ausentes');
  }
  const tenant = await getTenant(comerciante_id);
  if (!tenant) throw new MensagemInvalida(`Comerciante ${comerciante_id} não existe`);

  const inserido = await db.withTenant(tenant, async (c) => {
    const data = dataNoFuso(criado_em || new Date(), tenant.fuso);
    if (await diaFechado(c, data)) {
      // Decisão final sobre dia fechado é aqui: `pode_reabrir` vem do perfil
      // do usuário (gestor). Operador em dia fechado (ou dia que fechou entre
      // o 202 e o processamento) vai para a DLQ, nunca reabre por conta própria.
      if (!pode_reabrir) throw new MensagemInvalida(`Dia ${data} fechado e usuário sem permissão de reabertura`);
      await c.query('SELECT reabrir_dia($1::date, $2)', [data, usuario_id || null]);
    }
    // ON CONFLICT DO NOTHING garante idempotência: redelivery não duplica.
    const r = await c.query(
      `INSERT INTO lancamentos_financeiros (id, tipo_movimento, valor, descricao, criado_em)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING
       RETURNING criado_em`,
      [id, tipo_movimento, valor, descricao || null, criado_em || new Date().toISOString()]
    );
    if (r.rows.length === 0) return false;
    await db.reconsolidarAPartirDe(c, dataNoFuso(r.rows[0].criado_em, tenant.fuso), tenant.fuso);
    return true;
  });

  if (inserido) {
    console.log('Lançamento inserido:', id, `tenant=${tenant.id}`, tipo_movimento, valor);
  } else {
    console.log('Lançamento já processado, ignorando:', id);
  }
}

function isErroDeDados(err) {
  // 22xxx = data exception, 23xxx = integrity constraint violation
  return err instanceof MensagemInvalida || /^2[23]/.test(err.code || '');
}

async function registrarConsumer(ch) {
  await ch.prefetch(PREFETCH);
  await ch.consume(QUEUE_LANCAMENTOS, async (msg) => {
    if (!msg) return;
    try {
      await processar(msg);
      ch.ack(msg);
    } catch (err) {
      if (isErroDeDados(err)) {
        console.error('Mensagem rejeitada para DLQ:', err.message);
        ch.nack(msg, false, false);
      } else {
        // Ex.: banco fora do ar. Espera um pouco e devolve para a fila.
        console.error('Erro transitório, devolvendo para a fila:', err.message);
        await sleep(RETRY_DELAY_MS);
        ch.nack(msg, false, true);
      }
    }
  }, { noAck: false });
  console.log('Worker consumindo a fila', QUEUE_LANCAMENTOS, 'prefetch', PREFETCH);
}

if (require.main === module) {
  const rabbit = createRabbit({ onChannel: registrarConsumer });
  rabbit.connect();
}

module.exports = { processar, isErroDeDados, MensagemInvalida };
