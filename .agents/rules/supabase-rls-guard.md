# Blindagem RLS e Multi-tenant no Supabase (supabase-rls-guard)

## Regra de Banco de Dados
Toda migration, DDL ou tabela pública gerada no Supabase deve conter obrigatoriamente:

1. Habilitação de RLS:
   ```sql
   ALTER TABLE public.<nome_tabela> ENABLE ROW LEVEL SECURITY;
   ```

2. Políticas de Isolamento Multitenant:
   Políticas `USING` e `WITH CHECK` isolando estritamente por `loja_id` com a função canônica:
   ```sql
   CREATE POLICY "loja_isolation_policy" ON public.<nome_tabela>
     FOR ALL
     USING (public.usuario_pertence_loja(loja_id))
     WITH CHECK (public.usuario_pertence_loja(loja_id));
   ```
   Validando obrigatoriamente `auth.uid()`.

3. Camada Frontend (React / TypeScript):
   Toda consulta, inserção ou atualização via Supabase Client deve manter explicitamente o filtro `.eq('loja_id', loja.id)`.
