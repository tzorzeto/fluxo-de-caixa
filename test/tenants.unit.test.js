jest.mock('../src/db', () => ({ query: jest.fn() }));

const { dataNoFuso, validarJanela } = require('../src/tenants');

const sp = { fuso: 'America/Sao_Paulo' };
const agora = new Date('2026-09-29T12:00:00Z');

describe('dataNoFuso', () => {
  it('converte para a data local do fuso', () => {
    // 01:00 UTC de 21/02 é 22:00 de 20/02 em São Paulo
    expect(dataNoFuso('2026-02-21T01:00:00Z', 'America/Sao_Paulo')).toBe('2026-02-20');
    expect(dataNoFuso('2026-02-21T01:00:00Z', 'UTC')).toBe('2026-02-21');
  });
});

describe('validarJanela', () => {
  it('aceita hoje', () => {
    expect(validarJanela('2026-09-29T10:00:00-03:00', sp, agora)).toBeNull();
  });

  it('aceita o último dia da janela', () => {
    expect(validarJanela('2026-08-30T10:00:00-03:00', sp, agora)).toBeNull();
  });

  it('rejeita um dia antes da janela', () => {
    expect(validarJanela('2026-08-29T10:00:00-03:00', sp, agora)).toMatch(/fora da janela/);
  });

  it('rejeita data futura', () => {
    expect(validarJanela('2026-09-30T10:00:00-03:00', sp, agora)).toMatch(/futuro/);
  });

  it('janela zero aceita só hoje', () => {
    expect(validarJanela('2026-09-29T00:30:00-03:00', sp, agora, 0)).toBeNull();
    expect(validarJanela('2026-09-28T23:30:00-03:00', sp, agora, 0)).toMatch(/fora da janela/);
  });

  it('usa o fuso do tenant para decidir o dia', () => {
    // 02:00 UTC de 30/09 ainda é 29/09 em São Paulo (não é futuro)
    expect(validarJanela('2026-09-30T02:00:00Z', sp, new Date('2026-09-30T01:00:00Z'))).toBeNull();
  });
});
