# 🛡️ Anti-REA-Shield (v2.0)

Suíte modular de defesa em profundidade contra **Agentes de Engenharia Reversa (REAs)**, **Clonadores Automatizados de UI/DOM** e **Scrapers de API** para aplicações **React + Vite + Supabase**.

---

## 🎯 Arquitetura de 5 Camadas (Skills)

1. **`01-polymorphic-obfuscator`**: Derivação polimórfica de identificadores por `SHIELD_SECRET_SEED`, *Semantic Misdirection*, *AST Poisoning* contra LLMs e ofuscação de classes CSS/DOM.
2. **`02-runtime-sentinel`**: Motor de pontuação de risco multi-sinal (*Multi-Signal Risk Engine*) calibrado para zero falso positivo em dispositivos móveis/PWA, *Domain Lock* criptográfico, marca d'água invisível (Zero-Width Steganography) e degradação silenciosa estocástica.
3. **`03-supabase-honeypot`**: Desativação da introspecção OpenAPI do PostgREST + Tabelas Isca (*Canary Tables*) com armadilhas de leitura `SELECT` baseadas em políticas RLS `VOLATILE SECURITY DEFINER`.
4. **`04-zero-trust-migrator`**: Scanner estático de AST para identificar segredos `VITE_*` e cálculos financeiros no cliente, com templates prontos de migração para RPCs `SECURITY DEFINER` e Edge Functions.
5. **`05-anti-scraping-harvest`**: Marca d'água invisível em registros de catálogo público (*Canary Records*) e proteção contra raspagem paginada em massa.

---

## 🎛️ Modos de Operação (`VITE_SHIELD_MODE`)

| Modo | Comportamento | Uso Recomendado |
| :--- | :--- | :--- |
| `development` | Monitoramento desativado, DevTools livre, build instantâneo. | Desenvolvimento diário local |
| `simulation` | **(Padrão)** Detecta sinais de risco e registra logs no console sem bloquear ou degradar a UI. | Homologação e testes no HUBI |
| `production` | Ativa Domain Lock estrito, Degradação Silenciosa estocástica (8s–25s) e Ofuscação Polimórfica. | Produção final |
