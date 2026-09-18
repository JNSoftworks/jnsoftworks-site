(() => {
  const VERSAO = "1.0";
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $all = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function fmtMoeda(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function hoje() {
    return new Date().toISOString().slice(0, 10);
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function normaliza(s) {
    return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  function textoBuscaOrdem(o) {
    const partes = [
      o.numero, DB.STATUS_POR_ID[o.status]?.label,
      o.cliente?.nome, o.cliente?.telefone, o.cliente?.cpfCnpj, o.cliente?.endereco,
      o.veiculo?.marcaModelo, o.veiculo?.placa, o.veiculo?.ano, o.veiculo?.cor, o.veiculo?.combustivel,
      ...(o.servicos || []).map((s) => (typeof s === "string" ? s : s.nome)),
      ...(o.itens || []).map((it) => it.nome)
    ];
    return normaliza(partes.filter(Boolean).join(" "));
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  // ---------- Confirm modal ----------
  function confirmModal(titulo, msg, corBotao) {
    return new Promise((resolve) => {
      const overlay = $("#overlay-confirm");
      $("#confirm-titulo", overlay).textContent = titulo;
      $("#confirm-msg", overlay).textContent = msg;
      const btnOk = $("#confirm-ok", overlay);
      const btnCancel = $("#confirm-cancel", overlay);
      btnOk.className = "btn " + (corBotao || "btn-danger");
      overlay.classList.add("show");
      function limpar(resultado) {
        overlay.classList.remove("show");
        btnOk.removeEventListener("click", onOk);
        btnCancel.removeEventListener("click", onCancel);
        resolve(resultado);
      }
      function onOk() { limpar(true); }
      function onCancel() { limpar(false); }
      btnOk.addEventListener("click", onOk);
      btnCancel.addEventListener("click", onCancel);
    });
  }

  // ---------- Bottom sheet genérico ----------
  function abrirSheet(html) {
    const overlay = $("#overlay-sheet");
    $("#sheet-body", overlay).innerHTML = html;
    overlay.classList.add("show");
  }
  function fecharSheet() {
    $("#overlay-sheet").classList.remove("show");
  }

  // ---------- Router ----------
  const VIEWS = ["home", "nova-os", "historico", "cadastros"];
  let cadastroTabAtiva = "servicos";
  let ordemDetalheId = null;

  const TITULOS = {
    home: ["Minha OS", "Ordens de serviço"],
    "nova-os": ["Nova OS", "Preencher ordem de serviço"],
    historico: ["Ver Ordens", "Buscar e filtrar OS"],
    cadastros: ["Cadastros", "Serviços, peças e oficina"]
  };

  function mostrarView(nome, opts) {
    opts = opts || {};
    VIEWS.forEach((v) => {
      $(`#view-${v}`).classList.toggle("ativo", v === nome);
    });
    $all(".navbar button").forEach((b) => b.classList.toggle("ativo", b.dataset.view === nome));
    const [titulo, sub] = TITULOS[nome] || ["DH Garage", ""];
    $("#topbar-titulo").childNodes[0].nodeValue = titulo;
    $("#topbar-sub").textContent = sub;
    if (nome === "home") renderHome();
    if (nome === "historico") renderHistorico();
    if (nome === "cadastros") renderCadastros(opts.tab || cadastroTabAtiva);
    if (nome === "nova-os" && !opts.manterEstado) iniciarNovaOS(opts.baseOrdem, opts.duplicar);
    window.scrollTo(0, 0);
  }

  // ---------- Home ----------
  function renderHome() {
    const oficina = DB.getOficina();
    const stats = DB.stats();
    const nomeCurto = (oficina.nome || "Minha Oficina").trim().split(/\s+/)[0];
    $("#view-home").innerHTML = `
      <div class="home-hero">
        <div class="logo-mini">${esc(nomeCurto)}</div>
        <p>${esc(oficina.telefone || "")}</p>
      </div>
      <div class="stat-row">
        <div class="stat"><div class="num">${stats.totalOrdens}</div><div class="lb">OS emitidas</div></div>
        <div class="stat"><div class="num">${stats.qtdMes}</div><div class="lb">Este mês</div></div>
        <div class="stat"><div class="num">${fmtMoeda(stats.totalMes)}</div><div class="lb">Faturado no mês</div></div>
      </div>
      <div class="menu-grid">
        <button class="menu-item" data-ir="nova-os"><span class="ic">📝</span><span class="lb">Nova OS</span><span class="ds">Criar ordem de serviço</span></button>
        <button class="menu-item" data-ir="historico"><span class="ic">🗂️</span><span class="lb">Ver Ordens</span><span class="ds">Buscar e filtrar OS</span></button>
        <button class="menu-item" data-ir="cadastros" data-tab="servicos"><span class="ic">🔧</span><span class="lb">Serviços</span><span class="ds">Catálogo de serviços</span></button>
        <button class="menu-item" data-ir="cadastros" data-tab="pecas"><span class="ic">⚙️</span><span class="lb">Peças</span><span class="ds">Catálogo de peças</span></button>
      </div>
      <div class="creditos">
        <div class="rule"><span class="dot" aria-hidden="true">•</span></div>
        <div class="cap">feito por</div><div class="nome">Jáber Felippe Neto</div>
        <span class="ver">Minha OS · v${VERSAO}</span>
      </div>
    `;
    $all("[data-ir]", $("#view-home")).forEach((btn) => {
      btn.addEventListener("click", () => mostrarView(btn.dataset.ir, { tab: btn.dataset.tab }));
    });
  }

  // ---------- Cadastros ----------
  function renderCadastros(tab) {
    cadastroTabAtiva = tab || "servicos";
    const view = $("#view-cadastros");
    view.innerHTML = `
      <div class="tabs">
        <button data-tab="servicos" class="${cadastroTabAtiva === "servicos" ? "ativo" : ""}">Serviços</button>
        <button data-tab="pecas" class="${cadastroTabAtiva === "pecas" ? "ativo" : ""}">Peças</button>
        <button data-tab="oficina" class="${cadastroTabAtiva === "oficina" ? "ativo" : ""}">Oficina</button>
      </div>
      <div id="cadastro-conteudo"></div>
    `;
    $all(".tabs button", view).forEach((b) => b.addEventListener("click", () => renderCadastros(b.dataset.tab)));
    if (cadastroTabAtiva === "servicos") renderCadastroServicos();
    else if (cadastroTabAtiva === "pecas") renderCadastroPecas();
    else renderCadastroOficina();
  }

  function renderCadastroServicos() {
    const cont = $("#cadastro-conteudo");
    const servicos = DB.listServicos();
    cont.innerHTML = `
      <div class="card">
        <h2>Serviços que você executa</h2>
        <div id="lista-servicos-cad">${
          servicos.length ? servicos.map((s) => `
            <div class="linha-item" data-id="${s.id}">
              <div class="info"><div class="nome">${esc(s.nome)}</div><div class="detalhe">${fmtMoeda(s.valor)}</div></div>
              <button class="icon-btn" data-acao="editar">✏️</button>
              <button class="icon-btn danger" data-acao="excluir">🗑️</button>
            </div>`).join("") : `<div class="vazio">Nenhum serviço cadastrado ainda.</div>`
        }</div>
        <button class="fab-add" id="btn-add-servico">+ Adicionar serviço</button>
      </div>
    `;
    $("#btn-add-servico").addEventListener("click", () => abrirSheetServico(null));
    $all('[data-acao="editar"]', cont).forEach((b) => b.addEventListener("click", (e) => {
      const id = e.target.closest(".linha-item").dataset.id;
      abrirSheetServico(servicos.find((s) => s.id === id));
    }));
    $all('[data-acao="excluir"]', cont).forEach((b) => b.addEventListener("click", async (e) => {
      const id = e.target.closest(".linha-item").dataset.id;
      const s = servicos.find((x) => x.id === id);
      if (await confirmModal("Excluir serviço", `Remover "${s.nome}" do catálogo?`)) {
        DB.removeServico(id);
        renderCadastroServicos();
        toast("Serviço removido");
      }
    }));
  }

  function abrirSheetServico(servico) {
    abrirSheet(`
      <h3>${servico ? "Editar serviço" : "Novo serviço"}</h3>
      <label>Nome do serviço</label>
      <input type="text" id="sh-nome" value="${servico ? esc(servico.nome) : ""}" placeholder="Ex: Troca de óleo" />
      <label>Valor (opcional)</label>
      <input type="number" id="sh-valor" min="0" step="0.01" value="${servico && servico.valor ? servico.valor : ""}" placeholder="0,00" />
      <div class="btn-row">
        <button class="btn btn-outline" id="sh-cancelar">Cancelar</button>
        <button class="btn btn-primary" id="sh-salvar">Salvar</button>
      </div>
    `);
    $("#sh-cancelar").addEventListener("click", fecharSheet);
    $("#sh-salvar").addEventListener("click", () => {
      const nome = $("#sh-nome").value.trim();
      const valor = $("#sh-valor").value;
      if (!nome) { toast("Digite um nome"); return; }
      if (servico) DB.updateServico(servico.id, nome, valor);
      else DB.addServico(nome, valor);
      fecharSheet();
      renderCadastroServicos();
      toast("Serviço salvo");
    });
    setTimeout(() => $("#sh-nome").focus(), 50);
  }

  function renderCadastroPecas() {
    const cont = $("#cadastro-conteudo");
    const pecas = DB.listPecas();
    cont.innerHTML = `
      <div class="card">
        <h2>Peças que você oferece</h2>
        <div id="lista-pecas-cad">${
          pecas.length ? pecas.map((p) => `
            <div class="linha-item" data-id="${p.id}">
              <div class="info"><div class="nome">${esc(p.nome)}</div><div class="detalhe">${fmtMoeda(p.valorUnit)}</div></div>
              <button class="icon-btn" data-acao="editar">✏️</button>
              <button class="icon-btn danger" data-acao="excluir">🗑️</button>
            </div>`).join("") : `<div class="vazio">Nenhuma peça cadastrada ainda.</div>`
        }</div>
        <button class="fab-add" id="btn-add-peca">+ Adicionar peça</button>
      </div>
    `;
    $("#btn-add-peca").addEventListener("click", () => abrirSheetPeca(null));
    $all('[data-acao="editar"]', cont).forEach((b) => b.addEventListener("click", (e) => {
      const id = e.target.closest(".linha-item").dataset.id;
      abrirSheetPeca(pecas.find((p) => p.id === id));
    }));
    $all('[data-acao="excluir"]', cont).forEach((b) => b.addEventListener("click", async (e) => {
      const id = e.target.closest(".linha-item").dataset.id;
      const p = pecas.find((x) => x.id === id);
      if (await confirmModal("Excluir peça", `Remover "${p.nome}" do catálogo?`)) {
        DB.removePeca(id);
        renderCadastroPecas();
        toast("Peça removida");
      }
    }));
  }

  function abrirSheetPeca(peca) {
    abrirSheet(`
      <h3>${peca ? "Editar peça" : "Nova peça"}</h3>
      <label>Nome da peça</label>
      <input type="text" id="sh-nome" value="${peca ? esc(peca.nome) : ""}" placeholder="Ex: Filtro de óleo" />
      <label>Valor unitário padrão (R$)</label>
      <input type="number" id="sh-valor" min="0" step="0.01" value="${peca ? peca.valorUnit : ""}" placeholder="0,00" />
      <div class="btn-row">
        <button class="btn btn-outline" id="sh-cancelar">Cancelar</button>
        <button class="btn btn-primary" id="sh-salvar">Salvar</button>
      </div>
    `);
    $("#sh-cancelar").addEventListener("click", fecharSheet);
    $("#sh-salvar").addEventListener("click", () => {
      const nome = $("#sh-nome").value.trim();
      const valor = $("#sh-valor").value;
      if (!nome) { toast("Digite um nome"); return; }
      if (peca) DB.updatePeca(peca.id, nome, valor);
      else DB.addPeca(nome, valor);
      fecharSheet();
      renderCadastroPecas();
      toast("Peça salva");
    });
    setTimeout(() => $("#sh-nome").focus(), 50);
  }

  function renderCadastroOficina() {
    const cont = $("#cadastro-conteudo");
    const oficina = DB.getOficina();
    cont.innerHTML = `
      <div class="card">
        <h2>Dados da oficina</h2>
        <div class="logo-upload">
          ${oficina.logoDataUrl ? `<img id="of-logo-preview" src="${oficina.logoDataUrl}" />` : `<div class="ph" id="of-logo-preview">LOGO</div>`}
          <div style="flex:1">
            <button class="btn btn-outline btn-sm" id="of-btn-logo">Enviar logo</button>
            ${oficina.logoDataUrl ? `<button class="btn btn-outline btn-sm" id="of-btn-logo-remover" style="margin-top:6px">Remover logo</button>` : ""}
            <input type="file" id="of-logo-file" accept="image/*" style="display:none" />
          </div>
        </div>
        <div class="detalhe" style="margin:4px 0 4px;color:var(--text-muted);font-size:11px">Se nenhuma logo for enviada, o PDF usa o nome da oficina como marca.</div>

        <label>Nome da oficina</label>
        <input type="text" id="of-nome" value="${esc(oficina.nome)}" />
        <label>Telefone</label>
        <input type="tel" id="of-telefone" value="${esc(oficina.telefone)}" />
        <label>Endereço (opcional)</label>
        <input type="text" id="of-endereco" value="${esc(oficina.endereco || "")}" />
        <label>Validade do orçamento (dias)</label>
        <input type="number" min="1" step="1" id="of-prazo" value="${Number(oficina.prazoOrcamentoDias) || 10}" />
        <div class="detalhe" style="margin:4px 0 0;color:var(--text-muted);font-size:11px">Depois desse prazo, uma OS "Em Análise" aparece como expirada em Ver Ordens.</div>

        <div class="btn-row">
          <button class="btn btn-primary" id="of-salvar">Salvar dados da oficina</button>
        </div>
      </div>
    `;
    let novaLogo = oficina.logoDataUrl;
    $("#of-btn-logo").addEventListener("click", () => $("#of-logo-file").click());
    $("#of-logo-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 400;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            const escala = max / Math.max(w, h);
            w = Math.round(w * escala); h = Math.round(h * escala);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          novaLogo = canvas.toDataURL("image/png");
          const preview = $("#of-logo-preview");
          const novoImg = document.createElement("img");
          novoImg.id = "of-logo-preview";
          novoImg.src = novaLogo;
          preview.replaceWith(novoImg);
          garantirBotaoRemoverLogo();
          toast("Logo carregada — clique em Salvar");
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    function ligarBotaoRemoverLogo(btn) {
      btn.addEventListener("click", () => {
        novaLogo = null;
        const preview = $("#of-logo-preview");
        const ph = document.createElement("div");
        ph.className = "ph"; ph.id = "of-logo-preview"; ph.textContent = "LOGO";
        preview.replaceWith(ph);
        btn.remove();
        toast("Logo removida — clique em Salvar");
      });
    }
    function garantirBotaoRemoverLogo() {
      if ($("#of-btn-logo-remover")) return;
      const btn = document.createElement("button");
      btn.className = "btn btn-outline btn-sm";
      btn.id = "of-btn-logo-remover";
      btn.textContent = "Remover logo";
      btn.style.marginTop = "6px";
      $("#of-btn-logo").insertAdjacentElement("afterend", btn);
      ligarBotaoRemoverLogo(btn);
    }
    const btnRemover = $("#of-btn-logo-remover");
    if (btnRemover) ligarBotaoRemoverLogo(btnRemover);
    $("#of-salvar").addEventListener("click", () => {
      DB.setOficina({
        nome: $("#of-nome").value.trim() || "Minha Oficina",
        telefone: $("#of-telefone").value.trim(),
        endereco: $("#of-endereco").value.trim(),
        prazoOrcamentoDias: Number($("#of-prazo").value) || 10,
        logoDataUrl: novaLogo
      });
      toast("Dados da oficina salvos");
    });
  }

  // ---------- Nova OS ----------
  let estadoOS = null;

  function novoEstadoOS() {
    return {
      id: null,
      numero: DB.proximoNumero(),
      dataEntrada: hoje(),
      prazoEntregaDias: 1,
      cliente: { nome: "", telefone: "", cpfCnpj: "", endereco: "" },
      veiculo: { marcaModelo: "", placa: "", ano: "", km: "", cor: "", combustivel: "" },
      servicos: [{ nome: "", qtd: 1, valorUnit: 0 }],
      itens: [{ nome: "", qtd: 1, valorUnit: 0 }],
      maoDeObra: 0,
      totalServicos: 0,
      totalPecas: 0,
      total: 0,
      pago: false
    };
  }

  function iniciarNovaOS(baseOrdem, duplicar) {
    if (baseOrdem) {
      estadoOS = JSON.parse(JSON.stringify(baseOrdem));
      if (duplicar) {
        estadoOS.id = null;
        estadoOS.numero = DB.proximoNumero();
        estadoOS.dataEntrada = hoje();
        estadoOS.prazoEntregaDias = 1;
        estadoOS.pago = false;
      }
      if (estadoOS.prazoEntregaDias == null) estadoOS.prazoEntregaDias = 1;
      if (estadoOS.pago == null) estadoOS.pago = false;
      estadoOS.servicos = (estadoOS.servicos || []).map((s) => (typeof s === "string" ? { nome: s, qtd: 1, valorUnit: 0 } : s));
      if (!estadoOS.servicos.length) estadoOS.servicos = [{ nome: "", qtd: 1, valorUnit: 0 }];
      if (!estadoOS.itens.length) estadoOS.itens = [{ nome: "", qtd: 1, valorUnit: 0 }];
    } else {
      estadoOS = novoEstadoOS();
    }
    renderNovaOS();
  }

  function renderNovaOS() {
    const view = $("#view-nova-os");

    view.innerHTML = `
      <div class="card">
        <h2>Ordem de Serviço</h2>
        <div class="grid2">
          <div>
            <label>Nº da OS</label>
            <input type="number" id="os-numero" min="1" step="1" value="${estadoOS.numero || ""}" />
          </div>
          <div>
            <label>Data de entrada</label>
            <input type="date" id="os-data-entrada" value="${estadoOS.dataEntrada}" />
          </div>
        </div>
        <div class="detalhe" style="margin:4px 0 10px;color:var(--text-muted);font-size:11px">Número sugerido automaticamente — edite se quiser usar outro.</div>
        <label>Entrega em dias úteis</label>
        <input type="number" id="os-prazo-entrega" min="0" step="1" value="${estadoOS.prazoEntregaDias ?? 1}" />
        <div class="detalhe" id="prazo-entrega-calc" style="margin:4px 0 0;color:var(--text-muted);font-size:11px"></div>
      </div>

      <div class="card">
        <h2>Dados do cliente</h2>
        <label>Nome</label>
        <input type="text" id="cli-nome" value="${esc(estadoOS.cliente.nome)}" />
        <div class="grid2">
          <div><label>Telefone</label><input type="tel" id="cli-telefone" value="${esc(estadoOS.cliente.telefone)}" /></div>
          <div><label>CPF/CNPJ</label><input type="text" id="cli-cpf" value="${esc(estadoOS.cliente.cpfCnpj)}" /></div>
        </div>
        <label>Endereço</label>
        <input type="text" id="cli-endereco" value="${esc(estadoOS.cliente.endereco)}" />
      </div>

      <div class="card">
        <h2>Dados do veículo</h2>
        <div class="grid2">
          <div><label>Marca/Modelo</label><input type="text" id="vei-marca" value="${esc(estadoOS.veiculo.marcaModelo)}" /></div>
          <div><label>Placa</label><input type="text" id="vei-placa" value="${esc(estadoOS.veiculo.placa)}" /></div>
        </div>
        <div class="grid2">
          <div><label>Ano</label><input type="text" id="vei-ano" value="${esc(estadoOS.veiculo.ano)}" /></div>
          <div><label>KM</label><input type="text" id="vei-km" value="${esc(estadoOS.veiculo.km)}" /></div>
        </div>
        <div class="grid2">
          <div><label>Cor</label><input type="text" id="vei-cor" value="${esc(estadoOS.veiculo.cor)}" /></div>
          <div><label>Combustível</label><input type="text" id="vei-combustivel" value="${esc(estadoOS.veiculo.combustivel)}" /></div>
        </div>
      </div>

      <div class="card">
        <h2>Serviços solicitados</h2>
        <div class="item-head"><span>Serviço</span><span>Qtd</span><span>Vlr Unit.</span><span>Total</span><span></span></div>
        <div id="lista-servicos"></div>
        <button class="fab-add" id="btn-add-servico-linha">+ Adicionar linha</button>
      </div>

      <div class="card">
        <h2>Peças</h2>
        <div class="item-head"><span>Peça</span><span>Qtd</span><span>Vlr Unit.</span><span>Total</span><span></span></div>
        <div id="lista-itens"></div>
        <button class="fab-add" id="btn-add-item">+ Adicionar peça</button>
      </div>

      <div class="card">
        <h2>Fechamento</h2>
        <label>Mão de obra (R$)</label>
        <input type="number" min="0" step="0.01" id="os-mao-obra" value="${estadoOS.maoDeObra || ""}" placeholder="0,00" />
        <div class="resumo-box">
          <div class="resumo-linha"><span>Serviços</span><span id="resumo-servicos">${fmtMoeda(estadoOS.totalServicos)}</span></div>
          <div class="resumo-linha"><span>Peças</span><span id="resumo-pecas">${fmtMoeda(estadoOS.totalPecas)}</span></div>
          <div class="resumo-linha"><span>Mão de obra</span><span id="resumo-mao">${fmtMoeda(estadoOS.maoDeObra)}</span></div>
          <div class="resumo-linha total"><span>Total</span><span id="resumo-total">${fmtMoeda(estadoOS.total)}</span></div>
        </div>
      </div>

      <div class="btn-row" style="flex-direction:column">
        <button class="btn btn-outline" id="os-visualizar">👁️ Visualizar</button>
        <button class="btn btn-secondary" id="os-baixar">⬇️ Baixar PDF</button>
        <button class="btn btn-primary" id="os-compartilhar">📤 Salvar e Compartilhar PDF</button>
      </div>
    `;

    renderListaServicos();
    renderListaItens();
    ligarEventosNovaOS();
    atualizarPrazoEntregaCalc();
  }

  // ---------- Combo customizado (nome com catálogo) ----------
  function comboHTML(valor, placeholder) {
    return `
      <div class="combo-wrap">
        <input type="text" class="in-nome" autocomplete="off" value="${esc(valor)}" placeholder="${placeholder}" />
        <button type="button" class="combo-arrow" tabindex="-1">▾</button>
        <div class="combo-lista"></div>
      </div>
    `;
  }

  function ligarCombo(wrapEl, { obterCatalogo, onDigitar, onSelecionar }) {
    const input = wrapEl.querySelector(".in-nome");
    const btn = wrapEl.querySelector(".combo-arrow");
    const lista = wrapEl.querySelector(".combo-lista");
    let fecharTimer = null;

    function render(filtro, mostrarTodos) {
      const catalogo = obterCatalogo();
      const termo = normaliza(filtro || "");
      const itens = mostrarTodos || !termo ? catalogo : catalogo.filter((c) => normaliza(c.nome).includes(termo));
      if (!catalogo.length) {
        lista.innerHTML = `<div class="combo-vazio">Nenhum item cadastrado</div>`;
      } else if (!itens.length) {
        lista.innerHTML = `<div class="combo-vazio">Nenhum resultado</div>`;
      } else {
        lista.innerHTML = itens.map((c) => `<div class="combo-item" data-nome="${esc(c.nome)}">${esc(c.nome)}</div>`).join("");
      }
      lista.querySelectorAll(".combo-item").forEach((el) => {
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          const nome = el.dataset.nome;
          input.value = nome;
          fechar();
          onSelecionar(nome);
        });
      });
    }
    function abrir(filtro, mostrarTodos) {
      clearTimeout(fecharTimer);
      render(filtro, mostrarTodos);
      lista.classList.add("show");
    }
    function fechar() {
      lista.classList.remove("show");
    }

    input.addEventListener("focus", () => abrir(input.value, false));
    input.addEventListener("input", (e) => {
      onDigitar(e.target.value);
      abrir(e.target.value, false);
    });
    input.addEventListener("blur", () => { fecharTimer = setTimeout(fechar, 150); });
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") { fechar(); input.blur(); } });
    btn.addEventListener("click", () => {
      if (lista.classList.contains("show")) { fechar(); return; }
      input.focus();
      abrir("", true);
    });
  }

  function renderListaServicos() {
    const cont = $("#lista-servicos");
    cont.innerHTML = "";
    estadoOS.servicos.forEach((s, idx) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.dataset.idx = idx;
      const total = (Number(s.qtd) || 0) * (Number(s.valorUnit) || 0);
      row.innerHTML = `
        ${comboHTML(s.nome, "Nome do serviço")}
        <input type="number" class="in-qtd" min="0" step="1" value="${s.qtd}" />
        <input type="number" class="in-valor" min="0" step="0.01" value="${s.valorUnit}" />
        <span class="total-cel">${fmtMoeda(total)}</span>
        <button class="rm" type="button">✕</button>
      `;
      const inValor = row.querySelector(".in-valor");
      const inQtd = row.querySelector(".in-qtd");
      ligarCombo(row.querySelector(".combo-wrap"), {
        obterCatalogo: () => DB.listServicos(),
        onDigitar: (val) => { estadoOS.servicos[idx].nome = val; },
        onSelecionar: (nome) => {
          estadoOS.servicos[idx].nome = nome;
          const achou = DB.listServicos().find((c) => c.nome === nome);
          if (achou && (!inValor.value || Number(inValor.value) === 0)) {
            inValor.value = achou.valor || 0;
            estadoOS.servicos[idx].valorUnit = achou.valor || 0;
          }
          recalcularTotais();
        }
      });
      inQtd.addEventListener("input", (e) => { estadoOS.servicos[idx].qtd = Number(e.target.value) || 0; recalcularTotais(); });
      inValor.addEventListener("input", (e) => { estadoOS.servicos[idx].valorUnit = Number(e.target.value) || 0; recalcularTotais(); });
      row.querySelector(".rm").addEventListener("click", () => {
        estadoOS.servicos.splice(idx, 1);
        if (!estadoOS.servicos.length) estadoOS.servicos.push({ nome: "", qtd: 1, valorUnit: 0 });
        renderListaServicos();
        recalcularTotais();
      });
      cont.appendChild(row);
    });
  }

  function recalcularTotais() {
    let totalServicos = 0;
    $all("#lista-servicos .item-row").forEach((row) => {
      const qtd = Number(row.querySelector(".in-qtd").value) || 0;
      const valor = Number(row.querySelector(".in-valor").value) || 0;
      const total = qtd * valor;
      row.querySelector(".total-cel").textContent = fmtMoeda(total);
      totalServicos += total;
    });
    let totalPecas = 0;
    $all("#lista-itens .item-row").forEach((row) => {
      const qtd = Number(row.querySelector(".in-qtd").value) || 0;
      const valor = Number(row.querySelector(".in-valor").value) || 0;
      const total = qtd * valor;
      row.querySelector(".total-cel").textContent = fmtMoeda(total);
      totalPecas += total;
    });
    const maoDeObra = Number($("#os-mao-obra").value) || 0;
    estadoOS.totalServicos = totalServicos;
    estadoOS.totalPecas = totalPecas;
    estadoOS.maoDeObra = maoDeObra;
    estadoOS.total = totalServicos + totalPecas + maoDeObra;
    $("#resumo-servicos").textContent = fmtMoeda(totalServicos);
    $("#resumo-pecas").textContent = fmtMoeda(totalPecas);
    $("#resumo-mao").textContent = fmtMoeda(maoDeObra);
    $("#resumo-total").textContent = fmtMoeda(estadoOS.total);
  }

  function renderListaItens() {
    const cont = $("#lista-itens");
    cont.innerHTML = "";
    estadoOS.itens.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.dataset.idx = idx;
      const total = (Number(it.qtd) || 0) * (Number(it.valorUnit) || 0);
      row.innerHTML = `
        ${comboHTML(it.nome, "Nome da peça")}
        <input type="number" class="in-qtd" min="0" step="1" value="${it.qtd}" />
        <input type="number" class="in-valor" min="0" step="0.01" value="${it.valorUnit}" />
        <span class="total-cel">${fmtMoeda(total)}</span>
        <button class="rm" type="button">✕</button>
      `;
      const inQtd = row.querySelector(".in-qtd");
      const inValor = row.querySelector(".in-valor");
      ligarCombo(row.querySelector(".combo-wrap"), {
        obterCatalogo: () => DB.listPecas(),
        onDigitar: (val) => { estadoOS.itens[idx].nome = val; },
        onSelecionar: (nome) => {
          estadoOS.itens[idx].nome = nome;
          const achou = DB.listPecas().find((p) => p.nome === nome);
          if (achou && (!inValor.value || Number(inValor.value) === 0)) {
            inValor.value = achou.valorUnit;
            estadoOS.itens[idx].valorUnit = achou.valorUnit;
          }
          recalcularTotais();
        }
      });
      inQtd.addEventListener("input", (e) => { estadoOS.itens[idx].qtd = Number(e.target.value) || 0; recalcularTotais(); });
      inValor.addEventListener("input", (e) => { estadoOS.itens[idx].valorUnit = Number(e.target.value) || 0; recalcularTotais(); });
      row.querySelector(".rm").addEventListener("click", () => {
        estadoOS.itens.splice(idx, 1);
        if (!estadoOS.itens.length) estadoOS.itens.push({ nome: "", qtd: 1, valorUnit: 0 });
        renderListaItens();
        recalcularTotais();
      });
      cont.appendChild(row);
    });
  }

  function coletarEstadoDosCampos() {
    estadoOS.numero = Number($("#os-numero").value) || null;
    estadoOS.dataEntrada = $("#os-data-entrada").value;
    estadoOS.prazoEntregaDias = Number($("#os-prazo-entrega").value) || 0;
    estadoOS.cliente = {
      nome: $("#cli-nome").value.trim(),
      telefone: $("#cli-telefone").value.trim(),
      cpfCnpj: $("#cli-cpf").value.trim(),
      endereco: $("#cli-endereco").value.trim()
    };
    estadoOS.veiculo = {
      marcaModelo: $("#vei-marca").value.trim(),
      placa: $("#vei-placa").value.trim(),
      ano: $("#vei-ano").value.trim(),
      km: $("#vei-km").value.trim(),
      cor: $("#vei-cor").value.trim(),
      combustivel: $("#vei-combustivel").value.trim()
    };
    recalcularTotais();
  }

  function atualizarPrazoEntregaCalc() {
    const dias = $("#os-prazo-entrega").value;
    const dataEntrada = $("#os-data-entrada").value;
    $("#prazo-entrega-calc").textContent = PDFGEN.textoPrazoEntrega(dataEntrada, dias) ? `Previsão: ${PDFGEN.textoPrazoEntrega(dataEntrada, dias)}` : "";
  }

  function ligarEventosNovaOS() {
    $all("#view-nova-os input[type=text], #view-nova-os input[type=tel], #view-nova-os input[type=date]").forEach((inp) => {
      inp.addEventListener("input", () => {});
    });
    $("#os-mao-obra").addEventListener("input", recalcularTotais);
    $("#os-prazo-entrega").addEventListener("input", atualizarPrazoEntregaCalc);
    $("#os-data-entrada").addEventListener("input", atualizarPrazoEntregaCalc);

    $("#btn-add-servico-linha").addEventListener("click", () => {
      estadoOS.servicos.push({ nome: "", qtd: 1, valorUnit: 0 });
      renderListaServicos();
    });

    $("#btn-add-item").addEventListener("click", () => {
      estadoOS.itens.push({ nome: "", qtd: 1, valorUnit: 0 });
      renderListaItens();
    });

    $("#os-visualizar").addEventListener("click", visualizarOS);
    $("#os-baixar").addEventListener("click", () => salvarEGerar("baixar"));
    $("#os-compartilhar").addEventListener("click", () => salvarEGerar("compartilhar"));
  }

  function validarOS() {
    const numero = Number(estadoOS.numero);
    if (!numero || numero < 1) { toast("Informe um número de OS válido"); return false; }
    const duplicada = DB.listOrdens().some((o) => o.numero === numero && o.id !== estadoOS.id);
    if (duplicada) { toast(`Já existe uma OS #${numero}`); return false; }
    if (!estadoOS.cliente.nome) { toast("Informe o nome do cliente"); return false; }
    if (!estadoOS.veiculo.placa) { toast("Informe a placa do veículo"); return false; }
    return true;
  }

  async function visualizarOS() {
    coletarEstadoDosCampos();
    const oficina = DB.getOficina();
    const folha = await PDFGEN.renderParaZona(estadoOS, oficina);
    const clone = folha.cloneNode(true);
    clone.style.transformOrigin = "top left";
    abrirSheet(`<h3>Pré-visualização</h3><div id="preview-wrap" style="width:100%;overflow:hidden;border:1px solid var(--border);border-radius:10px"></div>
      <div class="btn-row"><button class="btn btn-outline" id="sh-fechar-preview">Fechar</button></div>`);
    const wrap = $("#preview-wrap");
    wrap.appendChild(clone);
    const escala = (wrap.clientWidth) / 794;
    clone.style.transform = `scale(${escala})`;
    wrap.style.height = (1123 * escala) + "px";
    $("#sh-fechar-preview").addEventListener("click", fecharSheet);
  }

  async function salvarEGerar(modo) {
    coletarEstadoDosCampos();
    if (!validarOS()) return;
    const salvo = DB.salvarOrdem(JSON.parse(JSON.stringify(estadoOS)));
    estadoOS.id = salvo.id;
    estadoOS.numero = salvo.numero;
    const oficina = DB.getOficina();
    try {
      toast("Gerando PDF…");
      if (modo === "baixar") {
        await PDFGEN.baixarPDF(estadoOS, oficina);
        toast("PDF baixado");
      } else {
        const res = await PDFGEN.compartilharOuBaixar(estadoOS, oficina);
        if (res.modo === "compartilhado") toast("PDF compartilhado");
        else if (res.modo === "baixado") toast("PDF baixado (compartilhar não disponível aqui)");
      }
    } catch (e) {
      console.error(e);
      toast("Erro ao gerar PDF");
    }
  }

  // ---------- Ver Ordens ----------
  let filtroTextoOrdens = "";
  let filtroStatusOrdens = "todas";

  function badgeStatusHTML(status) {
    const info = DB.STATUS_POR_ID[status] || DB.STATUS_POR_ID[DB.STATUS_PADRAO];
    return `<span class="badge-status" data-acao="mudar-status" style="background:${info.cor}22;color:${info.cor}"><span class="dot" style="background:${info.cor}"></span>${esc(info.label)}</span>`;
  }

  function expiracaoInfo(ordem) {
    if (ordem.status !== "analise") return null;
    const dias = DB.diasRestantesAnalise(ordem);
    if (dias > 3) return { texto: `Expira em ${dias} dias`, classe: "ok" };
    if (dias > 1) return { texto: `Expira em ${dias} dias`, classe: "alerta" };
    if (dias === 1) return { texto: "Expira amanhã", classe: "alerta" };
    if (dias === 0) return { texto: "Expira hoje", classe: "alerta" };
    return { texto: `Expirado há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`, classe: "vencido" };
  }

  function renderHistorico() {
    const view = $("#view-historico");
    view.innerHTML = `
      <div class="card">
        <div class="busca-wrap">
          <span class="ic-busca">🔎</span>
          <input type="text" id="busca-ordens" placeholder="Buscar por cliente, placa, serviço…" value="${esc(filtroTextoOrdens)}" />
        </div>
        <div class="chips-scroll" id="chips-status">
          <button class="chip" data-status="todas">Todas</button>
          ${DB.STATUS_ORDEM.map((s) => `<button class="chip" data-status="${s.id}">${esc(s.label)}</button>`).join("")}
          <button class="chip" data-status="pago-sim">Paga</button>
          <button class="chip" data-status="pago-nao">Não paga</button>
        </div>
        <div id="lista-ordens"></div>
      </div>
    `;
    $all(".chip", view).forEach((chip) => {
      chip.classList.toggle("ativo", chip.dataset.status === filtroStatusOrdens);
      chip.addEventListener("click", () => {
        filtroStatusOrdens = chip.dataset.status;
        $all(".chip", view).forEach((c) => c.classList.toggle("ativo", c.dataset.status === filtroStatusOrdens));
        renderListaOrdens();
      });
    });
    $("#busca-ordens").addEventListener("input", (e) => {
      filtroTextoOrdens = e.target.value;
      renderListaOrdens();
    });
    renderListaOrdens();
  }

  function renderListaOrdens() {
    const cont = $("#lista-ordens");
    if (!cont) return;
    const todasOrdens = DB.listOrdens();
    const termo = normaliza(filtroTextoOrdens.trim());
    let ordens = todasOrdens;
    if (filtroStatusOrdens === "pago-sim") ordens = ordens.filter((o) => o.pago);
    else if (filtroStatusOrdens === "pago-nao") ordens = ordens.filter((o) => !o.pago);
    else if (filtroStatusOrdens !== "todas") ordens = ordens.filter((o) => o.status === filtroStatusOrdens);
    if (termo) ordens = ordens.filter((o) => textoBuscaOrdem(o).includes(termo));

    cont.innerHTML = ordens.length ? ordens.map((o) => {
      const exp = expiracaoInfo(o);
      return `
        <div class="linha-ordem" data-id="${o.id}">
          <div class="topo-linha">
            <div class="nome">#${o.numero} · ${esc(o.cliente?.nome || "Sem nome")}</div>
            <div class="badges-linha">${o.pago ? `<span class="badge-pago">💰 Pago</span>` : ""}${badgeStatusHTML(o.status)}</div>
          </div>
          <div class="detalhe">${esc(o.veiculo?.marcaModelo || "")} ${esc(o.veiculo?.placa || "")} · ${fmtMoeda(o.total)}</div>
          ${exp ? `<div class="expira ${exp.classe}">${exp.texto}</div>` : ""}
        </div>`;
    }).join("") : `<div class="vazio">${todasOrdens.length ? "Nenhuma OS encontrada com esse filtro." : "Nenhuma OS emitida ainda."}</div>`;

    $all(".linha-ordem", cont).forEach((linha) => {
      linha.addEventListener("click", () => abrirDetalheOrdem(linha.dataset.id));
      const badge = linha.querySelector(".badge-status");
      if (badge) badge.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirSeletorStatus(DB.getOrdem(linha.dataset.id), null);
      });
    });
  }

  function abrirSeletorStatus(ordem, aoMudar) {
    abrirSheet(`
      <h3>Status da OS #${ordem.numero}</h3>
      <div>
        ${DB.STATUS_ORDEM.map((s) => `
          <div class="status-picker-item" data-status="${s.id}">
            <span class="dot" style="background:${s.cor}"></span>
            <span class="nome">${esc(s.label)}</span>
            ${ordem.status === s.id ? `<span class="check">✓</span>` : ""}
          </div>`).join("")}
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-outline" id="sh-cancelar-status">Cancelar</button>
      </div>
    `);
    $("#sh-cancelar-status").addEventListener("click", fecharSheet);
    $all(".status-picker-item", $("#sheet-body")).forEach((item) => {
      item.addEventListener("click", () => {
        const novoStatus = item.dataset.status;
        const atualizado = DB.setStatus(ordem.id, novoStatus);
        fecharSheet();
        toast(`Status alterado para "${DB.STATUS_POR_ID[novoStatus].label}"`);
        renderListaOrdens();
        if (aoMudar) aoMudar(atualizado);
      });
    });
  }

  function abrirDetalheOrdem(id) {
    const ordem = DB.getOrdem(id);
    if (!ordem) return;
    ordemDetalheId = id;
    const exp = expiracaoInfo(ordem);
    abrirSheet(`
      <div class="detalhe-status-row">
        <h3 style="margin:0">OS #${ordem.numero}</h3>
        <div class="badges-linha">${ordem.pago ? `<span class="badge-pago">💰 Pago</span>` : ""}${badgeStatusHTML(ordem.status)}</div>
      </div>
      ${exp ? `<div class="expira ${exp.classe}" style="margin-bottom:10px">${exp.texto}</div>` : ""}
      <div class="resumo-box">
        <div class="resumo-linha"><span>Cliente</span><span>${esc(ordem.cliente?.nome || "-")}</span></div>
        <div class="resumo-linha"><span>Veículo</span><span>${esc(ordem.veiculo?.marcaModelo || "-")} · ${esc(ordem.veiculo?.placa || "-")}</span></div>
        <div class="resumo-linha"><span>Data</span><span>${ordem.dataEntrada || "-"}</span></div>
        <div class="resumo-linha total"><span>Total</span><span>${fmtMoeda(ordem.total)}</span></div>
      </div>
      <div class="btn-row" style="flex-direction:column;margin-top:14px">
        <button class="btn btn-outline" id="det-status">🔄 Alterar Status</button>
        <button class="btn ${ordem.pago ? "btn-ok" : "btn-outline"}" id="det-pago">${ordem.pago ? "✅ Paga" : "💰 Marcar como Paga"}</button>
        <button class="btn btn-primary" id="det-compartilhar">📤 Compartilhar PDF</button>
        <button class="btn btn-secondary" id="det-baixar">⬇️ Baixar PDF</button>
        <button class="btn btn-outline" id="det-editar">✏️ Reabrir para editar</button>
        <button class="btn btn-outline" id="det-duplicar">📄 Duplicar (nova OS)</button>
        <button class="btn btn-danger" id="det-excluir">🗑️ Excluir</button>
      </div>
    `);
    const abrirTrocaDeStatus = () => abrirSeletorStatus(ordem, (atualizado) => abrirDetalheOrdem(atualizado.id));
    $(".badge-status", $("#sheet-body")).addEventListener("click", abrirTrocaDeStatus);
    $("#det-status").addEventListener("click", abrirTrocaDeStatus);
    $("#det-pago").addEventListener("click", () => {
      DB.setPago(ordem.id, !ordem.pago);
      renderListaOrdens();
      abrirDetalheOrdem(ordem.id);
    });
    $("#det-compartilhar").addEventListener("click", async () => {
      try {
        const res = await PDFGEN.compartilharOuBaixar(ordem, DB.getOficina());
        toast(res.modo === "compartilhado" ? "PDF compartilhado" : "PDF baixado");
      } catch (e) { console.error(e); toast("Erro ao gerar PDF"); }
    });
    $("#det-baixar").addEventListener("click", async () => {
      try { await PDFGEN.baixarPDF(ordem, DB.getOficina()); toast("PDF baixado"); }
      catch (e) { console.error(e); toast("Erro ao gerar PDF"); }
    });
    $("#det-editar").addEventListener("click", () => {
      fecharSheet();
      mostrarView("nova-os", { baseOrdem: ordem, duplicar: false });
    });
    $("#det-duplicar").addEventListener("click", () => {
      fecharSheet();
      mostrarView("nova-os", { baseOrdem: ordem, duplicar: true });
    });
    $("#det-excluir").addEventListener("click", async () => {
      if (await confirmModal("Excluir OS", `Excluir a OS #${ordem.numero} permanentemente?`)) {
        DB.removeOrdem(ordem.id);
        fecharSheet();
        renderListaOrdens();
        toast("OS excluída");
      }
    });
  }

  // ---------- Init ----------
  function init() {
    $all(".navbar button").forEach((b) => b.addEventListener("click", () => mostrarView(b.dataset.view)));
    $("#overlay-sheet .overlay-fundo").addEventListener("click", fecharSheet);
    $("#overlay-confirm .overlay-fundo").addEventListener("click", () => $("#confirm-cancel").click());
    mostrarView("home");

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW falhou", e));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
