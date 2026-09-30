# ADR-0005 — Usar RabbitMQ como broker

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

A fila (ADR-0001) precisa de entrega garantida com confirmação por
mensagem, redelivery em falha e dead-letter para mensagens inválidas. Volume
na ordem de 1.000 mensagens/dia.

## Opções

1. **RabbitMQ** *(escolhida)*: ack/nack por mensagem, requeue e DLQ nativos,
   prefetch; leve de operar; gerenciado disponível.
2. Kafka: log com replay e vários consumidores; não há caso de replay hoje e
   DLQ/retry seriam código próprio.
3. Fila gerenciada da nuvem (SQS): zero operação, mas amarra a nuvem e não
   roda localmente.

## Decisão

Opção 1: é uma fila de trabalho com garantia de entrega, e RabbitMQ resolve
isso nativamente. Kafka entra se o evento virar fonte para vários domínios
que precisem reler o histórico.

## Consequências

- Fila durável com DLQ, mensagens persistentes, ack manual.
- Broker é dependência crítica da escrita: HA em produção e alerta de
  profundidade das filas.
- Troca por Kafka fica atrás de `src/rabbit.js` e do contrato do evento.
