# ADR-0003 — Monólito modular com workers no código; dois serviços na arquitetura alvo

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

O enunciado lista lançamentos e consolidado como dois serviços e pede
escolha entre microsserviços, monólito, SOA ou serverless. O código é um
exemplo executável com tempo limitado; a arquitetura alvo é o desenho para
produção.

## Opções

1. Monólito único: consolidação no mesmo processo da API; não demonstra o
   RNF-01.
2. **Monólito modular com workers** *(escolhida no código)*: uma imagem,
   processos separados por papel, comunicação por fila e banco.
3. **Dois serviços com deploy independente** *(escolhida no alvo)*:
   Lançamentos e Consolidado, contrato pelo evento.
4. Serverless: cold start na API de consulta, pool de conexões, workers longos
   não se encaixam.

## Decisão

Opção 2 no código, opção 3 no alvo. Os módulos de lançamento e consolidado
não se chamam diretamente; a única dependência é o evento na fila. Separar
é mover pastas para dois deploys, não reescrever.

## Consequências

- Simplicidade agora, caminho sem reescrita depois.
- No alvo o evento `lancamento.registrado` vira API pública entre serviços,
  versionada.
- O Consolidado precisa de cópia própria do catálogo de tenants ou consulta
  ao serviço dono dele.
