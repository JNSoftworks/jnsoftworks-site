const DB = (() => {
  const CHAVE = "dhgarage.v1";

  const STATUS_ORDEM = [
    { id: "analise", label: "Em Análise", cor: "#c9922c" },
    { id: "espera", label: "Em Espera", cor: "#6b7fa8" },
    { id: "execucao", label: "Em Execução", cor: "#2f7fc4" },
    { id: "parcial", label: "Executada Parcialmente", cor: "#8b5fbf" },
    { id: "finalizada", label: "Finalizada", cor: "#2a9d5c" },
    { id: "cancelada", label: "Cancelada", cor: "#d64545" },
    { id: "arquivada", label: "Arquivada", cor: "#7a7f8a" }
  ];
  const STATUS_POR_ID = STATUS_ORDEM.reduce((acc, s) => (acc[s.id] = s, acc), {});
  const STATUS_PADRAO = "analise";

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function padrao() {
    return {
      oficina: {
        nome: "DH Garage",
        telefone: "(41) 998763236",
        endereco: "",
        logoDataUrl: null,
        prazoOrcamentoDias: 10
      },
      servicos: [
        { id: uid(), nome: "Troca de óleo e filtro" },
        { id: uid(), nome: "Revisão geral" },
        { id: uid(), nome: "Alinhamento e balanceamento" },
        { id: uid(), nome: "Troca de pastilhas de freio" },
        { id: uid(), nome: "Diagnóstico eletrônico" }
      ],
      pecas: [
        { id: uid(), nome: "Óleo de motor (litro)", valorUnit: 0 },
        { id: uid(), nome: "Filtro de óleo", valorUnit: 0 },
        { id: uid(), nome: "Filtro de ar", valorUnit: 0 },
        { id: uid(), nome: "Pastilha de freio (jogo)", valorUnit: 0 },
        { id: uid(), nome: "Bateria", valorUnit: 0 }
      ],
      ordens: [],
      proximoNumero: 1
    };
  }

  function carregar() {
    let dados;
    let instalacaoNova = false;
    try {
      const bruto = localStorage.getItem(CHAVE);
      dados = bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      dados = null;
    }
    if (!dados) {
      dados = padrao();
      instalacaoNova = true;
    }
    dados.oficina = Object.assign(padrao().oficina, dados.oficina || {});
    dados.servicos = dados.servicos || [];
    dados.pecas = dados.pecas || [];
    dados.ordens = dados.ordens || [];
    dados.proximoNumero = dados.proximoNumero || 1;
    dados.ordens.forEach((o) => {
      if (o.status === "paga") {
        o.status = "finalizada";
        if (o.pago == null) o.pago = true;
      }
      if (!o.status || !STATUS_POR_ID[o.status]) o.status = STATUS_PADRAO;
      if (o.pago == null) o.pago = false;
      if (!o.analiseIniciadoEm) o.analiseIniciadoEm = o.criadoEm || Date.now();
      if (!o.statusAlteradoEm) o.statusAlteradoEm = o.criadoEm || Date.now();
      if (Array.isArray(o.servicos)) {
        o.servicos = o.servicos.map((s) => (typeof s === "string" ? { nome: s, qtd: 1, valorUnit: 0 } : s));
      }
      if (o.totalServicos == null) o.totalServicos = 0;
    });
    if (instalacaoNova) salvar(dados);
    return dados;
  }

  function salvar(dados) {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  }

  const api = {
    uid,
    STATUS_ORDEM,
    STATUS_POR_ID,
    STATUS_PADRAO,

    getOficina() {
      return carregar().oficina;
    },
    setOficina(oficina) {
      const dados = carregar();
      dados.oficina = Object.assign(dados.oficina, oficina);
      salvar(dados);
      return dados.oficina;
    },

    listServicos() {
      return carregar().servicos;
    },
    addServico(nome, valor) {
      const dados = carregar();
      const item = { id: uid(), nome: nome.trim(), valor: Number(valor) || 0 };
      dados.servicos.push(item);
      salvar(dados);
      return item;
    },
    updateServico(id, nome, valor) {
      const dados = carregar();
      const item = dados.servicos.find((s) => s.id === id);
      if (item) {
        item.nome = nome.trim();
        item.valor = Number(valor) || 0;
      }
      salvar(dados);
    },
    removeServico(id) {
      const dados = carregar();
      dados.servicos = dados.servicos.filter((s) => s.id !== id);
      salvar(dados);
    },

    listPecas() {
      return carregar().pecas;
    },
    addPeca(nome, valorUnit) {
      const dados = carregar();
      const item = { id: uid(), nome: nome.trim(), valorUnit: Number(valorUnit) || 0 };
      dados.pecas.push(item);
      salvar(dados);
      return item;
    },
    updatePeca(id, nome, valorUnit) {
      const dados = carregar();
      const item = dados.pecas.find((p) => p.id === id);
      if (item) {
        item.nome = nome.trim();
        item.valorUnit = Number(valorUnit) || 0;
      }
      salvar(dados);
    },
    removePeca(id) {
      const dados = carregar();
      dados.pecas = dados.pecas.filter((p) => p.id !== id);
      salvar(dados);
    },

    listOrdens() {
      return carregar().ordens.slice().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
    },
    getOrdem(id) {
      return carregar().ordens.find((o) => o.id === id) || null;
    },
    proximoNumero() {
      return carregar().proximoNumero;
    },
    salvarOrdem(ordem) {
      const dados = carregar();
      if (!ordem.numero || Number(ordem.numero) < 1) ordem.numero = dados.proximoNumero;
      ordem.numero = Number(ordem.numero);
      if (ordem.id) {
        const idx = dados.ordens.findIndex((o) => o.id === ordem.id);
        if (idx >= 0) {
          dados.ordens[idx] = ordem;
          if (ordem.numero >= dados.proximoNumero) dados.proximoNumero = ordem.numero + 1;
          salvar(dados);
          return ordem;
        }
      }
      ordem.id = uid();
      ordem.criadoEm = Date.now();
      ordem.status = STATUS_PADRAO;
      if (ordem.pago == null) ordem.pago = false;
      ordem.analiseIniciadoEm = ordem.criadoEm;
      ordem.statusAlteradoEm = ordem.criadoEm;
      if (ordem.numero >= dados.proximoNumero) dados.proximoNumero = ordem.numero + 1;
      dados.ordens.push(ordem);
      salvar(dados);
      return ordem;
    },
    removeOrdem(id) {
      const dados = carregar();
      dados.ordens = dados.ordens.filter((o) => o.id !== id);
      salvar(dados);
    },
    setStatus(id, status) {
      const dados = carregar();
      const ordem = dados.ordens.find((o) => o.id === id);
      if (!ordem || !STATUS_POR_ID[status]) return null;
      ordem.status = status;
      ordem.statusAlteradoEm = Date.now();
      if (status === "analise") ordem.analiseIniciadoEm = Date.now();
      salvar(dados);
      return ordem;
    },
    setPago(id, pago) {
      const dados = carregar();
      const ordem = dados.ordens.find((o) => o.id === id);
      if (!ordem) return null;
      ordem.pago = !!pago;
      salvar(dados);
      return ordem;
    },

    diasRestantesAnalise(ordem) {
      const dados = carregar();
      const prazo = Number(dados.oficina.prazoOrcamentoDias) || 10;
      const inicio = ordem.analiseIniciadoEm || ordem.criadoEm || Date.now();
      const expiraEm = inicio + prazo * 86400000;
      return Math.ceil((expiraEm - Date.now()) / 86400000);
    },

    stats() {
      const dados = carregar();
      const agora = new Date();
      const mesAtual = agora.getMonth();
      const anoAtual = agora.getFullYear();
      let totalMes = 0;
      let qtdMes = 0;
      dados.ordens.forEach((o) => {
        const d = new Date(o.criadoEm || 0);
        if (d.getMonth() === mesAtual && d.getFullYear() === anoAtual) {
          qtdMes += 1;
          if (o.pago) totalMes += Number(o.total) || 0;
        }
      });
      return { totalOrdens: dados.ordens.length, qtdMes, totalMes };
    }
  };

  return api;
})();
