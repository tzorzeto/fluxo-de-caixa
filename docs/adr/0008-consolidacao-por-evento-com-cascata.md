# ADR-0008 — Consolidar por evento e recalcular em cascata os dias seguintes

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

O saldo de um dia depende do saldo final do anterior. Um lançamento
retroativo ou editado altera o dia em que cai e todos os seguintes.
Lançamentos do mesmo tenant podem ser processados em paralelo.

## Opções

1. **Recalcular em cascata de D até hoje** *(escolhida)*: autocorretivo,
   reprocessar é a mesma operação, sem caso especial para edição.
2. Atualização incremental (aplicar o delta): mais barato por evento, mas um
   delta duplicado ou perdido deixa o saldo errado até um recálculo completo.
3. Consolidação só periódica: saldo do dia defasado por horas.

## Decisão

Opção 1. Em fluxo de caixa, correção vale mais que microssegundos. Regras:
a cascata vai de D até hoje no fuso do tenant e D nunca é anterior à janela
retroativa; a consolidação de um tenant é serializada com advisory lock,
tenants diferentes rodam em paralelo; gravação e reconsolidação na mesma
transação; recalcular não altera o fechamento do dia.

## Consequências

- Um único caminho de cálculo para evento, edição, reprocessamento e
  fechamento.
- Sem o lock, dois lançamentos do mesmo dia em paralelo perdiam atualização
  (reproduzido: 40 lançamentos → saldo errado; com o lock, 40/40).
- Throughput de consolidação por tenant é limitado; incremental fica como
  evolução, com a cascata mantida como reparo.
