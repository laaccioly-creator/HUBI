-- ==============================================================================
-- SISTEMA HUBI - REPARO DE DADOS CORROMPIDOS EM auth.users (ERRO 500 GOTRUE)
-- Corrige "Database error querying schema" e "Database error finding user"
-- causados por colunas nulas onde o GoTrue estritamente requer string vazia ('')
-- ==============================================================================

UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  phone = COALESCE(phone, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb),
  is_super_admin = COALESCE(is_super_admin, false),
  is_sso_user = COALESCE(is_sso_user, false)
WHERE email = 'janainaghi@gmail.com'
   OR confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change IS NULL;
