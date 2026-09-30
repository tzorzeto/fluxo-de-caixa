# 06 — Segurança

## O que existe

| Controle | Como |
|---|---|
| Autenticação | Login com email e senha (bcrypt); JWT com expiração configurável e claims `comerciante_id` e `perfil`; resposta de login em tempo constante para não revelar se o email existe |
| Autorização | Perfis `operador` e `gestor`; só gestor reabre dia fechado, validado na API e reforçado no worker (mensagem sem permissão vai para a DLQ) |
| Isolamento entre comerciantes | Schema e role de banco por tenant; a aplicação assume a role a cada transação (`SET LOCAL ROLE`), então uma query no schema errado recebe `permission denied` (ADR-0009) |
| Alteração do passado | Dia fechado só reabre por gestor, com registro de quem e quando (ADR-0010) |
| Entrada | Validação de tipo, valor e data; corpo limitado a 10 kB; CORS restrito às origens configuradas |
| Segredos | `.env` fora do versionamento; `JWT_SECRET` obrigatório, sem valor padrão; rota de administração só existe com `ADMIN_TOKEN` |
| Logs | Sem corpo de request e sem token |

Dívida conhecida: o `.env` foi versionado nos primeiros commits do projeto.
Os valores eram e são apenas de desenvolvimento local, e hoje estão
documentados de propósito no `.env.example` e no README para que qualquer
pessoa suba a aplicação; por isso o histórico não foi reescrito. Em qualquer
ambiente fora da máquina local, todos os segredos são outros e ficam em cofre.

## Segurança na versão alvo

- **Gateway na frente de tudo:** TLS terminado no gateway, WAF com regras
  gerenciadas, rate limit por comerciante (excedente recebe 429), bloqueio de
  força bruta no login.
- **Identidade:** provedor OIDC (Cognito, Keycloak ou Entra), tokens curtos
  com refresh, MFA para gestor; autorização por permissão em vez de perfil.
- **Entre serviços:** Lançamentos e Consolidado só se falam pelo broker, sem
  chamada HTTP direta; TLS no AMQP e no Postgres; credenciais distintas para
  quem publica e quem consome.
- **Segredos:** Secrets Manager ou Vault injetando em tempo de execução,
  rotação automática da senha do banco, `ADMIN_TOKEN` substituído por
  credencial de máquina auditada.
- **Dados:** volumes e backups criptografados pelo provedor (KMS); `descricao`
  mascarada em logs; exclusão de um comerciante é o drop do schema após o
  prazo legal.
- **Auditoria:** trilha própria para reaberturas, provisionamento e mudanças
  de configuração.
- **Dependências:** scan de vulnerabilidades no pipeline e imagens base
  atualizadas.

## Critérios para quem integra com a API

1. HTTPS (TLS ≥ 1.2), sempre.
2. Credencial própria, com escopo limitado ao comerciante; nunca credencial
   de usuário humano.
3. Consumir a versão publicada do OpenAPI (`/v1`); mudanças incompatíveis
   geram nova versão com período de convivência.
4. `Idempotency-Key` (UUID) em todo `POST /lancamentos`; retry só com a
   mesma chave.
5. Respeitar o rate limit; tratar `429` com backoff e `503` como transitório.
6. Timeout explícito no cliente.
7. Não enviar dados pessoais desnecessários em `descricao`.
8. Propagar `X-Request-Id` para rastreio ponta a ponta (doc 07).
