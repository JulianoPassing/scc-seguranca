require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ECHO_API_KEY = process.env.ECHO_API_KEY;

// Validação das variáveis de ambiente
if (!DISCORD_BOT_TOKEN) {
    console.error("ERRO: DISCORD_BOT_TOKEN não está definido no arquivo .env");
    process.exit(1);
}

if (!ECHO_API_KEY) {
    console.error("ERRO: ECHO_API_KEY não está definido no arquivo .env");
    process.exit(1);
}

let pollingInterval = null;
let currentPin = null;

const axiosConfig = {
    headers: { Authorization: ECHO_API_KEY },
};

const getPin = () =>
    axios.get("https://api.echo.ac/v1/user/pin", axiosConfig);

const getScanByPin = (pin) =>
    axios.get(`https://api.echo.ac/v1/scan/${pin}`, axiosConfig);

const getScanByUUID = (uuid) =>
    axios.get(`https://api.echo.ac/v1/scan/${uuid}`, axiosConfig);

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

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.on("clientReady", () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();

    if (content === "/echo") {
        if (pollingInterval) {
            await message.channel.send("Polling já está ativo!");
            return;
        }

        try {
            const response = await getPin();
            if (response.status === 200) {
                currentPin = response.data.pin;
                const link = response.data.links?.fivem || "Link não disponível";
                
                // Envia apenas uma mensagem com o PIN e o link
                await message.channel.send(`Seu pin é: ${currentPin}\n${link}`);
            } else {
                await message.channel.send("Erro ao obter o pin da API.");
                return;
            }
        } catch (error) {
            await message.channel.send(`Erro ao chamar a API: ${error.message}`);
            return;
        }

        await message.channel.send("Iniciando polling da API a cada 30 segundos...");

        pollingInterval = setInterval(async () => {
            if (!currentPin) {
                clearInterval(pollingInterval);
                pollingInterval = null;
                return;
            }

            try {
                const response = await getScanByPin(currentPin);

                if (response.status === 200 && response.data.length > 0) {
                    // Verifica se o scan está completo tentando obter os dados completos
                    try {
                        const embed = await getScanDataComplete(currentPin);
                        await message.channel.send({ embeds: [embed] });

                        clearInterval(pollingInterval);
                        pollingInterval = null;
                        currentPin = null; // Limpa o pin após enviar o resultado
                    } catch (error) {
                        // Scan ainda não está completo, aguarda próxima verificação
                        // Não precisa fazer nada, apenas continua o polling
                    }
                }
            } catch (error) {
                // Trata erro 429 (Rate Limited) - não loga como erro crítico
                if (error.response?.status === 429) {
                    const retryAfter = error.response?.headers?.['retry-after'] || 60;
                    // API está limitando requisições, aguarda próxima verificação normal (30s)
                    // O intervalo de 30s já é suficiente para não sobrecarregar
                } else {
                    // Loga apenas erros não relacionados a rate limit
                    console.error("Erro no polling da API:", error.message || error);
                }
            }
        }, 30000);
    }

    else if (content.startsWith("/resultado")) {
        const parts = content.split(" ");
        if (parts.length < 2) {
            await message.channel.send("Por favor, informe o pin após o comando. Exemplo: /resultado ABC123");
            return;
        }
        const pin = parts[1];

        try {
            const embed = await getScanDataComplete(pin);
            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            await message.channel.send("Ocorreu um erro ao buscar o resultado: " + error.message);
        }
    }

    else if (content === "/stop") {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            await message.channel.send("Polling interrompido com sucesso.");
        } else {
            await message.channel.send("Nenhum polling ativo no momento.");
        }
    }
});

// Exporta rota HTTP simples, se usar este arquivo numa API
module.exports = (req, res) => {
    res.status(200).send("Bot está rodando e a API está acessível!");
};

client.login(DISCORD_BOT_TOKEN);
