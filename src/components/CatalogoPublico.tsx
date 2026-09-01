import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Share2,
  X,
  Tag,
  Zap,
  AlertTriangle,
  CheckCircle2,
  TrendingUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Loja, Produto, VariacaoProduto, Categoria, FormaEntrega, ModoExibicaoCatalogo, Cupom, Cliente } from '../types';
import {
  obterRegrasPrecificacao,
  avaliarNivelCarrinho,
  calcularPrecoUnitarioPorTabela
} from '../services/pricingEngine';
import { LayoutGrid, List, Smartphone, Info, Copy, QrCode, ExternalLink, Ticket, Check, Loader2, User, Phone, MapPin, UserCheck, Edit2 } from 'lucide-react';
import { paymentGatewayService, PixDinamicoResponse } from '../services/paymentGatewayService';
import { CupomService } from '../services/cupomService';
import { audioService } from '../services/audioService';
import { ModalBuscaClienteCatalogo } from './ModalBuscaClienteCatalogo';
import { ModalContatoClienteCatalogo, DadosContatoCliente } from './ModalContatoClienteCatalogo';
import { ModalEnderecoClienteCatalogo, DadosEnderecoCliente } from './ModalEnderecoClienteCatalogo';
import { ChatRubiCatalogo } from './ChatRubiCatalogo';

interface ItemCarrinhoPublico {
  id: string;
  produto: Produto;
  variacao?: VariacaoProduto | null;
  quantidade: number;
}

interface PedidoConcluidoInfo {
  numeroPedido: number;
  whatsAppUrl: string;
  pixInfo?: PixDinamicoResponse | null;
  linkPagamento?: string | null;
  preferenceId?: string | null;
}

export const CatalogoPublico: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loja, setLoja] = useState<Loja | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [formasEntrega, setFormasEntrega] = useState<FormaEntrega[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);

  const [busca, setBusca] = useState<string>('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('todas');
  const [carrinho, setCarrinho] = useState<ItemCarrinhoPublico[]>([]);
  const [drawerCarrinhoAberto, setDrawerCarrinhoAberto] = useState<boolean>(false);
  const [produtoModalVariacao, setProdutoModalVariacao] = useState<Produto | null>(null);

  // Modo de exibição
  const [modoExibicaoPublico, setModoExibicaoPublico] = useState<ModoExibicaoCatalogo>('grade');
  const [pedidoConcluidoModal, setPedidoConcluidoModal] = useState<PedidoConcluidoInfo | null>(null);
  const [pixCopiado, setPixCopiado] = useState<boolean>(false);

  // Tratamento do Retorno Mercado Pago & Polling do Pix
  const [searchParams] = useSearchParams();
  const [modalRetornoMP, setModalRetornoMP] = useState<{
    aberto: boolean;
    pedidoNumero: number;
    sucesso: boolean;
    mensagem: string;
  } | null>(null);
  const [pixAprovadoEmTempoReal, setPixAprovadoEmTempoReal] = useState<boolean>(false);
  const [verificandoPixManual, setVerificandoPixManual] = useState<boolean>(false);

  const [nomeCliente, setNomeCliente] = useState<string>('');
  const [whatsappCliente, setWhatsappCliente] = useState<string>('');
  const [enderecoEntrega, setEnderecoEntrega] = useState<string>('');
  const [formaEntregaEscolhida, setFormaEntregaEscolhida] = useState<FormaEntrega | null>(null);
  const [observacoes, setObservacoes] = useState<string>('');
  const [enviandoPedido, setEnviandoPedido] = useState<boolean>(false);

  // Estados de Identificação do Cliente (3 Botões)
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [modalBuscaClienteAberto, setModalBuscaClienteAberto] = useState<boolean>(false);
  const [modalContatoAberto, setModalContatoAberto] = useState<boolean>(false);
  const [modalEnderecoAberto, setModalEnderecoAberto] = useState<boolean>(false);
  const [dadosContato, setDadosContato] = useState<DadosContatoCliente>({
    nome: '',
    telefone: '',
    telefoneIsWhatsapp: true
  });
  const [dadosEndereco, setDadosEndereco] = useState<DadosEnderecoCliente>({
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: ''
  });

  const handleSelecionarCliente = (cliente: Cliente) => {
    setClienteSelecionado(cliente);
    setNomeCliente(cliente.nome || '');
    const tel = cliente.whatsapp || cliente.telefone || cliente.telefone2 || '';
    setWhatsappCliente(tel);

    setDadosContato({
      nome: cliente.nome || '',
      telefone: tel,
      telefoneIsWhatsapp: cliente.telefone_is_whatsapp ?? true,
      telefone2: cliente.telefone2 || '',
      telefone2IsWhatsapp: cliente.telefone2_is_whatsapp ?? false,
      cpfCnpj: cliente.numero_documento || '',
      dataAniversario: cliente.data_aniversario || '',
      email: cliente.email || ''
    });

    const endObj: DadosEnderecoCliente = {
      cep: cliente.endereco_cep || '',
      rua: cliente.endereco_logradouro || '',
      numero: cliente.endereco_numero || '',
      complemento: cliente.endereco_complemento || '',
      bairro: cliente.endereco_bairro || '',
      cidade: cliente.endereco_cidade || '',
      estado: cliente.endereco_estado || ''
    };
    setDadosEndereco(endObj);

    const partes = [
      endObj.rua,
      endObj.numero ? `nº ${endObj.numero}` : '',
      endObj.complemento ? `(${endObj.complemento})` : '',
      endObj.bairro ? `- ${endObj.bairro}` : '',
      endObj.cidade,
      endObj.estado ? `/${endObj.estado}` : '',
      endObj.cep ? `• CEP: ${endObj.cep}` : ''
    ].filter(Boolean);

    setEnderecoEntrega(partes.join(' '));
  };

  const handleSalvarContato = (novosDados: DadosContatoCliente) => {
    setDadosContato(novosDados);
    setNomeCliente(novosDados.nome);
    setWhatsappCliente(novosDados.telefone);
  };

  const handleSalvarEndereco = (novosDados: DadosEnderecoCliente, formatado: string) => {
    setDadosEndereco(novosDados);
    setEnderecoEntrega(formatado);
  };

  // Estados de Cupom de Desconto
  const [codigoCupomInput, setCodigoCupomInput] = useState<string>('');
  const [cupomAplicado, setCupomAplicado] = useState<Cupom | null>(null);
  const [descontoCupom, setDescontoCupom] = useState<number>(0);
  const [freteGratisCupom, setFreteGratisCupom] = useState<boolean>(false);
  const [validandoCupom, setValidandoCupom] = useState<boolean>(false);
  const [mensagemCupom, setMensagemCupom] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    const carregarCatalogo = async () => {
      try {
        setCarregando(true);
        let query = supabase.from('lojas').select('*');
        if (slug) {
          query = query.eq('slug_catalogo', slug);
        }
        const { data: lojas } = await query.limit(1);

        if (lojas && lojas.length > 0) {
          const l = lojas[0];
          setLoja(l);

          // Configuração de exibição inicial
          const catConfig = l.configuracoes_extras?.catalogo;
          if (catConfig?.modo_exibicao) {
            setModoExibicaoPublico(catConfig.modo_exibicao);
          }

          const { data: prods } = await supabase
            .from('produtos')
            .select('*, variacoes:variacoes_produto(*)')
            .eq('loja_id', l.id)
            .eq('exibir_catalogo', true)
            .eq('ativo', true);
          if (prods) setProdutos(prods as unknown as Produto[]);

          const { data: cats } = await supabase
            .from('categorias')
            .select('*')
            .eq('loja_id', l.id)
            .eq('ativo', true)
            .order('ordem_exibicao');
          if (cats) setCategorias(cats);

          const { data: fretes } = await supabase
            .from('formas_entrega')
            .select('*')
            .eq('loja_id', l.id)
            .eq('ativo', true);
          if (fretes) {
            setFormasEntrega(fretes);
            if (fretes.length > 0) setFormaEntregaEscolhida(fretes[0]);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar catálogo:', err);
      } finally {
        setCarregando(false);
      }
    };

    carregarCatalogo();
  }, [slug]);

  // 1. Tratar Retorno do Mercado Pago (Redirecionamento pós-checkout)
  useEffect(() => {
    if (!loja?.id) return;

    const statusParam = searchParams.get('status') || searchParams.get('collection_status');
    const rawPedido = searchParams.get('pedido') || searchParams.get('external_reference')?.replace('PEDIDO_', '');
    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');

    if (!statusParam || !rawPedido) return;

    const pedidoNumero = Number(rawPedido);
    if (!pedidoNumero) return;

    const statusLimpo = statusParam.toLowerCase();
    const isAprovado = ['aprovado', 'approved'].includes(statusLimpo);
    const isPendente = ['pendente', 'pending', 'in_process'].includes(statusLimpo);

    const processarRetornoMP = async () => {
      if (isAprovado) {
        try {
          const accessToken = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.access_token;
          const res = await paymentGatewayService.confirmarPagamentoMercadoPago({
            lojaId: loja.id,
            pedidoNumero,
            paymentId: paymentId || undefined,
            status: 'approved',
            accessToken
          });

          audioService.playNewOrderSound();

          setModalRetornoMP({
            aberto: true,
            pedidoNumero,
            sucesso: true,
            mensagem: res.sucesso
              ? `Pagamento do Pedido #${pedidoNumero} confirmado com sucesso no Mercado Pago! O status do seu pedido já está PAGO e foi enviado para a loja preparar.`
              : `Pagamento do Pedido #${pedidoNumero} recebido! Atualizando status no sistema.`
          });
        } catch (err: any) {
          console.error('Erro ao confirmar retorno do Mercado Pago:', err);
          setModalRetornoMP({
            aberto: true,
            pedidoNumero,
            sucesso: true,
            mensagem: `Pagamento do Pedido #${pedidoNumero} processado com sucesso!`
          });
        }
      } else if (isPendente) {
        setModalRetornoMP({
          aberto: true,
          pedidoNumero,
          sucesso: false,
          mensagem: `O pagamento do Pedido #${pedidoNumero} está em análise/processamento no Mercado Pago. Assim que for compensado, o status será atualizado automaticamente.`
        });
      } else {
        setModalRetornoMP({
          aberto: true,
          pedidoNumero,
          sucesso: false,
          mensagem: `O pagamento do Pedido #${pedidoNumero} não foi concluído ou foi cancelado no Mercado Pago.`
        });
      }

      // Limpar parâmetros da URL para evitar loops ao recarregar a página
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    processarRetornoMP();
  }, [loja?.id, searchParams]);

  // 2. Polling em Tempo Real para Pix Dinâmico no Modal
  useEffect(() => {
    if (!pedidoConcluidoModal?.pixInfo?.transacaoId || pixAprovadoEmTempoReal || !loja?.id) {
      return;
    }

    const transacaoId = pedidoConcluidoModal.pixInfo.transacaoId;
    const pedidoNumero = pedidoConcluidoModal.numeroPedido;
    const accessToken = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.access_token;

    let ativo = true;

    const checarStatusPix = async () => {
      try {
        const res = await paymentGatewayService.confirmarPagamentoMercadoPago({
          lojaId: loja.id,
          pedidoNumero,
          paymentId: transacaoId,
          accessToken
        });

        if (ativo && (res.status === 'approved' || res.status === 'pago' || res.jaPago)) {
          setPixAprovadoEmTempoReal(true);
          audioService.playNewOrderSound();
        }
      } catch (err) {
        console.warn('Checagem em segundo plano do Pix:', err);
      }
    };

    const intervalId = setInterval(checarStatusPix, 4000);

    return () => {
      ativo = false;
      clearInterval(intervalId);
    };
  }, [pedidoConcluidoModal, pixAprovadoEmTempoReal, loja?.id]);

  const handleVerificarPixManualmente = async () => {
    if (!pedidoConcluidoModal?.pixInfo?.transacaoId || !loja?.id) return;
    setVerificandoPixManual(true);
    try {
      const transacaoId = pedidoConcluidoModal.pixInfo.transacaoId;
      const pedidoNumero = pedidoConcluidoModal.numeroPedido;
      const accessToken = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.access_token;

      const res = await paymentGatewayService.confirmarPagamentoMercadoPago({
        lojaId: loja.id,
        pedidoNumero,
        paymentId: transacaoId,
        accessToken
      });

      if (res.status === 'approved' || res.status === 'pago' || res.jaPago) {
        setPixAprovadoEmTempoReal(true);
        audioService.playNewOrderSound();
      } else {
        alert('O pagamento ainda não foi identificado como aprovado pelo banco. Aguarde alguns instantes e tente novamente.');
      }
    } catch (err: any) {
      alert(`Não foi possível verificar no momento: ${err.message || 'Tente novamente em instantes.'}`);
    } finally {
      setVerificandoPixManual(false);
    }
  };


  const corTema = loja?.cor_primaria || '#10B981';

  // Carregar e Avaliar Regras de Precificação em Tempo Real
  const regrasAtivas = useMemo(() => obterRegrasPrecificacao(loja), [loja]);

  const avaliacaoCarrinho = useMemo(() => {
    return avaliarNivelCarrinho(carrinho, regrasAtivas);
  }, [carrinho, regrasAtivas]);

  const contextoRubi = useMemo(() => {
    if (!loja) return null;
    return {
      loja,
      categorias,
      produtos,
      formasEntrega,
      regrasAtivas
    };
  }, [loja, categorias, produtos, formasEntrega, regrasAtivas]);

  const totalItens = avaliacaoCarrinho.totalPecas;
  const subtotal = avaliacaoCarrinho.totalFinal;
  const valorFrete = Number(formaEntregaEscolhida?.valor_taxa || 0);
  const valorFreteEfetivo = freteGratisCupom ? 0 : valorFrete;
  const total = Math.max(0, subtotal - descontoCupom) + valorFreteEfetivo;

  // Revalidar cupom caso o subtotal mude
  useEffect(() => {
    if (cupomAplicado && loja?.id) {
      CupomService.validarCupomCatalogo(loja.id, cupomAplicado.codigo, subtotal).then(res => {
        if (res.valido) {
          setDescontoCupom(res.descontoCalculado);
          setFreteGratisCupom(res.freteGratis);
        } else {
          setCupomAplicado(null);
          setDescontoCupom(0);
          setFreteGratisCupom(false);
          setMensagemCupom({ tipo: 'erro', texto: res.mensagem || 'Cupom removido.' });
        }
      });
    }
  }, [subtotal, cupomAplicado?.codigo, loja?.id]);

  const handleAplicarCupom = async () => {
    if (!loja?.id || !codigoCupomInput.trim()) return;
    setValidandoCupom(true);
    setMensagemCupom(null);
    try {
      const res = await CupomService.validarCupomCatalogo(loja.id, codigoCupomInput, subtotal);
      if (res.valido && res.cupom) {
        setCupomAplicado(res.cupom);
        setDescontoCupom(res.descontoCalculado);
        setFreteGratisCupom(res.freteGratis);
        setMensagemCupom({
          tipo: 'sucesso',
          texto: res.freteGratis
            ? 'Cupom de Frete Grátis aplicado com sucesso! 🚚'
            : `Cupom ${res.cupom.codigo} aplicado: R$ ${res.descontoCalculado.toFixed(2)} de desconto! 🎉`
        });
      } else {
        setCupomAplicado(null);
        setDescontoCupom(0);
        setFreteGratisCupom(false);
        setMensagemCupom({
          tipo: 'erro',
          texto: res.mensagem || 'Cupom inválido ou não encontrado.'
        });
      }
    } catch (err) {
      setMensagemCupom({ tipo: 'erro', texto: 'Erro ao validar cupom.' });
    } finally {
      setValidandoCupom(false);
    }
  };

  const handleRemoverCupom = () => {
    setCupomAplicado(null);
    setDescontoCupom(0);
    setFreteGratisCupom(false);
    setCodigoCupomInput('');
    setMensagemCupom(null);
  };

  const adicionarAoCarrinho = (produto: Produto, variacao?: VariacaoProduto | null, quantidade: number = 1) => {
    const key = variacao ? `${produto.id}-${variacao.id}` : `${produto.id}`;
    
    setCarrinho(prev => {
      const idx = prev.findIndex(i => i.id === key);
      if (idx >= 0) {
        const cp = [...prev];
        cp[idx] = {
          ...cp[idx],
          quantidade: cp[idx].quantidade + quantidade
        };
        return cp;
      } else {
        return [
          ...prev,
          {
            id: key,
            produto,
            variacao,
            quantidade
          }
        ];
      }
    });
  };

  const atualizarQtdCarrinho = (index: number, novaQtd: number) => {
    if (novaQtd <= 0) {
      setCarrinho(prev => prev.filter((_, i) => i !== index));
      return;
    }
    setCarrinho(prev => {
      const cp = [...prev];
      cp[index] = {
        ...cp[index],
        quantidade: novaQtd
      };
      return cp;
    });
  };

  const handleEnviarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || carrinho.length === 0) return;

    if (!nomeCliente.trim() || !whatsappCliente.trim()) {
      setModalContatoAberto(true);
      alert('Por favor, informe seu nome e WhatsApp clicando no botão "Contato" para finalizar o pedido.');
      return;
    }

    try {
      setEnviandoPedido(true);

      // 1. Criar ou Atualizar Cliente na base de dados do HUBI
      let clienteFinalId = clienteSelecionado?.id || null;

      console.group('🛒 [HUBI Catálogo] Processando Pedido e Cliente');
      console.info('Cliente selecionado prévio:', clienteSelecionado);
      console.info('Dados de contato:', { nomeCliente, whatsappCliente, dadosContato });
      console.info('Dados de endereço:', { enderecoEntrega, dadosEndereco });

      try {
        console.log('💾 Persistindo cliente na base HUBI...');
        const { data: rpcCli, error: rpcCliErr } = await supabase.rpc('salvar_cliente_catalogo', {
          p_loja_id: loja.id,
          p_nome: nomeCliente.trim(),
          p_telefone: whatsappCliente.trim(),
          p_email: dadosContato.email?.trim() || null,
          p_cpf_cnpj: dadosContato.cpfCnpj?.trim() || null,
          p_aniversario: dadosContato.dataAniversario || null,
          p_endereco: enderecoEntrega || null,
          p_cliente_id: clienteFinalId
        });

        if (!rpcCliErr && rpcCli?.sucesso && rpcCli?.cliente_id) {
          console.log('✅ Cliente persistido via RPC no HUBI! ID:', rpcCli.cliente_id, rpcCli.cliente);
          clienteFinalId = rpcCli.cliente_id;
          if (rpcCli.cliente) setClienteSelecionado(rpcCli.cliente);
        } else {
          // Fallback para operação direta na tabela caso RPC ainda não exista
          if (!clienteFinalId) {
            console.log('Tentando inserção direta na tabela public.clientes...');
            const { data: novoCliente, error: erroNovoCliente } = await supabase
              .from('clientes')
              .insert([
                {
                  loja_id: loja.id,
                  nome: nomeCliente.trim(),
                  telefone: whatsappCliente.trim(),
                  whatsapp: whatsappCliente.trim(),
                  email: dadosContato.email?.trim() || null,
                  numero_documento: dadosContato.cpfCnpj?.trim() || null,
                  data_aniversario: dadosContato.dataAniversario || null,
                  endereco_principal: enderecoEntrega || null,
                  tabela_preco_padrao: 'varejo'
                }
              ])
              .select()
              .single();

            if (erroNovoCliente) {
              console.error('❌ Erro ao salvar novo cliente no Supabase (verifique as políticas RLS no schema.sql):', erroNovoCliente);
            } else if (novoCliente) {
              console.log('✅ Novo cliente cadastrado com sucesso no HUBI! ID:', novoCliente.id, novoCliente);
              clienteFinalId = novoCliente.id;
              setClienteSelecionado(novoCliente);
            }
          } else {
            console.log('Tentando atualização direta na tabela public.clientes...');
            const { data: cliAtualizado, error: erroAtualizar } = await supabase
              .from('clientes')
              .update({
                nome: nomeCliente.trim(),
                telefone: whatsappCliente.trim(),
                whatsapp: whatsappCliente.trim(),
                email: dadosContato.email?.trim() || null,
                numero_documento: dadosContato.cpfCnpj?.trim() || null,
                data_aniversario: dadosContato.dataAniversario || null,
                endereco_principal: enderecoEntrega || null
              })
              .eq('id', clienteFinalId)
              .select()
              .single();

            if (erroAtualizar) {
              console.warn('Aviso ao atualizar cliente:', erroAtualizar);
            } else if (cliAtualizado) {
              console.log('✅ Cliente atualizado no banco HUBI:', cliAtualizado);
            }
          }
        }
      } catch (cliErr) {
        console.error('Exceção ao persistir cliente:', cliErr);
      }
      console.groupEnd();

      const dadosObs = [
        `Cliente: ${nomeCliente} (${whatsappCliente})`,
        dadosContato.cpfCnpj ? `CPF/CNPJ: ${dadosContato.cpfCnpj}` : '',
        dadosContato.email ? `E-mail: ${dadosContato.email}` : '',
        cupomAplicado ? `[Cupom: ${cupomAplicado.codigo}]` : '',
        observacoes ? `Obs: ${observacoes}` : ''
      ].filter(Boolean).join('. ');

      const { data: pedidoCriado, error: erroPedido } = await supabase
        .from('pedidos')
        .insert([
          {
            loja_id: loja.id,
            cliente_id: clienteFinalId,
            origem: 'catalogo_online',
            status: 'pendente',
            tabela_preco_aplicada: avaliacaoCarrinho.tabelaAtiva,
            subtotal,
            valor_frete: valorFreteEfetivo,
            valor_desconto: (Number(avaliacaoCarrinho.economiaTotal || 0) + Number(descontoCupom || 0)),
            valor_total: total,
            saldo_devedor: total,
            endereco_entrega: `${formaEntregaEscolhida?.nome || 'Entrega'} - ${enderecoEntrega || 'Retirada'}`,
            observacoes: dadosObs,
            data_venda: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (erroPedido || !pedidoCriado) throw erroPedido;

      const itensFormatados = carrinho.map(item => {
        const precoUnitario = calcularPrecoUnitarioPorTabela(
          item.produto,
          item.variacao,
          avaliacaoCarrinho.tabelaAtiva,
          avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? regrasAtivas.descontoAutoatacado : regrasAtivas.descontoAtacado
        );
        return {
          loja_id: loja.id,
          pedido_id: pedidoCriado.id,
          produto_id: item.produto.id,
          variacao_id: item.variacao?.id || null,
          tabela_preco_utilizada: avaliacaoCarrinho.tabelaAtiva,
          nome_produto: item.produto.nome,
          rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
          preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
          preco_venda_unitario: precoUnitario,
          quantidade: item.quantidade,
          subtotal: precoUnitario * item.quantidade
        };
      });

      await supabase.from('itens_pedido').insert(itensFormatados);

      const itensMsg = carrinho
        .map(i => {
          const precoUnitario = calcularPrecoUnitarioPorTabela(
            i.produto,
            i.variacao,
            avaliacaoCarrinho.tabelaAtiva,
            avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? regrasAtivas.descontoAutoatacado : regrasAtivas.descontoAtacado
          );
          const subtotalItem = precoUnitario * i.quantidade;
          return `▫️ *${i.quantidade}x* ${i.produto.nome} ${i.variacao ? `(${i.variacao.valor_variacao_1})` : ''} - R$ ${subtotalItem.toFixed(2)}`;
        })
        .join('\n');

      const tabelaTexto =
        avaliacaoCarrinho.tabelaAtiva === 'autoatacado'
          ? '⚡ Autoatacado (Distribuidor)'
          : avaliacaoCarrinho.tabelaAtiva === 'atacado'
          ? '🏷️ Atacado'
          : '🛒 Varejo';

      const msgWhatsApp = `🛍️ *NOVO PEDIDO ONLINE #${pedidoCriado.numero_pedido}*

Olá, ${loja.nome_fantasia}! Gostaria de confirmar meu pedido feito pelo catálogo online:

${itensMsg}

━━━━━━━━━━━━━━━━━━━━
🏷️ *Tabela Aplicada:* ${tabelaTexto}
${avaliacaoCarrinho.economiaTotal > 0 ? `💰 *Economia Obtida:* R$ ${avaliacaoCarrinho.economiaTotal.toFixed(2)}\n` : ''}💰 *Subtotal:* R$ ${subtotal.toFixed(2)}
🛵 *Entrega:* ${formaEntregaEscolhida?.nome || 'A combinar'} (+ R$ ${valorFrete.toFixed(2)})
💵 *TOTAL A PAGAR:* R$ ${total.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
👤 *Nome:* ${nomeCliente}
📱 *WhatsApp:* ${whatsappCliente}
📍 *Endereço:* ${enderecoEntrega || 'Retirada no Balcão'}
${observacoes ? `📝 *Observação:* ${observacoes}\n` : ''}
Fico no aguardo da confirmação! ✨`;

      const lojaPhone = loja.whatsapp.replace(/\D/g, '');
      const urlWhats = `https://api.whatsapp.com/send?phone=55${lojaPhone}&text=${encodeURIComponent(msgWhatsApp)}`;
      
      let pixInfoRes: PixDinamicoResponse | null = null;
      let linkPagamentoUrl: string | null = null;
      let linkPreferenceId: string | null = null;

      // Gerar cobrança Mercado Pago se ativado
      if (loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.ativo) {
        const emailEfetivo = dadosContato.email?.trim() || clienteSelecionado?.email?.trim() || undefined;

        pixInfoRes = await paymentGatewayService.gerarPixMercadoPago({
          loja,
          valor: total,
          descricao: `Pedido #${pedidoCriado.numero_pedido} - ${loja.nome_fantasia}`,
          pedidoNumero: pedidoCriado.numero_pedido,
          emailCliente: emailEfetivo,
          nomeCliente: nomeCliente
        });

        const itensPreference = carrinho.map(c => {
          const precoUnitario = calcularPrecoUnitarioPorTabela(
            c.produto,
            c.variacao,
            avaliacaoCarrinho.tabelaAtiva,
            avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? regrasAtivas.descontoAutoatacado : regrasAtivas.descontoAtacado
          );
          return {
            titulo: `${c.produto.nome}${c.variacao ? ` - ${c.variacao.valor_variacao_1}` : ''}`,
            quantidade: c.quantidade,
            precoUnitario: precoUnitario
          };
        });

        if (valorFreteEfetivo > 0) {
          itensPreference.push({
            titulo: `Frete / Entrega (${formaEntregaEscolhida?.nome || 'Padrão'})`,
            quantidade: 1,
            precoUnitario: valorFreteEfetivo
          });
        }

        const linkRes = await paymentGatewayService.gerarLinkMercadoPago({
          loja,
          itens: itensPreference,
          pedidoNumero: pedidoCriado.numero_pedido,
          clienteEmail: emailEfetivo
        });

        if (linkRes.sucesso && linkRes.linkPagamento) {
          linkPagamentoUrl = linkRes.linkPagamento;
          linkPreferenceId = linkRes.preferenceId || null;
        }
      }

      setCarrinho([]);
      setDrawerCarrinhoAberto(false);
      setPixAprovadoEmTempoReal(false);

      setPedidoConcluidoModal({
        numeroPedido: pedidoCriado.numero_pedido,
        whatsAppUrl: (loja.resumo_whatsapp ?? true) ? urlWhats : '',
        pixInfo: pixInfoRes?.sucesso ? pixInfoRes : null,
        linkPagamento: linkPagamentoUrl,
        preferenceId: linkPreferenceId
      });
    } catch (err: any) {
      console.error('Erro ao enviar pedido:', err);
      alert(`Erro ao finalizar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setEnviandoPedido(false);
    }
  };

  const handleAbrirCheckoutMP = () => {
    if (!pedidoConcluidoModal) return;

    const MP_SDK = (window as any).MercadoPago;
    const publicKey = loja?.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.public_key;

    if (MP_SDK && publicKey && pedidoConcluidoModal.preferenceId) {
      try {
        console.info('🚀 [Mercado Pago SDK] Abrindo Checkout Modal oficial (padrão TSB)...', {
          publicKey,
          preferenceId: pedidoConcluidoModal.preferenceId
        });
        const mp = new MP_SDK(publicKey.trim(), { locale: 'pt-BR' });
        mp.checkout({
          preference: { id: pedidoConcluidoModal.preferenceId },
          autoOpen: true,
        });
        return;
      } catch (err) {
        console.warn('⚠️ Falha ao abrir modal SDK, usando redirecionamento direto:', err);
      }
    }

    if (pedidoConcluidoModal.linkPagamento) {
      console.info('🌐 [Mercado Pago Fallback] Abrindo link de pagamento em nova aba:', pedidoConcluidoModal.linkPagamento);
      window.open(pedidoConcluidoModal.linkPagamento, '_blank');
    }
  };

  const getEstoqueTotal = (p: Produto) => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0);
    }
    return Number(p.quantidade_estoque || 0);
  };

  const catConfig = loja?.configuracoes_extras?.catalogo;
  const semEstoqueModo = catConfig?.produtos_sem_estoque || 'exibir';
  const bannerAtivo = (catConfig?.exibir_banner ?? Boolean(loja?.url_banner)) && Boolean(loja?.url_banner);
  const aceitaPedidos = loja?.aceita_pedidos_online ?? true;

  const produtosFiltrados = produtos.filter(p => {
    const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoriaSelecionada === 'todas' || p.categoria_id === categoriaSelecionada;
    
    // Regra de produtos sem estoque
    if (semEstoqueModo === 'ocultar') {
      const est = getEstoqueTotal(p);
      if (est <= 0) return false;
    }

    return matchBusca && matchCat;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* HEADER PRINCIPAL DO CATÁLOGO COM COR DO TEMA */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {loja?.url_logo ? (
            <img src={loja.url_logo} alt={loja.nome_fantasia} className="w-10 h-10 rounded-xl object-contain bg-slate-900 border border-slate-800" />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow text-base"
              style={{ backgroundColor: corTema }}
            >
              {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
            </div>
          )}
          <div>
            <h1 className="font-extrabold text-sm text-slate-100 leading-tight">
              {loja?.nome_fantasia || 'Catálogo Online'}
            </h1>
            <span className="text-[11px] font-medium flex items-center gap-1" style={{ color: aceitaPedidos ? corTema : '#94A3B8' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: aceitaPedidos ? corTema : '#64748B' }}></span>
              {aceitaPedidos ? 'Aberto para pedidos' : 'Modo Mostruário / Consulta'}
            </span>
          </div>
        </div>

        <button
          onClick={() => setDrawerCarrinhoAberto(true)}
          className="relative px-3.5 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-lg transition hover:brightness-110 cursor-pointer"
          style={{ backgroundColor: corTema }}
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="hidden sm:inline">Carrinho</span>
          {totalItens > 0 && (
            <span className="bg-white text-slate-950 text-[11px] font-black px-1.5 py-0.2 rounded-full">
              {totalItens}
            </span>
          )}
        </button>
      </header>

      {/* BANNER DA LOJA SE HABILITADO */}
      {bannerAtivo && loja?.url_banner && (
        <div className="w-full bg-slate-950 border-b border-slate-800/80 overflow-hidden">
          <div className="max-w-6xl mx-auto">
            <img
              src={loja.url_banner}
              alt="Banner Promocional"
              className="w-full max-h-48 sm:max-h-64 object-cover"
            />
          </div>
        </div>
      )}

      {/* AVISO DE CATÁLOGO APENAS PARA CONSULTA */}
      {!aceitaPedidos && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs text-amber-300 flex items-center justify-center gap-2">
          <Info className="w-4 h-4" />
          <span>Nosso catálogo online está no momento configurado apenas para consulta e mostruário de produtos.</span>
        </div>
      )}

      {loja?.sobre_loja && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-4 border-b border-slate-800/80 text-center">
          <p className="text-xs text-slate-300 max-w-xl mx-auto italic">
            "{loja.sobre_loja}"
          </p>
        </div>
      )}

      <div className="max-w-6xl mx-auto w-full p-4 space-y-4">
        {/* BUSCA E SELETORES DE MODO DE EXIBIÇÃO */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="O que você está procurando hoje?"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* BOTÕES DE ALTERNAR MODO DE EXIBIÇÃO (LISTA / GRADE / INSTAVIEW) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1 flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setModoExibicaoPublico('lista')}
              className={`p-2 rounded-xl transition cursor-pointer ${
                modoExibicaoPublico === 'lista' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Modo Lista"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setModoExibicaoPublico('grade')}
              className={`p-2 rounded-xl transition cursor-pointer ${
                modoExibicaoPublico === 'grade' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Modo Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setModoExibicaoPublico('instaview')}
              className={`p-2 rounded-xl transition cursor-pointer ${
                modoExibicaoPublico === 'instaview' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Modo Instaview"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ABAS DE CATEGORIAS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCategoriaSelecionada('todas')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              categoriaSelecionada === 'todas'
                ? 'text-white shadow'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
            style={{ backgroundColor: categoriaSelecionada === 'todas' ? corTema : undefined }}
          >
            Todos
          </button>
          {categorias.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoriaSelecionada(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                categoriaSelecionada === cat.id
                  ? 'text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
              style={{ backgroundColor: categoriaSelecionada === cat.id ? corTema : undefined }}
            >
              {cat.nome}
            </button>
          ))}
        </div>

        {/* LISTAGEM DE PRODUTOS NOS 3 MODOS */}
        {carregando ? (
          <div className="text-center py-20 text-slate-500 text-sm">Carregando catálogo...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm">Nenhum produto disponível no momento.</div>
        ) : modoExibicaoPublico === 'lista' ? (
          /* ================= MODO LISTA ================= */
          <div className="space-y-2.5 pt-2">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
              const estoqueTotal = getEstoqueTotal(produto);
              const esgotado = estoqueTotal <= 0 && semEstoqueModo === 'indisponivel';

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-950 shrink-0">
                      <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover" />
                      {esgotado && (
                        <span className="absolute inset-0 bg-black/70 flex items-center justify-center text-[9px] font-black text-rose-300">
                          ESGOTADO
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-bold text-xs sm:text-sm text-slate-100 truncate">{produto.nome}</h3>
                      {produto.descricao && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{produto.descricao}</p>
                      )}
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="font-black text-sm" style={{ color: corTema }}>
                          R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                        </span>
                        {produto.preco_venda_atacado && (
                          <span className="text-[10px] text-indigo-400 hidden sm:inline">
                            Atacado ({produto.qtd_minima_atacado}+): R$ {Number(produto.preco_venda_atacado).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={esgotado}
                    onClick={() => {
                      if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                        setProdutoModalVariacao(produto);
                      } else {
                        adicionarAoCarrinho(produto);
                      }
                    }}
                    className="px-3 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-40 shrink-0"
                    style={{ backgroundColor: corTema }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Adicionar</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : modoExibicaoPublico === 'instaview' ? (
          /* ================= MODO INSTAVIEW (FEED) ================= */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2 max-w-4xl mx-auto">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&auto=format&fit=crop&q=80';
              const estoqueTotal = getEstoqueTotal(produto);
              const esgotado = estoqueTotal <= 0 && semEstoqueModo === 'indisponivel';

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between"
                >
                  <div className="relative aspect-square w-full bg-slate-950">
                    <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover" />
                    {esgotado && (
                      <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                        <span className="bg-rose-600 text-white font-black text-xs px-4 py-1 rounded-full shadow-lg">
                          ESGOTADO
                        </span>
                      </div>
                    )}
                    {produto.destaque && (
                      <span className="absolute top-3 left-3 bg-amber-500 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full shadow">
                        ★ Destaque
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-bold text-sm text-slate-100">{produto.nome}</h3>
                      {produto.descricao && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{produto.descricao}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">A partir de</span>
                        <span className="text-base font-black" style={{ color: corTema }}>
                          R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={esgotado}
                        onClick={() => {
                          if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                            setProdutoModalVariacao(produto);
                          } else {
                            adicionarAoCarrinho(produto);
                          }
                        }}
                        className="px-4 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer disabled:opacity-40"
                        style={{ backgroundColor: corTema }}
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span>Adicionar ao Pedido</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ================= MODO GRADE (DEFAULT) ================= */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pt-2">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
              const estoqueTotal = getEstoqueTotal(produto);
              const esgotado = estoqueTotal <= 0 && semEstoqueModo === 'indisponivel';

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between shadow-sm hover:border-slate-700 transition group"
                >
                  <div>
                    <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-950 mb-2.5">
                      <img
                        src={fotoUrl}
                        alt={produto.nome}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      {esgotado ? (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <span className="bg-rose-600 text-white font-black text-[9px] px-2 py-0.5 rounded shadow">
                            ESGOTADO
                          </span>
                        </div>
                      ) : (
                        produto.promocao_ativa && produto.preco_promocional && (
                          <span className="absolute top-2 left-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                            OFERTA
                          </span>
                        )
                      )}
                    </div>

                    <h3 className="font-bold text-xs text-slate-100 line-clamp-2 leading-snug">
                      {produto.nome}
                    </h3>

                    {produto.preco_venda_atacado && (
                      <span className="text-[10px] text-indigo-400 block mt-1">
                        A partir de {produto.qtd_minima_atacado} un: <b>R$ {Number(produto.preco_venda_atacado).toFixed(2)}</b>
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <div>
                      {produto.promocao_ativa && produto.preco_promocional && (
                        <span className="text-[10px] text-slate-500 line-through block leading-none">
                          R$ {Number(produto.preco_venda_varejo).toFixed(2)}
                        </span>
                      )}
                      <span className="font-black text-sm" style={{ color: corTema }}>
                        R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={esgotado}
                      onClick={() => {
                        if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                          setProdutoModalVariacao(produto);
                        } else {
                          adicionarAoCarrinho(produto);
                        }
                      }}
                      className="w-8 h-8 rounded-xl text-white flex items-center justify-center transition shadow-sm font-bold cursor-pointer disabled:opacity-40"
                      style={{ backgroundColor: corTema }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {produtoModalVariacao && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-100">{produtoModalVariacao.nome}</h3>
              <button onClick={() => setProdutoModalVariacao(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {produtoModalVariacao.variacoes?.map((variacao) => (
                <button
                  key={variacao.id}
                  onClick={() => {
                    adicionarAoCarrinho(produtoModalVariacao, variacao);
                    setProdutoModalVariacao(null);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 flex items-center justify-between text-left transition"
                >
                  <span className="font-bold text-xs text-slate-100">
                    {variacao.valor_variacao_1} {variacao.valor_variacao_2 ? `- ${variacao.valor_variacao_2}` : ''}
                  </span>
                  <span className="font-bold text-emerald-400 text-xs">
                    R$ {Number(variacao.preco_venda_varejo).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {drawerCarrinhoAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-end z-50 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
                <span>Seu Pedido ({totalItens} itens)</span>
              </h3>
              <button onClick={() => setDrawerCarrinhoAberto(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DESTAQUE DA TABELA ATIVA & BARRA DE PROGRESSO */}
            {carrinho.length > 0 && (
              <div className="p-3.5 mx-4 mt-3 rounded-2xl border transition-all space-y-2.5 bg-slate-900 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm">
                    {avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? (
                      <div className="flex items-center gap-1.5 text-amber-300">
                        <Zap className="w-4 h-4 fill-amber-300 text-amber-300 animate-pulse" />
                        <span className="bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
                          ⚡ Tabela Ativa: Autoatacado
                        </span>
                      </div>
                    ) : avaliacaoCarrinho.tabelaAtiva === 'atacado' ? (
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <Tag className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">
                          🏷️ Tabela Ativa: Atacado
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <ShoppingBag className="w-4 h-4 text-slate-400" />
                        <span>🛒 Tabela Ativa: Varejo</span>
                      </div>
                    )}
                  </div>

                  {avaliacaoCarrinho.economiaTotal > 0 && (
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500 text-white shadow shadow-emerald-500/30 whitespace-nowrap">
                      Economia de R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* BARRA DE PROGRESSO DINÂMICA & MENSAGEM DE UPSELL */}
                {avaliacaoCarrinho.proximoNivel && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 leading-tight">
                        {(() => {
                          const proxNome = avaliacaoCarrinho.proximoNivel === 'autoatacado' ? 'Autoatacado' : 'Atacado';
                          const isAuto = avaliacaoCarrinho.proximoNivel === 'autoatacado';
                          const valMin = isAuto ? loja?.valor_minimo_padrao_autoatacado : loja?.valor_minimo_padrao_atacado;
                          const qtdMin = isAuto ? loja?.qtd_minima_padrao_autoatacado : loja?.qtd_minima_padrao_atacado;
                          const tipoMin = isAuto ? loja?.tipo_minimo_padrao_autoatacado : loja?.tipo_minimo_padrao_atacado;

                          if (tipoMin === 'quantidade' || (Number(qtdMin) > 0 && (!valMin || Number(valMin) === 0))) {
                            const faltamPecas = avaliacaoCarrinho.faltaPecasParaProximo;
                            return (
                              <>Faltam <b className="text-emerald-400">{faltamPecas} {faltamPecas === 1 ? 'peça' : 'peças'}</b> para {proxNome}!</>
                            );
                          }
                          const faltaVal = avaliacaoCarrinho.faltaValorParaProximo;
                          return (
                            <>Faltam <b className="text-emerald-400">R$ {faltaVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> para {proxNome}!</>
                          );
                        })()}
                      </span>
                      <span className="text-[10px] font-bold text-amber-300 ml-2">
                        {avaliacaoCarrinho.progressoGeralPercent}%
                      </span>
                    </div>

                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${avaliacaoCarrinho.progressoGeralPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {avaliacaoCarrinho.tabelaAtiva === 'autoatacado' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-semibold pt-1 border-t border-slate-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Nível Máximo! Você conquistou o preço de Autoatacado (Distribuidor).</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {carrinho.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm">Seu carrinho está vazio.</div>
              ) : (
                carrinho.map((item, idx) => {
                  const precoVarejoItem = Number(item.variacao ? item.variacao.preco_venda_varejo : item.produto.preco_venda_varejo) || 0;
                  const precoUnitarioAtivo = calcularPrecoUnitarioPorTabela(
                    item.produto,
                    item.variacao,
                    avaliacaoCarrinho.tabelaAtiva,
                    avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? regrasAtivas.descontoAutoatacado : regrasAtivas.descontoAtacado
                  );
                  const subtotalItem = precoUnitarioAtivo * item.quantidade;
                  const itemKey = item.variacao ? `${item.produto.id}-${item.variacao.id}` : `${item.produto.id}`;
                  const skuFracionado = avaliacaoCarrinho.skusFracionados.find(s => s.id === itemKey);

                  return (
                    <div key={idx} className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-xs text-slate-100 truncate">{item.produto.nome}</h4>
                          {item.variacao && (
                            <span className="text-[10px] text-slate-400 block">
                              {item.variacao.valor_variacao_1} {item.variacao.valor_variacao_2 ? `- ${item.variacao.valor_variacao_2}` : ''}
                            </span>
                          )}
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            {precoUnitarioAtivo < precoVarejoItem && (
                              <span className="text-[10px] text-slate-500 line-through">
                                R$ {(precoVarejoItem * item.quantidade).toFixed(2)}
                              </span>
                            )}
                            <span className="text-xs font-bold text-emerald-400">
                              R$ {subtotalItem.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              (R$ {precoUnitarioAtivo.toFixed(2)}/un)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center border border-slate-700 bg-slate-900 rounded-lg overflow-hidden shrink-0">
                          <button onClick={() => atualizarQtdCarrinho(idx, item.quantidade - 1)} className="p-1 text-slate-400 hover:text-white">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-xs font-bold text-slate-100 min-w-[20px] text-center">{item.quantidade}</span>
                          <button onClick={() => atualizarQtdCarrinho(idx, item.quantidade + 1)} className="p-1 text-slate-400 hover:text-white">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* ALERTA DE SKU FRACIONADO */}
                      {skuFracionado && (
                        <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 text-[10px] text-amber-300">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">
                              Aumente este item para <b>{skuFracionado.quantidadeMinimaExigida} un</b> para liberar {avaliacaoCarrinho.proximoNivel === 'autoatacado' ? 'autoatacado' : 'atacado'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => atualizarQtdCarrinho(idx, item.quantidade + skuFracionado.faltamUnidades)}
                            className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 font-black text-[10px] transition shrink-0 cursor-pointer shadow"
                          >
                            +{skuFracionado.faltamUnidades} un
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {carrinho.length > 0 && (
                <form id="formCheckout" onSubmit={handleEnviarPedido} className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-200 block">Identificação & Entrega</span>

                    {/* GRADE COM OS 3 BOTÕES */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setModalBuscaClienteAberto(true)}
                        className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/60 flex flex-col items-center justify-center text-center gap-1.5 transition cursor-pointer group shadow-sm"
                      >
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 flex items-center justify-center transition">
                          <UserCheck className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-200 group-hover:text-emerald-400 leading-tight">
                          Já tenho cadastro
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalContatoAberto(true)}
                        className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-sky-500/60 flex flex-col items-center justify-center text-center gap-1.5 transition cursor-pointer group shadow-sm relative"
                      >
                        {nomeCliente && whatsappCliente && (
                          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400"></span>
                        )}
                        <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 group-hover:bg-sky-500 group-hover:text-slate-950 flex items-center justify-center transition">
                          <Phone className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-200 group-hover:text-sky-400 leading-tight">
                          Contato
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalEnderecoAberto(true)}
                        className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-purple-500/60 flex flex-col items-center justify-center text-center gap-1.5 transition cursor-pointer group shadow-sm relative"
                      >
                        {enderecoEntrega && (
                          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400"></span>
                        )}
                        <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 group-hover:bg-purple-500 group-hover:text-slate-950 flex items-center justify-center transition">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-200 group-hover:text-purple-400 leading-tight">
                          Endereço
                        </span>
                      </button>
                    </div>

                    {/* CARDS COM RESUMO DOS DADOS PREENCHIDOS E OPÇÃO DE ALTERAR */}
                    <div className="space-y-2 pt-1">
                      {/* Resumo do Contato */}
                      <div
                        onClick={() => setModalContatoAberto(true)}
                        className="p-3 rounded-2xl bg-slate-800/70 border border-slate-700/80 hover:border-slate-600 flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${nomeCliente ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/60 text-slate-400'}`}>
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Contato
                              </span>
                              {nomeCliente ? (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300">
                                  PREENCHIDO
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300">
                                  OBRIGATÓRIO
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-slate-200 block truncate mt-0.5">
                              {nomeCliente ? `${nomeCliente} • ${whatsappCliente}` : 'Toque em Contato para informar Nome e WhatsApp'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-sky-400 font-bold hover:underline shrink-0 ml-2">
                          <Edit2 className="w-3 h-3" />
                          <span>{nomeCliente ? 'Alterar' : 'Preencher'}</span>
                        </div>
                      </div>

                      {/* Resumo do Endereço */}
                      <div
                        onClick={() => setModalEnderecoAberto(true)}
                        className="p-3 rounded-2xl bg-slate-800/70 border border-slate-700/80 hover:border-slate-600 flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${enderecoEntrega ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700/60 text-slate-400'}`}>
                            <MapPin className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Endereço
                              </span>
                              {enderecoEntrega ? (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300">
                                  PREENCHIDO
                                </span>
                              ) : (
                                <span className="text-[9px] font-medium text-slate-500">
                                  (Opcional / Retirada)
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-slate-200 block truncate mt-0.5">
                              {enderecoEntrega || 'Toque em Endereço para informar CEP, Rua e Bairro'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-purple-400 font-bold hover:underline shrink-0 ml-2">
                          <Edit2 className="w-3 h-3" />
                          <span>{enderecoEntrega ? 'Alterar' : 'Preencher'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder="Observações do pedido (opcional)..."
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>

                  {/* CAMPO DE CUPOM DE DESCONTO */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Possui cupom de desconto?</span>
                    </span>

                    {cupomAplicado ? (
                      <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                            ✓
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-100">{cupomAplicado.codigo}</span>
                            <span className="text-[10px] text-emerald-400 block">
                              {freteGratisCupom ? 'Frete Grátis Aplicado' : `R$ ${descontoCupom.toFixed(2)} OFF`}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoverCupom}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition text-xs"
                          title="Remover cupom"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="CÓDIGO DO CUPOM"
                            value={codigoCupomInput}
                            onChange={(e) => setCodigoCupomInput(e.target.value.toUpperCase())}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-bold placeholder:text-slate-500 placeholder:font-normal focus:outline-none focus:border-emerald-500 tracking-wider"
                          />
                          <button
                            type="button"
                            onClick={handleAplicarCupom}
                            disabled={!codigoCupomInput.trim() || validandoCupom}
                            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs transition cursor-pointer shrink-0"
                          >
                            {validandoCupom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aplicar'}
                          </button>
                        </div>

                        {mensagemCupom && (
                          <span
                            className={`text-[10px] block ${
                              mensagemCupom.tipo === 'sucesso' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-medium'
                            }`}
                          >
                            {mensagemCupom.texto}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </form>
              )}
            </div>

            {carrinho.length > 0 && (
              <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-3">
                <div className="space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="text-slate-200 font-semibold">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  {avaliacaoCarrinho.economiaTotal > 0 && (
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>Desconto de Volume ({avaliacaoCarrinho.tabelaAtiva}):</span>
                      <span>- R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {descontoCupom > 0 && (
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>Desconto Cupom ({cupomAplicado?.codigo}):</span>
                      <span>- R$ {descontoCupom.toFixed(2)}</span>
                    </div>
                  )}
                  {valorFrete > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Taxa de Entrega:</span>
                      {freteGratisCupom ? (
                        <span className="text-emerald-400 font-bold">GRÁTIS (Cupom)</span>
                      ) : (
                        <span>+ R$ {valorFrete.toFixed(2)}</span>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-white pt-1.5 border-t border-slate-800">
                    <span>Total do Pedido:</span>
                    <span className="text-emerald-400 text-lg">R$ {total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  form="formCheckout"
                  disabled={enviandoPedido}
                  className="w-full py-4 rounded-2xl text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer hover:brightness-110"
                  style={{ backgroundColor: corTema }}
                >
                  <Share2 className="w-5 h-5" />
                  <span>{enviandoPedido ? 'Enviando Pedido...' : aceitaPedidos ? 'Finalizar e Enviar Pedido' : 'Enviar Consulta via WhatsApp'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE SUCESSO / ORIENTAÇÕES PÓS-PEDIDO */}
      {pedidoConcluidoModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-lg"
              style={{ backgroundColor: `${corTema}25`, color: corTema }}
            >
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-100">
                Pedido #{pedidoConcluidoModal.numeroPedido} Enviado!
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Seu pedido foi registrado no sistema com sucesso.
              </p>
            </div>

            {/* Mensagem Personalizada de Orientações Pós-Pedido da Loja */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 text-left whitespace-pre-wrap leading-relaxed">
              {loja?.instrucoes_pos_pedido || 'Em breve entraremos em contato para confirmar os detalhes da sua compra. Agradecemos pela preferência!'}
            </div>

            {/* SE PIX FOI APROVADO EM TEMPO REAL */}
            {pixAprovadoEmTempoReal ? (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-center space-y-2 animate-in zoom-in-95 duration-200">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-black text-emerald-400">Pagamento Pix Confirmado! 🎉</h4>
                <p className="text-xs text-slate-300">
                  Identificamos o seu pagamento instantaneamente! O pedido está como <strong>PAGO</strong> e já foi enviado para a produção.
                </p>
                <Link
                  to={`/order-tracking/${pedidoConcluidoModal.numeroPedido}`}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-400 underline hover:text-emerald-300 font-semibold pt-1"
                  target="_blank"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Acompanhar status do pedido</span>
                </Link>
              </div>
            ) : pedidoConcluidoModal.pixInfo ? (
              /* SE HOUVER PIX DINÂMICO AGUARDANDO PAGAMENTO */
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center space-y-3">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400">
                  <QrCode className="w-4 h-4" />
                  <span>Pague agora com Pix Instantâneo</span>
                </div>

                {pedidoConcluidoModal.pixInfo.qrCodeBase64 ? (
                  <img
                    src={`data:image/png;base64,${pedidoConcluidoModal.pixInfo.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="w-44 h-44 mx-auto rounded-xl bg-white p-2 border border-emerald-500/40 shadow-lg"
                  />
                ) : null}

                {pedidoConcluidoModal.pixInfo.qrCode && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (pedidoConcluidoModal.pixInfo?.qrCode) {
                        await navigator.clipboard.writeText(pedidoConcluidoModal.pixInfo.qrCode);
                        setPixCopiado(true);
                        setTimeout(() => setPixCopiado(false), 2500);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{pixCopiado ? 'Código Pix Copiado!' : 'Copiar Código Pix (Copia e Cola)'}</span>
                  </button>
                )}

                <div className="pt-1 flex flex-col items-center gap-2">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Aguardando identificação do pagamento...</span>
                  </div>

                  <button
                    type="button"
                    disabled={verificandoPixManual}
                    onClick={handleVerificarPixManualmente}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {verificandoPixManual ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        <span>Verificando no Mercado Pago...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Já paguei no banco (Verificar agora)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {/* LINK / MODAL DE PAGAMENTO MERCADO PAGO / CARTÃO */}
            {!pixAprovadoEmTempoReal && pedidoConcluidoModal.linkPagamento && (
              <button
                type="button"
                onClick={handleAbrirCheckoutMP}
                className="w-full py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-600/25 transition cursor-pointer"
              >
                <span>Pagar com Cartão / Mercado Pago</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            )}

            <div className="space-y-2 pt-2">
              <Link
                to={`/order-tracking/${pedidoConcluidoModal.numeroPedido}`}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700"
                target="_blank"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                <span>Acompanhar Pedido #{pedidoConcluidoModal.numeroPedido}</span>
              </Link>

              {pedidoConcluidoModal.whatsAppUrl && (
                <a
                  href={pedidoConcluidoModal.whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Enviar Resumo no WhatsApp da Loja</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  setPedidoConcluidoModal(null);
                  setPixAprovadoEmTempoReal(false);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Voltar ao Catálogo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE RETORNO DO MERCADO PAGO */}
      {modalRetornoMP && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-lg ${
                modalRetornoMP.sucesso ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {modalRetornoMP.sucesso ? (
                <CheckCircle2 className="w-10 h-10" />
              ) : (
                <AlertTriangle className="w-10 h-10" />
              )}
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-100">
                {modalRetornoMP.sucesso ? `Pagamento Pedido #${modalRetornoMP.pedidoNumero} Confirmado!` : `Pagamento Pedido #${modalRetornoMP.pedidoNumero}`}
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {modalRetornoMP.mensagem}
              </p>
            </div>

            <div className="space-y-2 pt-2">
              {modalRetornoMP.sucesso && (
                <Link
                  to={`/order-tracking/${modalRetornoMP.pedidoNumero}`}
                  className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                  target="_blank"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Acompanhar Pedido Online</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setModalRetornoMP(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BUSCA CLIENTE (JÁ TENHO CADASTRO) */}
      {loja && (
        <ModalBuscaClienteCatalogo
          isOpen={modalBuscaClienteAberto}
          onClose={() => setModalBuscaClienteAberto(false)}
          lojaId={loja.id}
          onSelectCliente={handleSelecionarCliente}
        />
      )}

      {/* MODAL CONTATO DO CLIENTE */}
      <ModalContatoClienteCatalogo
        isOpen={modalContatoAberto}
        onClose={() => setModalContatoAberto(false)}
        dadosIniciais={dadosContato}
        onSalvar={handleSalvarContato}
      />

      {/* MODAL ENDEREÇO DO CLIENTE */}
      <ModalEnderecoClienteCatalogo
        isOpen={modalEnderecoAberto}
        onClose={() => setModalEnderecoAberto(false)}
        dadosIniciais={dadosEndereco}
        onSalvar={handleSalvarEndereco}
      />

      {/* ASSISTENTE VIRTUAL RUBI IA NO CATÁLOGO */}
      {contextoRubi && <ChatRubiCatalogo contexto={contextoRubi} />}
    </div>
  );
};
