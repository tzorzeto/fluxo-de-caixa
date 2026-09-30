# Fluxo de Caixa — Lançamentos e Saldo Diário Consolidado

Solução para o desafio de Arquitetura de Soluções: um comerciante registra
lançamentos (créditos e débitos) e consulta o saldo diário consolidado.

> **Este repositório é um exemplo executável da arquitetura, não a arquitetura
> alvo.** No código, lançamentos e consolidado são módulos de um monólito com
> workers, rodando com `docker compose`. Na arquitetura alvo
> ([docs/04](docs/04-arquitetura-alvo.md)) eles são dois serviços com deploy
> independente. O porquê e o caminho de um para o outro estão no
> [ADR-0003](docs/adr/0003-estilo-arquitetural.md). Toda a documentação está em
> [docs/](docs/README.md).

## Tecnologias

- **Backend:** Node.js 20, Express, PostgreSQL 16, RabbitMQ
- **Frontend:** React (Vite)
- **Workers:** Node.js (consumo de fila e consolidação periódica)
- **Infra local:** Docker Compose
- **Testes:** Jest, Supertest (backend), React Testing Library (frontend)

## Funcionalidades

- Cadastro assíncrono de lançamentos (fila) com idempotência
- Consulta de lançamentos e de saldos diários
- Reprocessamento de saldo a partir de uma data (com cascata para os dias seguintes)
- Página de status das dependências (PostgreSQL, RabbitMQ)
- Documentação OpenAPI em `/docs`

## Como rodar localmente

Pré-requisitos: Docker e Docker Compose.

```bash
cp .env.example .env
docker compose up --build -d
```

O `init.sql` cria o schema, as funções de consolidação e dados de exemplo
dos **últimos 10 dias** (relativos à data de subida) na primeira subida do banco. Para recriar do zero:
`docker compose down -v`.

### Credenciais de desenvolvimento

Todas estão no `.env.example` (copiado para `.env`) e valem só para a máquina local.

| O quê | Valor | Onde usar |
|---|---|---|
| PostgreSQL | usuário `usercarrefour`, senha `875421`, banco `bancocarrefour`, porta 5432 | `psql`, DBeaver, etc. Ex.: `docker exec -it postgres_financeiro psql -U usercarrefour -d bancocarrefour` |
| RabbitMQ | `admin` / `admin` | http://localhost:15672 e URL AMQP |
| Token administrativo | `dev-admin-token` | header `Authorization: Bearer dev-admin-token` em `POST /admin/tenants`; variável `ADMIN_TOKEN` nos scripts k6 |
| JWT | segredo `dev-only-secret-change-me`, expira em 8 h | assinado automaticamente no login |

| Serviço | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000 |
| OpenAPI / Swagger | http://localhost:3000/docs |
| RabbitMQ Management | http://localhost:15672 (admin / admin) |

Dois tenants de demonstração (senha `123456` em ambos):

| Usuário | Perfil | Comerciante | Schema | Fuso | Corte |
|---|---|---|---|---|---|
| `admin@example.com` | gestor | Mercearia Exemplo | `tenant_1` | America/Sao_Paulo | 18:00 |
| `caixa@example.com` | operador | Mercearia Exemplo | `tenant_1` | America/Sao_Paulo | 18:00 |
| `padaria@example.com` | gestor | Padaria Modelo | `tenant_2` | America/Manaus | 18:00 |

### Variáveis de ambiente

Todas em `.env` (veja `.env.example`). O `.env` não é versionado.

| Variável | Uso |
|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | conexão com o PostgreSQL |
| `RABBITMQ_URL` | conexão AMQP |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | assinatura do token (obrigatório) |
| `TZ` | fuso padrão do banco (o fuso de cada tenant fica em `comerciantes.fuso`) |
| `DIAS_RETROATIVOS` | janela retroativa para cadastro/edição de lançamentos, igual para todos os comerciantes (padrão 30) |
| `TENANT_CACHE_TTL_MS` | cache da configuração do tenant na API/worker (padrão 60 s) |
| `CONSOLIDAR_CRON` | agenda do worker de consolidação (padrão `*/5 * * * *`) |
| `WORKER_PREFETCH` | mensagens em voo por worker (padrão 10) |
| `WORKER_RETRY_DELAY_MS` | pausa antes de devolver mensagem à fila em erro transitório (padrão 2000) |
| `PG_POOL_MAX` | tamanho do pool de conexões (padrão 10) |
| `ADMIN_TOKEN` | habilita `POST /admin/tenants`; vazio desliga a rota |

## Testes

### Backend

Os testes unitários não precisam de infraestrutura. Os de integração usam o
PostgreSQL e o RabbitMQ do Compose (em `localhost`):

```bash
docker compose up -d db rabbitmq
npm install
npm test
```

### Frontend

```bash
cd frontend
npm install
npm test
```

## Multi-tenant

Cada comerciante (tenant) tem um schema próprio no PostgreSQL (`tenant_<id>`)
com as tabelas `lancamentos_financeiros` e `saldos_diarios`. O catálogo
(`comerciantes`, `usuarios`) e as funções de consolidação ficam em `public`.

- O JWT carrega `comerciante_id`; o middleware resolve o tenant e toda
  consulta roda numa transação com `SET LOCAL ROLE tenant_<id>_role` e
  `SET LOCAL search_path TO tenant_<id>`. A role só tem privilégio no próprio
  schema: uma query apontando para outro tenant recebe `permission denied`.
- Cada tenant configura `fuso` (o que é "dia") e `hora_fechamento`. A janela
  retroativa (`DIAS_RETROATIVOS`) é única para todos; fora dela a API responde 400/409.
- O token também carrega um snapshot dessa configuração: se o catálogo estiver
  indisponível, a API usa o snapshot (ou o cache) para continuar aceitando
  lançamentos; o worker sempre revalida com o catálogo ao gravar.
- Provisionar um tenant: `POST /admin/tenants` (habilitado por `ADMIN_TOKEN`) ou a função SQL `criar_tenant(nome, fuso, hora_fechamento)`.

## Fechamento diário

Cada tenant tem um horário de corte (`hora_fechamento`, no seu fuso). No
corte, `worker_consolidar` consolida e marca o dia como **fechado**; o saldo
passa a ser o valor oficial do dia (`GET /saldos-diarios` expõe `status`,
`fechado_em`, `reaberto_em`). Lançar ou editar em dia fechado **reabre o dia**:
só usuários com perfil `gestor` podem (operador recebe 409); a reabertura é
registrada e o dia fecha de novo no próximo corte. Reprocessar saldo recalcula
sem alterar o status.

## Fluxo principal

1. `POST /lancamentos` valida corpo e janela retroativa do tenant, gera um `id`
   (ou usa o header `Idempotency-Key`), publica na fila `lancamentos` e
   responde **202** com o id.
2. `worker_lancamentos` consome a fila, resolve o tenant da mensagem, insere com
   `ON CONFLICT (id) DO NOTHING` (redelivery não duplica) e chama
   `consolidar_saldo_a_partir_de(data, fuso)`, que recalcula o dia do lançamento
   e todos os seguintes, na mesma transação. A consolidação de um tenant é
   serializada por advisory lock; tenants diferentes rodam em paralelo.
3. `GET /saldos-diarios` e `GET /saldos-diarios/{data}` leem a tabela
   `saldos_diarios` do tenant, já consolidada.
4. `worker_consolidar` roda a cada 5 minutos por tenant: reconsolida ontem e
   hoje (rede de segurança) e fecha os dias cujo corte já passou.

Tratamento de falhas na fila:

- Erro de dados (JSON inválido, violação de constraint): `nack` sem requeue, a
  mensagem vai para `lancamentos.dlq`.
- Erro transitório (banco fora): `nack` com requeue, a mensagem é reprocessada.
- Se o RabbitMQ cair, a API continua no ar: as consultas de saldo funcionam e
  só o `POST /lancamentos` responde **503** até a fila voltar (reconexão automática).

## Estrutura

```
.
├── index.js                     # API Express
├── openapi.yaml                 # contrato da API
├── init.sql                     # schema, funções de consolidação, dados de exemplo
├── docker-compose.yml
├── src/
│   ├── auth.js                  # JWT + resolução do tenant
│   ├── db.js                    # pool PostgreSQL, transação por tenant (search_path)
│   ├── tenants.js               # catálogo de tenants, fuso e janela retroativa
│   ├── rabbit.js                # conexão, reconexão e topologia (fila + DLQ)
│   ├── routes/
│   │   ├── auth.js
│   │   ├── lancamentos.js
│   │   └── saldosDiarios.js
│   └── workers/
│       ├── workerLancamentos.js
│       └── workerConsolidarSaldo.js
├── test/
│   ├── api.integration.test.js
│   ├── tenants.unit.test.js
│   └── workerLancamentos.unit.test.js
└── frontend/
    └── src/components/
```

## Página de Status

O menu da interface tem "Status dos Serviços", que chama `GET /status` e
mostra se PostgreSQL e RabbitMQ estão acessíveis. `GET /health` é público, para
uso por load balancer ou orquestrador.

## Arquitetura e decisões

Toda a documentação de arquitetura está em [docs/](docs/README.md):

| Documento | Conteúdo |
|---|---|
| [01 Domínios e capacidades](docs/01-dominios-e-capacidades.md) | Bounded contexts, context map, linguagem ubíqua |
| [02 Requisitos](docs/02-requisitos.md) | RFs, RNFs com metas e premissas |
| [03 Arquitetura atual](docs/03-arquitetura-atual.md) | O que este repositório implementa (containers, fluxo, modelo de dados, limitações) |
| [04 Arquitetura alvo](docs/04-arquitetura-alvo.md) | Dois serviços, gateway, read model, deploy, falhas e escala |
| [05 Transição](docs/05-arquitetura-transicao.md) | Migração de um legado em fases |
| [06 Segurança](docs/06-seguranca.md) | O que existe, versão alvo, critérios para integração |
| [07 Observabilidade](docs/07-observabilidade.md) | Sinais, métricas, alertas, SLOs |
| [08 Custos](docs/08-custos.md) | Dois cenários na AWS |
| [09 Testes](docs/09-testes-e-carga.md) | O que existe (unitários, integração, carga, caos) e o que faríamos no alvo |
| [ADRs](docs/adr/README.md) | As 10 decisões, com opções consideradas e consequências |
