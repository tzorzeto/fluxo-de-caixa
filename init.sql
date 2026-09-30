SET search_path TO public;

-- =========================================================
-- Multi-tenant: um schema por comerciante (tenant_<id>), com as tabelas de
-- lançamentos e saldos e uma role própria (tenant_<id>_role) com acesso só a
-- esse schema. O catálogo de tenants e os usuários ficam em public.
-- As funções de consolidação ficam em public e usam nomes de tabela não
-- qualificados: resolvem para o schema do tenant via search_path, definido
-- pela aplicação a cada transação (SET LOCAL search_path).
-- =========================================================

CREATE TABLE IF NOT EXISTS comerciantes (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    schema_name TEXT NOT NULL UNIQUE,
    fuso TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    hora_fechamento TIME NOT NULL DEFAULT '18:00',   -- corte do dia, no fuso do tenant
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    comerciante_id INT NOT NULL REFERENCES comerciantes(id),
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'operador' CHECK (perfil IN ('operador', 'gestor')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- Provisionamento de tenant: cria o schema e as tabelas.
-- =========================================================
CREATE OR REPLACE FUNCTION criar_tenant(p_nome TEXT, p_fuso TEXT DEFAULT 'America/Sao_Paulo', p_hora_fechamento TIME DEFAULT '18:00')
RETURNS INT AS $$
DECLARE
    v_id INT;
    v_schema TEXT;
    v_role TEXT;
BEGIN
    INSERT INTO comerciantes (nome, schema_name, fuso, hora_fechamento)
    VALUES (p_nome, 'pendente', p_fuso, p_hora_fechamento)
    RETURNING id INTO v_id;

    v_schema := 'tenant_' || v_id;
    UPDATE comerciantes SET schema_name = v_schema WHERE id = v_id;

    EXECUTE format('CREATE SCHEMA %I', v_schema);

    EXECUTE format($t$
        CREATE TABLE %I.lancamentos_financeiros (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tipo_movimento VARCHAR(7) NOT NULL CHECK (tipo_movimento IN ('CREDITO', 'DEBITO')),
            valor NUMERIC(15, 2) NOT NULL CHECK (valor > 0),
            descricao TEXT,
            criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )$t$, v_schema);
    EXECUTE format('CREATE INDEX ON %I.lancamentos_financeiros (criado_em)', v_schema);

    EXECUTE format($t$
        CREATE TABLE %I.saldos_diarios (
            data DATE PRIMARY KEY,
            saldo_inicio NUMERIC(15, 2) NOT NULL,
            total_creditos NUMERIC(15, 2) NOT NULL,
            total_debitos NUMERIC(15, 2) NOT NULL,
            saldo_fim NUMERIC(15, 2) NOT NULL,
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            -- Fechamento diário: 'aberto' até o corte; 'fechado' depois.
            status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
            fechado_em TIMESTAMPTZ,
            reaberto_em TIMESTAMPTZ,
            reaberto_por INT
        )$t$, v_schema);

    -- Role do tenant: sem login, com privilégio apenas no próprio schema.
    -- A aplicação assume essa role a cada transação (SET LOCAL ROLE), então
    -- uma query que aponte para outro schema falha com "permission denied".
    v_role := v_schema || '_role';
    EXECUTE format('CREATE ROLE %I NOLOGIN', v_role);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', v_schema, v_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I', v_schema, v_role);
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_role);
    -- A role da aplicação precisa ser membro para poder assumir a role do tenant.
    EXECUTE format('GRANT %I TO %I', v_role, current_user);

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Consolida um único dia do tenant corrente (search_path).
-- p_fuso define o que é "dia" para esse tenant.
-- =========================================================
CREATE OR REPLACE FUNCTION consolidar_saldo_diario(p_data DATE, p_fuso TEXT)
RETURNS VOID AS $$
DECLARE
    v_saldo_inicio   NUMERIC(15, 2);
    v_total_creditos NUMERIC(15, 2);
    v_total_debitos  NUMERIC(15, 2);
BEGIN
    SELECT COALESCE(saldo_fim, 0)
      INTO v_saldo_inicio
      FROM saldos_diarios
     WHERE data < p_data
     ORDER BY data DESC
     LIMIT 1;

    SELECT
        COALESCE(SUM(valor) FILTER (WHERE tipo_movimento = 'CREDITO'), 0),
        COALESCE(SUM(valor) FILTER (WHERE tipo_movimento = 'DEBITO'),  0)
      INTO v_total_creditos, v_total_debitos
      FROM lancamentos_financeiros
     WHERE (criado_em AT TIME ZONE p_fuso)::date = p_data;

    INSERT INTO saldos_diarios (data, saldo_inicio, total_creditos, total_debitos, saldo_fim, atualizado_em)
    VALUES (
        p_data,
        COALESCE(v_saldo_inicio, 0),
        v_total_creditos,
        v_total_debitos,
        COALESCE(v_saldo_inicio, 0) + v_total_creditos - v_total_debitos,
        NOW()
    )
    ON CONFLICT (data) DO UPDATE
       SET saldo_inicio   = EXCLUDED.saldo_inicio,
           total_creditos = EXCLUDED.total_creditos,
           total_debitos  = EXCLUDED.total_debitos,
           saldo_fim      = EXCLUDED.saldo_fim,
           atualizado_em  = NOW();
    -- status, fechado_em e reaberto_* não são tocados: recalcular não reabre.
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Reabre um dia fechado (exige perfil gestor, validado na aplicação).
-- Registra quem reabriu; o dia volta a fechar no próximo corte.
-- =========================================================
CREATE OR REPLACE FUNCTION reabrir_dia(p_data DATE, p_usuario_id INT)
RETURNS VOID AS $$
BEGIN
    UPDATE saldos_diarios
       SET status = 'aberto', reaberto_em = NOW(), reaberto_por = p_usuario_id
     WHERE data = p_data AND status = 'fechado';
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Fechamento: consolida e marca como 'fechado' todo dia aberto cujo corte
-- já passou (dias anteriores a hoje, e hoje se já passou de hora_fechamento).
-- Chamado periodicamente pelo worker de consolidação, por tenant.
-- =========================================================
CREATE OR REPLACE FUNCTION fechar_dias(p_fuso TEXT, p_hora_fechamento TIME)
RETURNS INT AS $$
DECLARE
    v_agora  TIMESTAMP := NOW() AT TIME ZONE p_fuso;
    v_limite DATE;
    v_fechados INT := 0;
    r RECORD;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(current_schema()));

    -- Último dia cujo corte já passou.
    v_limite := CASE WHEN v_agora::time >= p_hora_fechamento THEN v_agora::date ELSE v_agora::date - 1 END;

    -- Garante que os dias até o limite existem (dias sem movimento também fecham).
    PERFORM consolidar_saldo_diario(d::date, p_fuso)
       FROM generate_series(
            COALESCE((SELECT MAX(data) FROM saldos_diarios WHERE status = 'fechado') + 1, v_limite),
            v_limite, '1 day') AS d;

    FOR r IN SELECT data FROM saldos_diarios WHERE status = 'aberto' AND data <= v_limite LOOP
        PERFORM consolidar_saldo_diario(r.data, p_fuso);
        UPDATE saldos_diarios SET status = 'fechado', fechado_em = NOW() WHERE data = r.data;
        v_fechados := v_fechados + 1;
    END LOOP;
    RETURN v_fechados;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Consolida p_data e, em cascata, os dias seguintes até "hoje" no fuso do
-- tenant. A janela retroativa (DIAS_RETROATIVOS, na aplicação) limita o tamanho da cascata.
-- Consolidações de tenants diferentes rodam em paralelo; do mesmo tenant,
-- em série (advisory lock).
-- =========================================================
CREATE OR REPLACE FUNCTION consolidar_saldo_a_partir_de(p_data DATE, p_fuso TEXT)
RETURNS VOID AS $$
DECLARE
    d DATE := p_data;
    v_hoje DATE := (NOW() AT TIME ZONE p_fuso)::date;
BEGIN
    -- Serializa a consolidação por tenant. Sem isso, dois lançamentos do
    -- mesmo dia processados em paralelo somam visões parciais e o último
    -- UPSERT sobrescreve o primeiro (lost update). O lock é liberado no
    -- COMMIT; quem esperar enxerga os lançamentos já commitados.
    PERFORM pg_advisory_xact_lock(hashtext(current_schema()));

    WHILE d <= v_hoje LOOP
        PERFORM consolidar_saldo_diario(d, p_fuso);
        d := d + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Dados de exemplo: dois tenants, usuário de demonstração em cada um.
-- Senha de ambos: 123456
-- =========================================================
DO $$
DECLARE
    v_t1 INT;
    v_t2 INT;
BEGIN
    v_t1 := criar_tenant('Mercearia Exemplo', 'America/Sao_Paulo');
    v_t2 := criar_tenant('Padaria Modelo',    'America/Manaus');

    INSERT INTO usuarios (comerciante_id, email, senha_hash, perfil) VALUES
      (v_t1, 'admin@example.com',   '$2b$10$RKMENop/O3RwOZKZrJPRB.LpybhhJeZRLhTkEIhx7ysCFwg2oByvG', 'gestor'),
      (v_t1, 'caixa@example.com',   '$2b$10$RKMENop/O3RwOZKZrJPRB.LpybhhJeZRLhTkEIhx7ysCFwg2oByvG', 'operador'),
      (v_t2, 'padaria@example.com', '$2b$10$RKMENop/O3RwOZKZrJPRB.LpybhhJeZRLhTkEIhx7ysCFwg2oByvG', 'gestor');
END;
$$;

SET search_path TO tenant_1, public;

-- Últimos 10 dias (D-10 a D-1), no fuso do tenant. D-10 fecha em 770,00.
INSERT INTO lancamentos_financeiros (tipo_movimento, valor, descricao, criado_em) VALUES
('CREDITO', 1000.00, 'Saldo inicial',  ((CURRENT_DATE - 10) + TIME '09:00') AT TIME ZONE 'America/Sao_Paulo'),
('DEBITO',   150.00, 'Supermercado',   ((CURRENT_DATE - 10) + TIME '12:30') AT TIME ZONE 'America/Sao_Paulo'),
('DEBITO',    80.00, 'Transporte',     ((CURRENT_DATE - 10) + TIME '18:00') AT TIME ZONE 'America/Sao_Paulo');

INSERT INTO lancamentos_financeiros (tipo_movimento, valor, descricao, criado_em)
SELECT 'CREDITO', 100 + i * 10, 'Vendas do dia', ((CURRENT_DATE - i) + TIME '10:00') AT TIME ZONE 'America/Sao_Paulo'
  FROM generate_series(9, 1, -1) AS i
UNION ALL
SELECT 'DEBITO', 40 + i * 5, 'Fornecedor', ((CURRENT_DATE - i) + TIME '15:00') AT TIME ZONE 'America/Sao_Paulo'
  FROM generate_series(9, 1, -1) AS i;

SELECT consolidar_saldo_a_partir_de(CURRENT_DATE - 10, 'America/Sao_Paulo');
SELECT fechar_dias('America/Sao_Paulo', '18:00');

SET search_path TO tenant_2, public;

-- D-10 fecha em 2.500,00.
INSERT INTO lancamentos_financeiros (tipo_movimento, valor, descricao, criado_em) VALUES
('CREDITO', 2500.00, 'Vendas do dia', ((CURRENT_DATE - 10) + TIME '20:00') AT TIME ZONE 'America/Manaus');

INSERT INTO lancamentos_financeiros (tipo_movimento, valor, descricao, criado_em)
SELECT 'DEBITO', 100 + i * 20, 'Farinha', ((CURRENT_DATE - i) + TIME '08:00') AT TIME ZONE 'America/Manaus'
  FROM generate_series(9, 1, -1) AS i;

SELECT consolidar_saldo_a_partir_de(CURRENT_DATE - 10, 'America/Manaus');
SELECT fechar_dias('America/Manaus', '18:00');

SET search_path TO public;
