const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

// Configurações
const DISCORD_BOT_TOKEN = "SEU_TOKEN_AQUI";
const ECHO_API_KEY = "HLuY3TkWaQWm6r735cHCw.vfkXoZcrcj43vWsgJNd5hLYakB3ZbjuGwKvVFm6EPZMb";
const axiosConfig = { headers: { Authorization: ECHO_API_KEY } };

// Múltiplos pollings ativos: { pin: intervalId }
const activePollings = new Map();

// Utilitários
const getPin = () => axios.get("https://api.echo.ac/v1/user/pin", axiosConfig);
const getScanByPin = (pin) => axios.get(`https://api.echo.ac/v1/scan/${pin}`, axiosConfig);
const getScanByUUID = (uuid) => axios.get(`https://api.echo.ac/v1/scan/${uuid}`, axiosConfig);

const calcularDiferencaDiasEData = (data) => {
    if (!data || typeof data !== "string" || !data.includes("T")) {
        return {
            diffDias: "N/A",
            dataFormatada: "Data indisponível"
        };
    }

    const dataFormatada = data.split("T")[0];
    const [ano, mes, dia] = dataFormatada.split("-");
    const dataAlvo = new Date(ano, mes - 1, dia);
    const diffMs = Date.now() - dataAlvo.getTime();
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return {
        diffDias,
        dataFormatada: `${dia}/${mes}/${ano}`
    };
};

const linksSteam = (contas) => {
    if (!Array.isArray(contas) || contas.length === 0) {
        return "Nenhuma conta Steam encontrada.";
    }

    return contas.map(conta => {
        const [_, steamId64, nome] = conta.split(":");
        return `[${nome || "Desconhecido"}](https://steamcommunity.com/profiles/${steamId64 || "0"})`;
    }).join("\n");
};

const diagnosticoScan = (traces) => {
    if (!Array.isArray(traces) || traces.length === 0) {
        return "Nenhuma detecção encontrada.";
    }

    return traces.map(trace =>
        `**Gravidade**: \`${trace?.in_instance || "Desconhecido"}\`\n**Descrição**: ${trace?.name || "Sem nome"}`
    ).join("\n\n");
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

    return chavesDesejadas.map(chave => {
        const ts = start_time[chave];
        return `**${chave.toUpperCase()}**: ${formatarTimestamp(ts)}`;
    }).join("\n");
};


const getScanDataComplete = async (pin) => {
    const responsePin = await getScanByPin(pin);
    if (responsePin.status !== 200 || !responsePin.data[0] || responsePin.data[0].game !== "GTA-V RP") {
        throw new Error("PIN inválido ou sem dados disponíveis.");
    }

    const uuid = responsePin.data[0].uuid;
    const responseUUID = await getScanByUUID(uuid);
    const scanInfo = responseUUID.data;

    const formatacao = calcularDiferencaDiasEData(scanInfo.results.info.installationDate);
    const lixeira = calcularDiferencaDiasEData(scanInfo.results.info.recycleBinModified);
    const steams = linksSteam(scanInfo.accounts);
    const deteccoesFormatadas = diagnosticoScan(scanInfo.results.traces);
    const startTimeFormatado = gerarStartTimeFormatado(scanInfo.results.start_time);

    return {
        color: 0x0099ff,
        title: "Informações do Scan",
        description: [
            `**Resultado:** ${scanInfo.detection}`,
            `**Pin:** ${scanInfo.pin}`,
            `**Duração:** ${scanInfo.results.info.speed ? `${(scanInfo.results.info.speed / 60000).toFixed(2)} minutos` : "N/A"}`,
            `**Steams:** ${steams || "N/A"}`,
            `**Lixeira:** ${lixeira.diffDias} dias (${lixeira.dataFormatada})`,
            `**Formatação:** ${formatacao.diffDias} dias (${formatacao.dataFormatada})`,
            `**Detecção:**\n${deteccoesFormatadas}`,
            `**Start Time:**\n${startTimeFormatado}`,
            ` ** Link Completo:** [Ver Mais](https://scan.echo.ac/${scanInfo.uuid})`,
        ].join("\n"),
    };
};

// Inicializa cliente Discord
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

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
                    await message.channel.send(`Polling já está ativo para o PIN ${pin}.`);
                    return;
                }

                await message.channel.send(`Novo PIN: ${pin}\n${link}`);
                await message.channel.send(`Iniciando polling para o PIN ${pin}...`);

                const intervalId = setInterval(async () => {
                    try {
                        const res = await getScanByPin(pin);
                        if (res.status === 200 && res.data.length > 0) {
                            const embed = await getScanDataComplete(pin);
                            await message.channel.send({ embeds: [embed] });
                            clearInterval(activePollings.get(pin));
                            activePollings.delete(pin);
                            await message.channel.send(`Polling finalizado para o PIN ${pin}.`);
                        }
                    } catch (err) {
                        console.error(`Erro no polling do PIN ${pin}:`, err.message);
                    }
                }, 30000);

                activePollings.set(pin, intervalId);
            } else {
                await message.channel.send("Erro ao obter o PIN da API.");
            }
        } catch (error) {
            await message.channel.send("Erro: " + error.message);
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
            await message.channel.send("Erro ao buscar resultado: " + error.message);
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
                if (res.status === 200 && res.data.length > 0) {
                    const embed = await getScanDataComplete(pin);
                    await message.channel.send({ embeds: [embed] });
                    clearInterval(activePollings.get(pin));
                    activePollings.delete(pin);
                    await message.channel.send(`Polling finalizado para o PIN ${pin}.`);
                }
            } catch (err) {
                console.error(`Erro no polling do PIN ${pin}:`, err.message);
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
            .map(pin => `• ${pin}`)
            .join("\n");
        await message.channel.send(`📡 Pollings ativos:\n${pins}`);
    }
});

// Exporta rota HTTP opcional
module.exports = (req, res) => {
    res.status(200).send("Bot está rodando e a API está acessível!");
};

// Login do bot
client.login(DISCORD_BOT_TOKEN);
