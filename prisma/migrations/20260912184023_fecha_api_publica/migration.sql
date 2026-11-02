-- Fecha a API pública do Postgres para estas tabelas.
--
-- POR QUE ISTO EXISTE
--
-- No Supabase, o mesmo banco também é servido por uma API REST automática
-- (PostgREST). Ela atende com a chave publicável — a que, por natureza, vai
-- para o navegador de qualquer visitante. Sem trancar as tabelas, quem
-- tivesse essa chave poderia ler e escrever em `users`, `orders`,
-- `payments` e `audit_logs` direto, passando por cima de toda a autorização
-- desta aplicação.
--
-- Esta aplicação NÃO usa a API REST do Supabase. Ela fala com o banco pelo
-- Prisma, autenticando-se com a senha do banco (DATABASE_URL), e usa o
-- Supabase apenas para autenticação. Então a tranca certa é a mais
-- fechada possível:
--
--   1. RLS ligado SEM nenhuma policy. Para os papéis `anon` e
--      `authenticated` isso nega tudo. O papel dono das tabelas — o que o
--      Prisma usa — passa por cima de RLS, e por isso a aplicação não sente
--      diferença. Verificado: a suíte end-to-end passa igual com isto
--      aplicado.
--   2. Revogação explícita dos privilégios desses papéis, como segunda
--      barreira que não depende da semântica de RLS.
--
-- Em Postgres fora do Supabase (o banco de desenvolvimento, por exemplo) os
-- papéis `anon` e `authenticated` não existem, e o passo 2 é silenciosamente
-- ignorado.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel TEXT;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', papel);
      -- Tabelas criadas daqui para frente também nascem fechadas.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', papel
      );
    END IF;
  END LOOP;
END
$$;
