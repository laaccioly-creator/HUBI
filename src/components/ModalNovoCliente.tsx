import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  MapPin,
  FileText,
  DollarSign,
  Navigation,
  HelpCircle,
  Check,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  MessageCircle,
  Lock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import { Cliente, TabelaPreco } from '../types';
import { formatarMoeda, formatarValorBRL } from '../utils/formatters';

interface ModalNovoClienteProps {
  isOpen: boolean;
  onClose: () => void;
  onClienteCadastrado: (cliente: Cliente) => void;
  clienteEditar?: Cliente | null;
}

const ESTADOS_BRASIL = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' }
];

const UFS_MAP: Record<string, string> = {
  'AC': 'AC', 'AL': 'AL', 'AP': 'AP', 'AM': 'AM', 'BA': 'BA', 'CE': 'CE', 'DF': 'DF', 'ES': 'ES',
  'GO': 'GO', 'MA': 'MA', 'MT': 'MT', 'MS': 'MS', 'MG': 'MG', 'PA': 'PA', 'PB': 'PB', 'PR': 'PR',
  'PE': 'PE', 'PI': 'PI', 'RJ': 'RJ', 'RN': 'RN', 'RS': 'RS', 'RO': 'RO', 'RR': 'RR', 'SC': 'SC',
  'SP': 'SP', 'SE': 'SE', 'TO': 'TO',
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE', 'CEARÁ': 'CE',
  'ESPIRITO SANTO': 'ES', 'ESPÍRITO SANTO': 'ES', 'GOIAS': 'GO', 'GOIÁS': 'GO', 'MARANHAO': 'MA', 'MARANHÃO': 'MA',
  'MATO GROSSO': 'MT', 'MINAS GERAIS': 'MG', 'PARA': 'PA', 'PARÁ': 'PA', 'PARAIBA': 'PB', 'PARAÍBA': 'PB',
  'PARANA': 'PR', 'PARANÁ': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI', 'PIAUÍ': 'PI', 'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RONDÔNIA': 'RO',
  'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SÃO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO'
};

/**
 * Extrai campos estruturados de endereço a partir de uma string única (endereco_principal)
 */
export function extrairEnderecoEstruturado(texto?: string | null) {
  if (!texto || !texto.trim()) {
    return { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };
  }

  let limpo = texto.trim().replace(/\r\n/g, '\n');
  let cep = '';
  let estado = '';
  let numero = '';
  let complemento = '';
  let bairro = '';
  let cidade = '';
  let rua = '';

  // 1. Extrair CEP (ex: CEP: 52020-140 ou 52020-140)
  const matchCep = limpo.match(/(?:CEP:?\s*)?(\d{5}-?\d{3})/i);
  if (matchCep) {
    const rawCep = matchCep[1].replace(/\D/g, '');
    cep = `${rawCep.slice(0, 5)}-${rawCep.slice(5)}`;
    limpo = limpo.replace(matchCep[0], '').trim();
  }

  // 2. Extrair Estado / UF (ex: ", PE" ou "/PE" ou "- PIAUI")
  for (const [nomeUf, sigla] of Object.entries(UFS_MAP)) {
    const regexUf = new RegExp(`(?:,|\\/|-|•|\\s)\\s*\\b${nomeUf}\\b(?:$|\\s|,|\\/|-|•)`, 'i');
    if (regexUf.test(limpo)) {
      estado = sigla;
      limpo = limpo.replace(regexUf, ' ').trim();
      break;
    }
  }

  // 3. Extrair linhas adicionais como complemento (ex: "Casa", "Bloco 6...")
  const linhas = limpo.split('\n').map(l => l.trim()).filter(Boolean);
  if (linhas.length > 1) {
    complemento = linhas.slice(1).join(' - ');
    limpo = linhas[0];
  }

  // 4. Analisar partes separadas por vírgula ou marcadores
  const partes = limpo.split(/[,•]/).map(p => p.trim()).filter(Boolean);

  if (partes.length >= 2) {
    rua = partes[0];
    for (let i = 1; i < partes.length; i++) {
      const parte = partes[i];
      const matchNum = parte.match(/^(?:n[ºo°\.]?\s*)?(\d+[A-Za-z]?)$/i);
      if (matchNum && !numero) {
        numero = matchNum[1];
        continue;
      }
      if (i === 1 && !numero && parte.match(/\d+/)) {
        const m = parte.match(/^(?:n[ºo°\.]?\s*)?(\d+[A-Za-z]?)(.*)$/i);
        if (m) {
          numero = m[1];
          if (m[2] && m[2].trim()) {
            complemento = complemento ? `${complemento} - ${m[2].trim()}` : m[2].trim();
          }
          continue;
        }
      }
      if (!bairro && i < partes.length - 1) {
        bairro = parte;
      } else if (!cidade) {
        cidade = parte;
      } else {
        complemento = complemento ? `${complemento}, ${parte}` : parte;
      }
    }
  } else {
    // String contínua única (ex: "Rua Pedro Ponciano 209")
    const matchNumFinal = limpo.match(/^(.*?)[,\s]+(?:n[ºo°\.]?\s*)?(\d+[A-Za-z]?)(.*)$/i);
    if (matchNumFinal) {
      rua = matchNumFinal[1].trim();
      numero = matchNumFinal[2].trim();
      const resto = matchNumFinal[3].trim().replace(/^[,-\s]+/, '');
      if (resto) {
        if (!bairro) bairro = resto;
        else complemento = complemento ? `${complemento} - ${resto}` : resto;
      }
    } else {
      rua = limpo;
    }
  }

  // Se rua ainda contiver o número no final (ex: "Rua Pedro Ponciano 209")
  if (rua && !numero) {
    const mRua = rua.match(/^(.*?)[,\s]+(?:n[ºo°\.]?\s*)?(\d+[A-Za-z]?)$/i);
    if (mRua) {
      rua = mRua[1].trim();
      numero = mRua[2].trim();
    }
  }

  rua = rua.replace(/[,-\/]+$/, '').trim();
  numero = numero.replace(/[,-\/]+$/, '').trim();
  bairro = bairro.replace(/[,-\/]+$/, '').trim();
  cidade = cidade.replace(/[,-\/]+$/, '').trim();
  complemento = complemento.replace(/[,-\/]+$/, '').trim();

  return { cep, rua, numero, complemento, bairro, cidade, estado };
}

export const ModalNovoCliente: React.FC<ModalNovoClienteProps> = ({
  isOpen,
  onClose,
  onClienteCadastrado,
  clienteEditar
}) => {
  const { loja } = useAuth();
  const permissions = usePermissions();

  // Estados dos Campos
  const [ativo, setAtivo] = useState(true);
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [dataAniversario, setDataAniversario] = useState('');
  const [email, setEmail] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Telefones com Indicador WhatsApp
  const [telefone1, setTelefone1] = useState('');
  const [telefone1IsWhatsapp, setTelefone1IsWhatsapp] = useState(true);
  const [telefone2, setTelefone2] = useState('');
  const [telefone2IsWhatsapp, setTelefone2IsWhatsapp] = useState(false);

  // Fiado e Tabela de Preço
  const [permiteFiado, setPermiteFiado] = useState(permissions.podeAtivarFiado);
  const [limiteCredito, setLimiteCredito] = useState('500,00');
  const [tabelaPreco, setTabelaPreco] = useState<TabelaPreco>('varejo');

  // Endereço
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');

  // Estados de Controle de UI
  const [carregandoCep, setCarregandoCep] = useState(false);
  const [carregandoGeoloc, setCarregandoGeoloc] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  const { confirmar, setTemAlteracoesNaoSalvas } = useFeedbackModal();
  const [snapshotInicial, setSnapshotInicial] = useState<string>('');

  // Sincronizar dados para Edição ou Criação
  React.useEffect(() => {
    if (isOpen) {
      let snapObj: any;
      if (clienteEditar) {
        setAtivo((clienteEditar as any).ativo !== false);
        setNome(clienteEditar.nome || '');
        setCpfCnpj(clienteEditar.numero_documento || '');
        setDataAniversario(clienteEditar.data_aniversario || '');
        setEmail(clienteEditar.email || '');
        setObservacoes(clienteEditar.observacoes || '');
        setTelefone1(clienteEditar.telefone || clienteEditar.whatsapp || '');
        setTelefone1IsWhatsapp(clienteEditar.telefone_is_whatsapp ?? true);
        setTelefone2(clienteEditar.telefone2 || '');
        setTelefone2IsWhatsapp(clienteEditar.telefone2_is_whatsapp ?? false);
        setPermiteFiado(clienteEditar.permite_fiado ?? permissions.podeAtivarFiado);
        setLimiteCredito(formatarValorBRL(clienteEditar.limite_credito ?? 500));
        setTabelaPreco(clienteEditar.tabela_preco_padrao || 'varejo');

        // Endereço: se já tiver campos estruturados, usa-os
        const temEstruturado = Boolean(
          clienteEditar.endereco_logradouro ||
          clienteEditar.endereco_cep ||
          clienteEditar.endereco_cidade ||
          clienteEditar.endereco_bairro
        );

        let finalCep = '';
        let finalRua = '';
        let finalNumero = '';
        let finalComplemento = '';
        let finalBairro = '';
        let finalCidade = '';
        let finalEstado = '';

        if (temEstruturado) {
          finalCep = clienteEditar.endereco_cep || '';
          finalRua = clienteEditar.endereco_logradouro || '';
          finalNumero = clienteEditar.endereco_numero || '';
          finalComplemento = clienteEditar.endereco_complemento || '';
          finalBairro = clienteEditar.endereco_bairro || '';
          finalCidade = clienteEditar.endereco_cidade || '';
          finalEstado = clienteEditar.endereco_estado || '';
        } else if (clienteEditar.endereco_principal) {
          const extraido = extrairEnderecoEstruturado(clienteEditar.endereco_principal);
          finalCep = extraido.cep || clienteEditar.endereco_cep || '';
          finalRua = extraido.rua || clienteEditar.endereco_principal || '';
          finalNumero = extraido.numero || clienteEditar.endereco_numero || '';
          finalComplemento = extraido.complemento || clienteEditar.endereco_complemento || '';
          finalBairro = extraido.bairro || clienteEditar.endereco_bairro || '';
          finalCidade = extraido.cidade || clienteEditar.endereco_cidade || '';
          finalEstado = extraido.estado || clienteEditar.endereco_estado || '';
        }

        setCep(finalCep);
        setRua(finalRua);
        setNumero(finalNumero);
        setComplemento(finalComplemento);
        setBairro(finalBairro);
        setCidade(finalCidade);
        setEstado(finalEstado);

        snapObj = {
          ativo: (clienteEditar as any).ativo !== false,
          nome: clienteEditar.nome || '',
          cpfCnpj: clienteEditar.numero_documento || '',
          dataAniversario: clienteEditar.data_aniversario || '',
          email: clienteEditar.email || '',
          observacoes: clienteEditar.observacoes || '',
          telefone1: clienteEditar.telefone || clienteEditar.whatsapp || '',
          telefone1IsWhatsapp: clienteEditar.telefone_is_whatsapp ?? true,
          telefone2: clienteEditar.telefone2 || '',
          telefone2IsWhatsapp: clienteEditar.telefone2_is_whatsapp ?? false,
          permiteFiado: clienteEditar.permite_fiado ?? permissions.podeAtivarFiado,
          limiteCredito: String(clienteEditar.limite_credito ?? '500.00'),
          tabelaPreco: clienteEditar.tabela_preco_padrao || 'varejo',
          cep: finalCep,
          rua: finalRua,
          numero: finalNumero,
          complemento: finalComplemento,
          bairro: finalBairro,
          cidade: finalCidade,
          estado: finalEstado
        };
      } else {
        setAtivo(true);
        setNome('');
        setCpfCnpj('');
        setDataAniversario('');
        setEmail('');
        setObservacoes('');
        setTelefone1('');
        setTelefone1IsWhatsapp(true);
        setTelefone2('');
        setTelefone2IsWhatsapp(false);
        setPermiteFiado(permissions.podeAtivarFiado);
        setLimiteCredito(permissions.podeAtivarFiado ? '500,00' : '0,00');
        setTabelaPreco('varejo');
        setCep('');
        setRua('');
        setNumero('');
        setComplemento('');
        setBairro('');
        setCidade('');
        setEstado('');

        snapObj = {
          ativo: true,
          nome: '',
          cpfCnpj: '',
          dataAniversario: '',
          email: '',
          observacoes: '',
          telefone1: '',
          telefone1IsWhatsapp: true,
          telefone2: '',
          telefone2IsWhatsapp: false,
          permiteFiado: permissions.podeAtivarFiado,
          limiteCredito: permissions.podeAtivarFiado ? '500,00' : '0,00',
          tabelaPreco: 'varejo',
          cep: '',
          rua: '',
          numero: '',
          complemento: '',
          bairro: '',
          cidade: '',
          estado: ''
        };
      }
      setSnapshotInicial(JSON.stringify(snapObj));
      setErroMsg(null);
    }
  }, [isOpen, clienteEditar]);

  const snapshotAtual = JSON.stringify({
    ativo,
    nome,
    cpfCnpj,
    dataAniversario,
    email,
    observacoes,
    telefone1,
    telefone1IsWhatsapp,
    telefone2,
    telefone2IsWhatsapp,
    permiteFiado,
    limiteCredito,
    tabelaPreco,
    cep,
    rua,
    numero,
    complemento,
    bairro,
    cidade,
    estado
  });

  const isDirty = Boolean(snapshotInicial && snapshotAtual !== snapshotInicial);

  React.useEffect(() => {
    if (isOpen) {
      setTemAlteracoesNaoSalvas(isDirty);
    }
    return () => {
      setTemAlteracoesNaoSalvas(false);
    };
  }, [isOpen, isDirty, setTemAlteracoesNaoSalvas]);

  const handleFecharComConfirmacao = () => {
    if (isDirty) {
      confirmar({
        titulo: 'Alterações Não Salvas',
        mensagem: 'Você fez alterações no cadastro do cliente que ainda não foram salvas. Se sair agora, as alterações serão perdidas.',
        textoConfirmar: 'Sair sem salvar',
        textoCancelar: 'Continuar editando',
        onConfirmar: () => onClose()
      });
    } else {
      onClose();
    }
  };

  useRegisterOverlay(isOpen, handleFecharComConfirmacao, 'modal-novo-cliente');

  if (!isOpen) return null;

  // Formatadores de Máscara
  const formatarTelefone = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 11);
    if (limpo.length <= 2) return limpo;
    if (limpo.length <= 6) return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
    if (limpo.length <= 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
  };

  const formatarCpfCnpj = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 14);
    if (limpo.length <= 11) {
      // CPF: 000.000.000-00
      if (limpo.length <= 3) return limpo;
      if (limpo.length <= 6) return `${limpo.slice(0, 3)}.${limpo.slice(3)}`;
      if (limpo.length <= 9) return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6)}`;
      return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9, 11)}`;
    } else {
      // CNPJ: 00.000.000/0000-00
      if (limpo.length <= 12) return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8)}`;
      return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`;
    }
  };

  const formatarCep = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 8);
    if (limpo.length <= 5) return limpo;
    return `${limpo.slice(0, 5)}-${limpo.slice(5, 8)}`;
  };

  // Buscar CEP via ViaCEP
  const buscarCep = async (cepParaBuscar: string) => {
    const cepLimpo = cepParaBuscar.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    try {
      setCarregandoCep(true);
      setErroMsg(null);
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();

      if (data.erro) {
        setErroMsg('CEP não encontrado nos Correios.');
        return;
      }

      if (data.logradouro) setRua(data.logradouro);
      if (data.bairro) setBairro(data.bairro);
      if (data.localidade) setCidade(data.localidade);
      if (data.uf) setEstado(data.uf.toUpperCase());
    } catch (err) {
      console.error('Erro ao consultar CEP:', err);
      setErroMsg('Não foi possível consultar o CEP automaticamente.');
    } finally {
      setCarregandoCep(false);
    }
  };

  // Obter Localização Atual do Navegador e Fazer Geocoding Reverso
  const usarLocalizacaoAtual = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    setCarregandoGeoloc(true);
    setErroMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;

          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
            {
              headers: {
                'Accept-Language': 'pt-BR,pt;q=0.9'
              }
            }
          );
          const data = await res.json();

          if (data && data.address) {
            const addr = data.address;
            const logradouro = addr.road || addr.street || addr.pedestrian || addr.footway || '';
            const num = addr.house_number || '';
            const b = addr.suburb || addr.neighbourhood || addr.city_district || '';
            const cid = addr.city || addr.town || addr.municipality || addr.village || '';
            const est = addr['ISO3166-2-lvl4']?.split('-')[1] || addr.state_code || addr.state || '';
            const rawCep = addr.postcode || '';

            if (logradouro) setRua(logradouro);
            if (num) setNumero(num);
            if (b) setBairro(b);
            if (cid) setCidade(cid);
            if (rawCep) {
              const cepFormatado = formatarCep(rawCep);
              setCep(cepFormatado);
            }

            // Normalizar sigla do estado
            if (est) {
              const ufEncontrada = ESTADOS_BRASIL.find(
                e => e.sigla.toLowerCase() === est.toLowerCase() || e.nome.toLowerCase() === est.toLowerCase()
              );
              if (ufEncontrada) setEstado(ufEncontrada.sigla);
              else if (est.length === 2) setEstado(est.toUpperCase());
            }
          }
        } catch (err) {
          console.error('Erro na geolocalização reversa:', err);
          setErroMsg('Localização obtida, mas não foi possível converter em endereço automaticamente.');
        } finally {
          setCarregandoGeoloc(false);
        }
      },
      (erro) => {
        setCarregandoGeoloc(false);
        let msg = 'Erro ao obter localização.';
        if (erro.code === erro.PERMISSION_DENIED) {
          msg = 'Permissão de localização negada pelo navegador.';
        } else if (erro.code === erro.POSITION_UNAVAILABLE) {
          msg = 'Informações de localização indisponíveis.';
        } else if (erro.code === erro.TIMEOUT) {
          msg = 'Tempo limite esgotado ao buscar localização.';
        }
        setErroMsg(msg);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSubmeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id) {
      setErroMsg('Loja não identificada. Faça login novamente.');
      return;
    }

    if (!nome.trim()) {
      setErroMsg('Por favor, informe o nome do cliente.');
      return;
    }

    setSalvando(true);
    setErroMsg(null);

    // Formatar endereço completo estruturado
    const partesEndereco = [];
    if (rua.trim()) partesEndereco.push(rua.trim());
    if (numero.trim()) partesEndereco.push(`nº ${numero.trim()}`);
    if (complemento.trim()) partesEndereco.push(`(${complemento.trim()})`);
    if (bairro.trim()) partesEndereco.push(bairro.trim());
    if (cidade.trim()) partesEndereco.push(cidade.trim());
    if (estado.trim()) partesEndereco.push(estado.trim());
    if (cep.trim()) partesEndereco.push(`CEP: ${cep.trim()}`);

    let enderecoPrincipalFormatado = partesEndereco.join(', ');
    if (!enderecoPrincipalFormatado && clienteEditar?.endereco_principal) {
      enderecoPrincipalFormatado = clienteEditar.endereco_principal;
    }

    // Definir número principal para WhatsApp
    let whatsappPrincipal = '';
    if (telefone1IsWhatsapp && telefone1.trim()) {
      whatsappPrincipal = telefone1.replace(/\D/g, '');
    } else if (telefone2IsWhatsapp && telefone2.trim()) {
      whatsappPrincipal = telefone2.replace(/\D/g, '');
    } else if (telefone1.trim()) {
      whatsappPrincipal = telefone1.replace(/\D/g, '');
    }

    // Converter limite de crédito do formato pt-BR para número
    const limCreditoLimpo = String(limiteCredito || '').trim().replace(/\./g, '').replace(',', '.');
    const limiteCreditoNum = permiteFiado ? (parseFloat(limCreditoLimpo) || 0) : 0;

    const payloadCompleto: Record<string, any> = {
      loja_id: loja.id,
      nome: nome.trim(),
      numero_documento: cpfCnpj.trim() || null,
      data_aniversario: dataAniversario || null,
      email: email.trim() || null,
      telefone: telefone1.trim() || null,
      telefone2: telefone2.trim() || null,
      telefone_is_whatsapp: telefone1IsWhatsapp,
      telefone2_is_whatsapp: telefone2IsWhatsapp,
      whatsapp: whatsappPrincipal || null,
      permite_fiado: permiteFiado,
      limite_credito: limiteCreditoNum,
      saldo_devedor_fiado: clienteEditar ? (Number(clienteEditar.saldo_devedor_fiado) || 0) : 0,
      tabela_preco_padrao: tabelaPreco,
      observacoes: observacoes.trim() || null,
      endereco_cep: cep.trim() || null,
      endereco_logradouro: rua.trim() || null,
      endereco_numero: numero.trim() || null,
      endereco_complemento: complemento.trim() || null,
      endereco_bairro: bairro.trim() || null,
      endereco_cidade: cidade.trim() || null,
      endereco_estado: estado.trim() || null,
      endereco_principal: enderecoPrincipalFormatado || null,
      ativo: ativo
    };

    try {
      let data: any = null;
      let error: any = null;

      if (clienteEditar?.id) {
        // ATUALIZAÇÃO (UPDATE)
        let res = await supabase
          .from('clientes')
          .update(payloadCompleto)
          .eq('id', clienteEditar.id)
          .select()
          .single();

        // Se falhar porque a coluna 'ativo' não existe no banco, remove 'ativo' e tenta novamente
        if (res.error && res.error.message && res.error.message.includes('ativo')) {
          delete payloadCompleto.ativo;
          res = await supabase
            .from('clientes')
            .update(payloadCompleto)
            .eq('id', clienteEditar.id)
            .select()
            .single();
        }

        // Se ainda falhar por alguma outra coluna, tenta o payload reduzido
        if (res.error && res.error.message && res.error.message.includes('column')) {
          const payloadLegado = {
            nome: nome.trim(),
            numero_documento: cpfCnpj.trim() || null,
            data_aniversario: dataAniversario || null,
            email: email.trim() || null,
            telefone: telefone1.trim() || null,
            whatsapp: whatsappPrincipal || null,
            permite_fiado: permiteFiado,
            limite_credito: limiteCreditoNum,
            tabela_preco_padrao: tabelaPreco,
            observacoes: observacoes.trim() || null,
            endereco_principal: enderecoPrincipalFormatado || null
          };
          res = await supabase
            .from('clientes')
            .update(payloadLegado)
            .eq('id', clienteEditar.id)
            .select()
            .single();
        }

        data = res.data;
        error = res.error;
      } else {
        // INSERÇÃO (INSERT NOVO)
        let res = await supabase
          .from('clientes')
          .insert([payloadCompleto])
          .select()
          .single();

        // Se falhar porque a coluna 'ativo' não existe no banco, remove 'ativo' e tenta novamente
        if (res.error && res.error.message && res.error.message.includes('ativo')) {
          delete payloadCompleto.ativo;
          res = await supabase
            .from('clientes')
            .insert([payloadCompleto])
            .select()
            .single();
        }

        if (res.error && res.error.message && res.error.message.includes('column')) {
          const payloadLegado = {
            loja_id: loja.id,
            nome: nome.trim(),
            numero_documento: cpfCnpj.trim() || null,
            data_aniversario: dataAniversario || null,
            email: email.trim() || null,
            telefone: telefone1.trim() || null,
            whatsapp: whatsappPrincipal || null,
            permite_fiado: permiteFiado,
            limite_credito: limiteCreditoNum,
            saldo_devedor_fiado: 0,
            tabela_preco_padrao: tabelaPreco,
            observacoes: observacoes.trim() || null,
            endereco_principal: enderecoPrincipalFormatado || null
          };
          res = await supabase
            .from('clientes')
            .insert([payloadLegado])
            .select()
            .single();
        }

        data = res.data;
        error = res.error;
      }

      if (error) throw error;

      if (data) {
        setSnapshotInicial(snapshotAtual);
        onClienteCadastrado(data as Cliente);
        onClose();
      }
    } catch (err: any) {
      console.error('Erro ao salvar cliente:', err);
      setErroMsg(err.message || 'Erro inesperado ao salvar cliente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/80 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1E293B] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">
                {clienteEditar ? 'Editar Dados do Cliente' : 'Cadastrar Novo Cliente'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {clienteEditar
                  ? 'Atualize os dados de contato, endereço e condições de crédito'
                  : 'Preencha os dados de contato, endereço e controle de crédito'}
              </p>
            </div>
          </div>
          <button
            onClick={handleFecharComConfirmacao}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro / Alerta */}
        {erroMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="flex-1 font-medium">{erroMsg}</span>
          </div>
        )}

        {/* Formulário com Scroll */}
        <form onSubmit={handleSubmeter} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Status do Cliente (Ativo / Inativo) - Apenas em Edição e Restrito a Owner / Admin */}
          {clienteEditar && (
            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Status do Cadastro:</span>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    ativo
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60'
                  }`}>
                    {ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  {ativo ? 'Cliente ativo e disponível para vendas e emissão de fiado.' : 'Cliente inativado no sistema.'}
                </span>
              </div>

              {permissions.ehAdmin ? (
                <button
                  type="button"
                  onClick={() => setAtivo(!ativo)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    ativo
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 dark:text-rose-400 dark:border-rose-800/60'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 dark:text-emerald-400 dark:border-emerald-800/60'
                  }`}
                >
                  <span>{ativo ? 'Inativar Cliente' : 'Ativar Cliente'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Apenas Owner / Admin</span>
                </div>
              )}
            </div>
          )}

          {/* SEÇÃO 1: DADOS BÁSICOS */}
          <div className="bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>1. Identificação do Cliente</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Nome */}
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                  Nome Completo <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Ex: João Carlos da Silva"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
              </div>

              {/* CPF / CNPJ */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">CPF ou CNPJ</label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="000.000.000-00 ou CNPJ"
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(formatarCpfCnpj(e.target.value))}
                    className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Data de Aniversário */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Data de Aniversário</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={dataAniversario}
                    onChange={(e) => setDataAniversario(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
              </div>

              {/* E-mail */}
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    placeholder="exemplo@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: TELEFONES & WHATSAPP */}
          <div className="bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              <span>2. Contatos & WhatsApp</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Telefone 1 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Telefone 1</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={telefone1}
                    onChange={(e) => setTelefone1(formatarTelefone(e.target.value))}
                    className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTelefone1IsWhatsapp(!telefone1IsWhatsapp)}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-[11px] font-semibold transition cursor-pointer shadow-2xs ${
                    telefone1IsWhatsapp
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60 font-bold'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{telefone1IsWhatsapp ? '✓ É WhatsApp' : 'Definir como WhatsApp'}</span>
                </button>
              </div>

              {/* Telefone 2 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Telefone 2</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={telefone2}
                    onChange={(e) => setTelefone2(formatarTelefone(e.target.value))}
                    className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTelefone2IsWhatsapp(!telefone2IsWhatsapp)}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-[11px] font-semibold transition cursor-pointer shadow-2xs ${
                    telefone2IsWhatsapp
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60 font-bold'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{telefone2IsWhatsapp ? '✓ É WhatsApp' : 'Definir como WhatsApp'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: CONTROLE DE FIADO & PREÇOS */}
          <div className="bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              <span>3. Controle de Fiado & Tabela de Preço</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Tabela de Preço */}
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Tabela de Preço Padrão</label>
                <select
                  value={tabelaPreco}
                  onChange={(e) => setTabelaPreco(e.target.value as TabelaPreco)}
                  className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition capitalize cursor-pointer"
                >
                  <option value="varejo">Varejo (Preço Normal)</option>
                  <option value="atacado">Atacado</option>
                  <option value="autoatacado">Autoatacado</option>
                </select>
              </div>

              {/* Indicador se Permite Fiado (Apenas se autorizado a ativar fiado) */}
              {permissions.podeAtivarFiado && (
                <>
                  <div className="sm:col-span-2 bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                        permiteFiado
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-400'
                          : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500'
                      }`}>
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">Permite Venda no Fiado / A Prazo?</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {permiteFiado
                            ? 'Cliente habilitado para compras a prazo com limite de crédito'
                            : 'Cliente bloqueado para fiado (apenas pagamentos à vista)'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={permiteFiado}
                      onClick={() => setPermiteFiado(!permiteFiado)}
                      className="flex items-center gap-2 cursor-pointer select-none shrink-0 self-start sm:self-auto"
                      title={permiteFiado ? 'Desativar fiado' : 'Ativar fiado'}
                    >
                      <span className={`text-xs font-bold transition ${permiteFiado ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {permiteFiado ? 'Habilitado' : 'Bloqueado'}
                      </span>
                      <div
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          permiteFiado ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            permiteFiado ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </button>
                  </div>

                  {/* LIMITE DE FIADO: SÓ EXIBIDO/SOLICITADO SE PERMITE FIADO FOR VERDADEIRO */}
                  {permiteFiado && (
                    <div className="sm:col-span-2 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 rounded-2xl p-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Limite de Crédito / Fiado (R$) <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Valor máximo de débito pendente permitido
                        </span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600 dark:text-emerald-400">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          required={permiteFiado}
                          placeholder="500,00"
                          value={limiteCredito}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0,1-9.,]/g, '');
                            setLimiteCredito(val);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* SEÇÃO 4: ENDEREÇO COMPLETO */}
          <div className="bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>4. Endereço Completo</span>
              </h3>

              {/* Botão de Localização Atual */}
              <button
                type="button"
                disabled={carregandoGeoloc}
                onClick={usarLocalizacaoAtual}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {carregandoGeoloc ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Navigation className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                <span>{carregandoGeoloc ? 'Buscando GPS...' : 'Usar Localização Atual'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3.5">
              {/* CEP com Botão Não Sei o CEP */}
              <div className="sm:col-span-3 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">CEP</label>
                  <a
                    href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>Não sei o CEP</span>
                  </a>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="00000-000"
                    value={cep}
                    onChange={(e) => {
                      const formatado = formatarCep(e.target.value);
                      setCep(formatado);
                      if (formatado.replace(/\D/g, '').length === 8) {
                        buscarCep(formatado);
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                  {carregandoCep && (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>

              {/* Estado (UF) */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Estado (UF)</label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition cursor-pointer"
                >
                  <option value="">Selecione o Estado</option>
                  {ESTADOS_BRASIL.map((uf) => (
                    <option key={uf.sigla} value={uf.sigla}>
                      {uf.sigla} - {uf.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rua / Logradouro */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Rua / Logradouro</label>
                <input
                  type="text"
                  placeholder="Ex: Av. Santos Dumont, Rua das Flores"
                  value={rua}
                  onChange={(e) => setRua(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              {/* Número */}
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Número</label>
                <input
                  type="text"
                  placeholder="Ex: 123, S/N"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              {/* Bairro */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Bairro</label>
                <input
                  type="text"
                  placeholder="Ex: Aldeota, Centro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              {/* Cidade */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Cidade</label>
                <input
                  type="text"
                  placeholder="Ex: Fortaleza, São Paulo"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              {/* Complemento */}
              <div className="sm:col-span-6 space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Complemento / Ponto de Referência</label>
                <input
                  type="text"
                  placeholder="Ex: Apto 204, Bloco B, Próximo ao supermercado"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 5: OBSERVAÇÕES */}
          <div className="bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2.5 shadow-xs">
            <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>5. Observações Gerais</span>
            </h3>
            <textarea
              rows={2}
              placeholder="Preferências de atendimento, notas de entrega, histórico ou detalhes importantes..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl p-3 text-xs font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 transition resize-none"
            />
          </div>
        </form>

        {/* Rodapé com Ações */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-700/80 bg-slate-50/90 dark:bg-slate-900/80 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={handleFecharComConfirmacao}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={handleSubmeter}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white text-xs font-bold shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{clienteEditar ? 'Salvando...' : 'Cadastrando...'}</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{clienteEditar ? 'Salvar Alterações' : 'Salvar Cliente'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
