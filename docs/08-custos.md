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
| API + workers | ECS Fargate | 4 tasks pequenas (0,25–0,5 vCPU) | 45 |
| Banco | RDS PostgreSQL db.t4g.small, single-AZ | 20 GB | 30 |
| Broker | Amazon MQ (RabbitMQ) mq.t3.micro | 1 instância | 25 |
| Entrada | ALB | mínimo | 25 |
| Frontend | S3 + CloudFront | estático | 5 |
| Observabilidade, segredos, registry | CloudWatch, Secrets Manager, ECR | | 20 |
| **Total** | | | **≈ 150** (≈ US$ 7,5 por comerciante) |

## Cenário 2 — pico simultâneo (20 × 50 req/s = 1.000 req/s, multi-AZ)

| Componente | Serviço | Dimensionamento | USD/mês |
|---|---|---|---|
| API de Consolidado | ECS Fargate | 4 tasks de 1 vCPU (2 por AZ), autoscaling por CPU | 145 |
| API de Lançamentos | ECS Fargate | 2 tasks de 0,5 vCPU (1 por AZ) | 30 |
| Workers | ECS Fargate | 4 tasks de 0,5 vCPU, autoscaling pela fila | 60 |
| Banco | RDS PostgreSQL db.m6g.large multi-AZ + réplica de leitura | 100 GB | 400 |
| Broker | Amazon MQ (RabbitMQ) mq.t3.micro active/standby | | 55 |
| Entrada | ALB + WAF com rate limit por comerciante | | 70 |
| Frontend | S3 + CloudFront | | 10 |
| Observabilidade, segredos, registry | CloudWatch + coletor OTel, Secrets Manager, ECR | | 65 |
| **Total** | | | **≈ 835** (≈ US$ 42 por comerciante a 20; ≈ US$ 4 a 200) |
| *Evolução: cache* | *ElastiCache Redis, 2 nós pequenos* | | *+50, só quando os gatilhos do ADR-0002 aparecerem* |

## Leitura dos números

- O salto do cenário 1 para o 2 (≈ 5,5×) é quase todo alta disponibilidade
  (multi-AZ, standby, réplica), não capacidade: 1.000 req/s custa pouco
  porque o read model torna a leitura barata (ADR-0002).
- O custo por comerciante cai com a escala porque banco, broker e ALB são
  compartilhados; é o argumento econômico do schema por tenant (ADR-0009).
- O banco é o maior item nos dois cenários; cada comerciante em banco
  dedicado adicionaria US$ 60–400/mês, por isso essa separação é decisão por
  sinal, não padrão.

## Referência

Calculadora AWS da estimativa original:
<https://calculator.aws/#/estimate?id=84a5b3f760cdd70963245653033e9f7004b1ac14>
<!-- TODO: refazer a calculadora com os dois cenários acima e substituir o link -->
