# Sanitização de PII e Proteção contra Vazamentos (pii-leak-detector)

## Regra de Privacidade (LGPD)
Proibir terminantemente a emissão ou persistência de dados pessoais identificáveis (PII) de clientes em texto plano não criptografado, logs ou consoles:
- CPF, CNPJ, dados de cartão de crédito.
- Telefones, WhatsApp e e-mails pessoais.
- Coordenadas geográficas residenciais detalhadas (latitude/longitude em logs).
- Chaves privadas, credenciais BYOK (`serpapi_key`, tokens de API da Uber Direct e Melhor Envio).

## Tratamento Seguro de Erros
- Nunca disparar `console.log` ou `console.error` expondo objetos com payloads brutos contendo PII.
- Erros de banco ou rede devem exibir mensagens sanitizadas e amigáveis em `pt-BR` na interface, nunca expondo mensagens brutas do PostgreSQL ou credenciais.
