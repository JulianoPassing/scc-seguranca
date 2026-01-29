require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

const {
  DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  ECHO_API_KEY,
} = process.env;

if (!DISCORD_BOT_TOKEN) {
  console.error("ERRO: DISCORD_BOT_TOKEN não está definido no arquivo .env");
  process.exit(1);
}
if (!ECHO_API_KEY) {
  console.error("ERRO: ECHO_API_KEY não está definido no arquivo .env");
  process.exit(1);
}
if (!DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  console.error("ERRO: DISCORD_CLIENT_ID e DISCORD_GUILD_ID são necessários para slash commands (deploy).");
  // Ainda dá pra rodar, mas não dá pra registrar comandos sem isso.
}

// ============================
// MODO DEPLOY (Slash Commands)
// ============================
const MODE = process.argv[2]; // "deploy" ou undefined

const commands = [
  new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Gera um PIN e acompanha o scan até ficar pronto."),
  new SlashCommandBuilder()
    .setName("resultado")
    .setDescription("Busca o resultado completo de um PIN.")
    .addStringOption((opt) =>
      opt.setName("pin").setDescription("PIN do scan").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Interrompe polling. Sem pin = interrompe todas as sessões.")
    .addStringOption((opt) =>
      opt.setName("pin").setDescription("PIN específico (opcional)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Mostra logs recentes.")
    .addIntegerOption((opt) =>
      opt.setName("linhas").setDescription("Quantidade (1..100)").setRequired(false)
    ),
].map((c) => c.toJSON());

async function deployCommands() {
  if (!DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    console.error("ERRO: Para deploy, defina DISCORD_CLIENT_ID e DISCORD_GUILD_ID no .env");
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: commands }
  );
  console.log("Slash commands registrados no guild!");
}

if (MODE === "deploy") {
  deployCommands()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("Falha ao registrar comandos:", e);
      process.exit(1);
    });
  return;
}

// ============================
// Persistência (5) + Logs (6)
// ============================
const DATA_DIR = path.join(__dirname, "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const LOGS_FILE = path.join(DATA_DIR, "logs.jsonl");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const LOG_BUFFER_MAX = 500; // simples: últimos 500 logs em memória
const logBuffer = [];

function writeLog(level, msg, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };

  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();

  try {
    fs.appendFileSync(LOGS_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (e) {
    // evita loop infinito de log
    console.error("Falha ao gravar LOGS_FILE:", e);
  }
}

function getLastLogs(n = 20) {
  const limit = Math.max(1, Math.min(Number(n) || 20, 100));
  return logBuffer.slice(-limit);
}

// ============================
// Echo API (igual ao seu antigo, só com axios.create e timeout)
// ============================
const echoApi = axios.create({
  baseURL: "https://api.echo.ac/v1",
  timeout: 10000,
  headers: { Authorization: ECHO_API_KEY },
});

const getPin = () => echoApi.get("/user/pin");
const getScanByPin = (pin) => echoApi.get(`/scan/${encodeURIComponent(pin)}`);
const getScanByUUID = (uuid) => echoApi.get(`/scan/${encodeURIComponent(uuid)}`);

// ============================
// Helpers (IGUAL ao seu antigo)
// ============================
const calcularDiferencaDiasEData = (data) => {
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

const linksSteam = (contas) => {
  return contas
    .map((conta) => {
      const [_, steamId64, nome] = conta.split(":");
      return `[${nome}](https://steamcommunity.com/profiles/${steamId64})`;
    })
    .join("\n");
};

const diagnosticoScan = (traces) => {
  return traces
    .map((trace) => {
      return `**Gravidade**: \`${trace.in_instance}\`\n**Descrição**: ${trace.name}`;
    })
    .join("\n\n");
};

const gerarStartTimeFormatado = (start_time) => {
  const chavesDesejadas = ["dps", "pca", "dgt", "sys", "explorer"];

  const formatarTimestamp = (timestamp) => {
    const date = new Date(timestamp * 1000); // segundos → ms
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  return chavesDesejadas
    .map((chave) => {
      const ts = start_time[chave];
      const dataFormatada = ts > 0 ? formatarTimestamp(ts) : "N/A";
      return `**${chave.toUpperCase()}**: ${dataFormatada}`;
    })
    .join("\n");
};

// ============================
// getScanDataComplete (IGUAL ao seu antigo)
// ============================
const getScanDataComplete = async (pin) => {
  const responsePin = await getScanByPin(pin);

  if (responsePin.status !== 200 || !responsePin.data[0]) {
    throw new Error("Não foi possível obter o scan pelo pin.");
  }

  if (responsePin.data[0].game !== "GTA-V RP") {
    throw new Error("Jogo incompatível ou scan não disponível.");
  }

  const uuid = responsePin.data[0].uuid;
  const responseUUID = await getScanByUUID(uuid);

  if (responseUUID.status !== 200 || responseUUID.data.game !== "GTA-V RP") {
    throw new Error("Detalhes do scan não encontrados.");
  }

  const scanInfo = responseUUID.data;

  const formatacao = calcularDiferencaDiasEData(scanInfo.installationDate);
  const lixeira = calcularDiferencaDiasEData(scanInfo.recycleBinModified);
  const steams = linksSteam(scanInfo.accounts);
  const deteccoesFormatadas = diagnosticoScan(scanInfo.traces);
  const startTimeFormatado = gerarStartTimeFormatado(scanInfo.start_time);

  return {
    color: 0x0099ff,
    title: "Informações do Scan",
    description: [
      `**Resultado:** ${scanInfo.detection}`,
      `**Pin:** ${scanInfo.pin}`,
      `**Duração:** ${scanInfo.speed ? `${(scanInfo.speed / 60000).toFixed(2)} minutos` : "N/A"}`,
      `**Steams:** ${steams || "N/A"}`,
      `**Lixeira:** ${lixeira.diffDias} dias (${lixeira.dataFormatada})`,
      `**Formatação:** ${formatacao.diffDias} dias (${formatacao.dataFormatada})`,
      `**Detecção:**\n${deteccoesFormatadas}`,
      `**Start Time:**\n${startTimeFormatado}`,
    ].join("\n"),
  };
};

// ============================
// Sessões concorrentes (um canal só) + status editável (4) + persistência (5)
// ============================
// Cada sessão = 1 pin e 1 mensagem de status que é editada.
// Persistimos: pin, channelId, messageId, userId, createdAt
const sessions = new Map(); // pin -> { pin, channelId, messageId, userId, createdAt, stop }

function saveSessionsToDisk() {
  try {
    const arr = [...sessions.values()].map((s) => ({
      pin: s.pin,
      channelId: s.channelId,
      messageId: s.messageId,
      userId: s.userId,
      createdAt: s.createdAt,
    }));
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(arr, null, 2), "utf8");
  } catch (e) {
    writeLog("error", "Falha ao salvar sessions.json", { error: String(e) });
  }
}

function loadSessionsFromDisk() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const raw = fs.readFileSync(SESSIONS_FILE, "utf8");
    if (!raw.trim()) return;

    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;

    for (const s of arr) {
      if (!s?.pin || !s?.channelId || !s?.messageId) continue;
      sessions.set(s.pin, {
        pin: s.pin,
        channelId: s.channelId,
        messageId: s.messageId,
        userId: s.userId || null,
        createdAt: s.createdAt || Date.now(),
        stop: false,
      });
    }

    writeLog("info", "Sessões carregadas do disco", { count: sessions.size });
  } catch (e) {
    writeLog("error", "Falha ao carregar sessions.json", { error: String(e) });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function editStatusMessage(client, session, content, embed) {
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(session.messageId).catch(() => null);
  if (!msg) return;

  if (embed) {
    await msg.edit({ content, embeds: [embed] }).catch(() => null);
  } else {
    await msg.edit({ content, embeds: [] }).catch(() => null);
  }
}

// POLLING (mesma ideia do seu antigo, só que por sessão e editando msg)
async function runPollingSession(client, session) {
  writeLog("info", "Sessão iniciada", { pin: session.pin });

  // mensagem inicial (mantém comportamento do seu antigo: PIN + link já foi enviado antes)
  await editStatusMessage(
    client,
    session,
    "Iniciando polling da API a cada 30 segundos..."
  );

  while (!session.stop) {
    try {
      const response = await getScanByPin(session.pin);

      if (response.status === 200 && response.data.length > 0) {
        try {
          const embed = await getScanDataComplete(session.pin);

          // Em vez de enviar outra mensagem, editamos a mesma com o resultado (melhoria 4)
          await editStatusMessage(
            client,
            session,
            "✅ Resultado obtido!",
            embed
          );

          sessions.delete(session.pin);
          saveSessionsToDisk();
          writeLog("info", "Sessão concluída", { pin: session.pin });
          return;
        } catch (e) {
          // scan ainda não está completo, continua polling (igual ao seu antigo)
        }
      }

      await sleep(30000);
    } catch (error) {
      // manter lógica do seu antigo: tratar 429 sem "erro crítico"
      if (error.response?.status === 429) {
        // no seu antigo você lia retry-after mas não usava; aqui mantemos o comportamento (não altera ritmo)
        writeLog("warn", "Rate limited (429) no polling", { pin: session.pin });
      } else {
        writeLog("error", "Erro no polling da API", {
          pin: session.pin,
          error: error?.message || String(error),
        });
      }

      await sleep(30000);
    }
  }

  // Se foi interrompida
  await editStatusMessage(client, session, "Polling interrompido com sucesso.");
  sessions.delete(session.pin);
  saveSessionsToDisk();
  writeLog("info", "Sessão interrompida", { pin: session.pin });
}

// ============================
// Discord Client (slash commands) (9)
// ============================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", async () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  writeLog("info", "Bot pronto", { tag: client.user.tag });

  // Retoma sessões persistidas (5)
  loadSessionsFromDisk();

  for (const session of sessions.values()) {
    runPollingSession(client, session).catch((e) => {
      writeLog("error", "Sessão falhou ao retomar", { pin: session.pin, error: String(e) });
      sessions.delete(session.pin);
      saveSessionsToDisk();
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /echo
  if (interaction.commandName === "echo") {
    await interaction.deferReply({ ephemeral: false });

    try {
      const response = await getPin();
      if (response.status !== 200) {
        await interaction.editReply("Erro ao obter o pin da API.");
        return;
      }

      const pin = response.data.pin;
      const link = response.data.links?.fivem || "Link não disponível";

      // Mantém exatamente a mesma mensagem do seu antigo:
      // "Seu pin é: {pin}\n{link}"
      const msg = await interaction.followUp(`Seu pin é: ${pin}\n${link}`);

      // cria sessão persistida
      const session = {
        pin,
        channelId: interaction.channelId,
        messageId: msg.id,   // (4) esta mensagem será editada com status e depois com embed final
        userId: interaction.user.id,
        createdAt: Date.now(),
        stop: false,
      };

      sessions.set(pin, session);
      saveSessionsToDisk();

      // "reply principal" só confirma (não muda comportamento visível, só evita "This interaction failed")
      await interaction.editReply("✅ OK");

      // dispara polling concorrente
      runPollingSession(client, session).catch((e) => {
        writeLog("error", "Sessão de polling falhou", { pin, error: String(e) });
        sessions.delete(pin);
        saveSessionsToDisk();
      });
    } catch (error) {
      await interaction.editReply(`Erro ao chamar a API: ${error.message}`);
      writeLog("error", "Falha no /echo", { error: error?.message || String(error) });
    }

    return;
  }

  // /resultado pin (igual ao seu antigo)
  if (interaction.commandName === "resultado") {
    const pin = interaction.options.getString("pin", true);

    try {
      const embed = await getScanDataComplete(pin);
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply("Ocorreu um erro ao buscar o resultado: " + error.message);
    }

    return;
  }

  // /stop [pin] (igual ao seu antigo, mas agora para sessões concorrentes)
  if (interaction.commandName === "stop") {
    const pin = interaction.options.getString("pin", false);

    if (!pin) {
      // Para todas
      for (const s of sessions.values()) s.stop = true;
      saveSessionsToDisk();
      await interaction.reply("Polling interrompido com sucesso.");
      return;
    }

    const s = sessions.get(pin);
    if (!s) {
      await interaction.reply("Nenhum polling ativo no momento.");
      return;
    }

    s.stop = true;
    saveSessionsToDisk();
    await interaction.reply("Polling interrompido com sucesso.");
    return;
  }

  // /logs (6) — logs por comando no canal
  if (interaction.commandName === "logs") {
    const linhas = interaction.options.getInteger("linhas") ?? 20;
    const rows = getLastLogs(linhas);

    const text = rows
      .map((r) => {
        const meta = Object.entries(r)
          .filter(([k]) => !["ts", "level", "msg"].includes(k))
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(" ");
        return `${r.ts} [${r.level}] ${r.msg}${meta ? " " + meta : ""}`;
      })
      .join("\n");

    // resposta curta e sem frescura
    await interaction.reply({
      content: "```txt\n" + (text.length ? text.slice(0, 1800) : "Sem logs no buffer.") + "\n```",
      ephemeral: true,
    });
    return;
  }
});

// Exporta rota HTTP simples, se usar este arquivo numa API (igual ao seu antigo)
module.exports = (req, res) => {
  res.status(200).send("Bot está rodando e a API está acessível!");
};

client.login(DISCORD_BOT_TOKEN);
