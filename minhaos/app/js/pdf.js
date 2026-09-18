const PDFGEN = (() => {
  function fmtMoeda(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function fmtData(iso) {
    if (!iso) return "";
    const [ano, mes, dia] = iso.split("-");
    if (!ano || !mes || !dia) return iso;
    return `${dia}/${mes}/${ano}`;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function somarDiasUteis(dataISO, dias) {
    if (!dataISO) return null;
    const partes = dataISO.split("-").map(Number);
    const data = new Date(partes[0], partes[1] - 1, partes[2]);
    let restante = Math.max(0, Math.floor(Number(dias)) || 0);
    while (restante > 0) {
      data.setDate(data.getDate() + 1);
      const diaSemana = data.getDay();
      if (diaSemana !== 0 && diaSemana !== 6) restante--;
    }
    return data;
  }

  function fmtDataObj(data) {
    if (!data) return "";
    const dd = String(data.getDate()).padStart(2, "0");
    const mm = String(data.getMonth() + 1).padStart(2, "0");
    const yyyy = data.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function textoPrazoEntrega(dataEntradaISO, dias) {
    const n = Math.max(0, Math.floor(Number(dias)) || 0);
    const dataCalc = somarDiasUteis(dataEntradaISO, n);
    if (!dataCalc) return "";
    const rotuloDias = n === 1 ? "1 dia útil" : `${n} dias úteis`;
    return n === 0 ? fmtDataObj(dataCalc) : `${fmtDataObj(dataCalc)} (${rotuloDias})`;
  }

  function montarTabelaItens(lista, colunaNome, textoVazio) {
    const validos = (lista || []).filter((it) => it && it.nome && it.nome.trim());
    const mostrarQtd = validos.some((it) => Number(it.qtd) > 1);
    const temValor = validos.some((it) => Number(it.valorUnit) > 0);
    const mostrarValorUnit = temValor && mostrarQtd;
    const mostrarTotal = temValor;
    const colCount = 1 + (mostrarQtd ? 1 : 0) + (mostrarValorUnit ? 1 : 0) + (mostrarTotal ? 1 : 0);

    const cabecalho = `<th>${colunaNome}</th>${mostrarQtd ? "<th>Qtd</th>" : ""}${mostrarValorUnit ? "<th>Valor Unit.</th>" : ""}${mostrarTotal ? "<th>Total</th>" : ""}`;

    const corpo = validos.map((it) => {
      const total = (Number(it.qtd) || 0) * (Number(it.valorUnit) || 0);
      let celulas = `<td>${esc(it.nome)}</td>`;
      if (mostrarQtd) celulas += `<td class="num">${Number(it.qtd) || 0}</td>`;
      if (mostrarValorUnit) celulas += `<td class="num">${fmtMoeda(it.valorUnit)}</td>`;
      if (mostrarTotal) celulas += `<td class="num">${fmtMoeda(total)}</td>`;
      return `<tr>${celulas}</tr>`;
    }).join("") || `<tr><td colspan="${colCount}" style="text-align:center;color:#999">${textoVazio}</td></tr>`;

    return { cabecalho, corpo };
  }

  function montarHTML(ordem, oficina) {
    const logoHtml = oficina.logoDataUrl
      ? `<img src="${oficina.logoDataUrl}" alt="logo" />`
      : `<div class="wordmark">${esc((oficina.nome || "Minha Oficina").trim().split(/\s+/)[0])}</div>`;

    const tabServicos = montarTabelaItens(ordem.servicos, "Serviço", "Nenhum serviço lançado");
    const tabPecas = montarTabelaItens(ordem.itens, "Peça", "Nenhuma peça lançada");

    return `
    <div class="folha">
      <div class="cabecalho">
        <div class="logo-box">
          ${logoHtml}
          ${oficina.telefone ? `<div class="fone">${esc(oficina.telefone)}</div>` : ""}
        </div>
        <div class="titulo">ORDEM DE SERVIÇO &ndash; ${esc((oficina.nome || "").toUpperCase())}</div>
      </div>

      <table class="faixa-topo">
        <tr>
          <td class="rotulo">Nº OS:</td><td>${esc(ordem.numero)}</td>
          <td class="rotulo">Data de Entrada:</td><td>${fmtData(ordem.dataEntrada)}</td>
          <td class="rotulo">Previsão de Entrega:</td><td>${ordem.prazoEntregaDias != null ? esc(textoPrazoEntrega(ordem.dataEntrada, ordem.prazoEntregaDias)) : fmtData(ordem.previsaoEntrega)}</td>
        </tr>
      </table>

      <div class="secao-titulo">DADOS DO CLIENTE</div>
      <div class="secao-corpo">
        <table>
          <tr><td class="rotulo">Nome:</td><td>${esc(ordem.cliente?.nome)}</td><td class="rotulo">Telefone:</td><td>${esc(ordem.cliente?.telefone)}</td></tr>
          <tr><td class="rotulo">CPF/CNPJ:</td><td>${esc(ordem.cliente?.cpfCnpj)}</td><td class="rotulo">Endereço:</td><td>${esc(ordem.cliente?.endereco)}</td></tr>
        </table>
      </div>

      <div class="secao-titulo">DADOS DO VEÍCULO</div>
      <div class="secao-corpo">
        <table>
          <tr><td class="rotulo">Marca/Modelo:</td><td>${esc(ordem.veiculo?.marcaModelo)}</td><td class="rotulo">Placa:</td><td>${esc(ordem.veiculo?.placa)}</td></tr>
          <tr><td class="rotulo">Ano:</td><td>${esc(ordem.veiculo?.ano)}</td><td class="rotulo">KM:</td><td>${esc(ordem.veiculo?.km)}</td></tr>
          <tr><td class="rotulo">Cor:</td><td>${esc(ordem.veiculo?.cor)}</td><td class="rotulo">Combustível:</td><td>${esc(ordem.veiculo?.combustivel)}</td></tr>
        </table>
      </div>

      <div class="secao-titulo">SERVIÇOS SOLICITADOS</div>
      <table class="tabela-pecas">
        <tr>${tabServicos.cabecalho}</tr>
        ${tabServicos.corpo}
      </table>

      <div class="secao-titulo">PEÇAS</div>
      <table class="tabela-pecas">
        <tr>${tabPecas.cabecalho}</tr>
        ${tabPecas.corpo}
      </table>

      <table class="resumo-fin">
        <tr><td class="rotulo">Serviços:</td><td class="num">${fmtMoeda(ordem.totalServicos)}</td></tr>
        <tr><td class="rotulo">Peças:</td><td class="num">${fmtMoeda(ordem.totalPecas)}</td></tr>
        <tr><td class="rotulo">Mão de obra:</td><td class="num">${fmtMoeda(ordem.maoDeObra)}</td></tr>
        <tr class="total-linha"><td class="rotulo">Total:</td><td class="num">${fmtMoeda(ordem.total)}</td></tr>
      </table>

      <div class="assinaturas">
        <div>Assinatura do Cliente: _________________________________</div>
        <div>Responsável pela Oficina: _________________________________</div>
      </div>
    </div>`;
  }

  async function renderParaZona(ordem, oficina) {
    let zona = document.getElementById("folha-render-zone");
    if (!zona) {
      zona = document.createElement("div");
      zona.id = "folha-render-zone";
      document.body.appendChild(zona);
    }
    zona.innerHTML = montarHTML(ordem, oficina);
    const folha = zona.querySelector(".folha");
    const imgs = Array.from(folha.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; })));
    return folha;
  }

  async function gerarBlob(ordem, oficina) {
    const folha = await renderParaZona(ordem, oficina);
    const canvas = await html2canvas(folha, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    if (imgH <= pageH) {
      doc.addImage(imgData, "JPEG", 0, 0, imgW, imgH);
    } else {
      let restante = canvas.height;
      let offsetCanvasPx = 0;
      const pxPorPagina = (pageH * canvas.width) / imgW;
      while (restante > 0) {
        const fatia = document.createElement("canvas");
        fatia.width = canvas.width;
        fatia.height = Math.min(pxPorPagina, restante);
        const ctx = fatia.getContext("2d");
        ctx.drawImage(canvas, 0, offsetCanvasPx, canvas.width, fatia.height, 0, 0, canvas.width, fatia.height);
        const fatiaData = fatia.toDataURL("image/jpeg", 0.95);
        const fatiaAlturaMm = (fatia.height * imgW) / canvas.width;
        if (offsetCanvasPx > 0) doc.addPage();
        doc.addImage(fatiaData, "JPEG", 0, 0, imgW, fatiaAlturaMm);
        offsetCanvasPx += fatia.height;
        restante -= fatia.height;
      }
    }
    return doc.output("blob");
  }

  function nomeArquivo(ordem) {
    const cliente = (ordem.cliente?.nome || "cliente").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `OS-${ordem.numero}-${cliente || "cliente"}.pdf`;
  }

  async function compartilharOuBaixar(ordem, oficina) {
    const blob = await gerarBlob(ordem, oficina);
    const nome = nomeArquivo(ordem);
    const file = new File([blob], nome, { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Ordem de Serviço #${ordem.numero}`,
          text: `Ordem de Serviço #${ordem.numero} - ${oficina.nome}`
        });
        return { modo: "compartilhado" };
      } catch (e) {
        if (e && e.name === "AbortError") return { modo: "cancelado" };
      }
    }
    baixarBlob(blob, nome);
    return { modo: "baixado" };
  }

  function baixarBlob(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function baixarPDF(ordem, oficina) {
    const blob = await gerarBlob(ordem, oficina);
    baixarBlob(blob, nomeArquivo(ordem));
  }

  return { montarHTML, renderParaZona, gerarBlob, compartilharOuBaixar, baixarPDF, nomeArquivo, somarDiasUteis, textoPrazoEntrega };
})();
