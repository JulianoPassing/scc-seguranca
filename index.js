require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const axios = require("axios");

const {
  DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  ECHO_API_KEY,
  ADMIN_ID,
} = process.env;

if (!DISCORD_BOT_TOKEN) {
  console.error("ERRO: DISCORD_BOT_TOKEN não está definido no arquivo .env");
  process.exit(1);
}
if (!ECHO_API_KEY) {
  console.error("ERRO: ECHO_API_KEY não está definido no arquivo .env");
  process.exit(1);
}

const MODE = process.argv[2];

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
    .setDescription("Interrompe polling. Sem pin = interrompe todos.")
    .addStringOption((opt) =>
      opt.setName("pin").setDescription("PIN específico (opcional)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("start")
    .setDescription("Reinicia polling de um PIN.")
    .addStringOption((opt) =>
      opt.setName("pin").setDescription("PIN do scan").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Mostra pollings ativos."),
].map((c) => c.toJSON());

async function deployCommands() {
  if (!DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    console.error("ERRO: defina DISCORD_CLIENT_ID e DISCORD_GUILD_ID no .env");
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: commands }
  );
  console.log("Slash commands registrados no servidor!");
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

const axiosConfig = { headers: { Authorization: ECHO_API_KEY } };
const activePollings = new Map();

function formatApiError(error) {
  const status = error.response?.status;
  const apiMessage = error.response?.data?.message;

  if (status === 403) {
    return apiMessage || "API Echo recusou acesso (403). Verifique se ECHO_API_KEY no .env está correta e ativa em dash.echo.ac.";
  }
  if (status === 401) {
    return apiMessage || "API Echo não autorizou (401). ECHO_API_KEY inválida ou ausente.";
  }
  if (status === 429) {
    return apiMessage || "API Echo limitou requisições (429). Aguarde alguns minutos e tente novamente.";
  }
  return apiMessage || error.message || String(error);
}

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
    }
  );
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

const linksSteam = (contas) => {
  if (!Array.isArray(contas) || contas.length === 0) {
    return "Nenhuma conta Steam encontrada.";
  }

  return contas
    .map((conta) => {
      const [_, steamId64, nome] = conta.split(":");
      return `[${nome || "Desconhecido"}](https://steamcommunity.com/profiles/${steamId64 || "0"})`;
    })
    .join("\n");
};

const diagnosticoScan = (traces) => {
  if (!Array.isArray(traces) || traces.length === 0) {
    return "Nenhuma detecção encontrada.";
  }

  return traces
    .map(
      (trace) =>
        `**Gravidade**: \`${trace?.in_instance || "Desconhecido"}\`\n**Descrição**: ${trace?.name || "Sem nome"}`
    )
    .join("\n\n");
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

const getScanDataComplete = async (pin) => {
  const responsePin = await getScanByPin(pin);
  if (
    responsePin.status !== 200 ||
    !responsePin.data[0] ||
    responsePin.data[0].game !== "GTA-V RP"
  ) {
    throw new Error("PIN inválido ou sem dados disponíveis.");
  }

  const uuid = responsePin.data[0].uuid;
  const responseUUID = await getScanByUUID(uuid);
  const scanInfo = responseUUID.data;

  await tornarScanPublico(uuid).catch(() => {});

  const formatacao = calcularDiferencaDiasEData(
    scanInfo.results.info.installationDate
  );
  const lixeira = calcularDiferencaDiasEData(
    scanInfo.results.info.recycleBinModified
  );
  const steams = linksSteam(scanInfo.accounts);
  const deteccoesFormatadas = diagnosticoScan(scanInfo.results.traces);
  const startTimeFormatado = gerarStartTimeFormatado(
    scanInfo.results.start_time
  );

  return new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Informações do Scan")
    .setDescription(
      [
        `**Resultado:** ${scanInfo.detection}`,
        `**Pin:** ${scanInfo.pin}`,
        `**Duração:** ${scanInfo.results.info.speed ? `${(scanInfo.results.info.speed / 60000).toFixed(2)} minutos` : "N/A"}`,
        `**Steams:** ${steams || "N/A"}`,
        `**Lixeira:** ${lixeira.diffDias} dias (${lixeira.dataFormatada})`,
        `**Formatação:** ${formatacao.diffDias} dias (${formatacao.dataFormatada})`,
        `**Detecção:**\n${deteccoesFormatadas}`,
        `**Start Time:**\n${startTimeFormatado}`,
        `**Link Completo:** [Ver Mais](https://scan.echo.ac/${scanInfo.uuid})`,
      ].join("\n")
    );
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const sendErrorDM = async (errorMsg) => {
  if (!client.isReady() || !ADMIN_ID) return;
  try {
    const msgString = String(errorMsg).substring(0, 1900);
    const user = await client.users.fetch(ADMIN_ID);
    await user.send(`**⚠️ Log do Bot:**\n\`\`\`\n${msgString}\n\`\`\``);
  } catch (dmError) {
    console.error("Erro ao enviar DM:", dmError);
  }
};

const logError = async (errorMsg) => {
  console.error(errorMsg);
  await sendErrorDM(errorMsg);
};

const notifyError = async (channel, errorMsg) => {
  await logError(errorMsg);
  if (channel?.send) {
    await channel.send(`❌ Erro: ${String(errorMsg).slice(0, 1800)}`).catch(() => {});
  }
};

function startPolling(channel, pin) {
  if (activePollings.has(pin)) {
    return `Polling já está ativo para o PIN ${pin}.`;
  }

  const intervalId = setInterval(async () => {
    try {
      const res = await getScanByPin(pin);
      if (res.status === 200 && res.data.length > 0) {
        const embed = await getScanDataComplete(pin);
        await channel.send({ embeds: [embed] });
        clearInterval(activePollings.get(pin));
        activePollings.delete(pin);
        await channel.send(`Polling finalizado para o PIN ${pin}.`);
      }
    } catch (err) {
      await notifyError(channel, `Erro no polling do PIN ${pin}: ${formatApiError(err)}`);
    }
  }, 30000);

  activePollings.set(pin, intervalId);
  return null;
}

async function runEcho(channel) {
  let response;
  try {
    response = await getPin();
  } catch (error) {
    throw new Error(formatApiError(error));
  }

  if (response.status !== 200) {
    throw new Error("Erro ao obter o PIN da API.");
  }

  const pin = response.data.pin;
  const link = response.data.links?.fivem || "Link não disponível";

  const alreadyActive = startPolling(channel, pin);
  if (alreadyActive) {
    return alreadyActive;
  }

  await channel.send(`Novo PIN: ${pin}\n${link}`);
  await channel.send(`Iniciando polling para o PIN ${pin}...`);
  return null;
}

async function runResultado(channel, pin) {
  const embed = await getScanDataComplete(pin);
  await channel.send({ embeds: [embed] });
}

async function runStop(pin) {
  if (!pin) {
    if (activePollings.size === 0) {
      return "Nenhum polling ativo.";
    }
    activePollings.forEach(clearInterval);
    activePollings.clear();
    return "Todos os pollings foram interrompidos.";
  }

  if (!activePollings.has(pin)) {
    return `Nenhum polling ativo para o PIN ${pin}.`;
  }

  clearInterval(activePollings.get(pin));
  activePollings.delete(pin);
  return `Polling interrompido para o PIN ${pin}.`;
}

async function runStart(channel, pin) {
  const alreadyActive = startPolling(channel, pin);
  if (alreadyActive) {
    return alreadyActive;
  }

  await channel.send(`Reiniciando polling para o PIN ${pin}...`);
  return null;
}

function runStatus() {
  if (activePollings.size === 0) {
    return "Nenhum polling está ativo no momento.";
  }

  const pins = Array.from(activePollings.keys())
    .map((p) => `• ${p}`)
    .join("\n");
  return `📡 Pollings ativos:\n${pins}`;
}

let readyHandled = false;
function onReady() {
  if (readyHandled) return;
  readyHandled = true;
  console.log(`✅ Bot conectado como ${client.user.tag}`);
}

client.once("ready", onReady);
client.once("clientReady", onReady);

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const channel = interaction.channel;
  if (!channel) {
    await interaction.reply({ content: "Canal inválido.", ephemeral: true });
    return;
  }

  try {
    if (interaction.commandName === "echo") {
      await interaction.deferReply();
      const msg = await runEcho(channel);
      await interaction.editReply(msg || "✅ PIN gerado. Acompanhe as mensagens abaixo.");
      return;
    }

    if (interaction.commandName === "resultado") {
      const pin = interaction.options.getString("pin", true);
      await interaction.deferReply();
      await runResultado(channel, pin);
      await interaction.editReply("✅ Resultado enviado abaixo.");
      return;
    }

    if (interaction.commandName === "stop") {
      const pin = interaction.options.getString("pin", false);
      const msg = await runStop(pin);
      await interaction.reply(msg);
      return;
    }

    if (interaction.commandName === "start") {
      const pin = interaction.options.getString("pin", true);
      await interaction.deferReply();
      const msg = await runStart(channel, pin);
      await interaction.editReply(msg || `✅ Polling reiniciado para ${pin}.`);
      return;
    }

    if (interaction.commandName === "status") {
      await interaction.reply(runStatus());
    }
  } catch (error) {
    const msg = formatApiError(error);
    await logError(msg);
    const reply = interaction.deferred || interaction.replied
      ? interaction.editReply.bind(interaction)
      : interaction.reply.bind(interaction);
    await reply(`❌ Erro: ${msg}`).catch(() => {});
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content) return;

  const content = message.content.trim();
  const parts = content.split(/\s+/);
  const command = parts[0];

  try {
    if (command === "/echo") {
      const msg = await runEcho(message.channel);
      if (msg) await message.channel.send(msg);
      return;
    }

    if (command === "/resultado") {
      if (parts.length < 2) return;
      await runResultado(message.channel, parts[1]);
      return;
    }

    if (command === "/stop") {
      const msg = await runStop(parts[1]);
      await message.channel.send(msg);
      return;
    }

    if (command === "/start") {
      if (parts.length < 2) {
        await message.channel.send("Uso: `/start <pin>`");
        return;
      }
      const msg = await runStart(message.channel, parts[1]);
      if (msg) await message.channel.send(msg);
      return;
    }

    if (command === "/status") {
      await message.channel.send(runStatus());
    }
  } catch (error) {
    await notifyError(message.channel, formatApiError(error));
  }
});

module.exports = (req, res) => {
  res.status(200).send("Bot está rodando e a API está acessível!");
};

process.on("uncaughtException", async (err) => {
  console.error("Erro Fatal (uncaughtException):", err);
  await sendErrorDM(`Erro Fatal: ${err.message}\n${err.stack}`);
});

process.on("unhandledRejection", async (reason) => {
  console.error("Rejeição não tratada (unhandledRejection):", reason);
  await sendErrorDM(`Rejeição não tratada: ${reason}`);
});

client.login(DISCORD_BOT_TOKEN);
