-- Identidade das contas que já existiam.
--
-- No provedor local a identidade de um cliente É o id da linha de `users`.
-- Sem este preenchimento, cada conta antiga só ganharia `auth_user_id` na
-- primeira vez que entrasse (o vínculo é refeito em auth.ts), e até então
-- ficaria fora de qualquer consulta por identidade.
--
-- Em um banco novo — o caso do Supabase — não há linhas e nada acontece.
UPDATE "users" SET "auth_user_id" = "id" WHERE "auth_user_id" IS NULL;
