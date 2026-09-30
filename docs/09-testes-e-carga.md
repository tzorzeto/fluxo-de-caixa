# 09 — Testes

## O que existe

| Teste | O que prova | Como rodar | Resultado |
|---|---|---|---|
| Unitários (16) | Regras de janela retroativa e fuso; idempotência e classificação de erro no consumo da fila; reabertura só com permissão | `npm test` | Passam |
| Integração (26) | Rotas, autenticação, isolamento entre tenants (dados e role de banco), janela retroativa, fechamento e reabertura, provisionamento | `docker compose up -d db rabbitmq && npm test` | Passam |
| Frontend (4) | Telas de login, lançamentos, saldos e status | `cd frontend && npm test` | Passam |
| Carga, 1 comerciante | RNF-02: 50 req/s no consolidado com ≤ 5% de perda | `load/k6-consolidado.js` | 0% de falha, p95 4,7 ms |
| Carga, 20 comerciantes | RNF-02b: 20 × 50 = 1.000 req/s sem um comerciante degradar os outros | `load/k6-consolidado-multitenant.js` | 0% de falha, p95 1,1 ms |
| Carga, escrita | Nenhum lançamento aceito (202) se perde na fila | `load/k6-lancamentos.js` + `count(*)` no banco | Contagem bate |
| Caos (manual) | RNF-01 e RNF-03: broker fora → consultas seguem, escrita responde 503 e volta sozinha; banco fora → lançamentos continuam aceitos, ficam na fila e são gravados quando o banco volta | roteiro abaixo | 15/15 aceitos com o banco parado; 15/15 gravados ao voltar; DLQ vazia |

Os testes de carga rodaram em máquina local, sem rede e com o banco ocioso.
Servem para provar que o desenho atende o enunciado, não para dimensionar
produção: cache e réplicas se justificam por isolamento e latência de rede
(ADR-0002), não por esses números.

Os scripts de carga rodam com Docker, sem instalar nada; o comando está no
cabeçalho de cada arquivo em `load/`.

### Roteiro de caos

1. `docker compose stop rabbitmq` → `GET /saldos-diarios` responde 200 e
   `POST /lancamentos` responde 503.
2. `docker compose start rabbitmq` → `POST /lancamentos` volta a 202 sem
   reiniciar a API.
3. `docker compose stop db` → `POST /lancamentos` continua respondendo 202;
   mensagens ficam na fila; `GET` responde 500.
4. `docker compose start db` → fila drena; `count(*)` no banco bate com o
   número de 202; `lancamentos.dlq` vazia.

## Testes na versão alvo

- **Contrato:** validar a API contra o OpenAPI e o evento
  `lancamento.registrado` contra um JSON Schema, para os dois serviços
  evoluírem sem se quebrar.
- **Carga com leitura e escrita ao mesmo tempo:** medir o efeito da cascata
  de reconsolidação e do lock por tenant sobre a latência das consultas; é o
  cenário que decide quando ligar o cache.
- **Caos automatizado no pipeline:** o roteiro acima como teste de aceitação,
  rodando a cada release.
- **Mutação** nas regras de janela retroativa e fechamento, que são as que
  mais mudam e menos aparecem em teste de integração.
- **Restore do banco** a partir do backup, com reconstrução do read model,
  para provar o RPO/RTO assumido.
