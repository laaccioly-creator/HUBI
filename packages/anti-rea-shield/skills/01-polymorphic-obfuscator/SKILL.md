---
name: polymorphic-obfuscator
description: Blindagem polimórfica de build Vite, Semantic Misdirection por semente (SHIELD_SECRET_SEED), AST Poisoning contra LLMs de engenharia reversa e ofuscação de atributos DOM/Tailwind.
---

# Skill 01: Polymorphic Obfuscator & AST Poisoning

## Objetivo
Impedir que agentes de engenharia reversa (REAs) e clonadores visuais de DOM compreendam a estrutura sintática (AST) do bundle JavaScript ou extraiam componentes prontos da árvore HTML.

## Mecanismos Inclusos
1. **Derivação Polimórfica por Semente (`SHIELD_SECRET_SEED`)**: Gera mapas determinísticos de renomeação semântica (*WebGL / AudioDSP / Telemetry Misdirection*).
2. **AST & Context Poisoning (`vite-plugin-rea-poison.ts`)**: Injeta metadados arquiteturais isca (GraphQL schemas fictícios, referências a provedores cloud falsos) protegidos por predicados opacos para induzir LLMs descompiladores ao erro.
3. **DOM/CSS Scrambler (`css-class-scrambler.ts`)**: Remove `data-testid`, `data-component` e gera hashes polimórficos para classes customizadas.
