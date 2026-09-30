// Testes de integração da API. Exigem PostgreSQL e RabbitMQ no ar
// (docker compose up db rabbitmq) e um .env apontando para localhost.
const request = require('supertest');
const { app, rabbit } = require('../index');
const { signToken } = require('../src/auth');
const db = require('../src/db');

// Data D-n em YYYY-MM-DD (o seed usa os últimos 10 dias).
const diasAtras = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const D10 = diasAtras(10);

const tokenT1 = signToken({ id: 1, email: 'admin@example.com', comerciante_id: 1, perfil: 'gestor' });
const tokenT2 = signToken({ id: 2, email: 'padaria@example.com', comerciante_id: 2, perfil: 'gestor' });
const auth = (req, token = tokenT1) => req.set('Authorization', `Bearer ${token}`);

async function waitFor(fn, { timeout = 10_000, interval = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

beforeAll(async () => {
  await rabbit.connect();
  await waitFor(() => rabbit.isConnected());
});

afterAll(async () => {
  await rabbit.close();
  await db.pool.end();
});

describe('Autenticação', () => {
  it('retorna token com o tenant do usuário', async () => {
    const res = await request(app).post('/login').send({ email: 'admin@example.com', senha: '123456' });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64url'));
    expect(payload.comerciante_id).toBe(1);
  });

  it('recusa senha inválida', async () => {
    const res = await request(app).post('/login').send({ email: 'admin@example.com', senha: 'errada' });
    expect(res.statusCode).toBe(401);
  });

  it('recusa email inexistente com a mesma resposta', async () => {
    const res = await request(app).post('/login').send({ email: 'ninguem@example.com', senha: '123456' });
    expect(res.statusCode).toBe(401);
  });

  it('recusa acesso sem token', async () => {
    const res = await request(app).get('/saldos-diarios');
    expect(res.statusCode).toBe(401);
  });

  it('recusa token de tenant inexistente', async () => {
    const res = await auth(request(app).get('/saldos-diarios'), signToken({ id: 9, comerciante_id: 999 }));
    expect(res.statusCode).toBe(403);
  });
});

describe('Saldos diários', () => {
  it('lista saldos do tenant', async () => {
    const res = await auth(request(app).get('/saldos-diarios'));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('retorna saldo do dia de exemplo', async () => {
    const res = await auth(request(app).get(`/saldos-diarios/${D10}`));
    expect(res.statusCode).toBe(200);
    expect(res.body.saldo_fim).toBe('770.00');
  });

  it('isola dados entre tenants', async () => {
    const res = await auth(request(app).get(`/saldos-diarios/${D10}`), tokenT2);
    expect(res.statusCode).toBe(200);
    expect(res.body.saldo_fim).toBe('2500.00');
  });

  it('rejeita data malformada', async () => {
    const res = await auth(request(app).get('/saldos-diarios/20-02-2026'));
    expect(res.statusCode).toBe(400);
  });

  it('exige autenticação para reprocessar', async () => {
    const res = await request(app).post(`/saldos-diarios/${D10}/reprocessar`);
    expect(res.statusCode).toBe(401);
  });
});

describe('Lançamentos', () => {
  it('valida o corpo', async () => {
    const res = await auth(request(app).post('/lancamentos')).send({ tipo_movimento: 'X', valor: 10 });
    expect(res.statusCode).toBe(400);
  });

  it('enfileira e responde 202 com id e tenant', async () => {
    const res = await auth(request(app).post('/lancamentos')).send({ tipo_movimento: 'CREDITO', valor: 10.5 });
    expect(res.statusCode).toBe(202);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.lancamento.comerciante_id).toBe(1);
  });

  it('respeita Idempotency-Key', async () => {
    const key = '11111111-2222-4333-8444-555555555555';
    const res = await auth(request(app).post('/lancamentos'))
      .set('Idempotency-Key', key)
      .send({ tipo_movimento: 'DEBITO', valor: 1 });
    expect(res.statusCode).toBe(202);
    expect(res.body.id).toBe(key);
  });

  it('rejeita lançamento fora da janela retroativa', async () => {
    const res = await auth(request(app).post('/lancamentos'))
      .send({ tipo_movimento: 'CREDITO', valor: 1, criado_em: '2020-01-01T10:00:00-03:00' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/janela retroativa de 30 dias/);
  });

  it('rejeita lançamento futuro', async () => {
    const res = await auth(request(app).post('/lancamentos'))
      .send({ tipo_movimento: 'CREDITO', valor: 1, criado_em: '2999-01-01T10:00:00-03:00' });
    expect(res.statusCode).toBe(400);
  });
});

describe('Status', () => {
  it('health check é público', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });

  it('reporta dependências', async () => {
    const res = await auth(request(app).get('/status'));
    expect(res.statusCode).toBe(200);
    expect(res.body.PostgreSQL.ok).toBe(true);
    expect(res.body.RabbitMQ.ok).toBe(true);
  });
});

describe('Isolamento por role de banco', () => {
  it('a role do tenant 1 não consegue ler o schema do tenant 2', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE tenant_1_role');
      await expect(client.query('SELECT * FROM tenant_2.saldos_diarios')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  it('a role do tenant 1 lê o próprio schema', async () => {
    const r = await db.withTenant({ schema_name: 'tenant_1' }, (c) => c.query('SELECT count(*)::int AS n FROM saldos_diarios'));
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});

describe('Admin: provisionamento de tenant', () => {
  const admin = (req) => req.set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`);
  const email = `novo-${Date.now()}@example.com`;

  it('exige token administrativo', async () => {
    const res = await request(app).post('/admin/tenants').send({ nome: 'X', usuario: { email, senha: 'x' } });
    expect(res.statusCode).toBe(401);
  });

  it('cria schema, role e usuário, e o usuário consegue logar e consultar', async () => {
    const criado = await admin(request(app).post('/admin/tenants'))
      .send({ nome: 'Novo Comerciante', fuso: 'America/Recife', usuario: { email, senha: 'segredo' } });
    expect(criado.statusCode).toBe(201);
    expect(criado.body.schema_name).toMatch(/^tenant_\d+$/);

    const login = await request(app).post('/login').send({ email, senha: 'segredo' });
    expect(login.statusCode).toBe(200);

    const saldos = await auth(request(app).get('/saldos-diarios'), login.body.token);
    expect(saldos.statusCode).toBe(200);
    expect(saldos.body).toEqual([]);
  });

  it('rejeita email duplicado', async () => {
    const res = await admin(request(app).post('/admin/tenants'))
      .send({ nome: 'Outro', usuario: { email, senha: 'x' } });
    expect(res.statusCode).toBe(409);
  });
});

describe('Fechamento diário', () => {
  const tokenCaixa = signToken({ id: 3, email: 'caixa@example.com', comerciante_id: 1, perfil: 'operador' });
  const tokenGestor = signToken({ id: 1, email: 'admin@example.com', comerciante_id: 1, perfil: 'gestor' });
  const t1 = { id: 1, schema_name: 'tenant_1', fuso: 'America/Sao_Paulo' };
  const ontem = new Date(); ontem.setUTCDate(ontem.getUTCDate() - 1);
  const dataOntem = ontem.toISOString().slice(0, 10);

  beforeAll(async () => {
    // Garante que ontem existe e está fechado.
    await db.withTenant(t1, async (c) => {
      await c.query('SELECT consolidar_saldo_diario($1::date, $2)', [dataOntem, t1.fuso]);
      await c.query("UPDATE saldos_diarios SET status = 'fechado', fechado_em = NOW() WHERE data = $1", [dataOntem]);
    });
  });

  it('saldo expõe o status do dia', async () => {
    const res = await auth(request(app).get(`/saldos-diarios/${dataOntem}`));
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('fechado');
  });

  it('operador não lança em dia fechado', async () => {
    const res = await auth(request(app).post('/lancamentos'), tokenCaixa)
      .send({ tipo_movimento: 'CREDITO', valor: 1, criado_em: `${dataOntem}T12:00:00-03:00` });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/gestor/);
  });

  it('gestor lança em dia fechado e o dia é reaberto pelo worker', async () => {
    const res = await auth(request(app).post('/lancamentos'), tokenGestor)
      .send({ tipo_movimento: 'CREDITO', valor: 1, descricao: 'reabertura', criado_em: `${dataOntem}T12:00:00-03:00` });
    expect(res.statusCode).toBe(202);
    expect(res.body.lancamento.pode_reabrir).toBe(true);

    const reaberto = await waitFor(async () => {
      const r = await db.withTenant(t1, (c) => c.query('SELECT status, reaberto_por FROM saldos_diarios WHERE data = $1', [dataOntem]));
      return r.rows[0]?.status === 'aberto' && r.rows[0]?.reaberto_por === 1;
    });
    expect(reaberto).toBe(true);
  });

  it('fechar_dias fecha de novo o dia reaberto', async () => {
    const n = await db.withTenant(t1, async (c) => (await c.query("SELECT fechar_dias($1, '18:00') AS n", [t1.fuso])).rows[0].n);
    expect(n).toBeGreaterThanOrEqual(1);
    const r = await auth(request(app).get(`/saldos-diarios/${dataOntem}`));
    expect(r.body.status).toBe('fechado');
    expect(r.body.reaberto_em).not.toBeNull();
  });
});
