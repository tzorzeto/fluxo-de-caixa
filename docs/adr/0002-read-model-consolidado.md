# ADR-0002 — Servir o consolidado a partir de um read model pré-calculado

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

A carga do enunciado está na leitura do consolidado: 50 req/s por
comerciante (P2), até 1.000 req/s na base inicial (P4), contra escrita na
ordem de 1.000 lançamentos/dia. O texto fala em relatório diário, não em
tempo real.

## Opções

1. Calcular o saldo na leitura: custo cresce com os lançamentos e com a
   cadeia de dias.
2. **Tabela pré-calculada `saldos_diarios`**, atualizada a cada lançamento
   *(escolhida)*: leitura por chave (tenant, dia).
3. Read model + cache Redis: protege a leitura se o banco degradar; mais um
   componente.

## Decisão

Opção 2 agora, opção 3 como evolução. No teste local o read model atendeu
1.000 req/s sem cache (doc 09); cache entra por isolamento e latência em
produção, não por throughput. Atraso aceitável entre lançar e ver no saldo:
segundos.

## Consequências

- `GET /saldos-diarios/{data}` é um SELECT por chave.
- O consolidado depende do banco; se o banco cair, lançamentos seguem (fila)
  e o consolidado fica fora.
- Gatilhos para o cache: p95 em produção acima da meta com o banco já
  dimensionado; custo de IOPS relevante; exigência de manter o consolidado no
  ar durante failover.
