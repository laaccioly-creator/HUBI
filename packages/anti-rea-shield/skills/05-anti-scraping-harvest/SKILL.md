---
name: anti-scraping-harvest
description: Proteção de rotas públicas (Catálogo Online) contra raspagem de dados em massa (Catalog/Price Scraping) através de marcas d'água invisíveis em registros (Canary Records) e filtros de integridade.
---

# Skill 05: Anti-Scraping & Data Watermarking

## Objetivo
Proteger vitrines públicas (como o Catálogo Online do HUBI) contra concorrentes ou bots que tentam extrair a lista completa de produtos, fotos e preços via chamadas diretas à API pública.

## Mecanismos
1. **Canary Fingerprinting (`canary-watermark.ts`)**: Filtra no cliente oficial registros canário sintéticos identificados por hash derivado da `SHIELD_SECRET_SEED`. Se um scraper clonar o retorno JSON bruto da API, ele publicará os itens canário no site clone, comprovando matematicamente a origem do vazamento.
2. **Guardas SQL de Paginação e Isolamento (`sql/03_canary_and_pagination_guard.sql`)**: Funções de consulta pública que exigem contexto de `loja_id` explícito e limitam o volume de registros por página.
