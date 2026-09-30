# 02 — Requisitos funcionais e não funcionais

## Requisitos funcionais

| ID | Requisito | Prioridade | Origem | Status |
|---|---|---|---|---|
| RF-01 | Registrar lançamento de crédito ou débito com valor, descrição e data | Must | Enunciado | Implementado |
| RF-02 | Consultar lançamentos | Must | Enunciado | Implementado |
| RF-03 | Consultar saldo diário consolidado (lista e por data) | Must | Enunciado | Implementado |
| RF-04 | Corrigir lançamento existente e refletir nos saldos seguintes | Should | Derivado | Implementado |
| RF-05 | Reprocessar consolidação a partir de uma data | Should | Derivado | Implementado |
| RF-06 | Aceitar lançamento retroativo | Should | Derivado | Implementado |
| RF-07 | Rejeitar lançamento fora da janela retroativa e datas futuras | Must | Domínio | Implementado |
| RF-08 | Provisionar novo tenant (schema, fuso, corte) | Must | Premissa P1 | Implementado (função SQL) |
| RF-09 | Fechar o dia no horário de corte do tenant; o saldo expõe status aberto/fechado | Must | Domínio (ADR-0010) | Implementado |
| RF-10 | Lançar/editar em dia fechado reabre o dia, exige perfil gestor e registra a reabertura | Must | Domínio (ADR-0010) | Implementado |
| RF-11 | Janela retroativa configurável por comerciante | Could | Futuro | Não iniciado |

## Requisitos não funcionais

Cada RNF tem uma métrica e uma meta verificável; a coluna "Como verificar"
aponta para o teste ou evidência.

| ID | Categoria | Requisito | Métrica / meta | Como verificar |
|---|---|---|---|---|
| RNF-01 | Disponibilidade | Lançamentos não podem ficar indisponíveis se o consolidado cair | `POST /lancamentos` responde 202 com serviço de consolidação parado | Teste de caos manual (parar `worker_consolidar` e o RabbitMQ) |
| RNF-02 | Desempenho | **Cada tenant** suporta pico de 50 req/s no consolidado (enunciado, lido por comerciante) | ≥ 95% de sucesso a 50 req/s por tenant por N minutos; p95 < ___ ms | `load/k6-consolidado.js` (1 tenant) |
| RNF-02b | Desempenho / isolamento | A plataforma suporta vários tenants em pico simultâneo sem que um degrade os outros | ≥ 95% de sucesso com N tenants × 50 req/s (N = 20 na base inicial); excedente de um tenant recebe 429, não derruba o serviço | `load/k6-consolidado-multitenant.js`; rate limit por tenant |
| RNF-03 | Integridade | Nenhum lançamento aceito (202) pode ser perdido | 0 perdas em falha de banco/worker | DLQ + requeue; teste unitário do worker |
| RNF-04 | Consistência | Saldo do dia D reflete todos os lançamentos aceitos de D | ≤ 30 s entre o 202 e o saldo atualizado, em operação normal | Métrica fila → ack por tenant (doc 07); testes de integração aguardam a consolidação |
| RNF-05 | Segurança | Toda rota de negócio autenticada | 401 sem token | Teste de integração |
| RNF-06 | Escalabilidade | Workers escalam horizontalmente | 2+ workers (ou prefetch > 1) consumindo a mesma fila sem duplicar nem perder atualização | Idempotência por id + advisory lock por tenant; teste de 40 lançamentos concorrentes → 40/40 (ADR-0008) |
| RNF-07 | Observabilidade | Todo request e mensagem são rastreáveis ponta a ponta; falhas de fila são visíveis | Correlation id em request, mensagem e log; alerta de DLQ > 0 e de fila acumulando | doc 07 |
| RNF-08 | Recuperação | Perda de dados e tempo de indisponibilidade em desastre | RPO/RTO do SLA do banco gerenciado (RDS multi-AZ); escrita de lançamentos com RTO ≈ 0 pela fila persistente; read model reconstruível | SLA do provedor; teste de restore (evolução) |

## Premissas e restrições

| # | Premissa | Consequência |
|---|---|---|
| P1 | Produto **multi-tenant**: cada comerciante é um tenant | Isolamento por schema (ADR-0009); `comerciante_id` no JWT; consolidação por tenant |
| P2 | O enunciado descreve **um** comerciante cujo consolidado recebe 50 req/s no pico. Como o produto é multi-tenant, o número vale **por tenant** | RNF-02 é por tenant; rate limit por tenant e cache por (tenant, dia) como evolução (ADR-0002, doc 06) |
| P3 | **Base inicial pequena: ~20 comerciantes**, com lançamento manual. **Hipótese de trabalho:** ordem de dezenas de lançamentos/dia por comerciante (usada só para dimensionar a escrita; a calibrar em produção). A base cresce sem limite definido | Cenário 1 de custos (doc 08); onboarding via `criar_tenant`; escrita na ordem de 1.000 lançamentos/dia no início |
| P4 | Se todos os 20 comerciantes tiverem pico ao mesmo tempo, a plataforma recebe **1.000 req/s** no consolidado (20 × 50). Na prática nem todos têm pico junto; quanto isso reduz a carga só se mede em produção | A arquitetura deve suportar 1.000 req/s sem mudar o desenho, só com réplicas e instâncias maiores (cenário 2 do doc 08). Como a escrita é muito menor que a leitura, o consolidado é um read model (ADR-0002) |
