/**
 * Projeções explícitas de colunas seguras para rotas e serviços públicos do Catálogo Online.
 * Regra Zero-Trust HUBI: jamais utilizar `select('*')` nem trafegar campos sensíveis
 * (preco_custo, fornecedor_id, chaves de API, whatsapp_saldo, senha_hash, auth_uid, lat/lng).
 *
 * Mantido como string literals diretos (sem `.join()`) para preservar inferência estrita
 * do parser de queries do `@supabase/supabase-js`.
 */

export const SELECT_LOJA_PUBLICA =
  'id, nome_fantasia, razao_social, tipo_documento, numero_documento, telefone, whatsapp, email, instagram, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep, sobre_loja, url_logo, url_banner, cor_primaria, moeda, slug_catalogo, aceita_pedidos_online, resumo_whatsapp, instrucoes_pos_pedido, valor_minimo_pedido, configuracoes_extras, retirada_loja_ativa, frete_gratis_ativo, frete_gratis_valor_minimo, tipos_venda, desconto_padrao_atacado_percentual, tipo_minimo_padrao_atacado, qtd_minima_padrao_atacado, valor_minimo_padrao_atacado, qtd_minima_sku_padrao_atacado, desconto_padrao_autoatacado_percentual, tipo_minimo_padrao_autoatacado, qtd_minima_padrao_autoatacado, valor_minimo_padrao_autoatacado, qtd_minima_sku_padrao_autoatacado, status_em_separacao, status_em_expedicao, status_aguardando_envio, status_enviado, status_entregue, status_pronto_para_retirar, caderneta_ativa, dia_vencimento_padrao_caderneta, ciclo_padrao_caderneta, dia_semana_padrao_caderneta, dia_vencimento_2_padrao_caderneta, whatsapp_auto_ativo, exigir_pesagem_previa_pagamento, wpp_auto_pedido_confirmado, wpp_auto_pesagem_concluida, wpp_auto_status_separacao, wpp_auto_pronto_retirada, wpp_auto_despacho_rastreio, wpp_auto_pedido_entregue, wpp_auto_recibo_venda, wpp_auto_comprovante_fiado, wpp_auto_agendamento_criado, wpp_auto_lembrete_agendamento, wpp_auto_vencimento_caderneta, wpp_auto_vencimento_fiado, antecedencia_lembrete_horas, limite_remarcacoes_cliente, antecedencia_minima_remarcacao_horas, taxa_padrao_domicilio, abater_taxa_domicilio_ao_fechar, trabalha_com_agenda, atendimento_domicilio_ativo, modo_exibicao_catalogo, lp_titulo_hero, lp_subtitulo_hero, lp_sobre_titulo, lp_sobre_texto, lp_galeria_urls, lp_mostrar_equipe, criado_em, atualizado_em';

export const SELECT_PRODUTO_PUBLICO =
  'id, loja_id, categoria_id, subcategoria_id, nome, codigo_interno, codigo_barras, descricao, fotos_urls, tipo_unidade, unidade_medida, permite_fracionado, venda_por_peso, tipo_item, preco_venda_varejo, preco_venda_atacado, tipo_minimo_atacado, qtd_minima_atacado, valor_minimo_atacado, preco_venda_autoatacado, tipo_minimo_autoatacado, qtd_minima_autoatacado, valor_minimo_autoatacado, preco_promocional, promocao_ativa, quantidade_estoque, tem_variacoes, rotulo_variacao_1, rotulo_variacao_2, eh_combo, data_validade, exibir_catalogo, destaque, ativo, peso_kg, altura_cm, largura_cm, comprimento_cm, requer_agendamento, duracao_estimada_minutos, local_prestacao_servico, taxa_deslocamento_domicilio, abater_taxa_domicilio_ao_fechar, criado_em, atualizado_em';

export const SELECT_VARIACAO_PUBLICA =
  'id, loja_id, produto_id, valor_variacao_1, valor_variacao_2, combinacao_nome, sku, codigo_barras, preco_venda_varejo, preco_venda_atacado, preco_venda_autoatacado, preco_promocional, quantidade_estoque, ativo, criado_em';

export const SELECT_CLIENTE_PUBLICO =
  'id, loja_id, nome, telefone, whatsapp, email, numero_documento, tabela_preco_padrao, endereco_principal, endereco_secundario, saldo_devedor_fiado, limite_credito, permite_fiado, data_aniversario, observacoes, permite_caderneta, limite_caderneta, saldo_devedor_caderneta, dia_vencimento_caderneta, ciclo_caderneta, dia_semana_caderneta, dia_vencimento_2_caderneta, criado_em';

export const SELECT_PEDIDO_PUBLICO =
  'id, loja_id, numero_pedido, cliente_id, vendedor_id, origem, tabela_preco_aplicada, status, status_pagamento, subtotal, subtotal_produtos, valor_desconto, desconto_percentual, valor_frete, valor_taxa_domicilio, levar_produto_no_atendimento, valor_total, valor_pago, saldo_devedor, fiado_quitado, data_vencimento_fiado, eh_venda_caderneta, ciclo_referencia_caderneta, forma_entrega_id, forma_pagamento_catalogo, comprovante_pagamento_url, comprovante_enviado_em, troco_para, cupom_id, cupom_codigo, valor_desconto_cupom, cliente_nome_avulso, cliente_telefone_avulso, cliente_documento_avulso, cliente_email_avulso, endereco_entrega, observacoes, data_venda, data_pagamento, data_entrega_agendada, motivo_cancelamento, codigo_rastreio, link_rastreio, entregador_nome, despachado_em, pin_entrega, nome_app, nome_transportadora, servico_correios, tipo_operacao, codigo_corrida, criado_em, atualizado_em';

export const SELECT_ITEM_PEDIDO_PUBLICO =
  'id, loja_id, pedido_id, produto_id, variacao_id, tabela_preco_utilizada, nome_produto, rotulo_variacao, preco_venda_unitario, quantidade, quantidade_solicitada, unidade_medida, tipo_unidade, peso_solicitado_kg, peso_real_kg, subtotal, observacoes, criado_em';

export const SELECT_PEDIDO_ENTREGA_PUBLICO =
  'id, pedido_id, tipo_atendimento, cliente_endereco_id, destino_cep, destino_logradouro, destino_numero, destino_complemento, destino_bairro, destino_cidade, destino_uf, provedor, transportadora_nome, servico_codigo, valor_frete, prazo_estimado_texto, codigo_rastreio, status_envio, link_rastreio, pin_entrega, entregador_nome, despachado_em, forma_entrega_id, nome_app, nome_transportadora, servico_correios, tipo_operacao, contato_entregador, codigo_corrida, cotacao_id, criado_em, atualizado_em';

export const SELECT_PAGAMENTO_PEDIDO_PUBLICO =
  'id, loja_id, pedido_id, forma_pagamento_id, valor, parcelas, valor_taxa, valor_liquido, data_pagamento, eh_pagamento_fiado, eh_pagamento_caderneta, criado_em';

export const SELECT_FORMA_PAGAMENTO_PUBLICA =
  'id, loja_id, nome, tipo, taxa_percentual, taxa_fixa, maximo_parcelas, ativo, exibir_catalogo, criado_em';

export const SELECT_PAGAMENTO_PREVISTO_PUBLICO =
  'id, loja_id, pedido_id, forma_pagamento_id, forma_tipo, forma_nome, valor, valor_entregue, parcelas, criado_em';

export const SELECT_AGENDAMENTO_PUBLICO =
  'id, loja_id, pedido_id, item_pedido_id, produto_id, profissional_id, cliente_id, cliente_nome, cliente_whatsapp, data_agendamento, hora_inicio, hora_fim, data_hora_inicio, data_hora_fim, modalidade_local, cliente_endereco_id, endereco_prestacao_snapshot, status_agendamento, token_confirmacao, lembrete_enviado, lembrete_enviado_em, confirmado_pelo_cliente_em, cancelado_em, motivo_cancelamento, qtd_remarcacoes, data_hora_anterior, remarcado_em, observacoes, criado_em, atualizado_em';

export const SELECT_CATEGORIA_PUBLICA =
  'id, loja_id, nome, descricao, imagem_url, icone, ordem_exibicao, ativo, categoria_pai_id, criado_em';

export const SELECT_PROFISSIONAL_PUBLICO =
  'id, loja_id, nome_completo, especialidade_cargo, presta_servicos, ativo, url_foto, mini_curriculo, curriculo_aprovado';

export const SELECT_FORMA_ENTREGA_PUBLICA =
  'id, loja_id, nome, tipo, valor_taxa, valor_por_km, tempo_estimado, ativo, requer_codigo_rastreio, requer_entregador, requer_link_rastreio, padrao, requer_pin, criado_em, atualizado_em';

export const SELECT_HISTORICO_PEDIDO_PUBLICO =
  'id, loja_id, pedido_id, usuario_id, tipo_evento, status_anterior, status_novo, descricao, detalhes, motivo, criado_em';

export const SELECT_CLIENTE_ENDERECO_PUBLICO =
  'id, cliente_id, identificador, cep, logradouro, numero, complemento, bairro, cidade, uf, is_principal, criado_em, atualizado_em';

export const SELECT_CLIENTE_NOTIFICACAO_PUBLICA =
  'id, cliente_id, loja_id, titulo, mensagem, lida, link_acao, criado_em';

export const SELECT_CLIENTE_CARRINHO_PUBLICO =
  'id, cliente_id, loja_id, produto_id, variacao_id, quantidade, criado_em, atualizado_em';

export const SELECT_VENDEDOR_PUBLICO = 'id, nome_completo, whatsapp_atendimento';

export const SELECT_PRODUTO_CATALOGO_COM_VARIACOES =
  `${SELECT_PRODUTO_PUBLICO}, variacoes:variacoes_produto(${SELECT_VARIACAO_PUBLICA})` as const;

export const SELECT_AGENDAMENTO_PUBLICO_COM_RELACOES =
  `${SELECT_AGENDAMENTO_PUBLICO}, produto:produtos(nome), profissional:usuarios_loja!agendamentos_servicos_profissional_id_fkey(nome_completo)` as const;

export const SELECT_PAGAMENTO_PEDIDO_COM_FORMA =
  `${SELECT_PAGAMENTO_PEDIDO_PUBLICO}, forma_pagamento:formas_pagamento(${SELECT_FORMA_PAGAMENTO_PUBLICA})` as const;

export const SELECT_PEDIDO_PUBLICO_COMPLETO =
  `${SELECT_PEDIDO_PUBLICO}, cliente:clientes(${SELECT_CLIENTE_PUBLICO}), vendedor:usuarios_loja!pedidos_vendedor_id_fkey(${SELECT_VENDEDOR_PUBLICO}), itens:itens_pedido(${SELECT_ITEM_PEDIDO_PUBLICO}), pagamentos:pagamentos_pedido(${SELECT_PAGAMENTO_PEDIDO_COM_FORMA}), pedido_entregas:pedido_entregas(${SELECT_PEDIDO_ENTREGA_PUBLICO}), pagamentos_previstos:pedidos_pagamentos_previstos(${SELECT_PAGAMENTO_PREVISTO_PUBLICO}), agendamentos:agendamentos_servicos(${SELECT_AGENDAMENTO_PUBLICO_COM_RELACOES})` as const;
