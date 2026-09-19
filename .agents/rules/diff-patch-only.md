# Economia de Tokens e Respostas em Diff (diff-patch-only)

## Regra de Output
Em qualquer refatoração, bugfix ou implementação no sistema HUBI, é terminantemente proibido reescrever arquivos completos de 300+ linhas na resposta do chat.

## Padrão Mandatório
1. Retornar exclusivamente blocos de unified diff (`diff --git`) ou blocos pontuais indicando com clareza as linhas adicionadas/alteradas e no máximo 3 linhas de contexto adjacente (`// ... código inalterado ...`).
2. Utilizar as ferramentas pontuais de edição (`replace_file_content`) para alterações cirúrgicas.

## Inspeção Econômica
Ao analisar arquivos grandes (`PosCheckout.tsx`, `CartContext.tsx`, `ShippingFulfillmentSelector.tsx`, etc.), ler apenas as interfaces, tipos e o bloco da função em questão utilizando fatiamento (`StartLine` e `EndLine`) para economizar tokens de contexto de entrada.
