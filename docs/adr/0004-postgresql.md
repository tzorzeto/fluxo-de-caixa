# ADR-0004 — Usar PostgreSQL como fonte da verdade

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

Precisamos de transações ACID (lançamento + reconsolidação juntos),
agregação por dia, schema e role por tenant, lock por tenant. Base inicial
pequena; custo de licença e simplicidade pesam.

## Opções

1. **PostgreSQL** *(escolhida)*: open source; schemas, roles, `plpgsql`,
   advisory locks, `TIMESTAMPTZ`; gerenciado em qualquer nuvem.
2. Oracle / SQL Server: recursos equivalentes; licença por core não se
   justifica para 20 comerciantes; continuam válidos se o cliente já os opera.
3. NoSQL: o domínio é relacional e transacional.

## Decisão

Opção 1, por simplicidade e custo. O desenho usa recursos que Oracle e SQL
Server também têm; a troca seria de sintaxe, não de arquitetura.

## Consequências

- Consolidação em `plpgsql`, perto dos dados e na mesma transação.
- Réplica de leitura quando o consolidado exigir; particionamento mensal de
  lançamentos.
