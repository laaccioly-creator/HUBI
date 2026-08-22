import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Store,
  FileText,
  Receipt,
  CreditCard,
  Truck,
  Zap,
  Lock,
  HelpCircle,
  Upload,
  X,
  MapPin,
  ExternalLink,
  Check,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Smartphone,
  Globe,
  Share2,
  Trash2,
  Edit2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { FormaPagamento, FormaEntrega } from '../types';

type AbaConfig = 'geral' | 'pedidos-vendas' | 'recibo' | 'pagamentos' | 'entrega-retirada' | 'integracoes';

interface MetodoPagamentoEdicao {
  id: string;
  nome: string;
  tipo: string;
  descricao: string;
  pdvAtivo: boolean;
  catalogoAtivo: boolean;
  isNovo?: boolean;
}

export const ConfiguracoesLoja: React.FC = () => {
  const { loja, recarregarDadosLoja } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!permissions.podeAcessarConfig) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarConfig, navigate]);

  const [abaAtiva, setAbaAtiva] = useState<AbaConfig>('geral');
  const [salvando, setSalvando] = useState<boolean>(false);
  const [houveAlteracao, setHouveAlteracao] = useState<boolean>(false);

  // ABA 1: GERAL
  const [nomeLoja, setNomeLoja] = useState<string>('');
  const [razaoSocial, setRazaoSocial] = useState<string>('');
  const [documento, setDocumento] = useState<string>('');
  const [urlLogo, setUrlLogo] = useState<string>('');
  const [sobreLoja, setSobreLoja] = useState<string>('');
  const [telefone, setTelefone] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [instagram, setInstagram] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [enderecoLogradouro, setEnderecoLogradouro] = useState<string>('');
  const [enderecoComplemento, setEnderecoComplemento] = useState<string>('');
  const [moeda, setMoeda] = useState<string>('BR - R$');
  const [casasDecimais, setCasasDecimais] = useState<boolean>(true);
  const [transacoesCanceladas, setTransacoesCanceladas] = useState<'riscadas' | 'ocultar'>('riscadas');

  // ABA 2: PEDIDOS E VENDAS (Taxas e Status)
  const [usarTaxaVenda, setUsarTaxaVenda] = useState<boolean>(false);
  const [nomeTaxaVenda, setNomeTaxaVenda] = useState<string>('');
  const [valorTaxaVenda, setValorTaxaVenda] = useState<string>('0,00');
  const [tipoTaxaVenda, setTipoTaxaVenda] = useState<'percentual' | 'fixo'>('percentual');
  const [aplicarTaxaVenda, setAplicarTaxaVenda] = useState<'adicionar' | 'incluida'>('adicionar');
  const [taxaVendaOpcional, setTaxaVendaOpcional] = useState<boolean>(false);

  const [aplicarTaxaCatalogo, setAplicarTaxaCatalogo] = useState<boolean>(false);
  const [nomeTaxaCatalogo, setNomeTaxaCatalogo] = useState<string>('');
  const [valorTaxaCatalogo, setValorTaxaCatalogo] = useState<string>('0,00');
  const [tipoTaxaCatalogo, setTipoTaxaCatalogo] = useState<'percentual' | 'fixo'>('percentual');
  const [aplicarTaxaCatalogoModo, setAplicarTaxaCatalogoModo] = useState<'adicionar' | 'incluida'>('adicionar');
  const [taxaCatalogoSomenteEntrega, setTaxaCatalogoSomenteEntrega] = useState<boolean>(false);

  // Status de Pedidos
  const [statusEmProducao, setStatusEmProducao] = useState<boolean>(true);
  const [statusEmExpedicao, setStatusEmExpedicao] = useState<boolean>(true);
  const [statusSaiuEntrega, setStatusSaiuEntrega] = useState<boolean>(true);
  const [statusProntoRetirar, setStatusProntoRetirar] = useState<boolean>(true);

  // ABA 3: RECIBO
  const [reciboAdicionarCliente, setReciboAdicionarCliente] = useState<boolean>(true);
  const [reciboExibirCodigoProduto, setReciboExibirCodigoProduto] = useState<boolean>(false);
  const [reciboCabecalho, setReciboCabecalho] = useState<string>('');
  const [reciboRodape, setReciboRodape] = useState<string>('');

  // ABA 4: PAGAMENTOS
  const [permitirFiado, setPermitirFiado] = useState<boolean>(true);
  const [drawerMetodoPagamento, setDrawerMetodoPagamento] = useState<MetodoPagamentoEdicao | null>(null);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);

  // ABA 5: ENTREGA E RETIRADA
  const [trabalhoComEntregas, setTrabalhoComEntregas] = useState<boolean>(true);
  const [descricaoEntregas, setDescricaoEntregas] = useState<string>(
    'Entregas feitas via UBER envios para Fortaleza e região metropolitana. Para compras acima de R$ 250,00 o frete é grátis. Compras abaixo de R$ 250,00 faremos a cotação do envio.'
  );
  const [trabalhoComRetirada, setTrabalhoComRetirada] = useState<boolean>(false);
  const [formasEntrega, setFormasEntrega] = useState<FormaEntrega[]>([]);
  const [modalNovaEntrega, setModalNovaEntrega] = useState<boolean>(false);
  const [novaEntregaNome, setNovaEntregaNome] = useState<string>('');
  const [novaEntregaValor, setNovaEntregaValor] = useState<string>('0.00');

  // Carregar dados da loja ativa
  useEffect(() => {
    if (loja) {
      setNomeLoja(loja.nome_fantasia || '');
      setRazaoSocial(loja.razao_social || '');
      setDocumento(loja.numero_documento || '18.748.429/0001-27');
      setUrlLogo(loja.url_logo || '');
      setSobreLoja(loja.sobre_loja || 'Valor minimo para compras é de R$ 50,00');
      setTelefone(loja.telefone || '+55 (85) 98607-2144');
      setWhatsapp(loja.whatsapp || '+55 (85) 98607-2144');
      setInstagram(loja.instagram || '@hot.amazonoficial');
      setEmail(loja.email || 'laaccioly@hotmail.com');
      setEnderecoLogradouro(loja.endereco_logradouro ? `${loja.endereco_logradouro}, ${loja.endereco_numero || ''}` : 'Rua Bélgica, 945');
      setEnderecoComplemento(loja.endereco_complemento || '');

      const carregarAuxiliares = async () => {
        const { data: p } = await supabase.from('formas_pagamento').select('*').eq('loja_id', loja.id);
        if (p && p.length > 0) {
          setFormasPagamento(p);
        } else {
          // Formas padrão da loja
          setFormasPagamento([
            { id: 'fp_pix', loja_id: loja.id, nome: 'Pix', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
            { id: 'fp_dinheiro', loja_id: loja.id, nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
            { id: 'fp_debito', loja_id: loja.id, nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
            { id: 'fp_credito', loja_id: loja.id, nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
            { id: 'fp_outros', loja_id: loja.id, nome: 'Outros', tipo: 'outro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false }
          ]);
        }

        const { data: e } = await supabase.from('formas_entrega').select('*').eq('loja_id', loja.id);
        if (e && e.length > 0) {
          setFormasEntrega(e);
        }
      };

      carregarAuxiliares();
    }
  }, [loja]);

  const registrarAlteracao = () => {
    setHouveAlteracao(true);
  };

  const handleSalvarTudo = async () => {
    if (!loja?.id) return;
    try {
      setSalvando(true);

      const { error } = await supabase
        .from('lojas')
        .update({
          nome_fantasia: nomeLoja,
          razao_social: razaoSocial,
          numero_documento: documento,
          url_logo: urlLogo,
          sobre_loja: sobreLoja,
          telefone,
          whatsapp,
          instagram,
          email,
          endereco_logradouro: enderecoLogradouro,
          endereco_complemento: enderecoComplemento,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', loja.id);

      if (error) {
        console.warn('Aviso ao atualizar lojas:', error.message);
      }

      await recarregarDadosLoja();
      setHouveAlteracao(false);
      alert('Configurações salvas com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert(`Erro ao salvar configurações: ${err.message || 'Tente novamente'}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleDescartarAlteracoes = () => {
    if (!loja) return;
    setNomeLoja(loja.nome_fantasia || '');
    setRazaoSocial(loja.razao_social || '');
    setUrlLogo(loja.url_logo || '');
    setSobreLoja(loja.sobre_loja || '');
    setTelefone(loja.telefone || '');
    setWhatsapp(loja.whatsapp || '');
    setInstagram(loja.instagram || '');
    setEmail(loja.email || '');
    setEnderecoLogradouro(loja.endereco_logradouro || '');
    setEnderecoComplemento(loja.endereco_complemento || '');
    setHouveAlteracao(false);
  };

  // Abrir Drawer de Método de Pagamento
  const handleAbrirDrawerPagamento = (nome: string, tipo: string) => {
    const fpExistente = formasPagamento.find(f => f.tipo === tipo || f.nome.toLowerCase() === nome.toLowerCase());
    setDrawerMetodoPagamento({
      id: fpExistente?.id || `fp_${tipo}_${Date.now()}`,
      nome: fpExistente?.nome || nome,
      tipo: fpExistente?.tipo || tipo,
      descricao: '',
      pdvAtivo: fpExistente ? fpExistente.ativo : true,
      catalogoAtivo: fpExistente ? fpExistente.exibir_catalogo : true
    });
  };

  const handleSalvarMetodoPagamentoDrawer = async () => {
    if (!drawerMetodoPagamento || !loja?.id) return;

    try {
      const { id, nome, tipo, pdvAtivo, catalogoAtivo } = drawerMetodoPagamento;
      
      const payload: Partial<FormaPagamento> = {
        id,
        loja_id: loja.id,
        nome,
        tipo: tipo as any,
        ativo: pdvAtivo,
        exibir_catalogo: catalogoAtivo,
        taxa_percentual: 0,
        taxa_fixa: 0,
        maximo_parcelas: 1
      };

      const { error } = await supabase.from('formas_pagamento').upsert(payload);
      if (error) console.warn('Aviso ao salvar forma pagamento:', error.message);

      setFormasPagamento(prev => {
        const existe = prev.some(f => f.id === id);
        if (existe) {
          return prev.map(f => f.id === id ? { ...f, nome, ativo: pdvAtivo, exibir_catalogo: catalogoAtivo } : f);
        }
        return [...prev, payload as FormaPagamento];
      });

      setDrawerMetodoPagamento(null);
    } catch (err) {
      console.error('Erro ao salvar método:', err);
    }
  };

  const handleCriarOpcaoEntrega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaEntregaNome.trim() || !loja?.id) return;

    try {
      const nova: Partial<FormaEntrega> = {
        id: `fe_${Date.now()}`,
        loja_id: loja.id,
        nome: novaEntregaNome.trim(),
        tipo: 'taxa_fixa',
        valor_taxa: parseFloat(novaEntregaValor) || 0,
        valor_por_km: 0,
        ativo: true
      };

      const { error } = await supabase.from('formas_entrega').insert(nova);
      if (error) console.warn('Aviso entrega:', error.message);

      setFormasEntrega(prev => [...prev, nova as FormaEntrega]);
      setNovaEntregaNome('');
      setNovaEntregaValor('0.00');
      setModalNovaEntrega(false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* CABEÇALHO COM TÍTULO E ABAS PILLS */}
      <header className="p-4 sm:px-8 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span>Configurações</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'geral', label: 'GERAL' },
              { id: 'pedidos-vendas', label: 'PEDIDOS E VENDAS' },
              { id: 'recibo', label: 'RECIBO' },
              { id: 'pagamentos', label: 'PAGAMENTOS' },
              { id: 'entrega-retirada', label: 'ENTREGA E RETIRADA' },
              { id: 'integracoes', label: 'INTEGRAÇÕES' }
            ].map(aba => (
              <button
                key={aba.id}
                type="button"
                onClick={() => setAbaAtiva(aba.id as AbaConfig)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer uppercase tracking-wider ${
                  abaAtiva === aba.id
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {aba.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ÁREA CENTRAL COM ROLAGEM */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 pb-28">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* ========================================================================= */}
          {/* ABA 1: GERAL                                                             */}
          {/* ========================================================================= */}
          {abaAtiva === 'geral' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Ilustração e Subtítulo */}
              <div className="text-center py-2 space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-2 shadow-sm">
                  <Store className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Informações gerais</h2>
                <p className="text-xs text-slate-400">Forneça detalhes sobre seu negócio</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coluna Esquerda: Identificação */}
                <div className="space-y-6">
                  {/* Card Identificação */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-200">Identificação</h3>

                    {/* Nome da Loja */}
                    <div className="relative">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>Nome da Loja</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <input
                        type="text"
                        value={nomeLoja}
                        onChange={(e) => { setNomeLoja(e.target.value); registrarAlteracao(); }}
                        placeholder="Nome da sua loja"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* Razão Social */}
                    <div className="relative">
                      <label className="text-xs font-semibold text-slate-400 flex items-center justify-between mb-1">
                        <span>Nome do responsável ou Razão Social</span>
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <input
                        type="text"
                        value={razaoSocial}
                        onChange={(e) => { setRazaoSocial(e.target.value); registrarAlteracao(); }}
                        placeholder="Razão Social ou Nome do Titular"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* CPF / CNPJ */}
                    <div className="relative">
                      <label className="text-xs font-semibold text-slate-400 flex items-center justify-between mb-1">
                        <span>CPF ou CNPJ</span>
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <input
                        type="text"
                        value={documento}
                        onChange={(e) => { setDocumento(e.target.value); registrarAlteracao(); }}
                        placeholder="00.000.000/0000-00"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* Box de Privacidade */}
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300/90 leading-relaxed">
                      Informar o CPF ou CNPJ é uma medida para validar a sua conta, preservar sua privacidade e garantir a qualidade de todos os catálogos. <strong className="text-emerald-300">Os dados de identificação não serão exibidos no seu Catálogo Online.</strong>
                    </div>
                  </div>

                  {/* Card Dados de Contato */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-200">Dados de contato</h3>

                    {/* Telefone */}
                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>Telefone</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-xs text-slate-300 shrink-0">
                          <span>🇧🇷</span>
                          <span>+55</span>
                        </div>
                        <input
                          type="text"
                          value={telefone}
                          onChange={(e) => { setTelefone(e.target.value); registrarAlteracao(); }}
                          placeholder="(85) 98607-2144"
                          className="flex-1 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Celular / WhatsApp */}
                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>Celular/WhatsApp</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-xs text-slate-300 shrink-0">
                          <span>🇧🇷</span>
                          <span>+55</span>
                        </div>
                        <input
                          type="text"
                          value={whatsapp}
                          onChange={(e) => { setWhatsapp(e.target.value); registrarAlteracao(); }}
                          placeholder="(85) 98607-2144"
                          className="flex-1 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Instagram */}
                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>Instagram</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <input
                        type="text"
                        value={instagram}
                        onChange={(e) => { setInstagram(e.target.value); registrarAlteracao(); }}
                        placeholder="@sualoja"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* E-mail */}
                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>E-mail</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); registrarAlteracao(); }}
                        placeholder="contato@sualoja.com"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Card Endereço */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-200">Endereço</h3>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoLogradouro)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Ver no mapa</span>
                      </a>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>Endereço</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <input
                        type="text"
                        value={enderecoLogradouro}
                        onChange={(e) => { setEnderecoLogradouro(e.target.value); registrarAlteracao(); }}
                        placeholder="Rua, número e bairro"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Complemento</label>
                      <input
                        type="text"
                        value={enderecoComplemento}
                        onChange={(e) => { setEnderecoComplemento(e.target.value); registrarAlteracao(); }}
                        placeholder="Sala, bloco, ponto de referência..."
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Coluna Direita: Logo, Sobre a Loja, Moeda e Exibição */}
                <div className="space-y-6">
                  {/* Card Logo / Marca */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Upload da sua marca</span>
                      <HelpCircle className="w-4 h-4 text-slate-500" />
                    </div>

                    <div className="border border-dashed border-slate-700/80 rounded-2xl p-6 text-center bg-slate-950/40 flex flex-col items-center justify-center gap-3">
                      {urlLogo ? (
                        <div className="relative group">
                          <img
                            src={urlLogo}
                            alt="Logo da Loja"
                            className="h-24 max-w-full object-contain rounded-xl shadow-md bg-slate-900 p-2 border border-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => { setUrlLogo(''); registrarAlteracao(); }}
                            className="absolute -top-2 -right-2 p-1 bg-rose-500 text-white rounded-full shadow hover:bg-rose-600 transition"
                            title="Remover logotipo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                          <Upload className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm">
                          <span>Escolher imagem</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  setUrlLogo(reader.result as string);
                                  registrarAlteracao();
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        <p className="text-[10px] text-slate-500">PNG, JPG ou SVG recomendado</p>
                      </div>
                    </div>

                    {/* Sobre a Loja */}
                    <div className="pt-2">
                      <h4 className="text-xs font-bold text-slate-200 mb-2">Sobre a loja</h4>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>Informações extras</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <textarea
                        rows={3}
                        value={sobreLoja}
                        onChange={(e) => { setSobreLoja(e.target.value); registrarAlteracao(); }}
                        placeholder="Neste campo você pode adicionar o endereço do seu negócio, horário de funcionamento e o que mais você precisar."
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 leading-relaxed"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Neste campo você pode adicionar o endereço do seu negócio, horário de funcionamento e o que mais você precisar.
                      </p>
                    </div>
                  </div>

                  {/* Card Moeda */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-200">Moeda</h3>

                    <div>
                      <select
                        value={moeda}
                        onChange={(e) => { setMoeda(e.target.value); registrarAlteracao(); }}
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="BR - R$">BR - R$ (Real Brasileiro)</option>
                        <option value="US - $">US - $ (Dólar Americano)</option>
                        <option value="EUR - €">EUR - € (Euro)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">Casas decimais</span>
                        <span className="text-[10px] text-slate-400">Exibir centavos em valores monetários</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCasasDecimais(prev => !prev); registrarAlteracao(); }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                          casasDecimais ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>
                  </div>

                  {/* Card Opções de Exibição */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-200">Opções de exibição</h3>

                    <div className="space-y-2.5">
                      <span className="text-xs font-semibold text-slate-400 block">Transações canceladas</span>

                      <label className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800 cursor-pointer hover:bg-slate-950/70 transition">
                        <input
                          type="radio"
                          name="transacoesCanceladas"
                          checked={transacoesCanceladas === 'riscadas'}
                          onChange={() => { setTransacoesCanceladas('riscadas'); registrarAlteracao(); }}
                          className="text-emerald-500 focus:ring-emerald-500"
                        />
                        <span className="text-xs text-slate-200 font-medium">Exibir riscadas</span>
                      </label>

                      <label className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800 cursor-pointer hover:bg-slate-950/70 transition">
                        <input
                          type="radio"
                          name="transacoesCanceladas"
                          checked={transacoesCanceladas === 'ocultar'}
                          onChange={() => { setTransacoesCanceladas('ocultar'); registrarAlteracao(); }}
                          className="text-emerald-500 focus:ring-emerald-500"
                        />
                        <span className="text-xs text-slate-200 font-medium">Ocultar</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 2: PEDIDOS E VENDAS                                                  */}
          {/* ========================================================================= */}
          {abaAtiva === 'pedidos-vendas' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Ilustração e Subtítulo */}
              <div className="text-center py-2 space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-2 shadow-sm">
                  <FileText className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Pedidos e Vendas</h2>
                <p className="text-xs text-slate-400">Configure suas taxas de venda e status de seus pedidos</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coluna Esquerda: Taxas de Venda */}
                <div className="space-y-6">
                  {/* Taxa de Vendas no PDV */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-200">Usar taxa de vendas</span>
                      <button
                        type="button"
                        onClick={() => { setUsarTaxaVenda(prev => !prev); registrarAlteracao(); }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                          usarTaxaVenda ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>

                    {usarTaxaVenda && (
                      <div className="space-y-3.5 pt-2 border-t border-slate-800 animate-in fade-in">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Nome da taxa</label>
                          <input
                            type="text"
                            value={nomeTaxaVenda}
                            onChange={(e) => { setNomeTaxaVenda(e.target.value); registrarAlteracao(); }}
                            placeholder="Ex: Taxa de Serviço, Taxa de Conveniência"
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Valor da taxa</label>
                          <input
                            type="text"
                            value={valorTaxaVenda}
                            onChange={(e) => { setValorTaxaVenda(e.target.value); registrarAlteracao(); }}
                            placeholder="0,00"
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div className="space-y-2 pt-1">
                          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="tipoTaxaVenda"
                              checked={tipoTaxaVenda === 'percentual'}
                              onChange={() => { setTipoTaxaVenda('percentual'); registrarAlteracao(); }}
                              className="text-emerald-500"
                            />
                            <span>Valor percentual</span>
                          </label>

                          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="tipoTaxaVenda"
                              checked={tipoTaxaVenda === 'fixo'}
                              onChange={() => { setTipoTaxaVenda('fixo'); registrarAlteracao(); }}
                              className="text-emerald-500"
                            />
                            <span>Valor Fixo</span>
                          </label>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="aplicarTaxaVenda"
                              checked={aplicarTaxaVenda === 'adicionar'}
                              onChange={() => { setAplicarTaxaVenda('adicionar'); registrarAlteracao(); }}
                              className="text-emerald-500"
                            />
                            <span>Adicionar ao valor da venda</span>
                          </label>

                          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="aplicarTaxaVenda"
                              checked={aplicarTaxaVenda === 'incluida'}
                              onChange={() => { setAplicarTaxaVenda('incluida'); registrarAlteracao(); }}
                              className="text-emerald-500"
                            />
                            <span>Já está incluída no preço da venda</span>
                          </label>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                          <div>
                            <span className="text-xs font-semibold text-slate-200 block">Taxa opcional</span>
                            <span className="text-[10px] text-slate-400">Pode ser removida na hora da venda</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setTaxaVendaOpcional(prev => !prev); registrarAlteracao(); }}
                            className={`w-9 h-5 flex items-center rounded-full p-0.5 transition cursor-pointer ${
                              taxaVendaOpcional ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                            }`}
                          >
                            <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Taxa do Catálogo Online */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-200">Aplicar a taxa do catálogo online</span>
                      <button
                        type="button"
                        onClick={() => { setAplicarTaxaCatalogo(prev => !prev); registrarAlteracao(); }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                          aplicarTaxaCatalogo ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>

                    {aplicarTaxaCatalogo && (
                      <div className="space-y-3.5 pt-2 border-t border-slate-800 animate-in fade-in">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Nome da taxa</label>
                          <input
                            type="text"
                            value={nomeTaxaCatalogo}
                            onChange={(e) => { setNomeTaxaCatalogo(e.target.value); registrarAlteracao(); }}
                            placeholder="Ex: Taxa do Cardápio / Embalagem"
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Valor da taxa</label>
                          <input
                            type="text"
                            value={valorTaxaCatalogo}
                            onChange={(e) => { setValorTaxaCatalogo(e.target.value); registrarAlteracao(); }}
                            placeholder="0,00"
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div className="space-y-2 pt-1">
                          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="tipoTaxaCatalogo"
                              checked={tipoTaxaCatalogo === 'percentual'}
                              onChange={() => { setTipoTaxaCatalogo('percentual'); registrarAlteracao(); }}
                              className="text-emerald-500"
                            />
                            <span>Valor percentual</span>
                          </label>

                          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="tipoTaxaCatalogo"
                              checked={tipoTaxaCatalogo === 'fixo'}
                              onChange={() => { setTipoTaxaCatalogo('fixo'); registrarAlteracao(); }}
                              className="text-emerald-500"
                            />
                            <span>Valor Fixo</span>
                          </label>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="aplicarTaxaCatalogoModo"
                              checked={aplicarTaxaCatalogoModo === 'adicionar'}
                              onChange={() => { setAplicarTaxaCatalogoModo('adicionar'); registrarAlteracao(); }}
                              className="text-emerald-500"
                            />
                            <span>Adicionar ao valor da venda</span>
                          </label>

                          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="radio"
                              name="aplicarTaxaCatalogoModo"
                              checked={aplicarTaxaCatalogoModo === 'incluida'}
                              onChange={() => { setAplicarTaxaCatalogoModo('incluida'); registrarAlteracao(); }}
                              className="text-emerald-500"
                            />
                            <span>Já está incluída no preço da venda</span>
                          </label>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                          <div>
                            <span className="text-xs font-semibold text-slate-200 block">Somente na entrega</span>
                            <span className="text-[10px] text-slate-400">Não cobrar caso o cliente retire no local</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setTaxaCatalogoSomenteEntrega(prev => !prev); registrarAlteracao(); }}
                            className={`w-9 h-5 flex items-center rounded-full p-0.5 transition cursor-pointer ${
                              taxaCatalogoSomenteEntrega ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                            }`}
                          >
                            <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Coluna Direita: Status de Pedidos */}
                <div className="space-y-4">
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-200">Status de Pedidos</h3>

                    <div className="space-y-3.5">
                      {/* Pendente */}
                      <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
                        <div className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-slate-200 block">Pendente</span>
                          <span className="text-[11px] text-slate-400 leading-relaxed block">
                            Aparece quando seu cliente realizar o pedido. Este status NÃO movimenta estoque.
                          </span>
                        </div>
                      </div>

                      {/* Confirmado */}
                      <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
                        <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-slate-200 block">Confirmado</span>
                          <span className="text-[11px] text-slate-400 leading-relaxed block">
                            Aparece quando o vendedor confirmar o pedido. A partir deste status o estoque é movimentado.
                          </span>
                        </div>
                      </div>

                      {/* Pago */}
                      <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
                        <div className="w-7 h-7 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                          <DollarSign className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-slate-200 block">Pago</span>
                          <span className="text-[11px] text-slate-400 leading-relaxed block">
                            Aparece após o pedido ser pago.
                          </span>
                        </div>
                      </div>

                      {/* Em produção */}
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full bg-rose-500" />
                          <span className="font-bold text-xs text-slate-200">Em produção</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setStatusEmProducao(prev => !prev); registrarAlteracao(); }}
                          className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                            statusEmProducao ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      {/* Em expedição */}
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full bg-orange-500" />
                          <span className="font-bold text-xs text-slate-200">Em expedição</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setStatusEmExpedicao(prev => !prev); registrarAlteracao(); }}
                          className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                            statusEmExpedicao ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      {/* Saiu para entrega */}
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full bg-amber-400" />
                          <span className="font-bold text-xs text-slate-200">Saiu para entrega</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setStatusSaiuEntrega(prev => !prev); registrarAlteracao(); }}
                          className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                            statusSaiuEntrega ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      {/* Pronto para retirar */}
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full bg-blue-400" />
                          <span className="font-bold text-xs text-slate-200">Pronto para retirar</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setStatusProntoRetirar(prev => !prev); registrarAlteracao(); }}
                          className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                            statusProntoRetirar ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-[11px] text-slate-400">
                      Você pode editar e gerenciar status ativos. Os status habilitados ficam disponíveis na listagem de pedidos para separação e despacho.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 3: RECIBO                                                            */}
          {/* ========================================================================= */}
          {abaAtiva === 'recibo' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Ilustração e Subtítulo */}
              <div className="text-center py-2 space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-2 shadow-sm">
                  <Receipt className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Meu Recibo</h2>
                <p className="text-xs text-slate-400">Personalize as informações impressas no recibo</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                {/* Coluna Esquerda: Opções de Customização */}
                <div className="space-y-6">
                  {/* Card Dados da Loja */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <div>
                      <h3 className="font-bold text-sm text-slate-200">Dados da Loja</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Complete as informações da sua loja e deixe seu catálogo e recibo profissionais!
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-emerald-400">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>NOME DA LOJA</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>LOGO</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>TELEFONE</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>WHATSAPP</span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2">
                        <Check className="w-3.5 h-3.5" />
                        <span>ENDEREÇO</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAbaAtiva('geral')}
                      className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-2xl transition cursor-pointer text-center"
                    >
                      Editar dados da loja
                    </button>
                  </div>

                  {/* Toggles do Recibo */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    {/* Adicionar dados do cliente */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">Adicionar dados do cliente</span>
                        <span className="text-[11px] text-slate-400">Nome, Endereço e Telefone</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setReciboAdicionarCliente(prev => !prev); registrarAlteracao(); }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                          reciboAdicionarCliente ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>

                    {/* Exibir código do produto */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">Exibir código do produto</span>
                        <span className="text-[11px] text-slate-400">Abaixo do nome do item</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setReciboExibirCodigoProduto(prev => !prev); registrarAlteracao(); }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                          reciboExibirCodigoProduto ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>
                  </div>

                  {/* Cabeçalho e Rodapé */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-200">Cabeçalho e rodapé</h3>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>Texto do cabeçalho</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <input
                        type="text"
                        value={reciboCabecalho}
                        onChange={(e) => { setReciboCabecalho(e.target.value); registrarAlteracao(); }}
                        placeholder="Mensagem de boas-vindas..."
                        className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1">
                        <span>Texto do rodapé</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      </label>
                      <input
                        type="text"
                        value={reciboRodape}
                        onChange={(e) => { setReciboRodape(e.target.value); registrarAlteracao(); }}
                        placeholder="Agradecemos pela preferência! Volte sempre."
                        className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Coluna Direita: Prévia Realista do Recibo Térmico */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold justify-center md:justify-start">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    <span>Prévia do seu recibo</span>
                  </div>

                  <div className="bg-white text-slate-900 rounded-3xl p-6 shadow-2xl font-mono text-xs max-w-sm mx-auto border-t-8 border-b-8 border-dashed border-slate-300 relative space-y-4">
                    {/* Topo do Recibo com Logo */}
                    <div className="text-center space-y-1 pb-3 border-b border-slate-200">
                      {urlLogo ? (
                        <img src={urlLogo} alt="Logo" className="h-12 mx-auto object-contain mb-1" />
                      ) : (
                        <div className="font-black text-sm text-slate-900 tracking-wider">
                          {nomeLoja || 'HOTAMAZON'}
                        </div>
                      )}
                      <h4 className="font-bold text-base tracking-widest text-slate-900">RECIBO</h4>
                      <p className="text-[10px] text-slate-600 font-bold">{nomeLoja || 'HOTAMAZON'}</p>
                      <p className="text-[9px] text-slate-500">{enderecoLogradouro} - {telefone}</p>
                    </div>

                    {/* Cabeçalho Customizado */}
                    {reciboCabecalho && (
                      <div className="text-center text-[10px] text-slate-600 italic pb-2 border-b border-slate-200">
                        "{reciboCabecalho}"
                      </div>
                    )}

                    {/* Dados do Cliente se ativado */}
                    {reciboAdicionarCliente && (
                      <div className="space-y-0.5 text-[10px] bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <span>👤 Nome do cliente</span>
                        </div>
                        <p className="text-slate-600">+551199999-9999 • Endereço completo</p>
                      </div>
                    )}

                    {/* Caixa de Observações */}
                    <div className="p-2 border border-slate-300 rounded-xl text-[10px] text-slate-500">
                      Observações do recibo
                    </div>

                    {/* Lista de Itens */}
                    <div className="space-y-2 text-[11px] pt-1">
                      <div className="text-[10px] font-bold text-slate-500 flex justify-between">
                        <span>2 itens (Qtd.: 15)</span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold block text-slate-800">2x ÓLEO BEIJÁVEL MENTA 30ML</span>
                            {reciboExibirCodigoProduto && (
                              <span className="text-[9px] text-slate-500 block">Cód: #00124</span>
                            )}
                          </div>
                          <span className="font-bold">R$ 11,80</span>
                        </div>

                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold block text-slate-800">1x ÓLEO CHOCOMENTA 30ML</span>
                            {reciboExibirCodigoProduto && (
                              <span className="text-[9px] text-slate-500 block">Cód: #00125</span>
                            )}
                          </div>
                          <span className="font-bold">R$ 5,90</span>
                        </div>

                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold block text-slate-800">2x PLUG METAL M</span>
                            {reciboExibirCodigoProduto && (
                              <span className="text-[9px] text-slate-500 block">Cód: #00230</span>
                            )}
                          </div>
                          <span className="font-bold">R$ 47,80</span>
                        </div>
                      </div>
                    </div>

                    {/* Totais */}
                    <div className="border-t border-slate-300 pt-2 space-y-1 text-[11px]">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal:</span>
                        <span>R$ 65,50</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Taxa de entrega:</span>
                        <span>R$ 9,99</span>
                      </div>
                      <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-slate-300">
                        <span>TOTAL:</span>
                        <span>R$ 75,49</span>
                      </div>
                    </div>

                    {/* Rodapé Customizado */}
                    {reciboRodape ? (
                      <div className="text-center text-[10px] text-slate-600 pt-2 border-t border-slate-200">
                        {reciboRodape}
                      </div>
                    ) : (
                      <div className="text-center text-[9px] text-slate-400 pt-2 border-t border-slate-200">
                        Obrigado pela preferência!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 4: PAGAMENTOS                                                        */}
          {/* ========================================================================= */}
          {abaAtiva === 'pagamentos' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Ilustração e Subtítulo */}
              <div className="text-center py-2 space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-2 shadow-sm">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Pagamentos</h2>
                <p className="text-xs text-slate-400">Configure os meios de pagamento que seu negócio oferece</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coluna Esquerda: Pagamentos a Combinar */}
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-slate-200">Pagamentos a combinar</h3>

                  <div className="space-y-2.5">
                    {/* Pix */}
                    <div
                      onClick={() => handleAbrirDrawerPagamento('Pix', 'pix')}
                      className="p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 transition cursor-pointer flex items-center justify-between shadow-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
                          💠
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-100">Pix</span>
                            <span className="text-[9px] bg-emerald-500 text-slate-950 font-black px-1.5 py-0.5 rounded">NOVO</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ PDV</span>
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ CATÁLOGO</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                    </div>

                    {/* Dinheiro */}
                    <div
                      onClick={() => handleAbrirDrawerPagamento('Dinheiro', 'dinheiro')}
                      className="p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 transition cursor-pointer flex items-center justify-between shadow-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
                          💵
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-100 block">Dinheiro</span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ PDV</span>
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ CATÁLOGO</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                    </div>

                    {/* Cartão de Débito */}
                    <div
                      onClick={() => handleAbrirDrawerPagamento('Cartão de Débito', 'cartao_debito')}
                      className="p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 transition cursor-pointer flex items-center justify-between shadow-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center font-bold">
                          💳
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-100 block">Cartão de Débito</span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ PDV</span>
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ CATÁLOGO</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                    </div>

                    {/* Cartão de Crédito */}
                    <div
                      onClick={() => handleAbrirDrawerPagamento('Cartão de Crédito', 'cartao_credito')}
                      className="p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 transition cursor-pointer flex items-center justify-between shadow-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center font-bold">
                          💳
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-100 block">Cartão de Crédito</span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ PDV</span>
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ CATÁLOGO</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                    </div>

                    {/* Outros */}
                    <div
                      onClick={() => handleAbrirDrawerPagamento('Outros', 'outro')}
                      className="p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 transition cursor-pointer flex items-center justify-between shadow-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center font-bold">
                          ⋯
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-100 block">Outros</span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ PDV</span>
                            <span className="text-slate-500 flex items-center gap-0.5">✕ CATÁLOGO</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                    </div>

                    {/* Saldo Cliente */}
                    <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/60 flex items-center justify-between opacity-80">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">
                          👤
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-200 block">Saldo Cliente</span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span className="text-emerald-400 flex items-center gap-0.5">✓ PDV</span>
                            <span className="text-slate-500 flex items-center gap-0.5">✕ CATÁLOGO</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coluna Direita: Integrações & Fiado */}
                <div className="space-y-6">
                  {/* Integrações */}
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-slate-200">Integrações</h3>

                    <div className="space-y-2.5">
                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Zap className="w-5 h-5 text-indigo-400" />
                          <div>
                            <span className="font-bold text-xs text-slate-200 block">Link de Pagamento</span>
                            <span className="text-[10px] text-slate-500 block">Cobrança online com cartão</span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded-full border border-slate-700">
                          NO APP
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          <div>
                            <span className="font-bold text-xs text-slate-200 block">Pagamentos automáticos</span>
                            <span className="text-[10px] text-slate-500 block">Conciliação bancária automática</span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded-full border border-slate-700">
                          NO APP
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CreditCard className="w-5 h-5 text-amber-400" />
                          <div>
                            <span className="font-bold text-xs text-slate-200 block">Maquininhas de Pagamento</span>
                            <span className="text-[10px] text-slate-500 block">TEF e maquininhas integradas</span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded-full border border-slate-700">
                          NO APP
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Fiado */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-200">Permitir vendas fiado</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Desative caso você não trabalhe com Fiado</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setPermitirFiado(prev => !prev); registrarAlteracao(); }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                          permitirFiado ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 5: ENTREGA E RETIRADA                                                */}
          {/* ========================================================================= */}
          {abaAtiva === 'entrega-retirada' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Ilustração e Subtítulo */}
              <div className="text-center py-2 space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-2 shadow-sm">
                  <Truck className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Entrega e Retirada</h2>
                <p className="text-xs text-slate-400">Quais as opções você disponibiliza em seu negócio?</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Trabalho com Entregas */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-slate-200">Trabalho com entregas</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Um campo obrigatório de endereço será solicitado aos seus clientes.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setTrabalhoComEntregas(prev => !prev); registrarAlteracao(); }}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                        trabalhoComEntregas ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>

                  {trabalhoComEntregas && (
                    <div className="space-y-4 pt-2 border-t border-slate-800 animate-in fade-in">
                      <textarea
                        rows={4}
                        value={descricaoEntregas}
                        onChange={(e) => { setDescricaoEntregas(e.target.value); registrarAlteracao(); }}
                        placeholder="Descreva resumidamente suas opções de entrega."
                        className="w-full bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 leading-relaxed"
                      />
                      <p className="text-[10px] text-slate-500">Descreva resumidamente suas opções de entrega.</p>

                      {/* Lista de Formas de Entrega Cadastradas */}
                      {formasEntrega.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <span className="text-xs font-bold text-slate-300 block">Opções configuradas:</span>
                          <div className="space-y-1.5">
                            {formasEntrega.map(fe => (
                              <div key={fe.id} className="flex justify-between items-center p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 text-xs">
                                <span className="font-semibold text-slate-200">{fe.nome}</span>
                                <span className="font-mono text-emerald-400 font-bold">
                                  {fe.valor_taxa > 0 ? `R$ ${Number(fe.valor_taxa).toFixed(2)}` : 'Grátis'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setModalNovaEntrega(true)}
                        className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs rounded-2xl transition cursor-pointer shadow-sm"
                      >
                        Adicionar opção de entrega
                      </button>
                    </div>
                  )}
                </div>

                {/* Trabalho com Retirada no Local */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-slate-200">Trabalho com retirada no local</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Seu endereço será informado durante o fechamento do pedido.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setTrabalhoComRetirada(prev => !prev); registrarAlteracao(); }}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                        trabalhoComRetirada ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>

                  {trabalhoComRetirada && (
                    <div className="pt-2 border-t border-slate-800 text-xs space-y-2 animate-in fade-in">
                      <div className="p-3 bg-slate-950/50 rounded-2xl border border-slate-800 space-y-1">
                        <span className="font-bold text-slate-300 block">Endereço de Retirada:</span>
                        <p className="text-slate-400 text-[11px]">{enderecoLogradouro || 'Endereço não configurado'}</p>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        O cliente poderá selecionar a opção de retirar pessoalmente na finalização do pedido.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 6: INTEGRAÇÕES                                                       */}
          {/* ========================================================================= */}
          {abaAtiva === 'integracoes' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Ilustração e Subtítulo */}
              <div className="text-center py-2 space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-2 shadow-sm">
                  <Zap className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Integrações</h2>
                <p className="text-xs text-slate-400">Configure seus canais de vendas e aumente suas vendas</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Facebook / Instagram */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-slate-200">
                    <span className="text-base">📸 📘</span>
                    <span>Facebook / Instagram</span>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-slate-950/50 hover:bg-slate-950 border border-slate-800 transition cursor-pointer flex items-center justify-between group">
                      <div>
                        <h4 className="font-bold text-xs text-slate-100 group-hover:text-emerald-400 transition">Shopping</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Conecte seu catálogo de produtos às lojas do Facebook e Instagram
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-xs text-slate-200">Pedidos de comida</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Receba pedidos no seu cardápio digital pelo Facebook e Instagram
                        </p>
                      </div>
                      <span className="text-[9px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded-full border border-slate-700">
                        NO APP
                      </span>
                    </div>
                  </div>
                </div>

                {/* Google */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-slate-200">
                    <span className="text-base">🌐</span>
                    <span>Google</span>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-slate-950/50 hover:bg-slate-950 border border-slate-800 transition cursor-pointer flex items-center justify-between group">
                      <div>
                        <h4 className="font-bold text-xs text-slate-100 group-hover:text-emerald-400 transition">Shopping</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Alcance clientes no Google
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* BARRA FLUTUANTE DE SALVAR / DESCARTAR ALTERAÇÕES */}
      <div className="fixed bottom-4 right-4 sm:right-8 z-30 flex items-center gap-2 bg-slate-900/95 border border-slate-700/90 p-2 rounded-2xl shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-2">
        <button
          type="button"
          onClick={handleDescartarAlteracoes}
          className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
        >
          Descartar
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={handleSalvarTudo}
          className="px-5 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-xl transition shadow-lg shadow-emerald-500/25 flex items-center gap-1.5 cursor-pointer"
        >
          {salvando ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Salvando...</span>
            </>
          ) : (
            <span>Salvar alterações</span>
          )}
        </button>
      </div>

      {/* DRAWER LATERAL DE EDIÇÃO DE MÉTODO DE PAGAMENTO (Screens 1192-1196) */}
      {drawerMetodoPagamento && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header do Drawer */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <h3 className="font-bold text-sm sm:text-base text-slate-100">{drawerMetodoPagamento.nome}</h3>
              <button
                type="button"
                onClick={() => setDrawerMetodoPagamento(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Drawer */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Textarea de Instruções */}
              <div>
                <textarea
                  rows={4}
                  maxLength={140}
                  value={drawerMetodoPagamento.descricao}
                  onChange={(e) => setDrawerMetodoPagamento(prev => prev ? { ...prev, descricao: e.target.value } : null)}
                  placeholder={
                    drawerMetodoPagamento.tipo === 'pix'
                      ? 'Informe a sua chave PIX, oriente por onde enviar o comprovante de pagamento e o que mais você precisar.'
                      : drawerMetodoPagamento.tipo === 'dinheiro'
                      ? 'Descrição e orientações de troco.'
                      : drawerMetodoPagamento.tipo.includes('cartao')
                      ? 'Informe as bandeiras aceitas (Visa, Mastercard, etc) e o que mais você precisar.'
                      : 'Informe os outros meios de pagamento aceitos.'
                  }
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl p-3.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
                <div className="text-right text-[10px] text-slate-500 mt-1">
                  {drawerMetodoPagamento.descricao.length}/140
                </div>
              </div>

              {/* Toggle PDV */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Store className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200">PDV</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerMetodoPagamento(prev => prev ? { ...prev, pdvAtivo: !prev.pdvAtivo } : null)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                    drawerMetodoPagamento.pdvAtivo ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                </button>
              </div>

              {/* Toggle Catálogo Online */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-slate-200">Catálogo Online</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerMetodoPagamento(prev => prev ? { ...prev, catalogoAtivo: !prev.catalogoAtivo } : null)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                    drawerMetodoPagamento.catalogoAtivo ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                </button>
              </div>
            </div>

            {/* Rodapé do Drawer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDrawerMetodoPagamento(null)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleSalvarMetodoPagamentoDrawer}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-400 rounded-xl transition shadow-md cursor-pointer"
              >
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADICIONAR OPÇÃO DE ENTREGA */}
      {modalNovaEntrega && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-sm text-slate-100">Nova Opção de Entrega</h3>
              <button
                type="button"
                onClick={() => setModalNovaEntrega(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCriarOpcaoEntrega} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome da Opção</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Motoboy / Fortaleza"
                  value={novaEntregaNome}
                  onChange={(e) => setNovaEntregaNome(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Valor da Taxa (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={novaEntregaValor}
                  onChange={(e) => setNovaEntregaValor(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalNovaEntrega(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs text-white bg-emerald-500 hover:bg-emerald-400 font-bold rounded-xl shadow"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
