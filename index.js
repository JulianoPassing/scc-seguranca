require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const axios = require("axios");

// Configurações
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN?.trim();
const ECHO_API_KEY = process.env.ECHO_API_KEY?.trim();

if (!DISCORD_BOT_TOKEN) {
  console.error(
    "DISCORD_BOT_TOKEN não definido. Crie um arquivo .env na raiz do projeto com DISCORD_BOT_TOKEN=seu_token",
  );
  process.exit(1);
}

if (!ECHO_API_KEY) {
  console.error(
    "ECHO_API_KEY não definido. Crie um arquivo .env na raiz do projeto com ECHO_API_KEY=sua_chave",
  );
  process.exit(1);
}
const ADMIN_ID = "377862544699949056";

const axiosConfig = { headers: { Authorization: ECHO_API_KEY } };

const POLL_INTERVAL_MS = 30000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;
const FIELD_MAX = 1024;
const DESC_MAX = 4096;

// Múltiplos pollings ativos: { pin: { intervalId, timeoutId } }
const activePollings = new Map();

// Utilitários
const getPin = () => axios.get("https://api.echo.ac/v1/user/pin", axiosConfig);
const getScanByPin = (pin) =>
  axios.get(`https://api.echo.ac/v1/scan/${pin}`, axiosConfig);
const getScanByUUID = (uuid) =>
  axios.get(`https://api.echo.ac/v1/scan/${uuid}`, axiosConfig);

const tornarScanPublico = async (uuid) => {
  await axios.post(
    `https://dash.echo.ac/api/scan/${uuid}/settings`,
    "key=published&value=true",
    {
      headers: {
        ...axiosConfig.headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );
};

const truncar = (texto, max = FIELD_MAX) => {
  const str = String(texto ?? "").trim();
  if (!str) return "N/A";
  if (str.length <= max) return str;
  return `${str.slice(0, max - 24)}\n… (ver link completo)`;
};

const valorOuNA = (valor) => {
  if (valor === 0) return "0";
  if (valor === false) return "Não";
  if (valor === true) return "Sim";
  if (valor === undefined || valor === null || valor === "") return "N/A";
  return String(valor);
};

const extrairPin = (texto) => {
  if (!texto) return null;
  const raw = String(texto).trim();

  const pinLabel = raw.match(/PIN[:\s]+([a-zA-Z0-9]+)/i);
  if (pinLabel) return pinLabel[1];

  const fdl = raw.match(/fdl\.echo\.ac\/[^\s]*-([A-Za-z0-9+/=]+)/i);
  if (fdl) {
    try {
      const decoded = Buffer.from(fdl[1], "base64").toString("utf8").trim();
      if (/^[a-zA-Z0-9]+$/.test(decoded)) return decoded;
    } catch (_) {}
  }

  const token = raw.split(/\s+/)[0].replace(/[<>]/g, "");
  if (/^[a-zA-Z0-9]{3,16}$/.test(token) && !/^https?:/i.test(token)) {
    return token;
  }

  return null;
};

const calcularDiferencaDiasEData = (data) => {
  if (!data || typeof data !== "string" || !data.includes("T")) {
    return {
      diffDias: "N/A",
      dataFormatada: "Data indisponível",
    };
  }

  const dataFormatada = data.split("T")[0];
  const [ano, mes, dia] = dataFormatada.split("-");
  const dataAlvo = new Date(ano, mes - 1, dia);
  const diffMs = Date.now() - dataAlvo.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return {
    diffDias,
    dataFormatada: `${dia}/${mes}/${ano}`,
  };
};

const formatarDataHora = (data) => {
  if (!data) return "N/A";
  const date = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(date.getTime())) return "N/A";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const linksSteam = (contas) => {
  if (!Array.isArray(contas) || contas.length === 0) {
    return "Nenhuma conta Steam encontrada.";
  }

  return contas
    .map((conta) => {
      if (typeof conta !== "string") {
        const nome = conta?.name || conta?.username || "Desconhecido";
        const steamId64 = conta?.steamid || conta?.steamId64 || conta?.id || "0";
        return `[${nome}](https://steamcommunity.com/profiles/${steamId64})`;
      }
      const [_, steamId64, nome] = conta.split(":");
      return `[${nome || "Desconhecido"}](https://steamcommunity.com/profiles/${steamId64 || "0"})`;
    })
    .join("\n");
};

const formatarInstancia = (valor) => {
  if (valor === true || valor === "true" || valor === "in_instance") {
    return "in instance";
  }
  if (valor === false || valor === "false" || valor === "out_of_instance") {
    return "out of instance";
  }
  if (!valor) return "";
  return String(valor);
};

const diagnosticoScan = (traces) => {
  if (!Array.isArray(traces) || traces.length === 0) {
    return "Nenhuma detecção encontrada.";
  }

  return traces
    .map((trace) => {
      const nome = trace?.name || "Sem nome";
      const instancia = formatarInstancia(trace?.in_instance);
      const jaTemInstancia = /in instance|out of instance/i.test(nome);
      const sufixo = instancia && !jaTemInstancia ? ` ${instancia}` : "";
      return `• ${nome}${sufixo}`;
    })
    .join("\n");
};

const gerarStartTimeFormatado = (start_time) => {
  const chavesDesejadas = ["dps", "pca", "dgt", "sys", "explorer"];

  if (!start_time || typeof start_time !== "object") {
    return "Start time não disponível.";
  }

  const formatarTimestamp = (timestamp) => {
    if (!timestamp || isNaN(timestamp)) return "N/A";
    const date = new Date(timestamp * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  return chavesDesejadas
    .map((chave) => {
      const ts = start_time[chave];
      return `**${chave.toUpperCase()}**: ${formatarTimestamp(ts)}`;
    })
    .join("\n");
};

const scanTemResultados = (scanInfo) => {
  if (!scanInfo || !scanInfo.results) return false;
  if (scanInfo.processing === true) return false;
  const status = String(scanInfo.status || "").toLowerCase();
  if (status === "processing" || status === "pending" || status === "running") {
    return false;
  }
  return Boolean(
    scanInfo.detection ||
      scanInfo.results.info ||
      Array.isArray(scanInfo.results.traces),
  );
};

const corPorResultado = (detection) => {
  const d = String(detection || "").toLowerCase();
  if (d.includes("detect") && !d.includes("undetect")) return 0xed4245;
  if (d.includes("clean") || d.includes("undetect") || d.includes("none")) {
    return 0x57f287;
  }
  return 0xfee75c;
};

const formatarDuracao = (speed) => {
  if (speed === undefined || speed === null || speed === "") return "N/A";
  const ms = Number(speed);
  if (Number.isNaN(ms)) return "N/A";
  const segundos = ms >= 1000 ? Math.round(ms / 1000) : Math.round(ms);
  return `${segundos}s`;
};

const formatarVM = (info, scanInfo) => {
  const vm = info?.vm ?? info?.isVM ?? info?.virtualMachine ?? scanInfo?.vm;
  if (vm === true || vm === "true" || vm === "Yes" || vm === "yes") return "Sim";
  if (vm === false || vm === "false" || vm === "No" || vm === "no") return "Não";
  return valorOuNA(vm);
};

const pararPolling = (pin) => {
  const ativo = activePollings.get(pin);
  if (!ativo) return;
  clearInterval(ativo.intervalId);
  if (ativo.timeoutId) clearTimeout(ativo.timeoutId);
  activePollings.delete(pin);
};

const montarMensagemResultado = async (scanInfo, pinFallback) => {
  const uuid = scanInfo.uuid || scanInfo.id;
  await tornarScanPublico(uuid).catch(() => {});

  const info = scanInfo.results?.info || {};
  const pin = scanInfo.pin || pinFallback;
  const detection = scanInfo.detection || "N/A";
  const linkScan = `https://scan.echo.ac/${uuid}`;
  const formatacao = calcularDiferencaDiasEData(info.installationDate);
  const lixeira = calcularDiferencaDiasEData(info.recycleBinModified);
  const steams = linksSteam(scanInfo.accounts);
  const deteccoes = diagnosticoScan(scanInfo.results?.traces);
  const startTime = gerarStartTimeFormatado(scanInfo.results?.start_time);
  const os = info.os || info.operatingSystem || scanInfo.os || "Windows";
  const country = info.country || scanInfo.country || "N/A";
  const connection =
    info.connectionType || info.connection || scanInfo.connectionType || "N/A";
  const dataScan =
    scanInfo.created_at ||
    scanInfo.createdAt ||
    scanInfo.date ||
    scanInfo.timestamp ||
    info.scanDate;

  const embed = new EmbedBuilder()
    .setColor(corPorResultado(detection))
    .setTitle(`Resultado: ${detection}`)
    .setURL(linkScan)
    .setDescription(
      truncar(
        `Echo concluiu o scan. Resumo igual ao overview do site:\n[Abrir resultado completo](${linkScan})`,
        DESC_MAX,
      ),
    )
    .addFields(
      { name: "PIN", value: `\`${pin || "N/A"}\``, inline: true },
      { name: "Duração", value: formatarDuracao(info.speed), inline: true },
      { name: "Sistema", value: valorOuNA(os), inline: true },
      { name: "VM", value: formatarVM(info, scanInfo), inline: true },
      { name: "País", value: valorOuNA(country), inline: true },
      { name: "Conexão", value: valorOuNA(connection), inline: true },
      {
        name: "Formatação",
        value: `${formatacao.diffDias} dias (${formatacao.dataFormatada})`,
        inline: true,
      },
      {
        name: "Lixeira",
        value: `${lixeira.diffDias} dias (${lixeira.dataFormatada})`,
        inline: true,
      },
      {
        name: "Data do scan",
        value: formatarDataHora(dataScan),
        inline: true,
      },
      { name: "Contas Steam", value: truncar(steams) },
      { name: "Detecções", value: truncar(deteccoes) },
      { name: "Start Time", value: truncar(startTime) },
    )
    .setFooter({ text: "SCC Segurança • Echo.ac" })
    .setTimestamp();

  const components = uuid
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Abrir resultado no site")
            .setStyle(ButtonStyle.Link)
            .setURL(linkScan),
        ),
      ]
    : [];

  const content = [
    `**Resultado do Echo: ${detection}**`,
    `PIN: \`${pin || "N/A"}\``,
    linkScan,
  ].join("\n");

  return { content, embeds: [embed], components };
};

const getScanDataComplete = async (pin, uuidFromPolling = null) => {
  let uuid = uuidFromPolling;

  if (!uuid) {
    const responsePin = await getScanByPin(pin);
    if (
      responsePin.status !== 200 ||
      !responsePin.data ||
      !responsePin.data[0]
    ) {
      throw new Error("PIN inválido ou scan não encontrado.");
    }
    if (responsePin.data[0].game !== "GTA-V RP") {
      throw new Error(`Jogo inválido: ${responsePin.data[0].game}`);
    }
    uuid = responsePin.data[0].uuid;
  }

  const responseUUID = await getScanByUUID(uuid);
  const scanInfo = responseUUID.data;

  if (!scanTemResultados(scanInfo)) {
    throw new Error("Dados do scan incompletos ou em processamento.");
  }

  return montarMensagemResultado(scanInfo, pin);
};

const enviarResultadoNoCanal = async (channel, payload) => {
  await channel.send(payload);
};

const iniciarPolling = async (pin, channel) => {
  if (activePollings.has(pin)) {
    await channel.send(`Polling já está ativo para o PIN ${pin}.`);
    return;
  }

  await channel.send(
    `Acompanhando o PIN \`${pin}\`. Quando o scan terminar, mando o resultado completo aqui.`,
  );

  let uuid = null;
  let avisouInicio = false;

  const intervalId = setInterval(async () => {
    try {
      if (!uuid) {
        const res = await getScanByPin(pin);
        if (res.status !== 200 || !res.data || res.data.length === 0) return;

        if (res.data[0].game && res.data[0].game !== "GTA-V RP") {
          pararPolling(pin);
          const msg = `O jogo detectado no PIN ${pin} não é GTA-V RP (${res.data[0].game}).`;
          await channel.send(msg);
          await sendErrorDM(msg);
          return;
        }

        uuid = res.data[0].uuid;
      }

      const responseUUID = await getScanByUUID(uuid);
      const scanInfo = responseUUID.data;

      if (!scanTemResultados(scanInfo)) {
        if (!avisouInicio) {
          avisouInicio = true;
          await channel.send(
            `Scan iniciado para o PIN \`${pin}\`. Aguardando o resultado completo...`,
          );
        }
        return;
      }

      pararPolling(pin);
      const payload = await montarMensagemResultado(scanInfo, pin);
      await enviarResultadoNoCanal(channel, payload);
    } catch (err) {
      console.error(`Erro no polling do PIN ${pin}:`, err);
      pararPolling(pin);
      await channel.send(
        `Erro ao buscar o resultado do PIN \`${pin}\`. O admin foi notificado.`,
      );
      await sendErrorDM(
        `Erro no polling do PIN ${pin}: ${err.stack || err.message || err}`,
      );
    }
  }, POLL_INTERVAL_MS);

  const timeoutId = setTimeout(async () => {
    if (!activePollings.has(pin)) return;
    pararPolling(pin);
    await channel.send(
      `Tempo esgotado aguardando o scan do PIN \`${pin}\`. Use \`/resultado ${pin}\` mais tarde.`,
    );
  }, POLL_TIMEOUT_MS);

  activePollings.set(pin, { intervalId, timeoutId });
};

// Inicializa cliente Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Função global para enviar logs/erros por DM
const sendErrorDM = async (errorMsg) => {
  if (!client.isReady()) return;
  try {
    const msgString = String(errorMsg).substring(0, 1900);
    const user = await client.users.fetch(ADMIN_ID);
    await user.send(`**⚠️ Log do Bot:**\n\`\`\`\n${msgString}\n\`\`\``);
  } catch (dmError) {
    console.error("Erro ao enviar DM:", dmError);
  }
};

client.on("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const parts = content.split(" ");
  const command = parts[0];

  // Comando: /echo
  if (command === "/echo") {
    try {
      const response = await getPin();
      if (response.status === 200) {
        const pin = response.data.pin;
        const link = response.data.links?.fivem || "Link não disponível";

        await message.channel.send(`Novo PIN: ${pin}\n${link}`);
        await iniciarPolling(pin, message.channel);
      } else {
        await message.channel.send("Erro ao obter o PIN da API.");
        await sendErrorDM("Erro ao obter o PIN da API.");
      }
    } catch (error) {
      await message.channel.send("Erro ao gerar o PIN. O admin foi notificado.");
      await sendErrorDM("Erro: " + error.message);
    }
  }

  // Comando: /resultado <pin ou link>
  else if (command === "/resultado") {
    const pin = extrairPin(parts.slice(1).join(" "));
    if (!pin) {
      await message.channel.send(
        "Uso: `/resultado <pin>`\nExemplo: `/resultado mqd26v`",
      );
      return;
    }
    try {
      const payload = await getScanDataComplete(pin);
      await enviarResultadoNoCanal(message.channel, payload);
    } catch (error) {
      const aindaProcessando = /incompleto|processamento/i.test(error.message);
      if (aindaProcessando) {
        await iniciarPolling(pin, message.channel);
        return;
      }
      await message.channel.send(
        `Não consegui montar o resultado do PIN \`${pin}\`: ${error.message}`,
      );
      await sendErrorDM("Erro ao buscar resultado: " + error.message);
    }
  }

  // Comando: /stop ou /stop <pin>
  else if (command === "/stop") {
    if (parts.length === 1) {
      if (activePollings.size === 0) {
        await message.channel.send("Nenhum polling ativo.");
        return;
      }
      for (const pin of Array.from(activePollings.keys())) {
        pararPolling(pin);
      }
      await message.channel.send("Todos os pollings foram interrompidos.");
    } else {
      const pin = extrairPin(parts.slice(1).join(" ")) || parts[1];
      if (activePollings.has(pin)) {
        pararPolling(pin);
        await message.channel.send(`Polling interrompido para o PIN ${pin}.`);
      } else {
        await message.channel.send(`Nenhum polling ativo para o PIN ${pin}.`);
      }
    }
  }

  // Comando: /start <pin>
  else if (command === "/start") {
    if (parts.length < 2) {
      await message.channel.send("Uso: `/start <pin>`");
      return;
    }

    const pin = extrairPin(parts.slice(1).join(" "));
    if (!pin) {
      await message.channel.send("Uso: `/start <pin>`");
      return;
    }
    await iniciarPolling(pin, message.channel);
  }

  // Comando: /status
  else if (command === "/status") {
    if (activePollings.size === 0) {
      await message.channel.send("Nenhum polling está ativo no momento.");
      return;
    }

    const pins = Array.from(activePollings.keys())
      .map((pin) => `• ${pin}`)
      .join("\n");
    await message.channel.send(`📡 Pollings ativos:\n${pins}`);
  }
});

// Exporta rota HTTP opcional
module.exports = (req, res) => {
  res.status(200).send("Bot está rodando e a API está acessível!");
};

// Tratamento de Erros Globais para evitar travamentos silenciosos
process.on("uncaughtException", async (err) => {
  console.error("Erro Fatal (uncaughtException):", err);
  await sendErrorDM(`Erro Fatal: ${err.message}\n${err.stack}`);
});

process.on("unhandledRejection", async (reason, promise) => {
  console.error("Rejeição não tratada (unhandledRejection):", reason);
  await sendErrorDM(`Rejeição não tratada: ${reason}`);
});

// Login do bot
client.login(DISCORD_BOT_TOKEN).catch((err) => {
  console.error("Falha ao conectar no Discord:", err.message);
  if (err.code === "TokenInvalid") {
    console.error(
      "O token do Discord é inválido ou expirou. Gere um novo em https://discord.com/developers/applications",
    );
  }
  process.exit(1);
});
