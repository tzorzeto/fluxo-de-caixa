// Dois papéis, por tenant:
// 1) Fechamento diário: no corte (hora_fechamento, no fuso do tenant), consolida
//    e marca o dia como 'fechado'. Dias reabertos por gestor fecham de novo aqui.
// 2) Rede de segurança: reconsolida ontem e hoje, caso algum lançamento tenha
//    sido inserido sem passar pela fila.
// A consolidação principal acontece por evento, no workerLancamentos.
require('dotenv').config({ quiet: true });
const cron = require('node-cron');
const db = require('../db');
const { listTenants } = require('../tenants');

const CRON = process.env.CONSOLIDAR_CRON || '*/5 * * * *';

async function consolidar() {
  let tenants;
  try {
    tenants = await listTenants();
  } catch (e) {
    console.error('Erro ao listar tenants:', e.message);
    return;
  }
  for (const tenant of tenants) {
    try {
      const fechados = await db.withTenant(tenant, async (c) => {
        // "ontem" calculado no fuso do tenant
        await c.query('SELECT consolidar_saldo_a_partir_de(((NOW() AT TIME ZONE $1)::date - 1), $1)', [tenant.fuso]);
        const r = await c.query('SELECT fechar_dias($1, $2) AS n', [tenant.fuso, tenant.hora_fechamento]);
        return r.rows[0].n;
      });
      console.log(`Tenant ${tenant.id}: consolidado; dias fechados nesta rodada: ${fechados}`);
    } catch (e) {
      console.error(`Tenant ${tenant.id}: erro ao consolidar:`, e.message);
    }
  }
}

if (require.main === module) {
  consolidar();
  cron.schedule(CRON, consolidar);
  console.log('Worker de consolidação agendado:', CRON);
}

module.exports = { consolidar };
