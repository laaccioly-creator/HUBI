-- ==============================================================================
-- SISTEMA HUBI - MIGRAÇÃO PARA E-MAILS SINTÉTICOS WHATSAPP (@hubi.app)
-- Padronização da autenticação GoTrue e tabelas relacionais para operação 100% WhatsApp
-- ==============================================================================

-- 1. Padronizar Usuário Proprietário (WhatsApp 85 99612-3810 / Loja Mercadinho Itália)
UPDATE auth.users
SET 
  email = '5585996123810@hubi.app',
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  encrypted_password = extensions.crypt('123456', extensions.gen_salt('bf', 10)),
  raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{provider}', '"email"') || '{"providers":["email","google"]}'::jsonb,
  raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{email}', '"5585996123810@hubi.app"')
WHERE id = 'c34edba3-d26d-4698-8881-14309152a982';

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  'c34edba3-d26d-4698-8881-14309152a982',
  'c34edba3-d26d-4698-8881-14309152a982',
  jsonb_build_object('sub', 'c34edba3-d26d-4698-8881-14309152a982', 'email', '5585996123810@hubi.app', 'email_verified', true),
  'email',
  'c34edba3-d26d-4698-8881-14309152a982',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (provider, provider_id) DO UPDATE
SET identity_data = EXCLUDED.identity_data, updated_at = NOW();

-- Atualizar tabelas de negócio para o proprietário: lojas, usuarios_loja, organizacoes, configuracoes_plataforma
UPDATE public.lojas
SET email = '5585996123810@hubi.app'
WHERE id = '9ab2a087-4bf5-4a2d-bb69-5ab5cd084d45';

UPDATE public.usuarios_loja
SET 
  email = '5585996123810@hubi.app',
  whatsapp_atendimento = '85996123810'
WHERE loja_id = '9ab2a087-4bf5-4a2d-bb69-5ab5cd084d45'
  AND usuario_auth_id = 'c34edba3-d26d-4698-8881-14309152a982';

UPDATE public.usuarios_loja
SET 
  email = '5585996123810@hubi.app'
WHERE loja_id = 'bbae8c88-347e-46c4-a12a-3abd341a83dc'
  AND usuario_auth_id = 'c34edba3-d26d-4698-8881-14309152a982';

UPDATE public.organizacoes
SET email_principal = '5585996123810@hubi.app'
WHERE dono_usuario_id = 'c34edba3-d26d-4698-8881-14309152a982';

UPDATE public.configuracoes_plataforma
SET email_super_admin = '5585996123810@hubi.app'
WHERE id = 1;

-- 2. Demais usuários de teste:
-- Jose Carlos (WhatsApp 81997841235)
UPDATE auth.users
SET 
  email = '5581997841235@hubi.app',
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{email}', '"5581997841235@hubi.app"')
WHERE id = '4385e4e1-ec89-4c57-8804-08942714852d';

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  '4385e4e1-ec89-4c57-8804-08942714852d',
  '4385e4e1-ec89-4c57-8804-08942714852d',
  jsonb_build_object('sub', '4385e4e1-ec89-4c57-8804-08942714852d', 'email', '5581997841235@hubi.app', 'email_verified', true),
  'email',
  '4385e4e1-ec89-4c57-8804-08942714852d',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (provider, provider_id) DO UPDATE
SET identity_data = EXCLUDED.identity_data, updated_at = NOW();

UPDATE public.usuarios_loja
SET 
  email = '5581997841235@hubi.app',
  whatsapp_atendimento = '81997841235'
WHERE id = '7ab1e943-0c2a-4967-9f49-663a76912724';

-- Janaina (Admin HOTAMAZON - WhatsApp 85997374372)
UPDATE auth.users
SET 
  email = '5585997374372@hubi.app',
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{email}', '"5585997374372@hubi.app"')
WHERE id = '5d14c1b9-5da0-4fb8-94e7-f00971046427';

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  '5d14c1b9-5da0-4fb8-94e7-f00971046427',
  '5d14c1b9-5da0-4fb8-94e7-f00971046427',
  jsonb_build_object('sub', '5d14c1b9-5da0-4fb8-94e7-f00971046427', 'email', '5585997374372@hubi.app', 'email_verified', true),
  'email',
  '5d14c1b9-5da0-4fb8-94e7-f00971046427',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (provider, provider_id) DO UPDATE
SET identity_data = EXCLUDED.identity_data, updated_at = NOW();

UPDATE public.usuarios_loja
SET 
  email = '5585997374372@hubi.app',
  whatsapp_atendimento = '85997374372'
WHERE id = 'aeaddc31-a632-4d25-83c8-473620b757c9';

-- Janaina Teste Autofix
UPDATE auth.users
SET 
  email = '5585986072144@hubi.app',
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{email}', '"5585986072144@hubi.app"')
WHERE id = '10b1f971-848c-46fd-b86b-65c18fd01fba';

UPDATE auth.identities
SET 
  identity_data = jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', '"5585986072144@hubi.app"')
WHERE user_id = '10b1f971-848c-46fd-b86b-65c18fd01fba';
