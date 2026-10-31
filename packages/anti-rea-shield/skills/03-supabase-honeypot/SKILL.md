---
name: supabase-honeypot
description: Blindagem ativa do Supabase/PostgREST com desativação de introspecção OpenAPI, Tabelas Canário (Honeypots) e armadilhas de leitura SELECT via políticas RLS VOLATILE SECURITY DEFINER.
---

# Skill 03: Supabase Honeypot & PostgREST OpenAPI Lockdown

## Objetivo
Cegar ferramentas automatizadas de varredura de schema (OpenAPI Lock) e transformar tabelas isca em sensores ativos capazes de detectar e registrar até mesmo consultas `SELECT` através de políticas RLS com funções `VOLATILE SECURITY DEFINER`.

## Como Funciona a Armadilha em `SELECT`
Como o PostgreSQL não dispara `TRIGGER` em instruções `SELECT`, esta skill aplica uma política RLS `USING (security_audit.armadilha_leitura_honeypot('nome_tabela'))`. Ao avaliar a permissão de leitura da tabela isca, o motor do PostgreSQL executa a função `SECURITY DEFINER`, capturando `auth.uid()`, IP (`x-forwarded-for` / `cf-connecting-ip`) e `user-agent`, inserindo em `security_audit.blacklisted_actors` e retornando `false` (simulando uma tabela vazia `[]` com HTTP 200).
