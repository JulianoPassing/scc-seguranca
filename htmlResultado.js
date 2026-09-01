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
  if (!data) return "N/A";
  const date = data instanceof Date ? data : new Date(typeof data === "number" && data < 1e12 ? data * 1000 : data);
  if (Number.isNaN(date.getTime())) return texto(data);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const diasDesde = (dataIso) => {
  if (!dataIso || typeof dataIso !== "string" || !dataIso.includes("T")) {
    return { dias: "N/A", data: "Data indisponível" };
  }
  const soData = dataIso.split("T")[0];
  const [ano, mes, dia] = soData.split("-");
  const alvo = new Date(ano, mes - 1, dia);
  const dias = Math.floor((Date.now() - alvo.getTime()) / 86400000);
  return { dias, data: `${dia}/${mes}/${ano}` };
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

const renderTabela = (linhas, limite = 400) => {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return `<p class="empty">Nenhum registro.</p>`;
  }

  const amostra = linhas.find((item) => item && typeof item === "object") || {};
  const colunas =
    typeof amostra === "object" && !Array.isArray(amostra)
      ? Object.keys(amostra)
      : ["Valor"];
  const visiveis = linhas.slice(0, limite);

  const thead = colunas.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const tbody = visiveis
    .map((linha) => {
      if (linha && typeof linha === "object" && !Array.isArray(linha)) {
        return `<tr>${colunas
          .map((col) => `<td>${escapeHtml(formatarCelula(linha[col]))}</td>`)
          .join("")}</tr>`;
      }
      return `<tr><td>${escapeHtml(formatarCelula(linha))}</td></tr>`;
    })
    .join("");

  const extra =
    linhas.length > limite
      ? `<p class="hint">${linhas.length - limite} registros omitidos neste HTML. Veja o scan original no Echo.</p>`
      : "";

  return `<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>${extra}`;
};

const formatarCelula = (valor) => {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number") {
    if (valor > 1000000000 && valor < 20000000000) return formatarData(valor);
    return String(valor);
  }
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
};

const contasHtml = (accounts) => {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return `<p class="empty">Nenhuma conta Steam encontrada.</p>`;
  }

  const itens = accounts
    .map((conta) => {
      if (typeof conta === "string") {
        const [, steamId64, nome] = conta.split(":");
        const id = steamId64 || "0";
        const label = nome || "Desconhecido";
        return `<a href="https://steamcommunity.com/profiles/${escapeHtml(id)}" target="_blank" rel="noopener">${escapeHtml(label)} <span>${escapeHtml(id)}</span></a>`;
      }
      const nome = conta?.name || conta?.username || "Desconhecido";
      const id = conta?.steamid || conta?.steamId64 || conta?.id || "0";
      return `<a href="https://steamcommunity.com/profiles/${escapeHtml(id)}" target="_blank" rel="noopener">${escapeHtml(nome)} <span>${escapeHtml(id)}</span></a>`;
    })
    .join("");

  return `<div class="accounts">${itens}</div>`;
};

const tracesHtml = (traces) => {
  if (!Array.isArray(traces) || traces.length === 0) {
    return `<p class="empty">Nenhuma detecção encontrada.</p>`;
  }

  return `<ul class="traces">${traces
    .map((trace) => {
      const nome = trace?.name || "Sem nome";
      const inst = instanciaTrace(trace?.in_instance);
      const jaTem = /in instance|out of instance/i.test(nome);
      const label = jaTem || !inst ? nome : `${nome} ${inst}`;
      const grave = /in instance/i.test(label);
      return `<li class="${grave ? "severe" : ""}"><strong>${escapeHtml(label)}</strong></li>`;
    })
    .join("")}</ul>`;
};

const startTimeHtml = (startTime) => {
  const chaves = ["dps", "pca", "dgt", "sys", "explorer"];
  if (!startTime || typeof startTime !== "object") {
    return `<p class="empty">Start time não disponível.</p>`;
  }

  return `<div class="times">${chaves
    .map((chave) => {
      const ts = startTime[chave];
      const valor = ts ? formatarData(ts) : "N/A";
      return `<div class="time-card"><span>${escapeHtml(chave.toUpperCase())}</span><strong>${escapeHtml(valor)}</strong></div>`;
    })
    .join("")}</div>`;
};

const secoesExtras = (results) => {
  if (!results || typeof results !== "object") return "";
  const ignorar = new Set(["info", "traces", "start_time", "startTime"]);
  return Object.entries(results)
    .filter(([chave, valor]) => {
      if (ignorar.has(chave)) return false;
      if (Array.isArray(valor)) return valor.length > 0;
      if (valor && typeof valor === "object") return Object.keys(valor).length > 0;
      return valor !== undefined && valor !== null && valor !== "";
    })
    .map(([chave, valor]) => {
      const titulo = chave.replace(/[_-]/g, " ");
      let corpo = "";
      if (Array.isArray(valor)) corpo = renderTabela(valor);
      else if (typeof valor === "object") {
        const linhas = Object.entries(valor).map(([k, v]) => ({ Campo: k, Valor: formatarCelula(v) }));
        corpo = renderTabela(linhas);
      } else {
        corpo = `<p>${escapeHtml(valor)}</p>`;
      }
      return `<section class="card"><h2>${escapeHtml(titulo)}</h2>${corpo}</section>`;
    })
    .join("");
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
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Poppins', sans-serif;
      background: var(--background-color);
      color: var(--text-color);
      line-height: 1.6;
    }
    header {
      padding: 36px 20px 24px;
      text-align: center;
      border-bottom: 1px solid var(--border-color);
      background: #0D0D0D;
    }
    header img { max-width: 280px; height: auto; filter: drop-shadow(0 10px 20px rgba(0,0,0,.4)); }
    header p { margin-top: 10px; color: var(--text-secondary); letter-spacing: .12em; text-transform: uppercase; font-size: 12px; }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 80px; }
    .verdict {
      border: 1px solid var(--border-color);
      border-radius: 18px;
      padding: 28px;
      margin-bottom: 24px;
      text-align: center;
      background: linear-gradient(180deg, #141414 0%, #0D0D0D 100%);
      box-shadow: 0 15px 40px var(--shadow-color);
    }
    .verdict.detected { box-shadow: 0 0 32px rgba(255,0,0,.25); border-color: #ff0000; }
    .verdict.clean { box-shadow: 0 0 32px rgba(76,175,80,.18); border-color: #4CAF50; }
    .badge {
      display: inline-block;
      padding: 8px 18px;
      border-radius: 999px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      background: var(--gradient-primary);
      color: #fff;
    }
    .verdict.clean .badge { background: var(--ok); }
    .verdict h1 { margin: 14px 0 8px; font-size: 2.2rem; }
    .verdict a { color: var(--secondary-color); font-weight: 600; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat {
      background: #141414;
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 16px;
    }
    .stat span { display: block; color: var(--text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .stat strong { display: block; margin-top: 6px; font-size: 15px; word-break: break-word; }
    .card {
      background: #141414;
      border: 1px solid var(--border-color);
      border-radius: 18px;
      padding: 22px;
      margin-bottom: 18px;
      box-shadow: 0 10px 30px var(--shadow-color);
    }
    .card h2 {
      font-size: 1.15rem;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--primary-color);
      text-transform: capitalize;
    }
    .empty { color: var(--text-secondary); }
    .hint { color: var(--text-secondary); font-size: 13px; margin-top: 10px; }
    .traces { list-style: none; display: grid; gap: 8px; }
    .traces li {
      background: var(--hover-color);
      border-left: 4px solid var(--primary-color);
      padding: 10px 14px;
      border-radius: 8px;
    }
    .traces li.severe { border-left-color: #ff6363; }
    .accounts { display: flex; flex-wrap: wrap; gap: 10px; }
    .accounts a {
      color: #fff;
      text-decoration: none;
      background: var(--hover-color);
      border: 1px solid var(--border-color);
      padding: 10px 14px;
      border-radius: 10px;
    }
    .accounts a span { color: var(--text-secondary); font-size: 12px; margin-left: 6px; }
    .times { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
    .time-card {
      background: var(--hover-color);
      border-radius: 12px;
      padding: 12px;
      border: 1px solid var(--border-color);
    }
    .time-card span { color: var(--primary-color); font-size: 12px; font-weight: 700; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid var(--border-color); padding: 10px 8px; text-align: left; vertical-align: top; }
    th { background: #1a1a1a; color: var(--secondary-color); white-space: nowrap; }
    tr:nth-child(even) td { background: #101010; }
    footer {
      text-align: center;
      padding: 28px 12px;
      color: #fff;
      border-top: 1px solid var(--border-color);
      font-size: 13px;
    }
    footer a { color: var(--secondary-color); }
    @media print {
      body { background: #fff; color: #111; }
      .card, .stat, .verdict { box-shadow: none; }
    }
  </style>
</head>
<body>
  <header>
    <img src="https://i.imgur.com/aawPk38.png" alt="Street Car Club Roleplay" />
    <p>SCC Segurança • Relatório Echo</p>
  </header>
  <main>
    <section class="verdict ${statusClass}">
      <div class="badge">${escapeHtml(detection)}</div>
      <h1>Resultado do scan</h1>
      <p>PIN <strong>${escapeHtml(pin)}</strong> · ${escapeHtml(jogo)}</p>
      <p><a href="${escapeHtml(linkScan)}" target="_blank" rel="noopener">Abrir scan original no Echo</a></p>
    </section>

    <section class="grid">
      <div class="stat"><span>PIN</span><strong>${escapeHtml(pin)}</strong></div>
      <div class="stat"><span>Duração</span><strong>${escapeHtml(duracaoScan(info.speed))}</strong></div>
      <div class="stat"><span>Sistema</span><strong>${texto(os)}</strong></div>
      <div class="stat"><span>VM</span><strong>${texto(vm)}</strong></div>
      <div class="stat"><span>País</span><strong>${texto(country)}</strong></div>
      <div class="stat"><span>Conexão</span><strong>${texto(connection)}</strong></div>
      <div class="stat"><span>Formatação</span><strong>${escapeHtml(formatacao.dias)} dias (${escapeHtml(formatacao.data)})</strong></div>
      <div class="stat"><span>Lixeira</span><strong>${escapeHtml(lixeira.dias)} dias (${escapeHtml(lixeira.data)})</strong></div>
      <div class="stat"><span>Data do scan</span><strong>${escapeHtml(formatarData(dataScan))}</strong></div>
      <div class="stat"><span>UUID</span><strong>${texto(uuid)}</strong></div>
    </section>

    <section class="card">
      <h2>Detecções</h2>
      ${tracesHtml(scanInfo.results?.traces)}
    </section>

    <section class="card">
      <h2>Contas Steam</h2>
      ${contasHtml(scanInfo.accounts)}
    </section>

    <section class="card">
      <h2>Start Time</h2>
      ${startTimeHtml(scanInfo.results?.start_time || scanInfo.results?.startTime)}
    </section>

    ${secoesExtras(scanInfo.results)}
  </main>
  <footer>
    Street Car Club Roleplay • Segurança SCC<br />
    Relatório gerado automaticamente a partir do Echo.ac
  </footer>
</body>
</html>`;
};

module.exports = { gerarHtmlResultado };
