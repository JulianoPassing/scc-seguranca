const escapeHtml = (valor) =>
  String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pick = (obj, keys) => {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return undefined;
};

const caminho = (valor) => {
  if (!valor) return "";
  return String(valor)
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]:)(?!\/)/, "$1/");
};

const texto = (valor, fallback = "N/A") => {
  if (valor === 0) return "0";
  if (valor === true || valor === "true" || valor === "Yes") return "Sim";
  if (valor === false || valor === "false" || valor === "No" || valor === "Not Found") return "Não";
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
      : new Date(typeof bruto === "number" && bruto > 0 && bruto < 1e12 ? bruto * 1000 : bruto);
  if (Number.isNaN(date.getTime())) return String(data);
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
    recente: Number.isFinite(dias) && dias >= 0 && dias <= 2,
  };
};

const duracaoScan = (speed) => {
  if (speed === undefined || speed === null || speed === "") return "N/A";
  const n = Number(speed);
  if (!Number.isFinite(n) || n < 0) return "N/A";
  const segundos = n >= 1000 ? Math.round(n / 1000) : Math.round(n);
  if (segundos < 90) return `${segundos}s`;
  return `${Math.floor(segundos / 60)}m ${String(segundos % 60).padStart(2, "0")}s`;
};

const isDetected = (detection) => {
  const d = String(detection || "").toLowerCase();
  return d.includes("cheat") || (d.includes("detect") && !d.includes("undetect"));
};

const isClean = (detection) => {
  const d = String(detection || "").toLowerCase();
  return d.includes("clean") || d.includes("undetect") || d.includes("legit") || d === "none";
};

const nomeLocalizado = (item) => {
  const loc = item?.localisation || item?.localization;
  if (loc && typeof loc === "object") return loc.en || loc.pt || Object.values(loc)[0] || "";
  return item?.name || item?.nome || "";
};

const badgeAcao = (acao) => {
  const a = String(acao || "").toLowerCase();
  let cls = "tag";
  if (a.includes("delet")) cls += " tag-del";
  else if (a.includes("renam") || a.includes("mov")) cls += " tag-move";
  else if (a.includes("execut") || a.includes("run")) cls += " tag-run";
  else if (a.includes("creat") || a.includes("new")) cls += " tag-new";
  return `<span class="${cls}">${escapeHtml(acao || "—")}</span>`;
};

const tabela = (headers, rows, { id = "tbl", busca = true } = {}) => {
  if (!rows.length) return `<p class="empty">Nenhum registro.</p>`;
  const thead = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const tbody = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => {
            const valor = cell ?? "";
            if (headers[i] === "Ação") return `<td>${badgeAcao(valor)}</td>`;
            return `<td>${escapeHtml(valor)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const filtro = busca
    ? `<div class="toolbar">
        <input type="search" placeholder="Filtrar nesta tabela..." oninput="filtrarTabela('${id}', this.value)" />
        <span class="muted">${rows.length} registros</span>
      </div>`
    : "";
  return `${filtro}<div class="table-wrap"><table id="${id}"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
};

const parsePca = (pca) => {
  if (!pca) return [];
  if (Array.isArray(pca)) {
    return pca
      .map((item) => {
        if (typeof item === "string") return parsePca(item)[0];
        return {
          processo: caminho(item.path || item.file || item.name || ""),
          tempo: item.time || item.Time || item.duration || "",
        };
      })
      .filter((x) => x?.processo);
  }
  return String(pca)
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const partes = linha.split(",");
      const timeAt = partes.lastIndexOf("Time");
      const pathParts = partes.slice(5, timeAt === -1 ? Math.max(partes.length - 2, 5) : timeAt);
      return {
        processo: caminho(pathParts.join(",") || partes[5] || linha),
        tempo: partes[partes.length - 1] || "",
      };
    })
    .filter((x) => x.processo);
};

const processRows = (processData) => {
  if (!processData || typeof processData !== "object") return [];
  return Object.entries(processData)
    .filter(([, valor]) => valor && typeof valor === "object")
    .map(([nome, valor]) => [
      nome,
      formatarData(valor.startTime || valor.start_time),
      caminho(valor.path || ""),
    ]);
};

const logRows = (logs) => {
  if (!Array.isArray(logs)) return [];
  return logs.map((item) => {
    const from = caminho(item.from || item.path || item.file || "");
    const to = caminho(item.to || "");
    const caminhoFinal = to && to !== from ? `${from} → ${to}` : from;
    return [item.action || item.type || "—", caminhoFinal, formatarData(item.at || item.timestamp || item.time)];
  });
};

const dpsRows = (dps) => {
  if (!Array.isArray(dps)) return [];
  return dps.map((item) => [
    item.name || item.nome || "—",
    item.stamp || formatarData(item.unix || item.timestamp),
  ]);
};

const indicacoesLista = (indications) => {
  if (!Array.isArray(indications) || !indications.length) {
    return `<p class="empty">Nenhuma detecção encontrada.</p>`;
  }
  return `<ul class="traces">${indications
    .map((item) => {
      const nome = nomeLocalizado(item);
      const nivel = Number(item.level ?? item.severity ?? 0);
      const cls = nivel >= 2 ? "severe" : nivel === 1 ? "warn" : "";
      const inst = item.instance ? " · in instance" : "";
      return `<li class="${cls}"><span class="lvl">${escapeHtml(nivel)}</span><strong>${escapeHtml(nome)}${escapeHtml(inst)}</strong></li>`;
    })
    .join("")}</ul>`;
};

const contasHtml = (accounts) => {
  const lista = Array.isArray(accounts) ? accounts : [];
  if (!lista.length) return `<p class="empty">Nenhuma conta Steam encontrada.</p>`;
  return `<div class="accounts">${lista
    .map((conta) => {
      if (typeof conta === "string") {
        const partes = conta.split(":");
        const id = partes[1] || partes[0] || "0";
        const label = partes[2] || partes[0] || "Desconhecido";
        return `<a href="https://steamcommunity.com/profiles/${escapeHtml(id)}" target="_blank" rel="noopener">${escapeHtml(label)} <span>${escapeHtml(id)}</span></a>`;
      }
      const id = conta?.steamid || conta?.steamId64 || conta?.id || "0";
      const nome = conta?.name || conta?.username || "Desconhecido";
      return `<a href="https://steamcommunity.com/profiles/${escapeHtml(id)}" target="_blank" rel="noopener">${escapeHtml(nome)} <span>${escapeHtml(id)}</span></a>`;
    })
    .join("")}</div>`;
};

const startTimeHtml = (startTime, scanTs) => {
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
  const scanUnix =
    scanTs instanceof Date
      ? Math.floor(scanTs.getTime() / 1000)
      : Number(scanTs) > 1e12
        ? Math.floor(Number(scanTs) / 1000)
        : Number(scanTs) || 0;

  return `<div class="times">${chaves
    .map(([chave, label]) => {
      const ts = Number(startTime[chave]);
      const valor = ts ? formatarData(ts) : "N/A";
      const recente = chave === "explorer" && ts > 1e9 && scanUnix && scanUnix - ts < 40 * 60;
      return `<div class="time-card ${recente ? "alert" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(valor)}</strong>${recente ? "<small>Explorer recém iniciado</small>" : ""}</div>`;
    })
    .join("")}</div>`;
};

const gerarHtmlResultado = (scanInfo, pinFallback) => {
  const results = scanInfo.results || {};
  const info = results.info || {};
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
  const vpn = info.vpn || info.connectionType || info.connection || "N/A";
  const dataScan = info.timestamp || scanInfo.created_at || scanInfo.date || info.scanDate;
  const jogo = scanInfo.game || info.game || results.game || "GTA-V RP";
  const indications = Array.isArray(results.indications)
    ? results.indications
    : Array.isArray(results.traces)
      ? results.traces
      : [];
  const logs = Array.isArray(results.logs) ? results.logs : [];
  const pcaRows = parsePca(results.pca);
  const processos = processRows(results["process data"] || results.process_data);
  const dps = dpsRows(results.dps);
  const clientVer = results["client ver"] || results.client_ver || "";
  const serverVer = results["server ver"] || results.server_ver || "";

  const vereditoTexto = detected
    ? "O Echo marcou este scan como cheating. Revise as detecções abaixo."
    : clean
      ? "Nenhuma detecção relevante. Ainda assim revise lixeira, formatação e logs."
      : "Revise as seções abaixo antes de decidir.";

  const alertas = [];
  if (detected) {
    alertas.push({
      nivel: "alto",
      titulo: String(detection),
      texto: "Indicadores fortes de cheat. Priorize as detecções de nível 2.",
    });
  }
  if (typeof lixeira.dias === "number" && lixeira.dias <= 2) {
    alertas.push({
      nivel: "alto",
      titulo: "Lixeira esvaziada",
      texto: `Lixeira modificada há ${lixeira.dias} dia(s) (${lixeira.data}).`,
    });
  }
  if (typeof formatacao.dias === "number" && formatacao.dias <= 7) {
    alertas.push({
      nivel: "alto",
      titulo: "Formatação recente",
      texto: `Windows instalado/formatado há ${formatacao.dias} dia(s).`,
    });
  }
  const graves = indications.filter((i) => Number(i.level) >= 2).length;
  if (graves) {
    alertas.push({
      nivel: "alto",
      titulo: `${graves} indicação(ões) graves`,
      texto: "Há detecções de nível 2 neste scan.",
    });
  }

  const nav = [
    ["overview", "Overview"],
    alertas.length ? ["alertas", "Alertas"] : null,
    ["deteccoes", `Detecções`, indications.length],
    ["contas", "Accounts"],
    ["times", "Processos"],
    logs.length ? ["logs", "Logs", logs.length] : null,
    pcaRows.length ? ["pca", "PcaClient", pcaRows.length] : null,
    dps.length ? ["dps", "DPS", dps.length] : null,
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scan ${escapeHtml(pin)} • SCC Segurança</title>
  <link rel="icon" href="https://i.imgur.com/WEh0qkj.png" type="image/png" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
    :root {
      --red: #ff0000;
      --red-2: #ff3333;
      --bg: #0D0D0D;
      --card: #141414;
      --line: #30363D;
      --muted: #B0B0B0;
      --ok: #4CAF50;
      --warn: #f5a524;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: Poppins, sans-serif; background: var(--bg); color: #fff; line-height: 1.55; }
    header { text-align: center; padding: 28px 16px 12px; }
    header img { max-width: 220px; }
    header p { margin-top: 8px; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; color: var(--muted); }
    .nav {
      position: sticky; top: 0; z-index: 20;
      display: flex; gap: 8px; flex-wrap: wrap;
      padding: 10px 16px; background: rgba(13,13,13,.95);
      border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
    }
    .nav a {
      color: #fff; text-decoration: none; font-size: 12px; font-weight: 600;
      padding: 7px 12px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap;
    }
    .nav a:hover { background: var(--red); border-color: var(--red); }
    .nav em { font-style: normal; color: var(--red-2); margin-left: 4px; }
    main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 72px; }
    .verdict, .card, .stat {
      background: var(--card); border: 1px solid var(--line); border-radius: 16px;
    }
    .verdict { text-align: center; padding: 28px 18px; margin-bottom: 16px; }
    .verdict.detected { border-color: var(--red); box-shadow: 0 0 28px rgba(255,0,0,.22); }
    .verdict.clean { border-color: var(--ok); }
    .badge {
      display: inline-block; padding: 6px 16px; border-radius: 999px;
      background: linear-gradient(135deg, #ff0000, #ff3333); font-weight: 800; letter-spacing: .08em;
    }
    .verdict.clean .badge { background: var(--ok); }
    .verdict h1 { margin: 12px 0 8px; font-size: 1.8rem; }
    .actions { margin-top: 14px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .actions a, .actions button {
      background: #1a1a1a; color: #fff; border: 1px solid var(--line);
      padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 600; text-decoration: none; font-size: 13px;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .stat { min-width: 0; padding: 12px 14px; }
    .stat.hot { border-color: var(--red); }
    .stat span { display: block; color: var(--muted); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    .stat strong { display: block; margin-top: 6px; font-size: 13px; overflow-wrap: anywhere; }
    .card { padding: 18px; margin-bottom: 14px; }
    .card h2 { font-size: 1.05rem; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--red); }
    .empty, .muted, .hint { color: var(--muted); font-size: 13px; }
    .traces { list-style: none; display: grid; gap: 8px; }
    .traces li {
      display: flex; gap: 10px; align-items: flex-start;
      background: #1b1b1b; border-left: 4px solid var(--red); padding: 10px 12px; border-radius: 8px;
    }
    .traces li.severe { background: #2a1010; }
    .traces li.warn { border-left-color: var(--warn); }
    .lvl {
      min-width: 22px; height: 22px; border-radius: 6px; background: var(--red);
      display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;
    }
    .accounts { display: flex; flex-wrap: wrap; gap: 8px; }
    .accounts a { color: #fff; text-decoration: none; background: #1b1b1b; border: 1px solid var(--line); padding: 8px 12px; border-radius: 10px; }
    .accounts span { color: var(--muted); font-size: 12px; }
    .times { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
    .time-card { background: #1b1b1b; border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
    .time-card.alert { border-color: var(--warn); }
    .time-card span { color: var(--red-2); font-size: 11px; font-weight: 700; }
    .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
    .toolbar input {
      flex: 1; min-width: 0; background: var(--bg); color: #fff; border: 1px solid var(--line);
      border-radius: 10px; padding: 9px 12px; font-family: inherit;
    }
    .table-wrap { overflow-x: auto; max-width: 100%; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
    th, td { border: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    th { background: #1a1a1a; color: var(--red-2); }
    code { font-family: Consolas, ui-monospace, monospace; font-size: 11px; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #333; }
    .tag-run { background: #1f4b2d; }
    .tag-del { background: #5c1414; }
    .tag-move { background: #5c3d10; }
    .tag-new { background: #14305c; }
    .alert-list { display: grid; gap: 8px; }
    .alert-list article { padding: 12px; border-radius: 12px; border: 1px solid var(--line); }
    .alert-list .alto { border-color: var(--red); background: #2a1010; }
    footer { text-align: center; padding: 24px 12px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
    footer a { color: var(--red-2); }
  </style>
</head>
<body>
  <header>
    <img src="https://i.imgur.com/aawPk38.png" alt="Street Car Club Roleplay" />
    <p>SCC Segurança • Relatório Echo</p>
  </header>
  <nav class="nav">
    ${nav.map(([id, label, count]) => `<a href="#${id}">${escapeHtml(label)}${count ? `<em>${count}</em>` : ""}</a>`).join("")}
  </nav>
  <main>
    <section class="verdict ${statusClass}" id="overview">
      <div class="badge">${escapeHtml(detection)}</div>
      <h1>Resultado do scan</h1>
      <p>${escapeHtml(vereditoTexto)}</p>
      <p>PIN <strong>${escapeHtml(pin)}</strong> · ${escapeHtml(jogo)}</p>
      <div class="actions">
        <a href="${escapeHtml(linkScan)}" target="_blank" rel="noopener">Abrir no Echo</a>
        <button type="button" onclick="copiar(${JSON.stringify(pin)})">Copiar PIN</button>
        ${uuid ? `<button type="button" onclick="copiar(${JSON.stringify(uuid)})">Copiar UUID</button>` : ""}
      </div>
    </section>

    <section class="grid">
      <div class="stat"><span>PIN</span><strong>${escapeHtml(pin)}</strong></div>
      <div class="stat"><span>Duração</span><strong>${escapeHtml(duracaoScan(info.speed))}</strong></div>
      <div class="stat"><span>Sistema</span><strong>${texto(os)}</strong></div>
      <div class="stat"><span>VM</span><strong>${texto(vm)}</strong></div>
      <div class="stat"><span>País</span><strong>${texto(country)}</strong></div>
      <div class="stat"><span>VPN</span><strong>${texto(vpn)}</strong></div>
      <div class="stat ${formatacao.recente ? "hot" : ""}"><span>Instalação Windows</span><strong>${escapeHtml(formatacao.dias)} dias (${escapeHtml(formatacao.data)})</strong></div>
      <div class="stat ${lixeira.recente ? "hot" : ""}"><span>Lixeira</span><strong>${escapeHtml(lixeira.dias)} dias (${escapeHtml(lixeira.data)})</strong></div>
      <div class="stat"><span>Data do scan</span><strong>${escapeHtml(formatarData(dataScan))}</strong></div>
      <div class="stat"><span>UUID</span><strong>${texto(uuid)}</strong></div>
    </section>

    ${
      alertas.length
        ? `<section class="card" id="alertas"><h2>Alertas da staff</h2><div class="alert-list">${alertas
            .map((a) => `<article class="${a.nivel}"><strong>${escapeHtml(a.titulo)}</strong><p>${escapeHtml(a.texto)}</p></article>`)
            .join("")}</div></section>`
        : ""
    }

    <section class="card" id="deteccoes">
      <h2>Detecções</h2>
      ${indicacoesLista(indications)}
    </section>

    <section class="card" id="contas">
      <h2>Accounts</h2>
      ${contasHtml(scanInfo.accounts || results.accounts)}
    </section>

    <section class="card" id="times">
      <h2>Process Times</h2>
      ${startTimeHtml(results.start_time || results.startTime, dataScan)}
      ${processos.length ? `<div style="margin-top:14px">${tabela(["Processo", "Início", "Caminho"], processos, { id: "tbl-proc" })}</div>` : ""}
    </section>

    ${logs.length ? `<section class="card" id="logs"><h2>File Logs</h2>${tabela(["Ação", "Caminho", "Data"], logRows(logs), { id: "tbl-logs" })}</section>` : ""}
    ${pcaRows.length ? `<section class="card" id="pca"><h2>PcaClient</h2>${tabela(["Processo", "Tempo"], pcaRows.map((r) => [r.processo, r.tempo]), { id: "tbl-pca" })}</section>` : ""}
    ${dps.length ? `<section class="card" id="dps"><h2>Compilation Times (DPS)</h2>${tabela(["Arquivo", "Compilação"], dps, { id: "tbl-dps" })}</section>` : ""}
  </main>
  <footer>
    Street Car Club Roleplay • Segurança SCC${clientVer || serverVer ? `<br>Echo client ${escapeHtml(clientVer || "—")} · server ${escapeHtml(serverVer || "—")}` : ""}<br>
    Sempre cruze com o <a href="${escapeHtml(linkScan)}" target="_blank" rel="noopener">scan original no Echo</a>.
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
