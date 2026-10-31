---
name: runtime-sentinel
description: Sentinela de execução em tempo real com Multi-Signal Risk Score (zero falso positivo em dispositivos móveis/PWA), Domain Lock criptográfico, marca d'água invisível (Zero-Width Steganography) e degradação silenciosa estocástica.
---

# Skill 02: Runtime Sentinel & Silent State Corruption

## Objetivo
Identificar ambientes automatizados (Playwright, Puppeteer, Selenium, CDP), clonagem de arquivos estáticos em domínios não autorizados e *monkey-patching* de APIs nativas, aplicando degradação silenciosa estocástica (apenas em `production`) sem jamais prejudicar usuários reais em celulares ou WebViews.

## Componentes
1. **`sentinel-core.ts`**: Coleta sinais de automação e integridade nativa alimentando o `MultiSignalRiskEngine`.
2. **`domain-lock.ts`**: Valida se o hostname atual pertence à lista autorizada e deriva chaves de configuração em tempo de execução.
3. **`state-corruptor.ts`**: Agenda degradação silenciosa com atraso aleatório (8s a 25s) quando o score ultrapassa o limiar em modo `production`.
4. **`dom-watermark.ts`**: Aplica esteganografia Unicode de largura zero (Zero-Width Characters) para provar autoria criptográfica da interface.
