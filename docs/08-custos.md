# 08 — Estimativa de custos

## Premissas

- Ver P3 e P4 no doc 02 e a topologia no doc 04. Entre os dois cenários muda
  o dimensionamento (réplicas, tamanho de instância, multi-AZ), não o desenho.
- AWS us-east-1, preços públicos on-demand de setembro de 2026, **valores
  aproximados (±30%)**, sem impostos, só produção. Servem para comparar
  ordens de grandeza; a calculadora deve ser refeita antes de contratar.
- Toda a stack é open source: **licença zero** (ADR-0004, 0005, 0006).

## Cenário 1 — base inicial (~20 comerciantes, sem alta disponibilidade)

| Componente | Serviço | Dimensionamento | USD/mês |
|---|---|---|---|
| API + workers | ECS Fargate | 4 tasks de 0,5 vCPU / 1 GB | 72 |
| Banco | RDS PostgreSQL db.t4g.small, single-AZ | 20 GB gp3 | 24 |
| Broker | Amazon MQ (RabbitMQ) mq.t3.micro | 1 instância, 20 GB | 22 |
| Entrada | ALB | mínimo | 20 |
| Frontend | S3 + CloudFront | estático, 5 GB | 1 |
| Observabilidade, segredos, registry | CloudWatch (5 GB de logs), Secrets Manager, ECR | | 20 |
| **Total** | | | **≈ 157** (≈ US$ 8 por comerciante) |

## Cenário 2 — pico simultâneo (20 × 50 req/s = 1.000 req/s, multi-AZ)

| Componente | Serviço | Dimensionamento | USD/mês |
|---|---|---|---|
| API de Consolidado | ECS Fargate | 4 tasks de 1 vCPU / 2 GB (2 por AZ) | 144 |
| API de Lançamentos + workers | ECS Fargate | 6 tasks de 0,5 vCPU / 1 GB | 108 |
| Banco | RDS PostgreSQL db.m6g.large multi-AZ | 100 GB gp3 + 100 GB de backup | 305 |
| Réplica de leitura | RDS PostgreSQL db.m6g.large single-AZ | 100 GB | 168 |
| Broker | Amazon MQ (RabbitMQ) mq.t3.micro active/standby | 2 instâncias, 20 GB | 44 |
| Entrada | ALB | 1.000 req/s | 20 |
| Proteção na borda | WAF: 1 ACL, 5 regras (uma de rate limit por comerciante), 500 M requests/mês | | 310 |
| Frontend | S3 + CloudFront | 50 GB | 5 |
| Observabilidade, segredos, registry | CloudWatch (30 GB de logs, 200 métricas, 20 alarmes), Secrets Manager, ECR | | 84 |
| **Total** | | | **≈ 1.188** (≈ US$ 59 por comerciante a 20; ≈ US$ 6 a 200) |
| *Evolução: cache* | *ElastiCache Redis, 2 nós pequenos* | | *+50, só quando os gatilhos do ADR-0002 aparecerem* |

## Leitura dos números

- O salto do cenário 1 para o 2 (≈ 7,5×) não é capacidade: 1.000 req/s custa
  pouco porque o read model torna a leitura barata (ADR-0002). O que pesa é
  alta disponibilidade (multi-AZ, standby, réplica: ≈ US$ 500) e a proteção
  na borda (WAF: ≈ US$ 310, um quarto do total).
- O WAF cobra por request (US$ 0,60 por milhão). Os 500 M/mês vêm de P2:
  35 req/s por comerciante em horário comercial × 20 comerciantes. É a linha
  a discutir primeiro se o custo apertar: rate limit por comerciante dentro
  da própria API, sem WAF, atende o RNF-02b a custo quase zero, perdendo só as
  regras gerenciadas de proteção.
- O custo por comerciante cai com a escala porque banco, broker, ALB e WAF
  são compartilhados; é o argumento econômico do schema por tenant (ADR-0009).
- O banco (primário + réplica) é o maior item; cada comerciante em banco
  dedicado adicionaria US$ 25–300/mês, por isso essa separação é decisão por
  sinal, não padrão.

## Referência

Estimativa na calculadora AWS, com os dois cenários como grupos (link válido
por um ano a partir de 30/09/2026):
<https://calculator.aws/#/estimate?id=fc4c574671189677461111a599b90296c14c843f>
