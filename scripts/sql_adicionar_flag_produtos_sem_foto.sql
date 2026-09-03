-- ==============================================================================
-- MIGRAÇÃO: Inicialização da Flag 'exibir_produtos_sem_foto' no Catálogo Online
-- ==============================================================================
-- Padrão: false (desligado - não exibe produtos sem foto no catálogo online)

UPDATE public.lojas
SET configuracoes_extras = jsonb_set(
    COALESCE(configuracoes_extras, '{}'::jsonb),
    '{catalogo,exibir_produtos_sem_foto}',
    'false'::jsonb,
    true
)
WHERE configuracoes_extras->'catalogo'->'exibir_produtos_sem_foto' IS NULL;

-- Verificação do resultado:
SELECT 
    id, 
    nome_fantasia, 
    configuracoes_extras->'catalogo'->'exibir_produtos_sem_foto' AS exibir_produtos_sem_foto
FROM public.lojas;
