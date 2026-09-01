const escapeHtml = (valor) =>
  String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const texto = (valor, fallback = "N/A") => {
  if (valor === 0) return "0";
  if (valor === true) return "Sim";
  if (valor === false) return "Não";
  if (valor === undefined || valor === null || valor === "") return fallback;
  return escapeHtml(valor);
};

const formatarData = (data) => {
  if (!data && data !== 0) return "N/A";
  let bruto = data;
  if (typeof bruto === "string" && /^\d+$/.test(bruto.trim())) bruto = Number(bruto);
  const date =
    bruto instanceof Date
      ? bruto
      : new Date(typeof bruto === "number" && bruto < 1e12 ? bruto * 1000 : bruto);
  if (Number.isNaN(date.getTime())) return texto(data);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const diasDesde = (dataIso) => {
  if (!dataIso) return { dias: "N/A", data: "Data indisponível", recente: false };
  const date =
    typeof dataIso === "string" && dataIso.includes("T")
      ? new Date(dataIso)
      : new Date(typeof dataIso === "number" && dataIso < 1e12 ? dataIso * 1000 : dataIso);
  if (Number.isNaN(date.getTime())) return { dias: "N/A", data: "Data indisponível", recente: false };
  const pad = (n) => String(n).padStart(2, "0");
  const dias = Math.floor((Date.now() - date.getTime()) / 86400000);
  return {
    dias,
    data: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
    recente: Number.isFinite(dias) && dias >= 0 && dias <= 7,
  };
};

const duracaoScan = (speed) => {
  if (speed === undefined || speed === null || speed === "") return "N/A";
  const n = Number(speed);
  if (Number.isNaN(n)) return "N/A";
  const segundos = n >= 1000 ? Math.round(n / 1000) : Math.round(n);
  return `${segundos}s`;
};

const instanciaTrace = (valor) => {
  if (valor === true || valor === "true" || valor === "in_instance") return "in instance";
  if (valor === false || valor === "false" || valor === "out_of_instance") return "out of instance";
  return valor ? String(valor) : "";
};

const isDetected = (detection) => {
  const d = String(detection || "").toLowerCase();
  return d.includes("detect") && !d.includes("undetect");
};

const isClean = (detection) => {
  const d = String(detection || "").toLowerCase();
  return d.includes("clean") || d.includes("undetect") || d.includes("none");
};

const SUSPEITOS =
  /cheat|injector|temp\\|appdata\\local\\temp|downloads\\|processhacker|systeminformer|x64dbg|ollydbg|extreme injector|anydesk|rustdesk|veracrypt|ghost|gosth|skript|keyauth|loader|bypass|spoofer|suspend|createdump/i;

const titulosSecao = {
  files: "File Logs",
  file_logs: "File Logs",
  filelogs: "File Logs",
  logs: "Logs",
  journal: "Journal",
  pca: "PcaClient",
  pcaclient: "PcaClient",
  pca_client: "PcaClient",
  dps: "Compilation Times (DPS)",
  compilation: "Compilation Times",
  compilation_times: "Compilation Times",
  processes: "Processos",
  process_times: "Process Times",
  macros: "Macros",
  amcache: "AmCache",
  prefetch: "Prefetch",
  browsers: "Navegadores",
  usb: "USB",
  recents: "Recents",
};

const colunasAmigaveis = {
  action: "Ação",
  type: "Ação",
  event: "Ação",
  path: "Caminho",
  file: "Caminho",
  filename: "Caminho",
  name: "Nome",
  timestamp: "Data",
  time: "Data",
  date: "Data",
  ts: "Data",
  details: "Detalhes",
  detail: "Detalhes",
  tags: "Tags",
  last_executed: "Última execução",
  lastexecuted: "Última execução",
};

const pick = (obj, keys) => {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return undefined;
};

const primeiroArray = (results, chaves) => {
  if (!results) return [];
  for (const chave of chaves) {
    if (Array.isArray(results[chave]) && results[chave].length) return results[chave];
  }
  return [];
};

const formatarCelula = (valor) => {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number") {
    if (valor > 1e9 && valor < 2e10) return formatarData(valor);
    return String(valor);
  }
  if (typeof valor === "object") return JSON.stringify(valor);
  if (/^\d{9,13}$/.test(String(valor))) return formatarData(Number(valor));
  return String(valor);
};

const badgeAcao = (acao) => {
  const a = String(acao || "").toLowerCase();
  let cls = "tag";
  if (a.includes("delet") || a.includes("remov")) cls += " tag-del";
  else if (a.includes("renam") || a.includes("mov")) cls += " tag-move";
  else if (a.includes("execut") || a.includes("run")) cls += " tag-run";
  else if (a.includes("creat") || a.includes("new")) cls += " tag-new";
  return `<span class="${cls}">${escapeHtml(acao || "—")}</span>`;
};

const renderTabela = (linhas, { id = "", limite = 2500 } = {}) => {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return `<p class="empty">Nenhum registro.</p>`;
  }

  const amostra = linhas.find((item) => item && typeof item === "object" && !Array.isArray(item));
  const colunas = amostra ? Object.keys(amostra) : ["Valor"];
  const visiveis = linhas.slice(0, limite);
  const tableId = id || `tbl-${Math.random().toString(36).slice(2, 8)}`;
  const temAcao = colunas.some((c) => /action|type|event/i.test(c));
  const temPath = colunas.some((c) => /path|file|name/i.test(c));

  const thead = colunas
    .map((col) => `<th>${escapeHtml(colunasAmigaveis[col.toLowerCase()] || col)}</th>`)
    .join("");

  const tbody = visiveis
    .map((linha) => {
      if (!(linha && typeof linha === "object" && !Array.isArray(linha))) {
        return `<tr><td>${escapeHtml(formatarCelula(linha))}</td></tr>`;
      }
      const caminho = String(pick(linha, ["path", "file", "filename", "name"]) || "");
      const suspeito = SUSPEITOS.test(caminho);
      const cells = colunas
        .map((col) => {
          const valor = formatarCelula(linha[col]);
          if (/action|type|event/i.test(col)) return `<td>${badgeAcao(valor)}</td>`;
          return `<td>${escapeHtml(valor)}</td>`;
        })
        .join("");
      return `<tr class="${suspeito ? "row-alert" : ""}">${cells}</tr>`;
    })
    .join("");

  const extra =
    linhas.length > limite
      ? `<p class="hint">${linhas.length - limite} registros omitidos. Use o scan original no Echo para a lista completa.</p>`
      : "";

  const busca =
    temPath || visiveis.length > 8
      ? `<div class="toolbar">
          <input type="search" placeholder="Filtrar nesta tabela..." oninput="filtrarTabela('${tableId}', this.value)" />
          <span class="hint">${linhas.length} registros</span>
        </div>`
      : "";

  const chips = temAcao
    ? `<div class="chips" data-table="${tableId}">
        <button type="button" onclick="filtrarTabela('${tableId}','')">Tudo</button>
        <button type="button" onclick="filtrarTabela('${tableId}','Executed')">Executed</button>
        <button type="button" onclick="filtrarTabela('${tableId}','Deleted')">Deleted</button>
        <button type="button" onclick="filtrarTabela('${tableId}','Renamed')">Renamed</button>
        <button type="button" onclick="filtrarTabela('${tableId}','Created')">Created</button>
      </div>`
    : "";

  return `${busca}${chips}<div class="table-wrap"><table id="${tableId}"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>${extra}`;
};

const contasHtml = (accounts) => {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return `<p class="empty">Nenhuma conta Steam encontrada.</p>`;
  }

  const itens = accounts
    .map((conta) => {
      if (typeof conta === "string") {
        const partes = conta.split(":");
        const id = partes[1] || partes[0] || "0";
        const label = partes[2] || partes[0] || "Desconhecido";
        return `<a href="https://steamcommunity.com/profiles/${escapeHtml(id)}" target="_blank" rel="noopener"><i class="fab fa-steam"></i> ${escapeHtml(label)} <span>${escapeHtml(id)}</span></a>`;
      }
      const nome = conta?.name || conta?.username || "Desconhecido";
      const id = conta?.steamid || conta?.steamId64 || conta?.id || "0";
      return `<a href="https://steamcommunity.com/profiles/${escapeHtml(id)}" target="_blank" rel="noopener"><i class="fab fa-steam"></i> ${escapeHtml(nome)} <span>${escapeHtml(id)}</span></a>`;
    })
    .join("");

  return `<div class="accounts">${itens}</div>`;
};

const tracesHtml = (traces) => {
  if (!Array.isArray(traces) || traces.length === 0) {
    return `<p class="empty">Nenhuma detecção encontrada.</p>`;
  }

  const grupos = { instancia: [], fora: [], custom: [], outros: [] };
  for (const trace of traces) {
    const nome = trace?.name || "Sem nome";
    const inst = instanciaTrace(trace?.in_instance);
    const jaTem = /in instance|out of instance/i.test(nome);
    const label = jaTem || !inst ? nome : `${nome} ${inst}`;
    const item = { label, raw: trace };
    if (/custom string/i.test(label)) grupos.custom.push(item);
    else if (/in instance/i.test(label) && !/out of instance/i.test(label)) grupos.instancia.push(item);
    else if (/out of instance/i.test(label)) grupos.fora.push(item);
    else grupos.outros.push(item);
  }

  const bloco = (titulo, itens, cls) => {
    if (!itens.length) return "";
    return `<h3 class="sub">${escapeHtml(titulo)} <em>${itens.length}</em></h3>
      <ul class="traces">${itens
        .map(
          (item) =>
            `<li class="${cls}"><strong>${escapeHtml(item.label)}</strong></li>`,
        )
        .join("")}</ul>`;
  };

  return (
    bloco("In instance — evidência forte", grupos.instancia, "severe") +
    bloco("Out of instance — suspeito", grupos.fora, "warn") +
    bloco("Outras indicações", grupos.outros, "") +
    bloco("Custom String (pode ignorar no começo)", grupos.custom, "muted")
  );
};

const startTimeHtml = (startTime) => {
  const chaves = [
    ["dps", "DPS"],
    ["pca", "PCA"],
    ["dgt", "DGT"],
    ["sys", "SYS"],
    ["explorer", "Explorer"],
  ];
  if (!startTime || typeof startTime !== "object") {
    return `<p class="empty">Start time não disponível.</p>`;
  }

  const agoraScan = Object.values(startTime).filter((n) => Number(n) > 1e9);
  const maisRecente = agoraScan.length ? Math.max(...agoraScan.map(Number)) : 0;

  return `<div class="times">${chaves
    .map(([chave, label]) => {
      const ts = startTime[chave];
      const valor = ts ? formatarData(ts) : "N/A";
      const recente =
        ts && maisRecente && Math.abs(Number(ts) - maisRecente) < 1800 && chave === "explorer";
      return `<div class="time-card ${recente ? "alert" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(valor)}</strong>${recente ? "<small>Explorer recém iniciado</small>" : ""}</div>`;
    })
    .join("")}</div>
    <p class="hint">Se o Explorer iniciou agora e o PcaClient estiver vazio, o player pode ter reiniciado o Explorer para limpar rastros.</p>`;
};

const infoExtraHtml = (info) => {
  const pulados = new Set([
    "installationDate",
    "recycleBinModified",
    "speed",
    "os",
    "operatingSystem",
    "vm",
    "isVM",
    "virtualMachine",
    "country",
    "connectionType",
    "connection",
    "scanDate",
    "game",
  ]);
  const linhas = Object.entries(info || {})
    .filter(([k, v]) => !pulados.has(k) && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => ({ Campo: k, Valor: formatarCelula(v) }));
  if (!linhas.length) return "";
  return `<section class="card" id="sistema"><h2>Sistema e hardware</h2>${renderTabela(linhas, { id: "tbl-info" })}</section>`;
};

const alertasStaff = ({ formatacao, lixeira, traces, startTime, detection, vm }) => {
  const itens = [];
  if (isDetected(detection)) {
    itens.push({
      nivel: "alto",
      titulo: "Detected",
      texto: "O Echo marcou este scan com indicadores fortes de cheat. Confira as detecções in instance.",
    });
  }
  if (typeof formatacao.dias === "number" && formatacao.dias <= 7) {
    itens.push({
      nivel: "alto",
      titulo: "Formatação recente",
      texto: `Windows instalado/formatado há ${formatacao.dias} dia(s) (${formatacao.data}).`,
    });
  }
  if (typeof lixeira.dias === "number" && lixeira.dias <= 2) {
    itens.push({
      nivel: "alto",
      titulo: "Lixeira esvaziada",
      texto: `Lixeira modificada há ${lixeira.dias} dia(s) (${lixeira.data}).`,
    });
  } else if (typeof lixeira.dias === "number" && lixeira.dias <= 7) {
    itens.push({
      nivel: "medio",
      titulo: "Lixeira recente",
      texto: `Lixeira modificada há ${lixeira.dias} dia(s) (${lixeira.data}).`,
    });
  }
  const inInst = (traces || []).filter((t) => {
    const n = `${t?.name || ""} ${instanciaTrace(t?.in_instance)}`;
    return /in instance/i.test(n) && !/out of instance/i.test(n);
  }).length;
  if (inInst) {
    itens.push({
      nivel: "alto",
      titulo: `${inInst} detecção(ões) in instance`,
      texto: "Cheat provavelmente injetado na instância atual. Evidência forte.",
    });
  }
  if (vm === true || vm === "true" || vm === "Yes") {
    itens.push({
      nivel: "medio",
      titulo: "Máquina virtual",
      texto: "O Echo identificou VM. Vale cruzar com o restante do scan.",
    });
  }
  if (startTime?.explorer) {
    const exp = Number(startTime.explorer);
    const agora = Math.floor(Date.now() / 1000);
    if (exp > 1e9 && agora - exp < 40 * 60) {
      itens.push({
        nivel: "medio",
        titulo: "Explorer recente",
        texto: "O processo Explorer iniciou há pouco tempo. Pode ter sido reiniciado para limpar PcaClient.",
      });
    }
  }
  if (!itens.length) return "";
  return `<section class="card alerts" id="alertas">
    <h2>Alertas da staff</h2>
    <div class="alert-list">${itens
      .map(
        (item) =>
          `<article class="${item.nivel}"><strong>${escapeHtml(item.titulo)}</strong><p>${escapeHtml(item.texto)}</p></article>`,
      )
      .join("")}</div>
  </section>`;
};

const secoesMapeadas = (results) => {
  if (!results || typeof results !== "object") return { html: "", nav: [] };
  const ignorar = new Set(["info", "traces", "start_time", "startTime"]);
  const nav = [];
  const html = Object.entries(results)
    .filter(([chave, valor]) => {
      if (ignorar.has(chave)) return false;
      if (Array.isArray(valor)) return valor.length > 0;
      if (valor && typeof valor === "object") return Object.keys(valor).length > 0;
      return valor !== undefined && valor !== null && valor !== "";
    })
    .map(([chave, valor]) => {
      const id = `sec-${chave.replace(/[^a-z0-9]+/gi, "-")}`;
      const titulo = titulosSecao[chave.toLowerCase()] || chave.replace(/[_-]/g, " ");
      nav.push({ id, titulo, count: Array.isArray(valor) ? valor.length : "" });
      let corpo = "";
      if (Array.isArray(valor)) corpo = renderTabela(valor, { id: `tbl-${id}` });
      else if (typeof valor === "object") {
        corpo = renderTabela(
          Object.entries(valor).map(([k, v]) => ({ Campo: k, Valor: formatarCelula(v) })),
          { id: `tbl-${id}` },
        );
      } else corpo = `<p>${escapeHtml(valor)}</p>`;
      return `<section class="card" id="${id}"><h2>${escapeHtml(titulo)}</h2>${corpo}</section>`;
    })
    .join("");
  return { html, nav };
};

const gerarHtmlResultado = (scanInfo, pinFallback) => {
  const info = scanInfo.results?.info || {};
  const pin = scanInfo.pin || pinFallback || "N/A";
  const uuid = scanInfo.uuid || scanInfo.id || "";
  const detection = scanInfo.detection || "N/A";
  const detected = isDetected(detection);
  const clean = isClean(detection);
  const statusClass = detected ? "detected" : clean ? "clean" : "unknown";
  const linkScan = uuid ? `https://scan.echo.ac/${uuid}` : "#";
  const formatacao = diasDesde(info.installationDate);
  const lixeira = diasDesde(info.recycleBinModified);
  const os = info.os || info.operatingSystem || scanInfo.os || "Windows";
  const vm = info.vm ?? info.isVM ?? info.virtualMachine ?? scanInfo.vm;
  const country = info.country || scanInfo.country || "N/A";
  const connection =
    info.connectionType || info.connection || scanInfo.connectionType || "N/A";
  const dataScan =
    scanInfo.created_at ||
    scanInfo.createdAt ||
    scanInfo.date ||
    scanInfo.timestamp ||
    info.scanDate;
  const jogo = scanInfo.game || info.game || "GTA-V RP";
  const hwid = pick(scanInfo, ["hwid", "hardware_id", "HWID"]) || pick(info, ["hwid", "hardware_id"]);
  const ip = pick(scanInfo, ["ip", "ipAddress"]) || pick(info, ["ip", "ipAddress"]);
  const traces = scanInfo.results?.traces || [];
  const startTime = scanInfo.results?.start_time || scanInfo.results?.startTime;
  const fileLogs = primeiroArray(scanInfo.results, ["files", "file_logs", "filelogs", "logs"]);
  const extras = secoesMapeadas(scanInfo.results);
  const vereditoTexto = detected
    ? "O Echo encontrou indicadores fortes de cheat. Veja a análise abaixo."
    : clean
      ? "Nenhuma detecção relevante. Ainda assim revise lixeira, formatação e start times."
      : "Resultado indefinido. Revise as seções abaixo antes de decidir.";

  const navItens = [
    { id: "overview", titulo: "Overview" },
    { id: "alertas", titulo: "Alertas" },
    { id: "deteccoes", titulo: "Detecções", count: traces.length },
    { id: "contas", titulo: "Accounts", count: Array.isArray(scanInfo.accounts) ? scanInfo.accounts.length : 0 },
    { id: "times", titulo: "Process Times" },
    ...extras.nav,
  ];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scan ${escapeHtml(pin)} • SCC Segurança</title>
  <link rel="icon" href="https://i.imgur.com/WEh0qkj.png" type="image/png" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');
    :root {
      --primary-color: #ff0000;
      --secondary-color: #ff3333;
      --accent-color: #cc0000;
      --background-color: #0D0D0D;
      --text-color: #FFFFFF;
      --text-secondary: #B0B0B0;
      --border-color: #30363D;
      --hover-color: #21262D;
      --shadow-color: rgba(0, 0, 0, 0.4);
      --gradient-primary: linear-gradient(135deg, #ff0000 0%, #ff3333 100%);
      --ok: #4CAF50;
      --warn: #f5a524;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Poppins', sans-serif;
      background: var(--background-color);
      color: var(--text-color);
      line-height: 1.6;
    }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: #0D0D0D; }
    ::-webkit-scrollbar-thumb { background: var(--gradient-primary); border-radius: 10px; }
    header {
      padding: 28px 20px 18px;
      text-align: center;
      background: #0D0D0D;
    }
    header img { max-width: 240px; height: auto; filter: drop-shadow(0 10px 20px rgba(0,0,0,.4)); }
    header p { margin-top: 8px; color: var(--text-secondary); letter-spacing: .14em; text-transform: uppercase; font-size: 11px; }
    .nav {
      position: sticky; top: 0; z-index: 20;
      display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;
      padding: 12px 16px;
      background: rgba(13,13,13,.92);
      border-top: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      backdrop-filter: blur(12px);
    }
    .nav a {
      color: #fff; text-decoration: none; font-size: 13px; font-weight: 600;
      padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border-color);
    }
    .nav a:hover, .nav a:focus { background: var(--gradient-primary); border-color: transparent; }
    .nav em { font-style: normal; color: var(--secondary-color); margin-left: 4px; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 20px 80px; }
    .verdict {
      border: 1px solid var(--border-color);
      border-radius: 18px;
      padding: 28px;
      margin-bottom: 20px;
      text-align: center;
      background: linear-gradient(180deg, #161616 0%, #0D0D0D 100%);
    }
    .verdict.detected { box-shadow: 0 0 36px rgba(255,0,0,.28); border-color: #ff0000; }
    .verdict.clean { box-shadow: 0 0 36px rgba(76,175,80,.18); border-color: #4CAF50; }
    .badge {
      display: inline-block; padding: 8px 18px; border-radius: 999px;
      font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
      background: var(--gradient-primary); color: #fff;
    }
    .verdict.clean .badge { background: var(--ok); }
    .verdict h1 { margin: 14px 0 8px; font-size: 2rem; }
    .verdict a { color: var(--secondary-color); font-weight: 600; }
    .actions { margin-top: 14px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .actions button, .actions a.btn {
      background: #1a1a1a; color: #fff; border: 1px solid var(--border-color);
      padding: 8px 14px; border-radius: 10px; cursor: pointer; font-weight: 600;
      text-decoration: none; font-size: 13px;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat { background: #141414; border: 1px solid var(--border-color); border-radius: 14px; padding: 14px 16px; }
    .stat.hot { border-color: #ff0000; }
    .stat span { display: block; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .stat strong { display: block; margin-top: 6px; font-size: 14px; word-break: break-word; }
    .card {
      background: #141414; border: 1px solid var(--border-color); border-radius: 18px;
      padding: 22px; margin-bottom: 16px; box-shadow: 0 10px 30px var(--shadow-color);
    }
    .card h2 { font-size: 1.12rem; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid var(--primary-color); }
    .sub { margin: 18px 0 8px; font-size: 14px; color: var(--text-secondary); }
    .sub em { color: var(--secondary-color); font-style: normal; }
    .empty { color: var(--text-secondary); }
    .hint { color: var(--text-secondary); font-size: 12px; margin-top: 10px; }
    .traces { list-style: none; display: grid; gap: 8px; }
    .traces li { background: var(--hover-color); border-left: 4px solid var(--primary-color); padding: 10px 14px; border-radius: 8px; }
    .traces li.severe { border-left-color: #ff6363; background: #2a1010; }
    .traces li.warn { border-left-color: var(--warn); }
    .traces li.muted { border-left-color: #555; opacity: .85; }
    .accounts { display: flex; flex-wrap: wrap; gap: 10px; }
    .accounts a { color: #fff; text-decoration: none; background: var(--hover-color); border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 10px; }
    .accounts a span { color: var(--text-secondary); font-size: 12px; margin-left: 6px; }
    .times { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
    .time-card { background: var(--hover-color); border-radius: 12px; padding: 12px; border: 1px solid var(--border-color); }
    .time-card.alert { border-color: var(--warn); }
    .time-card span { color: var(--primary-color); font-size: 12px; font-weight: 700; }
    .time-card small { display: block; color: var(--warn); font-size: 11px; margin-top: 4px; }
    .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
    .toolbar input {
      flex: 1; min-width: 0; background: #0D0D0D; color: #fff; border: 1px solid var(--border-color);
      border-radius: 10px; padding: 10px 12px; font-family: inherit;
    }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .chips button {
      background: #0D0D0D; color: #fff; border: 1px solid var(--border-color);
      border-radius: 999px; padding: 6px 10px; cursor: pointer; font-size: 12px;
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid var(--border-color); padding: 9px 8px; text-align: left; vertical-align: top; }
    th { background: #1a1a1a; color: var(--secondary-color); white-space: nowrap; }
    tr:nth-child(even) td { background: #101010; }
    tr.row-alert td { background: #2a1212 !important; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #333; }
    .tag-run { background: #1f4b2d; }
    .tag-del { background: #5c1414; }
    .tag-move { background: #5c3d10; }
    .tag-new { background: #14305c; }
    .alert-list { display: grid; gap: 10px; }
    .alert-list article { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border-color); }
    .alert-list .alto { border-color: #ff0000; background: #2a1010; }
    .alert-list .medio { border-color: var(--warn); background: #2a220e; }
    footer { text-align: center; padding: 28px 12px; color: #fff; border-top: 1px solid var(--border-color); font-size: 13px; }
    footer a { color: var(--secondary-color); }
    @media (max-width: 720px) {
      .nav { justify-content: flex-start; overflow-x: auto; flex-wrap: nowrap; }
      .verdict h1 { font-size: 1.5rem; }
    }
  </style>
</head>
<body>
  <header>
    <img src="https://i.imgur.com/aawPk38.png" alt="Street Car Club Roleplay" />
    <p>SCC Segurança • Relatório Echo</p>
  </header>
  <nav class="nav">
    ${navItens
      .map(
        (item) =>
          `<a href="#${item.id}">${escapeHtml(item.titulo)}${item.count ? `<em>${item.count}</em>` : ""}</a>`,
      )
      .join("")}
  </nav>
  <main>
    <section class="verdict ${statusClass}" id="overview">
      <div class="badge">${escapeHtml(detection)}</div>
      <h1>Resultado do scan</h1>
      <p>${escapeHtml(vereditoTexto)}</p>
      <p>PIN <strong>${escapeHtml(pin)}</strong> · ${escapeHtml(jogo)}</p>
      <div class="actions">
        <a class="btn" href="${escapeHtml(linkScan)}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> Abrir no Echo</a>
        <button type="button" onclick="copiar('${escapeHtml(pin)}')">Copiar PIN</button>
        ${uuid ? `<button type="button" onclick="copiar('${escapeHtml(uuid)}')">Copiar UUID</button>` : ""}
      </div>
    </section>

    <section class="grid">
      <div class="stat"><span>PIN</span><strong>${escapeHtml(pin)}</strong></div>
      <div class="stat"><span>Duração</span><strong>${escapeHtml(duracaoScan(info.speed))}</strong></div>
      <div class="stat"><span>Sistema</span><strong>${texto(os)}</strong></div>
      <div class="stat ${vm === true || vm === "Yes" ? "hot" : ""}"><span>VM</span><strong>${texto(vm)}</strong></div>
      <div class="stat"><span>País</span><strong>${texto(country)}</strong></div>
      <div class="stat"><span>Conexão</span><strong>${texto(connection)}</strong></div>
      <div class="stat ${formatacao.recente ? "hot" : ""}"><span>Instalação Windows</span><strong>${escapeHtml(formatacao.dias)} dias (${escapeHtml(formatacao.data)})</strong></div>
      <div class="stat ${lixeira.recente ? "hot" : ""}"><span>Lixeira</span><strong>${escapeHtml(lixeira.dias)} dias (${escapeHtml(lixeira.data)})</strong></div>
      <div class="stat"><span>Data do scan</span><strong>${escapeHtml(formatarData(dataScan))}</strong></div>
      <div class="stat"><span>HWID</span><strong>${texto(hwid)}</strong></div>
      <div class="stat"><span>IP</span><strong>${texto(ip)}</strong></div>
      <div class="stat"><span>UUID</span><strong>${texto(uuid)}</strong></div>
    </section>

    ${alertasStaff({ formatacao, lixeira, traces, startTime, detection, vm })}

    <section class="card" id="deteccoes">
      <h2>Detecções / Key Indicators</h2>
      ${tracesHtml(traces)}
    </section>

    <section class="card" id="contas">
      <h2>Accounts</h2>
      ${contasHtml(scanInfo.accounts)}
    </section>

    <section class="card" id="times">
      <h2>Process Times / Start Time</h2>
      ${startTimeHtml(startTime)}
    </section>

    ${
      fileLogs.length && !extras.nav.some((n) => /file log|logs/i.test(n.titulo))
        ? `<section class="card" id="filelogs"><h2>File Logs</h2>${renderTabela(fileLogs, { id: "tbl-files" })}</section>`
        : ""
    }

    ${infoExtraHtml(info)}
    ${extras.html}
  </main>
  <footer>
    Street Car Club Roleplay • Segurança SCC<br />
    Relatório gerado para análise interna. Sempre cruze com o <a href="${escapeHtml(linkScan)}" target="_blank" rel="noopener">scan original no Echo</a>.
  </footer>
  <script>
    function filtrarTabela(id, q) {
      const query = String(q || '').toLowerCase();
      document.querySelectorAll('#' + id + ' tbody tr').forEach(function(tr) {
        tr.style.display = tr.textContent.toLowerCase().indexOf(query) !== -1 ? '' : 'none';
      });
    }
    function copiar(texto) {
      if (navigator.clipboard) navigator.clipboard.writeText(texto);
    }
  </script>
</body>
</html>`;
};

module.exports = { gerarHtmlResultado };
