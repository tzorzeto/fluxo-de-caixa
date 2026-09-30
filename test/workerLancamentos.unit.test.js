// Testes unitários do worker: classificação de erros e idempotência,
// com banco e catálogo de tenants mockados. Não precisam de infraestrutura.
jest.mock('../src/db', () => ({
  query: jest.fn(),
  withTenant: jest.fn((tenant, fn) => fn(mockClient)),
  reconsolidarAPartirDe: jest.fn(),
}));
jest.mock('../src/tenants', () => ({
  ...jest.requireActual('../src/tenants'),
  getTenant: jest.fn(),
}));

const mockClient = { query: jest.fn() };
const db = require('../src/db');
const { getTenant } = require('../src/tenants');
const { processar, isErroDeDados, MensagemInvalida } = require('../src/workers/workerLancamentos');

const tenant = { id: 1, schema_name: 'tenant_1', fuso: 'America/Sao_Paulo' };
const msg = (obj) => ({ content: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const lancamento = { id: 'abc', comerciante_id: 1, tipo_movimento: 'CREDITO', valor: 10, criado_em: '2026-02-20T12:00:00Z' };

beforeEach(() => {
  jest.clearAllMocks();
  getTenant.mockResolvedValue(tenant);
});

// Sequência de queries dentro da transação: 1) dia fechado? 2) INSERT [3) reabrir_dia]
const diaAberto = { rows: [] };
const diaFechado = { rows: [{ '?column?': 1 }] };
const inserido = { rows: [{ criado_em: new Date('2026-02-21T01:00:00Z') }] };

describe('processar', () => {
  it('insere no schema do tenant e reconsolida a data do lançamento no fuso dele', async () => {
    mockClient.query.mockResolvedValueOnce(diaAberto).mockResolvedValueOnce(inserido);
    await processar(msg(lancamento));
    expect(db.withTenant).toHaveBeenCalledWith(tenant, expect.any(Function));
    // 01:00 UTC de 21/02 ainda é 20/02 em São Paulo
    expect(db.reconsolidarAPartirDe).toHaveBeenCalledWith(mockClient, '2026-02-20', 'America/Sao_Paulo');
  });

  it('não reconsolida quando o id já existe (redelivery)', async () => {
    mockClient.query.mockResolvedValueOnce(diaAberto).mockResolvedValueOnce({ rows: [] });
    await processar(msg(lancamento));
    expect(db.reconsolidarAPartirDe).not.toHaveBeenCalled();
  });

  it('dia fechado sem autorização vai para a DLQ, sem inserir', async () => {
    mockClient.query.mockResolvedValueOnce(diaFechado);
    await expect(processar(msg(lancamento))).rejects.toBeInstanceOf(MensagemInvalida);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it('dia fechado com autorização reabre antes de inserir', async () => {
    mockClient.query.mockResolvedValueOnce(diaFechado).mockResolvedValueOnce({}).mockResolvedValueOnce(inserido);
    await processar(msg({ ...lancamento, pode_reabrir: true, usuario_id: 7 }));
    expect(mockClient.query.mock.calls[1][0]).toMatch(/reabrir_dia/);
    expect(mockClient.query.mock.calls[1][1]).toEqual(['2026-02-20', 7]);
    expect(db.reconsolidarAPartirDe).toHaveBeenCalled();
  });

  it('rejeita JSON inválido como erro de dados', async () => {
    await expect(processar(msg('{nope'))).rejects.toBeInstanceOf(MensagemInvalida);
  });

  it('rejeita mensagem sem comerciante_id', async () => {
    const { comerciante_id, ...semTenant } = lancamento;
    await expect(processar(msg(semTenant))).rejects.toBeInstanceOf(MensagemInvalida);
  });

  it('rejeita tenant inexistente como erro de dados', async () => {
    getTenant.mockResolvedValue(null);
    await expect(processar(msg(lancamento))).rejects.toBeInstanceOf(MensagemInvalida);
  });
});

describe('isErroDeDados', () => {
  it('trata violação de constraint como erro de dados', () => {
    expect(isErroDeDados(Object.assign(new Error(), { code: '23514' }))).toBe(true);
  });

  it('trata falha de conexão como erro transitório', () => {
    expect(isErroDeDados(Object.assign(new Error(), { code: 'ECONNREFUSED' }))).toBe(false);
  });
});
