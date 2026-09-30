# ADR-0007 — Gerar o id na origem e usar DLQ para mensagens inválidas

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

A fila entrega pelo menos uma vez: se o worker gravar e cair antes do ack, a
mensagem volta e o lançamento entraria duas vezes. Mensagens inválidas não
podem ser descartadas em silêncio nem voltar para a fila para sempre.
RNF-03: nenhum 202 se perde.

## Opções

1. **Id UUID gerado na API antes de enfileirar** (ou `Idempotency-Key` do
   cliente) + `ON CONFLICT DO NOTHING` *(escolhida)*.
2. Tabela de mensagens processadas: mesmo efeito com mais uma escrita.
3. "Exatamente uma vez" no broker: não existe na prática.

Para mensagens inválidas: descartar (perde), requeue infinito (trava) ou
**DLQ** *(escolhida)*.

## Decisão

Idempotência por id na origem; o worker classifica o erro: dados (JSON
inválido, tenant inexistente, constraint, dia fechado sem permissão) → DLQ;
transitório (banco fora) → pausa de 2 s e requeue.

## Consequências

- "Nenhum 202 se perde" é verificável: fila + DLQ + banco somam o total.
- Sem a pausa, o teste de caos mediu ~260 requeues/s (loop quente).
  Evolução: backoff exponencial e limite de tentativas.
- Alguém precisa olhar a DLQ: alerta e processo de reprocessamento.
