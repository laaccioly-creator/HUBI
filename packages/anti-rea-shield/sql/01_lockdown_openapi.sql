-- ============================================================================
-- 01_lockdown_openapi.sql
-- Desativa a exposição pública do catálogo OpenAPI do PostgREST para impedir
-- que ferramentas automatizadas (REAs) baixem o schema completo via GET /rest/v1/
-- ============================================================================

ALTER ROLE authenticator SET pgrst.openapi_mode = 'disabled';
NOTIFY pgrst, 'reload config';
