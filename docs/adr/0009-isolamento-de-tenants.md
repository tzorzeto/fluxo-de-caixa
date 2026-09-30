# ADR-0009 — Isolar tenants por schema, com caminho para banco por tenant

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

Produto multi-tenant em domínio financeiro: vazar dados entre clientes é o
pior cenário. A base começa pequena e a operação precisa ser simples.

## Opções

1. Schema compartilhado + coluna `comerciante_id` (+ RLS): uma query sem o
   filtro funciona e vaza.
2. **Um schema por tenant no mesmo banco** *(escolhida)*: falha fechado em
   dois níveis (tabela não existe no `search_path`; role do tenant não tem
   privilégio em outro schema); backup e exclusão por cliente triviais.
3. Um banco por tenant: isolamento máximo de dados e de recursos; custo e
   operação multiplicados por N.

## Decisão

Opção 2, por segurança: elimina a classe de erro "query sem filtro de
tenant", que na opção 1 é silenciosa e aqui é uma falha explícita. Opção 3
fica como evolução, para quando o crescimento justificar isolar também o
consumo de infraestrutura de cada cliente.

## Consequências

- Cada tenant tem role de banco própria (`tenant_<id>_role`), assumida a
  cada transação. A role da aplicação é membro de todas: protege contra erro
  de código, não contra a aplicação comprometida.
- Migrações rodam em N schemas; consultas entre tenants precisam de read
  model separado.
- Migrar um tenant para banco próprio não altera rotas nem worker: só
  `withTenant` passa a escolher a conexão.
- Sinais para evoluir (limites calibrados em produção): um tenant consumindo
  fatia desproporcional do banco; mudança de perfil (volume muito acima do
  manual); exigência contratual de segregação; custo operacional crescendo
  com o número de schemas (aí a resposta é sharding em grupos, não um banco
  por tenant).
