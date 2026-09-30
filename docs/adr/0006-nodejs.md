# ADR-0006 — Node.js no exemplo executável; linguagem do produto segue a stack da organização

- **Status:** Proposto
- **Data:** 2026-09-29
- **Decisores:** Tiago Zorzeto

## Contexto

O enunciado permite qualquer linguagem. A carga é de I/O e a regra pesada
(consolidação) está no banco. O objetivo do exemplo é demonstrar a
arquitetura, não a linguagem.

## Opções

1. **Node.js** *(escolhida para o exemplo)*: I/O assíncrono, ecossistema
   pronto, mesma linguagem do frontend.
2. .NET / C#: tipagem forte, `BackgroundService`, MassTransit, EF Core,
   Polly; stack comum em bancos.
3. Java / Spring: equivalente à opção 2.

## Decisão

Opção 1 só para este exemplo. Para o produto, a linguagem segue a stack que
a organização já opera; .NET é a escolha natural nesse contexto. Nada no
desenho depende de Node: API → ASP.NET Core, workers → `BackgroundService`,
fila → MassTransit, banco → EF Core/Npgsql, retries → Polly.

## Consequências

- Código organizado por papel para a tradução ser módulo a módulo.
