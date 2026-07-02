require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
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

// Múltiplos pollings ativos: { pin: intervalId }
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
        `**Gravidade**: \`${trace?.in_instance || "Desconhecido"}\`\n**Descrição**: ${trace?.name || "Sem nome"}`,
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

  if (!scanInfo || !scanInfo.results) {
    throw new Error("Dados do scan incompletos ou em processamento.");
  }

  // Torna o scan público automaticamente
  await tornarScanPublico(uuid).catch(() => {});

  const formatacao = calcularDiferencaDiasEData(
    scanInfo.results.info?.installationDate,
  );
  const lixeira = calcularDiferencaDiasEData(
    scanInfo.results.info?.recycleBinModified,
  );
  const steams = linksSteam(scanInfo.accounts);
  const deteccoesFormatadas = diagnosticoScan(scanInfo.results.traces);
  const startTimeFormatado = gerarStartTimeFormatado(
    scanInfo.results.start_time,
  );

  return new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Informações do Scan")
    .setDescription([
      `**Resultado:** ${scanInfo.detection || "N/A"}`,
      `**Pin:** ${scanInfo.pin || pin}`,
      `**Duração:** ${scanInfo.results.info?.speed ? `${(scanInfo.results.info.speed / 60000).toFixed(2)} minutos` : "N/A"}`,
      `**Steams:** ${steams || "N/A"}`,
      `**Lixeira:** ${lixeira.diffDias} dias (${lixeira.dataFormatada})`,
      `**Formatação:** ${formatacao.diffDias} dias (${formatacao.dataFormatada})`,
      `**Detecção:**\n${deteccoesFormatadas}`,
      `**Start Time:**\n${startTimeFormatado}`,
      `**Link Completo:** [Ver Mais](https://scan.echo.ac/${scanInfo.uuid || uuid})`,
    ].join("\n"));
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
  if (!client.isReady()) return; // Não envia se o bot ainda não logou
  try {
    const msgString = String(errorMsg).substring(0, 1900); // Evita limite de 2000 chars do Discord
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

        if (activePollings.has(pin)) {
          await message.channel.send(
            `Polling já está ativo para o PIN ${pin}.`,
          );
          return;
        }

        await message.channel.send(`Novo PIN: ${pin}\n${link}`);
        await message.channel.send(`Iniciando polling para o PIN ${pin}...`);

        const intervalId = setInterval(async () => {
          try {
            const res = await getScanByPin(pin);
            if (res.status === 200 && res.data && res.data.length > 0) {
              // Cancela o polling logo que encontrar dados para evitar loops de erro no embed
              clearInterval(activePollings.get(pin));
              activePollings.delete(pin);

              const uuid = res.data[0].uuid;
              if (res.data[0].game !== "GTA-V RP") {
                await sendErrorDM(`O jogo detectado no PIN ${pin} não é GTA-V RP.`);
                return;
              }

              const embed = await getScanDataComplete(pin, uuid);
              await message.channel.send({ embeds: [embed] });
              await message.channel.send(
                `Polling finalizado para o PIN ${pin}.`,
              );
            }
          } catch (err) {
            console.error(`Erro no polling do PIN ${pin}:`, err);
            clearInterval(activePollings.get(pin));
            activePollings.delete(pin);
            await sendErrorDM(`Erro no polling do PIN ${pin}: ${err.stack || err.message || err}`);
          }
        }, 30000);

        activePollings.set(pin, intervalId);
      } else {
        await sendErrorDM("Erro ao obter o PIN da API.");
      }
    } catch (error) {
      await sendErrorDM("Erro: " + error.message);
    }
  }

  // Comando: /resultado <pin>
  else if (command === "/resultado") {
    if (parts.length < 2) {
      return;
    }
    const pin = parts[1];
    try {
      const embed = await getScanDataComplete(pin);
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
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
      activePollings.forEach(clearInterval);
      activePollings.clear();
      await message.channel.send("Todos os pollings foram interrompidos.");
    } else {
      const pin = parts[1];
      if (activePollings.has(pin)) {
        clearInterval(activePollings.get(pin));
        activePollings.delete(pin);
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

    const pin = parts[1];

    if (activePollings.has(pin)) {
      await message.channel.send(`Polling já está ativo para o PIN ${pin}.`);
      return;
    }

    await message.channel.send(`Reiniciando polling para o PIN ${pin}...`);

    const intervalId = setInterval(async () => {
      try {
        const res = await getScanByPin(pin);
        if (res.status === 200 && res.data && res.data.length > 0) {
          // Cancela o polling assim que encontrar dados
          clearInterval(activePollings.get(pin));
          activePollings.delete(pin);

          const uuid = res.data[0].uuid;
          if (res.data[0].game !== "GTA-V RP") {
            await sendErrorDM(`O jogo detectado no PIN ${pin} não é GTA-V RP.`);
            return;
          }

          const embed = await getScanDataComplete(pin, uuid);
          await message.channel.send({ embeds: [embed] });
          await message.channel.send(`Polling finalizado para o PIN ${pin}.`);
        }
      } catch (err) {
        console.error(`Erro no polling do PIN ${pin}:`, err);
        clearInterval(activePollings.get(pin));
        activePollings.delete(pin);
        await sendErrorDM(`Erro no polling do PIN ${pin}: ${err.stack || err.message || err}`);
      }
    }, 30000);

    activePollings.set(pin, intervalId);
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