# 04 — Arquitetura alvo

Dois serviços com deploy independente, **Lançamentos** e **Consolidado**,
que se comunicam só pelo evento `lancamento.registrado` (ADR-0003). O
desenho responde a três exigências: lançamentos nunca param (RNF-01), a
leitura domina e é servida por um read model (P2, P4, ADR-0002), e os
comerciantes são isolados nos dados e na API (P1, ADR-0009). Entre a base
inicial e o pico o que muda é réplica e tamanho de instância, não o desenho.
O código deste repositório é a mesma arquitetura em um único deploy.

## C4 — Nível 1: Contexto

```mermaid
C4Context
  title Fluxo de Caixa — Contexto (alvo)
  Person(op, "Operador de caixa", "Registra lançamentos")
  Person(ges, "Gestor", "Consulta saldos, reabre dias fechados")
  System(fc, "Fluxo de Caixa", "Lançamentos e saldo diário consolidado, multi-tenant")
  System_Ext(idp, "Provedor de identidade", "Evolução: OIDC")
  Rel(op, fc, "Usa", "HTTPS")
  Rel(ges, fc, "Usa", "HTTPS")
  Rel(fc, idp, "Autentica", "OIDC")
```

## C4 — Nível 2: Containers

```mermaid
flowchart TB
  usr(["Usuário do comerciante"])
  web["Frontend<br/>React<br/><i>cadastro, consulta, status do dia</i>"]
  gw["API Gateway<br/><i>TLS, JWT, rate limit por tenant, WAF</i> (doc 06)"]

  subgraph sl["Serviço de Lançamentos"]
    api_l["API de Lançamentos<br/><i>valida, aplica janela retroativa e fechamento, enfileira</i> (ADR-0001)"]
    wk_l["Worker de Lançamentos<br/><i>grava no schema do tenant, idempotente</i> (ADR-0007)"]
    db_l[("Banco de Lançamentos<br/>PostgreSQL, schema por tenant<br/><i>fonte da verdade</i> (ADR-0004, 0009)")]
  end

  mq[("Broker<br/>RabbitMQ em HA<br/><i>lancamentos + DLQ</i> (ADR-0005)")]

  subgraph sc["Serviço de Consolidado"]
    wk_c["Consolidador<br/><i>consome o evento, cascata por tenant, fechamento diário</i> (ADR-0008, 0010)"]
    rm[("Read model<br/>PostgreSQL saldos_diarios<br/><i>pré-calculado</i> (ADR-0002)")]
    api_c["API de Consolidado<br/><i>GET saldos, 50 req/s por tenant</i>"]
    cache[("Cache<br/>Redis, chave (tenant, dia)<br/><i>evolução</i> (ADR-0002)")]
  end

  obs["Observabilidade<br/>OpenTelemetry → Prometheus / Grafana / Loki<br/><i>métricas por tenant, DLQ, filas</i> (doc 07)"]

  usr --> web
  web -- "JSON/HTTPS + JWT" --> gw
  gw -- "POST /lancamentos" --> api_l
  gw -- "GET /saldos-diarios" --> api_c
  api_l -- "lancamento.registrado" --> mq
  mq -- "entrega" --> wk_l
  wk_l -- "INSERT idempotente" --> db_l
  wk_l -- "lancamento.gravado (via outbox)" --> mq
  mq -- "entrega" --> wk_c
  wk_c -- "consolidar_saldo_a_partir_de" --> rm
  api_c -- "SELECT por (tenant, dia)" --> rm
  api_c -. "get / set" .-> cache
  wk_c -. "invalida" .-> cache
  sl -.-> obs
  sc -.-> obs

  style cache stroke-dasharray: 5 5
```

**Dois eventos, não um.** No código de hoje o mesmo worker grava e consolida
na mesma transação. Ao separar os serviços, Lançamentos publica
`lancamento.gravado` depois do commit (via outbox) e o Consolidado consome
esse evento. A fonte da verdade continua sendo o banco de lançamentos e o
read model é reconstruível a partir dele.

## Fluxo de um lançamento (alvo)

```mermaid
sequenceDiagram
  autonumber
  participant F as Frontend
  participant G as Gateway
  participant AL as API Lançamentos
  participant MQ as Broker
  participant WL as Worker Lançamentos
  participant DBL as Banco Lançamentos
  participant C as Consolidador
  participant RM as Read model
  F->>G: POST /lancamentos (JWT, Idempotency-Key)
  G->>G: TLS, valida JWT, rate limit por tenant
  G->>AL: encaminha
  AL->>AL: janela retroativa, dia fechado? exige gestor
  AL->>MQ: lancamento.registrado {id, tenant, ..., pode_reabrir}
  AL-->>F: 202 {id}
  MQ-->>WL: entrega
  WL->>DBL: INSERT ... ON CONFLICT DO NOTHING (+ outbox)
  WL->>MQ: lancamento.gravado
  MQ-->>C: entrega
  C->>RM: reabrir_dia (se marcado), consolidar_saldo_a_partir_de(data, fuso) [lock por tenant]
  Note over C,RM: evolução: invalida cache (tenant, dia)
```

## Topologia de deploy (AWS)

```mermaid
flowchart TB
  subgraph Internet
    U[Usuários / Integrações]
  end
  U --> WAF[WAF + ALB / API Gateway]
  subgraph VPC
    subgraph AZ-a
      A1[API Lançamentos]
      C1[API Consolidado]
      W1[Workers]
    end
    subgraph AZ-b
      A2[API Lançamentos]
      C2[API Consolidado]
      W2[Workers]
    end
    WAF --> A1 & A2 & C1 & C2
    A1 & A2 --> MQ[(Amazon MQ · RabbitMQ<br/>active/standby)]
    MQ --> W1 & W2
    W1 & W2 --> DB[(RDS PostgreSQL<br/>multi-AZ)]
    C1 & C2 --> DB
    C1 & C2 -.-> R[(ElastiCache Redis<br/>evolução)]
    A1 & A2 & C1 & C2 & W1 & W2 --> O[CloudWatch / OTel collector]
  end
  SM[(Secrets Manager)] -.-> A1 & A2 & C1 & C2 & W1 & W2
```

Serviços em ECS Fargate com autoscaling (por CPU; workers pela profundidade
da fila). Cenários de dimensionamento no doc 08.

## Atendimento aos RNFs

| RNF | Como a arquitetura alvo atende | Evidência |
|---|---|---|
| RNF-01 lançamentos independem do consolidado | Serviços e deploys separados; escrita depende só do broker (ADR-0001, ADR-0003) | Teste de caos (doc 09) |
| RNF-02 50 req/s por tenant, ≤ 5% perda | Read model por chave (ADR-0002); API de consolidado escala horizontalmente | k6 1 tenant: 0% falha, p95 4,7 ms (doc 09) |
| RNF-02b vários tenants em pico sem degradar os outros | Rate limit por tenant no gateway; schema/role por tenant; lock de consolidação por tenant | k6 20 × 50 req/s: 0% falha (doc 09) |
| RNF-03 nenhum 202 se perde | Fila persistente, ack manual, idempotência, DLQ (ADR-0007) | Testes unitários do worker; conferência fila + DLQ + banco |
| RNF-04 atraso de consolidação | Consolidação por evento; segundos (ADR-0002) | Métrica fila→ack (doc 07) |
| RNF-05 segurança | Gateway (TLS, JWT, WAF), perfis, role por tenant no banco (doc 06) | Testes de autorização |
| RNF-06 escalabilidade | Fargate autoscaling; workers escalam por fila; leitura por réplica/cache | — |
| RNF-07 observabilidade | OTel em todos os containers; métricas por tenant; alertas de DLQ e fila | doc 07 |
| RNF-08 recuperação | RPO/RTO definidos pelo SLA do banco gerenciado (RDS multi-AZ: replicação síncrona e backup contínuo com point-in-time). A fila persistente segura os lançamentos aceitos durante um failover, e o read model é reconstruível a partir dos lançamentos; por isso a escrita de lançamentos tem RTO efetivo próximo de zero | SLA do provedor; teste de restore documentado (evolução) |

## Falhas e escala

| Situação | O que acontece | Como escala |
|---|---|---|
| Banco de lançamentos fora | API continua aceitando (202); workers fazem requeue; fila drena ao voltar, nada se perde | — |
| Broker fora | `POST` responde 503 e o cliente repete com a mesma `Idempotency-Key`; consultas seguem; reconexão automática | Broker em HA |
| Consolidador fora | Lançamentos continuam gravados; saldos ficam defasados até consumir o backlog | Mais workers, pela profundidade da fila |
| Read model corrompido | Reconstruído a partir dos lançamentos (`reprocessar`) | — |
| Uma AZ fora | Réplicas na outra AZ; failover do RDS multi-AZ | — |
| Pico de leitura | Read model por chave; réplica de leitura; cache como evolução (ADR-0002) | API de consolidado por CPU |
| Pico de escrita | Fila absorve; consolidação serializada por tenant (ADR-0008) | Workers pela fila; incremental como evolução |
| Crescimento de comerciantes | Schema por tenant; banco dedicado por sinal (ADR-0009) | Particionamento mensal de lançamentos |

Timeouts e retry com backoff em todas as chamadas de saída.

## Integração

- **Protocolos:** HTTPS/JSON para clientes, com OpenAPI versionado por path
  (`/v1`); AMQP entre serviços.
- **Eventos:** `lancamento.registrado` (API → worker) e `lancamento.gravado`
  (worker → consolidador), JSON com `schema_version`, `id`, `comerciante_id`,
  `criado_em`, `pode_reabrir`, `usuario_id`.
- **Versionamento:** mudanças compatíveis adicionam campos; incompatíveis
  criam `v2` com período de convivência.

## Evoluções futuras

- Cache do consolidado (ADR-0002) e consolidação incremental (ADR-0008),
  quando os sinais aparecerem.
- Banco dedicado por comerciante ou por grupo (ADR-0009).
- Provedor de identidade externo e autorização por permissão (ADR-0010).
- Backoff e limite de tentativas antes da DLQ, com ferramenta de
  reprocessamento (ADR-0007).
