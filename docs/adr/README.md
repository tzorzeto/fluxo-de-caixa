# ADRs — Architecture Decision Records

Um ADR por decisão. Para mudar uma decisão, crie um novo ADR e marque o
antigo como "substituído por".

| # | Decisão | Status |
|---|---|---|
| [0001](0001-fila-entre-api-e-persistencia.md) | Fila entre a API de lançamentos e a persistência | Proposto |
| [0002](0002-read-model-consolidado.md) | Consolidado como read model pré-calculado | Proposto |
| [0003](0003-estilo-arquitetural.md) | Monólito modular com workers no código; dois serviços no alvo | Proposto |
| [0004](0004-postgresql.md) | PostgreSQL como fonte da verdade (Oracle/SQL Server descartados por custo) | Proposto |
| [0005](0005-rabbitmq.md) | RabbitMQ como broker (Kafka descartado: sem caso de replay) | Proposto |
| [0006](0006-nodejs.md) | Node.js só no exemplo executável; linguagem do produto segue a stack da organização (ex.: .NET) | Proposto |
| [0007](0007-idempotencia-e-dlq.md) | Idempotência por id na origem e DLQ | Proposto |
| [0008](0008-consolidacao-por-evento-com-cascata.md) | Consolidação disparada por evento, com cascata | Proposto |
| [0009](0009-isolamento-de-tenants.md) | Isolamento de tenants por schema, evoluindo para banco por tenant | Proposto |
| [0010](0010-fechamento-diario.md) | Fechamento diário com reabertura controlada por perfil | Proposto |
