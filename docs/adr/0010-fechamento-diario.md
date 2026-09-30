# ADR-0010 — Adotar fechamento diário com reabertura controlada por perfil

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

O enunciado pede um relatório de saldo diário consolidado. Na operação real
existe o fechamento de caixa: em um horário de corte o dia termina e o saldo
vira o valor oficial. A consolidação contínua (ADR-0008) entrega o saldo a
qualquer momento, mas não distingue "parcial" de "final".

## Opções

1. Só consolidação contínua: o relatório não diz se o dia acabou; qualquer
   usuário altera o passado sem rastro.
2. Fechamento com lançamento em dia fechado rejeitado: conflita com a janela
   retroativa; correções distorcem o dia corrente.
3. **Fechamento com reabertura por permissão** *(escolhida)*: dia reabre, é
   reconsolidado e fecha de novo no próximo corte; só gestor pode; fica
   registrado quem e quando.
4. Snapshots por faixa de horário: o saldo contínuo já responde isso
   consultando os lançamentos do dia.

## Decisão

Opção 3. Cada tenant tem `hora_fechamento` no seu fuso; no corte, o worker
consolida e marca o dia como fechado. Lançar ou editar em dia fechado reabre
o dia e exige perfil gestor. Lançamento depois do corte, no mesmo dia, conta
como reabertura: a data do fato prevalece.

## Consequências

- O relatório passa a ter semântica: parcial (aberto) ou final (fechado).
- Quem decide sobre dia fechado é o worker, não a API: a API verifica para
  recusar o operador na hora, mas se não conseguir verificar enfileira do
  mesmo jeito (RNF-01); a mensagem carrega `pode_reabrir`. Essa regra veio do
  teste de caos: a primeira versão consultava o banco na API e derrubou os
  lançamentos junto com ele.
- Reprocessar saldo recalcula sem alterar o status.
- Evolução: autorização por permissão em vez de perfil; trilha de auditoria
  própria.
