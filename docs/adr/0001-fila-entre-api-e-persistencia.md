# ADR-0001 — Usar fila entre a API de lançamentos e a persistência

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

O enunciado exige que lançamentos continuem funcionando se o consolidado
cair (RNF-01). Cada lançamento gravado dispara a reconsolidação do dia e dos
seguintes, que é a parte cara da escrita.

## Opções

1. INSERT síncrono no request: simples, mas banco lento vira erro para o
   usuário e a consolidação roda dentro do request.
2. **Fila entre API e banco** *(escolhida)*: a API só depende do broker;
   banco fora vira atraso, não erro.
3. Outbox no banco: continua dependendo do banco no request, não atende o
   RNF-01.

## Decisão

Opção 2. A fila é o que faz o RNF-01 valer por construção: o caminho de
escrita não toca o banco. Proteção contra pico é consequência, não motivo;
no volume inicial um INSERT bastaria.

## Consequências

- O cliente recebe 202 com o id, não o saldo; atraso de segundos até o saldo
  refletir.
- Nada no caminho do `POST` pode exigir o banco: configuração do tenant vem
  do cache ou do token; a verificação de dia fechado enfileira mesmo sem
  resposta (ADR-0010). O teste de caos com o banco parado (doc 09) verifica
  isso.
- Idempotência obrigatória (ADR-0007); broker precisa de HA e monitoramento.
- Se o broker cair, `POST` responde 503 e consultas seguem: preferimos
  depender do broker a depender do banco.
