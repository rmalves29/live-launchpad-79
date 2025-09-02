const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const RetrySystem = require('./retry-system');
const qrcode = require('qrcode-terminal'); // 🔹 QR no terminal (fallback)

// ===================== Manter sessão entre reinícios (não limpar por padrão) =====================
const authDir = path.join(__dirname, '.wwebjs_auth');
const wipeSession = process.env.WIPE_WWEB_SESSION === 'true';
if (wipeSession && fs.existsSync(authDir)) {
  console.log('🧹 Limpando sessão anterior por WIPE_WWEB_SESSION=true...');
  fs.rmSync(authDir, { recursive: true, force: true });
} else {
  console.log('🔐 Mantendo sessão do WhatsApp (para evitar re-login a cada reinício). Defina WIPE_WWEB_SESSION=true para limpar.');
}

// Tenta descobrir o executável do navegador no Windows/Linux/Mac
function resolveBrowserExecutable() {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH, // se você definir essa env, ela vence
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);

    for (const p of candidates) {
        try { if (fs.existsSync(p)) return p; } catch {}
    }
    return null; // deixa o Puppeteer decidir (usará o Chromium dele)
}
const BROWSER_EXECUTABLE = resolveBrowserExecutable();

// Classe de autenticação segura para contornar EBUSY/EPERM no Windows ao remover sessões
class SafeLocalAuth extends LocalAuth {
    async logout() {
        try {
            await super.logout();
        } catch (e) {
            const isBusy = e && (e.code === 'EBUSY' || e.code === 'EPERM');
            const fromLocalAuth = String(e?.message || '').includes('.wwebjs_auth');
            if (isBusy && fromLocalAuth) {
                console.warn('🛡️ SafeLocalAuth: erro EBUSY/EPERM ao remover sessão. Retentando...');
                for (let i = 0; i < 5; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    try {
                        await super.logout();
                        console.log('✅ SafeLocalAuth: Logout concluído após retry');
                        return;
                    } catch (err) {
                        if (!(err && (err.code === 'EBUSY' || err.code === 'EPERM'))) throw err;
                    }
                }
                console.warn('🚫 SafeLocalAuth: Mantendo pasta de sessão para evitar crash.');
                return; // não propaga
            }
            throw e; // outros erros seguem o fluxo normal
        }
    }
}

// Guardas globais para evitar crash do processo por EBUSY/EPERM durante logout
process.on('uncaughtException', (err) => {
    const isBusy = err && (err.code === 'EBUSY' || err.code === 'EPERM');
    const fromLocalAuth = String(err?.message || '').includes('.wwebjs_auth');
    if (isBusy && fromLocalAuth) {
        console.warn('🛡️ Ignorando exceção EBUSY/EPERM do LocalAuth (não crítico):', err.message);
        return;
    }
    console.error('❗ Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    const err = reason;
    const isBusy = err && (err.code === 'EBUSY' || err.code === 'EPERM');
    const fromLocalAuth = String(err?.message || '').includes('.wwebjs_auth');
    if (isBusy && fromLocalAuth) {
        console.warn('🛡️ Ignorando rejeição EBUSY/EPERM do LocalAuth (não crítico):', err.message || reason);
        return;
    }
    console.error('❗ Unhandled rejection:', reason);
});

const app = express();
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));
app.use(cors());

// 🔹 Atualizado para 6 instâncias
const instanceNames = ['instancia1'];
const clients = {};
const instanceStatus = {};
const instanceNumbers = {};
const logs = [];
const clientResponses = [];
const messageStatus = [];

// Sistema de rotação de instâncias por grupo
const groupInstanceMapping = new Map();
const instanceRotation = new Map();

// Função para configurar instâncias responsáveis por um grupo
function setGroupInstances(groupId, instanceList) {
    groupInstanceMapping.set(groupId, instanceList);
    instanceRotation.set(groupId, 0); // Inicializar rotação
    console.log(`🔄 Grupo ${groupId} configurado com instâncias: [${instanceList.join(', ')}]`);
}

// Função para obter próxima instância para um grupo específico
function getNextInstanceForGroup(groupId) {
    const instanceList = groupInstanceMapping.get(groupId);
    if (!instanceList || instanceList.length === 0) {
        console.log(`⚠️ Grupo ${groupId} não configurado. Usando sistema padrão.`);
        return getAvailableInstance();
    }
    const availableInstances = instanceList.filter(name => {
        const client = clients[name];
        const status = instanceStatus[name];
        return client && status === 'online' && instanceNumbers[name];
    });
    if (availableInstances.length === 0) {
        console.log(`❌ Nenhuma instância do grupo ${groupId} está online. Usando sistema padrão.`);
        return getAvailableInstance();
    }
    const currentIndex = instanceRotation.get(groupId) || 0;
    const selectedInstance = availableInstances[currentIndex % availableInstances.length];
    instanceRotation.set(groupId, currentIndex + 1);
    console.log(`🔄 Grupo ${groupId}: Selecionada ${selectedInstance} (${(currentIndex % availableInstances.length) + 1}/${availableInstances.length})`);
    return selectedInstance;
}

// ✅ Inicialização de grupos
function initializeGroupConfigurations() {
    // Exemplo:
    // setGroupInstances('120363123456789012@g.us', ['instancia1', 'instancia3', 'instancia5']);
    console.log('📋 Sistema de rotação de instâncias por grupo inicializado');
}

// Inicializar sistema de reenvio
const retrySystem = new RetrySystem();
retrySystem.setProcessCallback(async () => {
    await retrySystem.processRetryQueue(clients, instanceStatus, sendSingleMessage);
});

// Sistema de controle de duplicatas APRIMORADO
const sentMessagesControl = new Map();
const duplicateControlTimeout = 10 * 60 * 1000;
const messageQueue = new Set();

// NOVO: Sistema de monitoramento SEM reconexão automática
const instanceMonitoring = {
    healthCheckInterval: 15000, // 15 segundos
    maxHealthCheckFailures: 3,
    healthCheckTimers: {},
    failureCount: {},
    startMonitoring(instanceName) {
        console.log(`🔍 Iniciando monitoramento de ${instanceName}`);
        this.failureCount[instanceName] = 0;
        this.healthCheckTimers[instanceName] = setInterval(async () => {
            await this.performHealthCheck(instanceName);
        }, this.healthCheckInterval);
    },
    stopMonitoring(instanceName) {
        if (this.healthCheckTimers[instanceName]) {
            clearInterval(this.healthCheckTimers[instanceName]);
            delete this.healthCheckTimers[instanceName];
            console.log(`🛑 Monitoramento de ${instanceName} parado`);
        }
    },
    async performHealthCheck(instanceName) {
        try {
            const client = clients[instanceName];
            if (!client) {
                this.handleHealthCheckFailure(instanceName, 'Cliente não existe');
                return;
            }
            const healthPromise = this.checkClientHealth(client);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout no health check')), 10000)
            );
            const isHealthy = await Promise.race([healthPromise, timeoutPromise]);
            if (isHealthy) {
                this.handleHealthCheckSuccess(instanceName);
            } else {
                this.handleHealthCheckFailure(instanceName, 'Cliente não está saudável');
            }
        } catch (error) {
            this.handleHealthCheckFailure(instanceName, error.message);
        }
    },
    async checkClientHealth(client) {
        try {
            const state = await client.getState();
            return state === 'CONNECTED';
        } catch (error) {
            return false;
        }
    },
    handleHealthCheckSuccess(instanceName) {
        if (this.failureCount[instanceName] > 0) {
            console.log(`🎉 ${instanceName}: Recuperada após falhas`);
        }
        this.failureCount[instanceName] = 0;
        if (instanceStatus[instanceName] !== 'online') {
            instanceStatus[instanceName] = 'online';
            console.log(`✅ ${instanceName}: Status atualizado para online`);
        }
    },
    handleHealthCheckFailure(instanceName, reason) {
        this.failureCount[instanceName]++;
        console.log(`⚠️ ${instanceName}: Health check falhou (${this.failureCount[instanceName]}/${this.maxHealthCheckFailures}) - ${reason}`);
        if (this.failureCount[instanceName] >= this.maxHealthCheckFailures) {
            console.log(`❌ ${instanceName}: Máximo de falhas atingido - MARCANDO COMO OFFLINE PERMANENTE`);
            instanceStatus[instanceName] = 'offline';
            instanceNumbers[instanceName] = null;
            this.stopMonitoring(instanceName);
            if (clients[instanceName]) {
                try { clients[instanceName].destroy(); } catch (error) {
                    console.log(`⚠️ ${instanceName}: Erro ao destruir cliente - ${error.message}`);
                }
                delete clients[instanceName];
            }
            console.log(`🚫 ${instanceName}: Instância removida permanentemente do sistema`);
        }
    }
};

// Função com VERDADEIRO ROUND-ROBIN para distribuir entre instâncias
let roundRobinIndex = 0;
function getAvailableInstance() {
    const availableInstances = instanceNames.filter(name => {
        const client = clients[name];
        const status = instanceStatus[name];
        return client && status === 'online' && instanceNumbers[name];
    });
    if (availableInstances.length === 0) {
        console.log('⚠️ Nenhuma instância disponível no momento');
        return null;
    }
    const selectedInstance = availableInstances[roundRobinIndex % availableInstances.length];
    roundRobinIndex++;
    console.log(`🔄 ROUND-ROBIN: Selecionada ${selectedInstance} (${roundRobinIndex % availableInstances.length + 1}/${availableInstances.length})`);
    return selectedInstance;
}

// Funções de duplicidade
function createMessageControlKey(numero, mensagem) {
    const numeroLimpo = numero.replace(/\D/g, '');
    const mensagemNormalizada = mensagem.trim().toLowerCase();
    const mensagemHash = Buffer.from(mensagemNormalizada).toString('base64');
    return `${numeroLimpo}-${mensagemHash}`;
}
function isMessageDuplicate(numero, mensagem) {
    const controlKey = createMessageControlKey(numero, mensagem);
    const now = Date.now();
    if (messageQueue.has(controlKey)) {
        console.log(`🚫 DUPLICATA EM FILA BLOQUEADA: ${numero}`);
        return true;
    }
    if (sentMessagesControl.has(controlKey)) {
        const lastSent = sentMessagesControl.get(controlKey);
        if (now - lastSent < duplicateControlTimeout) {
            console.log(`🚫 DUPLICATA TEMPORAL BLOQUEADA: ${numero}`);
            return true;
        }
    }
    messageQueue.add(controlKey);
    return false;
}
function markMessageAsSent(numero, mensagem) {
    const controlKey = createMessageControlKey(numero, mensagem);
    const now = Date.now();
    sentMessagesControl.set(controlKey, now);
    messageQueue.delete(controlKey);
    if (sentMessagesControl.size > 5000) {
        const cutoffTime = now - duplicateControlTimeout;
        let cleaned = 0;
        for (const [key, timestamp] of sentMessagesControl.entries()) {
            if (timestamp < cutoffTime) {
                sentMessagesControl.delete(key);
                cleaned++;
            }
        }
        console.log(`🧹 Limpeza automática: ${cleaned} registros removidos`);
    }
}

// Sistema de reconexão simplificado (mantido)
const reconnectionConfig = { maxRetries: 5, retryDelay: 10000, healthCheckInterval: 15000 };
const instanceRetryCount = {};
const sentMessages = new Map();

const sendingRules = {
    defaultInterval: 2000,
    defaultBatchSize: 5,
    defaultBatchDelay: 3000,
    maxConcurrentSends: 1
};
let activeSendingProcesses = 0;

// Sistema de controle de pausa/despausar
const sendingControl = {
    isPaused: false,
    pauseRequested: false,
    activeProcesses: new Set(),
    pause() { this.pauseRequested = true; console.log('⏸️ PAUSA SOLICITADA - aguardando finalizações...'); },
    resume() { this.isPaused = false; this.pauseRequested = false; console.log('▶️ ENVIANDO DESPAUSADO - continuando envios...'); },
    async waitForPause() {
        if (this.pauseRequested && !this.isPaused) {
            this.isPaused = true;
            console.log('⏸️ ENVIO PAUSADO');
        }
        while (this.isPaused) { await delay(1000); }
    },
    getStatus() { return { isPaused: this.isPaused, pauseRequested: this.pauseRequested, activeProcesses: this.activeProcesses.size }; }
};

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Verificação de instância
async function verificarInstanciaFuncional(instanceName, client) {
    try {
        if (!client || !instanceName) return false;
        if (instanceStatus[instanceName] !== 'online') return false;
        const contextValid = await Promise.race([
            instanceMonitoring.checkClientHealth(client),
            new Promise(resolve => setTimeout(() => resolve(false), 5000))
        ]);
        if (!contextValid) {
            console.log(`💀 ${instanceName}: Contexto inválido - marcando como offline permanente`);
            instanceStatus[instanceName] = 'offline';
            instanceNumbers[instanceName] = null;
            instanceMonitoring.stopMonitoring(instanceName);
            return false;
        }
        return true;
    } catch (error) {
        console.log(`🔥 ${instanceName}: Erro na verificação - ${error.message}`);
        instanceStatus[instanceName] = 'offline';
        return false;
    }
}

// Criar cliente
function createClientWithConfig(instanceName) {
    console.log(`🆕 ${instanceName}: Criando cliente...`);
    return new Client({
        authStrategy: new SafeLocalAuth({
            clientId: instanceName,
            dataPath: path.join(__dirname, '.wwebjs_auth')
        }),
        puppeteer: {
            headless: false,
            executablePath: BROWSER_EXECUTABLE || undefined, // 🔹 força Chrome/Edge se encontrado
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--start-maximized',
                '--disable-features=VizDisplayCompositor'
            ],
            timeout: 120000
        },
        qrMaxRetries: 3,
        takeoverOnConflict: true
    });
}

// Sistema de números bloqueados
const blockedNumbers = new Set();

// Envio de mensagem
async function sendSingleMessage(instanceName, client, numero, mensagem, tempImagePath, messageId) {
    const numeroBase = numero.replace(/\D/g, '');
    let numeroFormatado = numeroBase;

    try {
        if (tempImagePath && fs.existsSync(tempImagePath)) {
            const media = MessageMedia.fromFilePath(tempImagePath);
            await client.sendMessage(`${numeroFormatado}@c.us`, media, { caption: mensagem });
        } else {
            await client.sendMessage(`${numeroFormatado}@c.us`, mensagem);
        }
        console.log('✅ Enviado com número original');
        sentMessages.set(messageId, {
            numero, numeroFormatado: `${numeroFormatado}@c.us`, mensagem, instancia: instanceName,
            timestamp: Date.now(), delivered: false, tempImagePath
        });
        logs.unshift({ instancia: instanceName, numero, mensagem, status: 'sucesso', data: new Date().toISOString(), messageId });
        messageStatus.push({ messageId, numero, status: 'enviado', instancia: instanceName, timestamp: new Date().toISOString(), sentAt: new Date().toISOString() });
    } catch (err) {
        const numeroSem9 = numeroFormatado.replace(/^(\d{4})9/, '$1');
        try {
            if (tempImagePath && fs.existsSync(tempImagePath)) {
                const media = MessageMedia.fromFilePath(tempImagePath);
                await client.sendMessage(`${numeroSem9}@c.us`, media, { caption: mensagem });
            } else {
                await client.sendMessage(`${numeroSem9}@c.us`, mensagem);
            }
            console.log('✅ Enviado sem nono dígito');
            sentMessages.set(messageId, {
                numero, numeroFormatado: `${numeroSem9}@c.us`, mensagem, instancia: instanceName,
                timestamp: Date.now(), delivered: false, tempImagePath
            });
            logs.unshift({ instancia: instanceName, numero, mensagem, status: 'sucesso', data: new Date().toISOString(), messageId });
            messageStatus.push({ messageId, numero, status: 'enviado', instancia: instanceName, timestamp: new Date().toISOString(), sentAt: new Date().toISOString() });
        } catch (erroFinal) {
            console.log('❌ Falhou com e sem nono dígito:', numero);
            blockedNumbers.add(numeroBase);
            logs.unshift({ instancia: instanceName, numero, mensagem, status: 'bloqueado', erro: 'Número bloqueado após tentativas', data: new Date().toISOString(), messageId });
            messageStatus.push({ messageId, numero, status: 'bloqueado', instancia: instanceName, timestamp: new Date().toISOString(), sentAt: new Date().toISOString() });
            if (erroFinal.message.includes('Session closed') || erroFinal.message.includes('Protocol error')) {
                console.log(`🔄 ${instanceName}: Sessão fechada detectada - marcando como offline permanente`);
                instanceStatus[instanceName] = 'offline';
                instanceNumbers[instanceName] = null;
                instanceMonitoring.stopMonitoring(instanceName);
            }
            throw erroFinal;
        }
    }
}

// Processamento com regras
async function processarEnviosComRegras({ numeros, mensagens, tempImagePath, interval, batchSize, batchDelay }) {
    const processId = `process-${Date.now()}`;
    sendingControl.activeProcesses.add(processId);
    console.log(`🚀 Iniciando envio COM REDISTRIBUIÇÃO AUTOMÁTICA: ${numeros.length} números, ${mensagens.length} mensagens`);

    let totalEnviados = 0, totalBloqueados = 0, totalErros = 0, totalRedistribuidos = 0, mensagemIndex = 0, contadorLote = 0;

    try {
        for (let numeroIndex = 0; numeroIndex < numeros.length; numeroIndex++) {
            await sendingControl.waitForPause();
            const numero = numeros[numeroIndex];
            const mensagem = mensagens[mensagemIndex];
            console.log(`📋 Processando ${numeroIndex + 1}/${numeros.length}: ${numero}`);

            if (isMessageDuplicate(numero, mensagem)) {
                totalBloqueados++;
                console.log(`🚫 DUPLICATA DETECTADA para ${numero}`);
                mensagemIndex = (mensagemIndex + 1) % mensagens.length;
                continue;
            }

            let mensagemEnviada = false;
            let tentativasInstancia = 0;
            const maxTentativasInstancia = 3;

            while (!mensagemEnviada && tentativasInstancia < maxTentativasInstancia) {
                const instanceName = getAvailableInstance();
                if (!instanceName) {
                    console.log(`❌ Nenhuma instância disponível - aguardando 10 segundos`);
                    await delay(10_000);
                    tentativasInstancia++;
                    continue;
                }
                const client = clients[instanceName];
                const isFunctional = await verificarInstanciaFuncional(instanceName, client);
                if (!isFunctional) {
                    console.log(`⚠️ ${instanceName} não funcional - tentando próxima instância`);
                    tentativasInstancia++;
                    continue;
                }
                const messageId = `${instanceName}-${numero}-${Date.now()}`;
                try {
                    console.log(`📤 ENVIANDO via ${instanceName} para ${numero}... (tentativa ${tentativasInstancia + 1})`);
                    await sendSingleMessage(instanceName, client, numero, mensagem, tempImagePath, messageId);
                    markMessageAsSent(numero, mensagem);
                    totalEnviados++; contadorLote++; mensagemEnviada = true;
                    retrySystem.addMessageForRetry(messageId, numero, mensagem, instanceName, tempImagePath);
                    console.log(`✅ ${instanceName}: ENVIADO para ${numero} (${totalEnviados}/${numeros.length})`);
                    await delay(interval);
                } catch (error) {
                    console.error(`❌ ERRO no envio via ${instanceName} para ${numero}:`, error.message);
                    if (error.message.includes('Session closed') || error.message.includes('Protocol error')) {
                        console.log(`🔄 ${instanceName}: Erro de sessão - redistribuindo mensagem`);
                        instanceStatus[instanceName] = 'offline';
                        totalRedistribuidos++;
                    }
                    tentativasInstancia++;
                    if (tentativasInstancia < maxTentativasInstancia) {
                        console.log(`🔄 Tentando próxima instância para ${numero}...`);
                        await delay(2000);
                    }
                }
            }

            if (!mensagemEnviada) {
                console.error(`❌ FALHA TOTAL para ${numero} - todas as instâncias falharam`);
                const controlKey = createMessageControlKey(numero, mensagem);
                messageQueue.delete(controlKey);
                totalErros++;
                logs.unshift({
                    instancia: 'NENHUMA',
                    numero, mensagem, status: 'erro',
                    erro: 'Todas as instâncias falharam',
                    data: new Date().toISOString(),
                    messageId: `failed-${numero}-${Date.now()}`
                });
            }

            mensagemIndex = (mensagemIndex + 1) % mensagens.length;
            if (contadorLote >= batchSize) {
                console.log(`🛑 Lote completo (${contadorLote}) - Delay de ${batchDelay}ms`);
                await delay(batchDelay);
                contadorLote = 0;
            }
        }

        console.log(`🎉 PROCESSO CONCLUÍDO COM REDISTRIBUIÇÃO:`);
        console.log(`   ✅ Sucessos: ${totalEnviados}/${numeros.length}`);
        console.log(`   🚫 Duplicatas bloqueadas: ${totalBloqueados}`);
        console.log(`   🔄 Redistribuições: ${totalRedistribuidos}`);
        console.log(`   ❌ Erros finais: ${totalErros}`);
        console.log(`   📊 Taxa de sucesso: ${((totalEnviados / numeros.length) * 100).toFixed(1)}%`);
        if (logs.length > 1000) logs.splice(1000);
        if (messageStatus.length > 1000) messageStatus.splice(1000);
    } finally {
        sendingControl.activeProcesses.delete(processId);
    }
}

// Eventos do cliente (inclui QR no terminal + CHANGE_STATE + LOADING)
function setupClientEvents(instanceName, client) {
    client.on('qr', (qr) => {
        console.log(`🔑 ${instanceName}: QR Code gerado`);
        instanceStatus[instanceName] = 'qr_code';
        try {
            qrcode.generate(qr, { small: true }); // 🔹 Fallback: imprime QR no terminal
        } catch (e) {
            console.log('⚠️ Falha ao renderizar QR no terminal:', e.message);
        }
    });

    // 🔁 Atualiza status assim que mudar de estado
    client.on('change_state', (state) => {
        console.log(`🔁 ${instanceName}: change_state → ${state}`);
        if (state === 'CONNECTED') {
            instanceStatus[instanceName] = 'online';
            const num = client?.info?.wid?.user;
            if (num && !instanceNumbers[instanceName]) {
                instanceNumbers[instanceName] = num;
                console.log(`📱 ${instanceName}: número detectado (change_state) +${num}`);
            }
        } else if (state === 'DISCONNECTED') {
            instanceStatus[instanceName] = 'offline';
        }
    });

    client.on('loading_screen', (percent, msg) => {
        console.log(`⏳ ${instanceName}: loading ${percent}% - ${msg}`);
    });

    client.on('authenticated', () => {
        console.log(`🔐 ${instanceName}: Autenticado`);
        instanceStatus[instanceName] = 'authenticated';
    });

    client.on('auth_failure', async (msg) => {
        console.error(`❌ ${instanceName}: Falha na autenticação - ${msg}`);
        instanceStatus[instanceName] = 'auth_failure';
        instanceMonitoring.stopMonitoring(instanceName);
    });

    client.on('ready', async () => {
        console.log(`✅ ${instanceName}: Cliente pronto`);
        instanceStatus[instanceName] = 'online';
        instanceRetryCount[instanceName] = 0;

        try {
            const info = client.info;
            if (info && info.wid && info.wid.user) {
                instanceNumbers[instanceName] = info.wid.user;
                console.log(`📱 ${instanceName}: +${info.wid.user}`);
            } else {
                instanceNumbers[instanceName] = 'Obtendo número...';
            }
            instanceMonitoring.startMonitoring(instanceName);
        } catch (error) {
            console.error(`🔥 ${instanceName}: Erro na configuração - ${error.message}`);
            instanceNumbers[instanceName] = 'Erro ao obter número';
        }
    });

    client.on('disconnected', async (reason) => {
        console.log(`💀 ${instanceName}: Desconectada - ${reason} - OFFLINE PERMANENTE`);
        instanceStatus[instanceName] = 'offline';
        instanceNumbers[instanceName] = null;
        instanceMonitoring.stopMonitoring(instanceName);
        if (clients[instanceName]) {
            try { await clients[instanceName].destroy(); } catch (error) {
                console.log(`⚠️ ${instanceName}: Erro ao destruir cliente - ${error.message}`);
            }
            delete clients[instanceName];
        }
        console.log(`🚫 ${instanceName}: Removida permanentemente do sistema - SEM RECONEXÃO`);
    });

    client.on('message_ack', (msg, ack) => {
        try {
            const statusMapping = { 0: 'pendente', 1: 'enviado', 2: 'entregue', 3: 'lido', 4: 'visualizado' };
            const status = statusMapping[ack] || 'desconhecido';
            const numeroLimpo = msg.to.replace('@c.us', '');

            if (status === 'entregue' || status === 'lido' || status === 'visualizado') {
                const possibleMessageId = `${instanceName}-${numeroLimpo}-`;
                for (const [messageId] of retrySystem.retryQueue) {
                    if (messageId.startsWith(possibleMessageId)) {
                        retrySystem.removeFromRetry(messageId);
                        break;
                    }
                }
            }

            const idx = messageStatus.findIndex(ms =>
                (ms.numero === numeroLimpo || ms.numero === msg.to) && ms.instancia === instanceName
            );

            if (idx !== -1) {
                messageStatus[idx].status = status;
                messageStatus[idx].timestamp = new Date().toISOString();
            } else {
                messageStatus.push({
                    messageId: msg.id.id || `${instanceName}-${numeroLimpo}-${Date.now()}`,
                    numero: numeroLimpo, status, instancia: instanceName,
                    timestamp: new Date().toISOString(), sentAt: new Date().toISOString()
                });
            }
            if (messageStatus.length > 1000) messageStatus.splice(1000);
        } catch (error) {
            console.error(`❌ Erro no processamento de message_ack:`, error.message);
        }
    });

    client.on('message', async (msg) => {
        try {
            if (!msg.fromMe) {
                const messageDate = new Date(msg.timestamp * 1000);
                const doisDiasAtras = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000));
                if (messageDate >= doisDiasAtras) {
                    const contact = await msg.getContact();
                    const numero = contact.number;
                    const mensagem = msg.body.trim();
                    console.log(`📨 Mensagem recebida de ${numero}: ${mensagem}`);
                    clientResponses.unshift({
                        numero, mensagem, instancia: instanceName,
                        data: messageDate.toISOString(), isOptOut: mensagem === '1'
                    });
                    if (clientResponses.length > 1000) clientResponses.splice(1000);
                    if (mensagem === '1') console.log(`🚫 Cliente ${numero} solicitou remoção da lista`);
                }
            }
        } catch (error) {
            console.error(`❌ Erro no processamento de mensagem recebida:`, error.message);
        }
    });
}

// Sistema de aquecimento (mantido)
let warmupSystem = {
    active: false,
    interval1: 300000,
    interval2: 120000,
    currentInterval: 300000,
    currentCycle: 1,
    messages: [],
    intervalId: null,
    onlineInstances: 0,
    lastExecution: null,
    nextExecution: null
};

async function executeAdvancedWarmupCycle() {
    console.log(`🔥 Iniciando ciclo de aquecimento avançado - Ciclo ${warmupSystem.currentCycle}...`);
    try {
        const onlineInstances = instanceNames.filter(name =>
            instanceStatus[name] === 'online' && clients[name] && instanceNumbers[name]
        );
        warmupSystem.onlineInstances = onlineInstances.length;
        if (onlineInstances.length < 2) {
            console.log('⚠️ Aquecimento: Menos de 2 instâncias online');
            return;
        }
        console.log(`📊 Aquecimento: ${onlineInstances.length} instâncias ativas`);
        console.log(`⏰ Usando intervalo do Ciclo ${warmupSystem.currentCycle}: ${warmupSystem.currentInterval / 60000}min`);
        for (let senderIndex = 0; senderIndex < onlineInstances.length; senderIndex++) {
            const senderInstance = onlineInstances[senderIndex];
            const senderClient = clients[senderInstance];
            if (!senderClient) continue;
            const isFunctional = await verificarInstanciaFuncional(senderInstance, senderClient);
            if (!isFunctional) continue;
            for (let receiverIndex = 0; receiverIndex < onlineInstances.length; receiverIndex++) {
                if (receiverIndex === senderIndex) continue;
                const receiverInstance = onlineInstances[receiverIndex];
                const receiverNumber = instanceNumbers[receiverInstance];
                if (!receiverNumber) continue;
                const randomMessage = warmupSystem.messages[Math.floor(Math.random() * warmupSystem.messages.length)];
                const numeroFormatado = `${receiverNumber}@c.us`;
                try {
                    await senderClient.sendMessage(numeroFormatado, randomMessage);
                    console.log(`🔥 Aquecimento Ciclo ${warmupSystem.currentCycle}: ${senderInstance} → ${receiverInstance}`);
                    await delay(1000);
                } catch (error) {
                    console.error(`❌ Erro no aquecimento ${senderInstance} → ${receiverInstance}:`, error.message);
                }
            }
            await delay(2000);
        }
        warmupSystem.lastExecution = new Date().toISOString();
        if (warmupSystem.currentCycle === 1) {
            warmupSystem.currentCycle = 2;
            warmupSystem.currentInterval = warmupSystem.interval2;
        } else {
            warmupSystem.currentCycle = 1;
            warmupSystem.currentInterval = warmupSystem.interval1;
        }
        console.log(`✅ Ciclo de aquecimento concluído. Próximo será Ciclo ${warmupSystem.currentCycle} em ${warmupSystem.currentInterval / 60000}min`);
    } catch (error) {
        console.error('❌ Erro no ciclo de aquecimento:', error);
    }
}

function startAdvancedWarmup(interval1, interval2, messages) {
    console.log('🔥 Iniciando sistema de aquecimento avançado...');
    if (warmupSystem.intervalId) clearTimeout(warmupSystem.intervalId);
    warmupSystem.active = true;
    warmupSystem.interval1 = interval1;
    warmupSystem.interval2 = interval2;
    warmupSystem.currentInterval = interval1;
    warmupSystem.currentCycle = 1;
    warmupSystem.messages = messages;
    warmupSystem.lastExecution = null;
    warmupSystem.nextExecution = new Date(Date.now() + warmupSystem.currentInterval).toISOString();
    function scheduleNextCycle() {
        warmupSystem.intervalId = setTimeout(async () => {
            await executeAdvancedWarmupCycle();
            if (warmupSystem.active) {
                warmupSystem.nextExecution = new Date(Date.now() + warmupSystem.currentInterval).toISOString();
                scheduleNextCycle();
            }
        }, warmupSystem.currentInterval);
    }
    scheduleNextCycle();
    console.log(`✅ Aquecimento avançado iniciado:`);
    console.log(`   - Ciclo 1: ${Math.floor(interval1 / 60000)} minutos`);
    console.log(`   - Ciclo 2: ${Math.floor(interval2 / 60000)} minutos`);
    console.log(`   - Modo: Cada instância → Todas as outras`);
}

function stopAdvancedWarmup() {
    console.log('🛑 Parando sistema de aquecimento avançado...');
    if (warmupSystem.intervalId) { clearTimeout(warmupSystem.intervalId); warmupSystem.intervalId = null; }
    warmupSystem.active = false;
    warmupSystem.nextExecution = null;
    console.log('✅ Aquecimento avançado parado');
}

// Inicialização das instâncias SEM reconexão automática
instanceNames.forEach(name => {
    try {
        const client = createClientWithConfig(name);
        setupClientEvents(name, client);
        client.initialize().catch(err => {
            console.log(`🔥 ${name}: Erro na inicialização - ${err.message}`);
            instanceStatus[name] = 'offline';
            instanceNumbers[name] = null;
        });
        clients[name] = client;
        instanceStatus[name] = 'offline';
        instanceNumbers[name] = null;

        // 🔁 Fallback: reconciliação a cada 5s até ficar online
        const reconcileTimer = setInterval(async () => {
            try {
                if (!clients[name]) { clearInterval(reconcileTimer); return; }
                if (instanceStatus[name] === 'online') { clearInterval(reconcileTimer); return; }
                const state = await clients[name].getState().catch(() => null);
                if (state === 'CONNECTED') {
                    instanceStatus[name] = 'online';
                    const num = clients[name]?.info?.wid?.user;
                    if (num) instanceNumbers[name] = num;
                    console.log(`✅ ${name}: Reconciliação -> online ${num ? '(+' + num + ')' : ''}`);
                    clearInterval(reconcileTimer);
                }
            } catch {}
        }, 5000);

    } catch (error) {
        console.log(`🔥 ${name}: Erro na criação - ${error.message}`);
        instanceStatus[name] = 'isolated';
        instanceNumbers[name] = null;
    }
});

// Endpoints da API principais
app.get('/api/status', (req, res) => {
    const status = instanceNames.map(name => ({
        nome: name, status: instanceStatus[name] || 'offline', numero: instanceNumbers[name] || null
    }));
    console.log('📊 Status atual das instâncias:', status);
    res.json({ instancias: status });
});

app.get('/api/logs', (req, res) => { res.json({ logs }); });
app.get('/api/message-status', (req, res) => { res.json({ messageStatus }); });
app.get('/api/client-responses', (req, res) => { res.json({ responses: clientResponses }); });

app.get('/api/warmup/status', (req, res) => {
    const onlineCount = instanceNames.filter(name =>
        instanceStatus[name] === 'online' && clients[name] && instanceNumbers[name]
    ).length;
    warmupSystem.onlineInstances = onlineCount;
    res.json({
        active: warmupSystem.active,
        interval1: warmupSystem.interval1,
        interval2: warmupSystem.interval2,
        currentInterval: warmupSystem.currentInterval,
        currentCycle: warmupSystem.currentCycle,
        messages: warmupSystem.messages,
        onlineInstances: warmupSystem.onlineInstances,
        lastExecution: warmupSystem.lastExecution,
        nextExecution: warmupSystem.nextExecution
    });
});

app.post('/api/warmup/start', (req, res) => {
    try {
        const { interval1, interval2, messages } = req.body;
        if (!interval1 || !interval2 || !messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ sucesso: false, erro: 'Ambos os intervalos e mensagens são obrigatórios' });
        }
        const onlineCount = instanceNames.filter(name =>
            instanceStatus[name] === 'online' && clients[name] && instanceNumbers[name]
        ).length;
        if (onlineCount < 2) {
            return res.status(400).json({ sucesso: false, erro: 'É necessário pelo menos 2 instâncias online para o aquecimento' });
        }
        startAdvancedWarmup(interval1, interval2, messages);
        res.json({
            sucesso: true,
            mensagem: 'Aquecimento avançado iniciado com sucesso',
            configuracao: {
                ciclo1: `${Math.floor(interval1 / 60000)} minutos`,
                ciclo2: `${Math.floor(interval2 / 60000)} minutos`,
                mensagens: messages.length,
                instanciasOnline: onlineCount,
                modo: 'Cada instância envia para todas as outras'
            }
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar aquecimento:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

app.post('/api/warmup/stop', (req, res) => {
    try {
        stopAdvancedWarmup();
        res.json({ sucesso: true, mensagem: 'Aquecimento avançado parado com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao parar aquecimento:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

app.post('/api/send-config', async (req, res) => {
    console.log('📥 Recebendo requisição de envio...');
    try {
        if (activeSendingProcesses >= sendingRules.maxConcurrentSends) {
            return res.status(429).json({ sucesso: false, erro: `Máximo de ${sendingRules.maxConcurrentSends} processos simultâneos atingido` });
        }
        if (!req.body.data) {
            return res.status(400).json({ sucesso: false, erro: 'Dados não encontrados na requisição' });
        }
        const configData = JSON.parse(req.body.data);
        const { numeros, mensagens, interval = sendingRules.defaultInterval, batchSize = sendingRules.defaultBatchSize, batchDelay = sendingRules.defaultBatchDelay } = configData;
        const image = req.files?.imagem;
        const tempImagePath = image ? path.join(__dirname, 'public', image.name) : null;
        if (image) { await image.mv(tempImagePath); console.log('📸 Imagem salva:', tempImagePath); }
        const numerosFiltrados = numeros.filter(n => n.trim() !== '');
        const mensagensFiltradas = mensagens.filter(m => m.trim() !== '');
        if (numerosFiltrados.length === 0 || mensagensFiltradas.length === 0) {
            return res.status(400).json({ sucesso: false, erro: 'Números ou mensagens não fornecidos' });
        }
        const finalInterval = Math.max(500, interval);
        const finalBatchSize = Math.max(1, Math.min(50, batchSize));
        const finalBatchDelay = Math.max(1000, batchDelay);
        activeSendingProcesses++;
        res.json({ sucesso: true, mensagem: 'Processo de envio iniciado', configuracoes: { intervalo: `${finalInterval}ms`, lote: `${finalBatchSize} mensagens`, delay: `${finalBatchDelay}ms` } });
        processarEnviosComRegras({
            numeros: numerosFiltrados, mensagens: mensagensFiltradas, tempImagePath,
            interval: finalInterval, batchSize: finalBatchSize, batchDelay: finalBatchDelay
        }).finally(() => {
            activeSendingProcesses--;
            if (tempImagePath && fs.existsSync(tempImagePath)) {
                fs.unlinkSync(tempImagePath);
                console.log('🗑️ Imagem temporária removida');
            }
        });
    } catch (error) {
        console.error('❌ Erro no envio:', error);
        activeSendingProcesses = Math.max(0, activeSendingProcesses - 1);
        if (!res.headersSent) res.status(500).json({ sucesso: false, erro: error.message });
    }
});

app.get('/api/retry-stats', (req, res) => {
    const stats = retrySystem.getStats();
    res.json({ success: true, stats });
});

app.get('/api/blocked-numbers', (req, res) => {
    res.json({ blockedNumbers: Array.from(blockedNumbers), count: blockedNumbers.size });
});

app.post('/api/pause-sending', (req, res) => {
    try {
        sendingControl.pause();
        res.json({ success: true, message: 'Pausa solicitada com sucesso', status: sendingControl.getStatus() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/resume-sending', (req, res) => {
    try {
        sendingControl.resume();
        res.json({ success: true, message: 'Envio despausado com sucesso', status: sendingControl.getStatus() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/sending-status', (req, res) => {
    res.json({ success: true, status: sendingControl.getStatus() });
});

// ==================== SISTEMA DE GRUPOS WHATSAPP ====================

/**
 * Adiciona uma lista de números ao grupo especificado.
 * @param {string[]} numeros - Array de números (DDI+DDD+Telefone, apenas dígitos).
 * @param {string} groupId - ID do grupo (sem sufixo '@g.us').
 */
async function addContactsToGroup(numeros, groupId) {
    // Usa a função de rotação por grupo (ou padrão se não configurado)
    const instanceName = getNextInstanceForGroup(groupId);
    if (!instanceName) {
        console.error('❌ Nenhuma instância disponível para adicionar ao grupo');
        throw new Error('Nenhuma instância disponível');
    }

    const client = clients[instanceName];
    const chatId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;

    try {
        console.log(`🔄 Usando instância ${instanceName} para adicionar ao grupo ${groupId}`);
        
        // Verifica se o cliente está conectado
        const state = await client.getState();
        if (state !== 'CONNECTED') {
            throw new Error(`Instância ${instanceName} não está conectada. Estado: ${state}`);
        }
        
        // Verifica se o grupo existe e se temos permissão de admin
        let chat;
        try {
            chat = await client.getChatById(chatId);
            console.log(`📋 Grupo encontrado: ${chat.name} (${chat.participants?.length || 0} participantes)`);
            
            // Verifica se somos admin do grupo
            const me = client.info.wid._serialized;
            const isAdmin = chat.participants?.some(p => p.id._serialized === me && p.isAdmin);
            if (!isAdmin) {
                throw new Error('Esta instância não é administrador do grupo');
            }
        } catch (error) {
            console.error(`❌ Erro ao acessar grupo ${chatId}:`, error.message);
            throw new Error(`Não foi possível acessar o grupo: ${error.message}`);
        }

        // Formata cada número para o ID de contato do WhatsApp
        const participantIds = numeros.map(num => {
            const clean = num.replace(/\D/g, '');
            // Adiciona +55 se não tiver código do país
            const withCountry = clean.startsWith('55') ? clean : `55${clean}`;
            return `${withCountry}@c.us`;
        });

        console.log(`📝 Tentando adicionar ${participantIds.length} participantes ao grupo`);

        // Adiciona participantes um por vez com mensagem prévia e delay
        let result = [];
        for (let i = 0; i < participantIds.length; i++) {
            try {
                console.log(`📱 Processando ${participantIds[i]}...`);
                
                // Verifica se o contato existe
                const contact = await client.getContactById(participantIds[i]);
                if (!contact.isWAContact) {
                    result.push({ participant: participantIds[i], success: false, error: 'Contato não possui WhatsApp' });
                    continue;
                }
                
                // Enviar mensagem de boas-vindas antes de adicionar ao grupo
                try {
                    console.log(`👋 Enviando mensagem de boas-vindas para ${participantIds[i]}`);
                    await client.sendMessage(participantIds[i], 'Olá! 👋');
                    console.log(`✅ Mensagem enviada para ${participantIds[i]}`);
                    
                    // Aguardar 2 segundos após enviar a mensagem
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (messageError) {
                    console.log(`⚠️ Erro ao enviar mensagem para ${participantIds[i]}: ${messageError.message}`);
                    // Continua mesmo se não conseguir enviar mensagem
                }
                
                // Tenta adicionar ao grupo
                console.log(`➕ Adicionando ${participantIds[i]} ao grupo...`);
                await chat.addParticipants([participantIds[i]]);
                result.push({ participant: participantIds[i], success: true });
                console.log(`✅ ${participantIds[i]} adicionado com sucesso ao grupo`);
                
                // Delay entre processamento de contatos
                if (i < participantIds.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.log(`❌ Erro ao processar ${participantIds[i]}:`, error.message);
                result.push({ participant: participantIds[i], success: false, error: error.message });
            }
        }
        
        console.log(`📊 Resultado da adição ao grupo ${groupId}:`, result);
        
        // Conta sucessos e erros dos resultados individuais
        let successCount = 0;
        let errors = [];
        
        result.forEach((res) => {
            if (res.success) {
                successCount++;
            } else {
                errors.push(`${res.participant}: ${res.error}`);
            }
        });
        
        if (successCount > 0) {
            console.log(`✅ ${successCount} de ${participantIds.length} participantes adicionados com sucesso`);
            logs.unshift({
                instancia: instanceName,
                mensagem: `${successCount}/${participantIds.length} participantes adicionados ao grupo ${groupId}`,
                status: 'sucesso',
                data: new Date().toISOString()
            });
        }
        
        if (errors.length > 0) {
            console.log(`⚠️ Erros ao adicionar alguns participantes:`, errors);
            logs.unshift({
                instancia: instanceName,
                mensagem: `Erros ao adicionar ${errors.length} participantes: ${errors.join(', ')}`,
                status: 'aviso',
                data: new Date().toISOString()
            });
        }
        
        return { 
            success: successCount > 0, 
            added: successCount, 
            total: participantIds.length, 
            errors: errors,
            result: result 
        };
    } catch (error) {
        console.error(`❌ Erro ao adicionar participantes ao grupo ${groupId}:`, error);
        logs.unshift({
            instancia: instanceName,
            mensagem: `Erro ao adicionar ao grupo ${groupId}: ${error.message}`,
            status: 'erro',
            data: new Date().toISOString()
        });
        throw error;
    }
}

// Endpoint para adicionar contatos a grupos
app.post('/api/group/add', async (req, res) => {
    const { numeros, groupId } = req.body;

    if (!Array.isArray(numeros) || !groupId) {
        return res.status(400).json({ 
            success: false, 
            error: 'números (array) e groupId são obrigatórios' 
        });
    }

    if (numeros.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Lista de números não pode estar vazia' 
        });
    }

    try {
        const result = await addContactsToGroup(numeros, groupId);
        
        res.json({ 
            success: true, 
            message: `${numeros.length} participantes adicionados ao grupo com sucesso`,
            result: result,
            groupId: groupId,
            participantsCount: numeros.length
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Endpoint para listar grupos disponíveis
app.get('/api/groups', async (req, res) => {
    try {
        const instanceName = getAvailableInstance();
        if (!instanceName) {
            return res.status(503).json({ 
                success: false, 
                error: 'Nenhuma instância disponível' 
            });
        }

        const client = clients[instanceName];
        const chats = await client.getChats();
        
        // Filtra apenas os grupos
        const groups = chats
            .filter(chat => chat.isGroup)
            .map(group => ({
                id: group.id._serialized,
                name: group.name,
                participantsCount: group.participants.length,
                isAdmin: group.participants.find(p => p.id._serialized === client.info.wid._serialized)?.isAdmin || false
            }));
        
        res.json({
            success: true,
            groups: groups,
            totalGroups: groups.length,
            instanceUsed: instanceName
        });
    } catch (error) {
        console.error('❌ Erro ao listar grupos:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Endpoint para adicionar contatos ao grupo com rotação automática entre instâncias admin
app.post('/api/group/add-rotative', async (req, res) => {
    try {
        const { numeros, groupId, delayBetweenContacts = 3 } = req.body;

        if (!numeros || !Array.isArray(numeros) || numeros.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Lista de números é obrigatória'
            });
        }

        if (!groupId) {
            return res.status(400).json({
                success: false,
                error: 'ID do grupo é obrigatório'
            });
        }

        console.log(`🎯 Iniciando adição rotativa de ${numeros.length} contatos ao grupo ${groupId}`);
        console.log(`⏱️ Delay configurado: ${delayBetweenContacts} segundos entre contatos`);

        const chatId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
        
        // Verificar quais instâncias são admin do grupo
        const adminInstances = [];
        
        for (const [instanceName, client] of Object.entries(clients)) {
            if (instanceStatus[instanceName] === 'online') {
                try {
                    const chat = await client.getChatById(chatId);
                    const me = client.info.wid._serialized;
                    const isAdmin = chat.participants?.some(p => p.id._serialized === me && p.isAdmin);
                    
                    if (isAdmin) {
                        adminInstances.push(instanceName);
                        console.log(`✅ Instância ${instanceName} é admin do grupo`);
                    }
                } catch (error) {
                    console.log(`❌ Instância ${instanceName} não pode acessar o grupo: ${error.message}`);
                }
            }
        }

        if (adminInstances.length === 0) {
            throw new Error('Nenhuma instância admin do grupo está online');
        }

        console.log(`👥 Instâncias admin disponíveis: ${adminInstances.join(', ')}`);

        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        let currentInstanceIndex = 0;

        // Processar cada contato com rotação
        for (let i = 0; i < numeros.length; i++) {
            const numero = numeros[i].toString().replace(/\D/g, '');
            const participantId = `${numero}@c.us`;
            
            // Selecionar instância em rotação
            const instanceName = adminInstances[currentInstanceIndex];
            const client = clients[instanceName];
            
            console.log(`📱 [${i+1}/${numeros.length}] Processando ${numero} via ${instanceName}`);
            
            try {
                // Obter o chat do grupo
                const chat = await client.getChatById(chatId);
                
                // Verificar se o número já está no grupo
                const isAlreadyInGroup = chat.participants?.some(p => p.id._serialized === participantId);
                
                if (isAlreadyInGroup) {
                    console.log(`⚠️ ${numero} já está no grupo, pulando...`);
                    currentInstanceIndex = (currentInstanceIndex + 1) % adminInstances.length;
                    continue;
                }
                
                // Enviar mensagem "Olá! 👋" antes de adicionar
                console.log(`📞 Enviando "Olá! 👋" para ${numero}...`);
                await client.sendMessage(participantId, 'Olá! 👋');
                
                // Aguardar 2 segundos após enviar mensagem
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Adicionar ao grupo
                console.log(`➕ Adicionando ${numero} ao grupo...`);
                await chat.addParticipants([participantId]);
                
                console.log(`✅ ${numero} adicionado com sucesso via ${instanceName}`);
                successCount++;
                
            } catch (error) {
                console.error(`❌ Erro ao processar ${numero} via ${instanceName}:`, error.message);
                errorCount++;
                errors.push({
                    numero: numero,
                    instancia: instanceName,
                    erro: error.message
                });
            }
            
            // Rotacionar para próxima instância
            currentInstanceIndex = (currentInstanceIndex + 1) % adminInstances.length;
            
            // Aguardar delay configurado entre contatos (se não for o último)
            if (i < numeros.length - 1) {
                console.log(`⏱️ Aguardando ${delayBetweenContacts} segundos antes do próximo contato...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenContacts * 1000));
            }
        }

        console.log(`🎉 Processo rotativo concluído: ${successCount} sucessos, ${errorCount} erros`);

        // Adicionar log do processo
        logs.unshift({
            instancia: adminInstances.join(', '),
            mensagem: `Adição rotativa concluída: ${successCount}/${numeros.length} contatos adicionados ao grupo ${groupId}`,
            status: successCount > 0 ? 'sucesso' : 'erro',
            data: new Date().toISOString()
        });

        res.json({
            success: true,
            successCount: successCount,
            errorCount: errorCount,
            totalProcessed: numeros.length,
            adminInstancesUsed: adminInstances,
            errors: errors
        });

    } catch (error) {
        console.error('❌ Erro no endpoint /api/group/add-rotative:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erro interno do servidor'
        });
    }
});

// Endpoint para configurar instâncias responsáveis por um grupo
app.post('/api/group/config', async (req, res) => {
    const { groupId, instances } = req.body;

    if (!groupId || !Array.isArray(instances) || instances.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'groupId e instances (array) são obrigatórios' 
        });
    }

    // Validar se as instâncias existem
    const validInstances = instances.filter(name => instanceNames.includes(name));
    if (validInstances.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Nenhuma instância válida fornecida' 
        });
    }

    try {
        setGroupInstances(groupId, validInstances);
        
        res.json({ 
            success: true, 
            message: `Grupo ${groupId} configurado com ${validInstances.length} instâncias`,
            groupId: groupId,
            instances: validInstances
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Endpoint para ver configurações de grupos
app.get('/api/group/config', async (req, res) => {
    try {
        const configurations = {};
        
        groupInstanceMapping.forEach((instances, groupId) => {
            configurations[groupId] = {
                instances: instances,
                currentRotation: instanceRotation.get(groupId) || 0
            };
        });
        
        res.json({ 
            success: true, 
            configurations: configurations
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ==================== FIM DO SISTEMA DE GRUPOS ====================

// Endpoints simples para envio de mensagens (compatibilidade com sistema atual)
app.post('/send-message', async (req, res) => {
    try {
        const { number, to, message } = req.body;
        const phone = number || to;
        
        if (!phone || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone and message are required' 
            });
        }

        if (isMessageDuplicate(phone, message)) {
            console.log(`🚫 DUPLICATA DETECTADA: ${phone}`);
            return res.status(409).json({ 
                success: false, 
                error: 'Duplicate message blocked' 
            });
        }

        const instanceName = getAvailableInstance();
        if (!instanceName) {
            return res.status(503).json({ 
                success: false, 
                error: 'Nenhuma instância disponível' 
            });
        }

        const client = clients[instanceName];
        const isFunctional = await verificarInstanciaFuncional(instanceName, client);
        
        if (!isFunctional) {
            return res.status(503).json({ 
                success: false, 
                error: 'Instância não está funcional' 
            });
        }

        const messageId = `${instanceName}-${phone}-${Date.now()}`;
        
        try {
            console.log(`📤 Enviando mensagem via ${instanceName} para ${phone}`);
            await sendSingleMessage(instanceName, client, phone, message, null, messageId);
            markMessageAsSent(phone, message);
            
            console.log(`✅ Mensagem enviada com sucesso para ${phone}`);
            
            res.json({ 
                success: true, 
                message: 'Message sent successfully',
                instanceUsed: instanceName
            });
            
        } catch (error) {
            console.error(`❌ Erro ao enviar mensagem para ${phone}:`, error.message);
            
            // Remover da fila se houver erro
            const controlKey = createMessageControlKey(phone, message);
            messageQueue.delete(controlKey);
            
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
        
    } catch (error) {
        console.error('❌ Erro no endpoint /send-message:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/send', async (req, res) => {
    try {
        const { number, to, message } = req.body;
        const phone = number || to;
        
        if (!phone || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone and message are required' 
            });
        }

        if (isMessageDuplicate(phone, message)) {
            console.log(`🚫 DUPLICATA DETECTADA: ${phone}`);
            return res.status(409).json({ 
                success: false, 
                error: 'Duplicate message blocked' 
            });
        }

        const instanceName = getAvailableInstance();
        if (!instanceName) {
            return res.status(503).json({ 
                success: false, 
                error: 'Nenhuma instância disponível' 
            });
        }

        const client = clients[instanceName];
        const isFunctional = await verificarInstanciaFuncional(instanceName, client);
        
        if (!isFunctional) {
            return res.status(503).json({ 
                success: false, 
                error: 'Instância não está funcional' 
            });
        }

        const messageId = `${instanceName}-${phone}-${Date.now()}`;
        
        try {
            console.log(`📤 Enviando mensagem via ${instanceName} para ${phone}`);
            await sendSingleMessage(instanceName, client, phone, message, null, messageId);
            markMessageAsSent(phone, message);
            
            console.log(`✅ Mensagem enviada com sucesso para ${phone}`);
            
            res.json({ 
                success: true, 
                message: 'Message sent successfully',
                instanceUsed: instanceName
            });
            
        } catch (error) {
            console.error(`❌ Erro ao enviar mensagem para ${phone}:`, error.message);
            
            // Remover da fila se houver erro
            const controlKey = createMessageControlKey(phone, message);
            messageQueue.delete(controlKey);
            
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
        
    } catch (error) {
        console.error('❌ Erro no endpoint /send:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Endpoint para adicionar etiquetas aos contatos
app.post('/add-label', async (req, res) => {
    try {
        const { phone, label } = req.body;
        
        if (!phone || !label) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone and label are required' 
            });
        }

        const instanceName = getAvailableInstance();
        if (!instanceName) {
            return res.status(503).json({ 
                success: false, 
                error: 'Nenhuma instância disponível' 
            });
        }

        const client = clients[instanceName];
        const isFunctional = await verificarInstanciaFuncional(instanceName, client);
        
        if (!isFunctional) {
            return res.status(503).json({ 
                success: false, 
                error: 'Instância não está funcional' 
            });
        }

        const numeroLimpo = phone.replace(/\D/g, '');
        const chatId = `${numeroLimpo}@c.us`;
        
        console.log(`🏷️ Tentando adicionar etiqueta "${label}" para ${phone} via ${instanceName}`);

        try {
            // Obter todas as etiquetas disponíveis
            const labels = await client.getLabels();
            
            // Procurar se a etiqueta já existe
            let targetLabel = labels.find(l => l.name === label);
            
            // Se não existe, criar a etiqueta
            if (!targetLabel) {
                console.log(`🆕 Criando nova etiqueta: ${label}`);
                targetLabel = await client.createLabel(label);
            }
            
            // Obter o chat/contato
            const chat = await client.getChatById(chatId);
            
            // Adicionar a etiqueta ao chat
            await chat.addLabel(targetLabel.id);
            
            console.log(`✅ Etiqueta "${label}" adicionada com sucesso para ${phone}`);
            
            logs.unshift({
                instancia: instanceName,
                numero: phone,
                mensagem: `Etiqueta "${label}" adicionada`,
                status: 'sucesso',
                data: new Date().toISOString()
            });

            res.json({ 
                success: true, 
                message: `Label "${label}" added to ${phone}`,
                instanceUsed: instanceName
            });
            
        } catch (error) {
            console.error(`❌ Erro ao adicionar etiqueta "${label}" para ${phone}:`, error.message);
            
            logs.unshift({
                instancia: instanceName,
                numero: phone,
                mensagem: `Erro ao adicionar etiqueta "${label}": ${error.message}`,
                status: 'erro',
                data: new Date().toISOString()
            });
            
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
        
    } catch (error) {
        console.error('❌ Erro no endpoint /add-label:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.listen(3333, () => {
    console.log('🟢 ==== SERVIDOR WHATSAPP SEM RECONEXÃO AUTOMÁTICA ====');
    console.log('🌐 URL: http://localhost:3333');
    console.log('🚫 Sistema: Controle de duplicatas ULTRA ativo (10 min)');
    console.log('🔄 Sistema: Reenvio automático ativo (30min, 09:00–20:00)');
    console.log('📋 Sistema: Persistência de reenvios habilitada');
    console.log('🔄 Sistema: Redistribuição automática de mensagens ativa');
    console.log('🔍 Sistema: Monitoramento de saúde das instâncias (15s)');
    console.log('🚫 NOVO: Instâncias desconectadas NÃO reconectam automaticamente');
    console.log('⚡ Recursos: Fila + redistribuição SEM reconexão automática');
    console.log('👥 Sistema: Rotação de instâncias por grupo ativo');
    console.log('🏷️ Sistema: Suporte a etiquetas do WhatsApp ativo');
    initializeGroupConfigurations();
    console.log('========================================');
});