# 07 — Observabilidade

## O que existe

| Sinal | Onde | Para quê |
|---|---|---|
| `GET /health` | API, sem autenticação | Probe de liveness/readiness |
| `GET /status` | API, autenticado; página "Status dos Serviços" no frontend | Diz se PostgreSQL e RabbitMQ estão acessíveis |
| Logs em texto | stdout de API e workers (`docker compose logs`) | Cada linha do worker traz o id do lançamento e o tenant |
| RabbitMQ Management | http://localhost:15672 | Profundidade da fila `lancamentos` e da `lancamentos.dlq` |

## Observabilidade na versão alvo

- **Logs:** JSON estruturado com `request_id`, `comerciante_id` e
  `message_id`, agregados (Loki ou CloudWatch Logs). O `request_id` gerado no
  gateway vai na resposta 202 e na mensagem da fila; com ele dá para
  responder "onde está o lançamento X?" (fila, DLQ, gravado, consolidado) sem
  consultar o banco.
- **Métricas:** OpenTelemetry na API e nos workers → Prometheus/Grafana. As
  que importam:
  - latência p95 de `POST /lancamentos` e de `GET /saldos-diarios/*`;
  - requisições/s por comerciante (mede quanto os picos coincidem, P4, e
    alimenta o rate limit por tenant);
  - profundidade da fila e da DLQ; tempo fila → ack por comerciante;
  - dias fechados por rodada do worker de consolidação;
  - conexões do pool em uso; tempo de query e tamanho por schema (sinais do
    ADR-0009 para separar um comerciante em banco próprio).
- **Traces:** request → publish → consume → transação no banco, ligados pelo
  mesmo trace id; o mesmo id aparece no log do consolidador.
- **Alertas:**
  - `lancamentos.dlq` > 0 (cada mensagem é um lançamento aceito e não gravado);
  - fila `lancamentos` crescendo por 10 minutos (worker parado ou banco lento);
  - broker indisponível (`POST /lancamentos` respondendo 503);
  - erros 5xx acima de 1% em 5 minutos;
  - comerciante com dia ainda aberto 10 minutos depois do corte.
- **SLOs (janela de 30 dias):**

| SLO | Meta |
|---|---|
| Disponibilidade de `POST /lancamentos` (sem 5xx/503) | 99,9% |
| Sucesso de `GET /saldos-diarios/*` em pico | ≥ 95% (enunciado); meta interna 99,5% |
| Atraso entre o 202 e o saldo atualizado | ≤ 30 s |
