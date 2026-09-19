# Router Dinâmico para a Suíte Mantis (mantis-router)

## Gestão de Contexto
Para evitar o consumo excessivo da janela de contexto no boot e nas operações cotidianas de desenvolvimento:
- Não injetar as 18 sub-skills do Mantis permanentemente no prompt inicial do assistente.

## Carregamento Condicional Sob Demanda
- Por padrão no boot, manter disponível no prompt apenas a skill orquestradora `mantis-meta-agent`.
- As sub-skills de auditoria (`mantis-researcher`, `mantis-threat-model`, `mantis-review`, `mantis-reproduce`, `mantis-patch`, `mantis-critic`, `mantis-chain`, `mantis-calibrate`, `mantis-report`, `mantis-summarize`, `mantis-structural-index`, `mantis-history`, `mantis-dedupe`, `mantis-reflect`, `mantis-architecture`, `mantis-pipeline-adapter`, `mantis-plan`) devem ser carregadas e executadas dinamicamente sob demanda, exclusivamente quando o usuário acionar um comando formal de auditoria ou revisão de segurança (ex: `/mantis-audit`).
