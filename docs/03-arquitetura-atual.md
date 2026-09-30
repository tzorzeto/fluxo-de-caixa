# 03 — Arquitetura atual (as-is)

Descreve o que está implementado neste repositório. Serve de ponto de partida
para a arquitetura alvo (doc 04) e para a transição (doc 05).

## C4 — Nível 2: Containers

```mermaid
flowchart LR
  com(["Comerciante<br/>(operador / gestor)"])
  subgraph fc["Fluxo de Caixa (as-is: um deploy, processos separados)"]
    web["Frontend<br/>React / Vite<br/><i>cadastro, consulta, status do dia</i>"]
    api["API<br/>Node.js / Express<br/><i>autenticação, lançamentos, saldos, admin</i>"]
    wl["Worker Lançamentos<br/>Node.js<br/><i>consome a fila, grava, reconsolida</i>"]
    wc["Worker Consolidação<br/>Node.js / cron<br/><i>fechamento diário, rede de segurança</i>"]
    mq[("RabbitMQ<br/>fila lancamentos + DLQ")]
    db[("PostgreSQL<br/>public: comerciantes, usuários<br/>tenant_&lt;id&gt;: lançamentos, saldos")]
  end
  com --> web
  web -- "JSON/HTTP + JWT" --> api
  api -- "publica lancamento.registrado" --> mq
  api -- "lê saldos e lançamentos<br/>(role e schema do tenant)" --> db
  mq -- "entrega" --> wl
  wl -- "INSERT idempotente +<br/>consolidar_saldo_a_partir_de" --> db
  wc -- "fechar_dias +<br/>reconsolida ontem e hoje" --> db
```

## Fluxo de um lançamento

```mermaid
sequenceDiagram
  autonumber
  participant F as Frontend
  participant A as API
  participant MQ as RabbitMQ
  participant W as Worker Lançamentos
  participant DB as PostgreSQL
  F->>A: POST /lancamentos (JWT com comerciante_id, Idempotency-Key opcional)
  A->>A: resolve tenant, valida janela retroativa, gera id
  A->>MQ: publish (persistent, messageId=id)
  A-->>F: 202 { id }
  MQ-->>W: deliver
  W->>DB: BEGIN, SET LOCAL ROLE tenant_<id>_role, SET LOCAL search_path TO tenant_<id>
  W->>DB: INSERT ... ON CONFLICT (id) DO NOTHING
  alt inserido
    W->>DB: consolidar_saldo_a_partir_de(data, fuso) [advisory lock por tenant]
  end
  W->>DB: COMMIT
  W-->>MQ: ack
  alt erro de dados
    W-->>MQ: nack (sem requeue) → DLQ
  else erro transitório
    W-->>MQ: nack (requeue)
  end
```

## Modelo de dados

Schema `public`: catálogo. Schema `tenant_<id>`: dados de cada comerciante, acessados pela role `tenant_<id>_role`.

```mermaid
erDiagram
  comerciantes {
    int id PK
    text nome
    text schema_name "tenant_<id>"
    text fuso
    time hora_fechamento
  }
  usuarios {
    int id PK
    int comerciante_id FK
    text email
    text senha_hash
    text perfil "operador | gestor"
  }
  comerciantes ||--o{ usuarios : "tem"
  comerciantes ||--|| tenant_schema : "possui um schema"
  tenant_schema ||--o{ lancamentos_financeiros : ""
  tenant_schema ||--o{ saldos_diarios : ""
  lancamentos_financeiros {
    uuid id PK
    varchar tipo_movimento "CREDITO | DEBITO"
    numeric valor "> 0"
    text descricao
    timestamptz criado_em
  }
  saldos_diarios {
    date data PK
    numeric saldo_inicio
    numeric total_creditos
    numeric total_debitos
    numeric saldo_fim
    timestamptz atualizado_em
    text status "aberto | fechado"
    timestamptz fechado_em
    timestamptz reaberto_em
    int reaberto_por
  }
  lancamentos_financeiros ||--o{ saldos_diarios : "consolida por dia"
```

## Limitações conhecidas do as-is

O que o exemplo executável **não** faz e a arquitetura alvo (doc 04) resolve:

- **Um único deploy** para API, consolidado e workers: a fronteira entre os
  dois serviços é de módulo, não de deploy (ADR-0003).
- **Um único banco** para lançamentos e read model, com gravação e
  consolidação na mesma transação; no alvo são dois eventos (doc 04).
- **Sem gateway:** TLS, rate limit por tenant e WAF não existem localmente
  (doc 06).
- **Sem cache** no consolidado, por decisão (ADR-0002).
- **Requeue com pausa fixa**, sem backoff nem limite de tentativas (ADR-0007).
- **Observabilidade mínima:** `/health`, `/status` e logs em texto (doc 07).
