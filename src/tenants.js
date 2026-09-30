const db = require('./db');

const CACHE_TTL_MS = Number(process.env.TENANT_CACHE_TTL_MS || 60_000);
// Janela retroativa única para todos os comerciantes (configurável por
// comerciante é requisito futuro, RF-11).
const DIAS_RETROATIVOS = Number(process.env.DIAS_RETROATIVOS ?? 30);
const cache = new Map();

// Configuração do tenant (schema, fuso, janela retroativa), com cache curto
// para não bater no catálogo a cada request.
async function getTenant(id) {
  const hit = cache.get(id);
  if (hit && hit.expira > Date.now()) return hit.tenant;

  try {
    const r = await db.query(
      'SELECT id, nome, schema_name, fuso, hora_fechamento FROM comerciantes WHERE id = $1',
      [id]
    );
    const tenant = r.rows[0] || null;
    if (tenant) cache.set(id, { tenant, expira: Date.now() + CACHE_TTL_MS });
    return tenant;
  } catch (err) {
    // Banco fora: serve a configuração em cache mesmo vencida, para que o
    // caminho de escrita (RNF-01) não dependa do banco.
    if (hit) {
      console.warn(`Catálogo indisponível (${err.message}); usando cache vencido do tenant ${id}`);
      return hit.tenant;
    }
    throw err;
  }
}

async function listTenants() {
  const r = await db.query('SELECT id, nome, schema_name, fuso, hora_fechamento FROM comerciantes ORDER BY id');
  return r.rows;
}

// Data (YYYY-MM-DD) de um instante, no fuso informado.
function dataNoFuso(instante, fuso) {
  return new Date(instante).toLocaleDateString('en-CA', { timeZone: fuso });
}

// Valida se a data do lançamento cabe na janela retroativa (no fuso do tenant).
// Retorna a mensagem de erro, ou null se válido.
function validarJanela(criadoEm, tenant, agora = new Date(), diasRetroativos = DIAS_RETROATIVOS) {
  const data = dataNoFuso(criadoEm, tenant.fuso);
  const hoje = dataNoFuso(agora, tenant.fuso);
  if (data > hoje) return 'criado_em não pode ser no futuro';

  const limite = new Date(agora);
  limite.setUTCDate(limite.getUTCDate() - diasRetroativos);
  const dataLimite = dataNoFuso(limite, tenant.fuso);
  if (data < dataLimite) {
    return `criado_em fora da janela retroativa de ${diasRetroativos} dias (mínimo ${dataLimite})`;
  }
  return null;
}

// Dentro de withTenant: o dia está fechado?
async function diaFechado(client, data) {
  const r = await client.query("SELECT 1 FROM saldos_diarios WHERE data = $1 AND status = 'fechado'", [data]);
  return r.rows.length > 0;
}

const podeReabrir = (user) => user.perfil === 'gestor';

module.exports = { getTenant, listTenants, dataNoFuso, validarJanela, diaFechado, podeReabrir, DIAS_RETROATIVOS, _cache: cache };
