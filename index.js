const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  REST, 
  Routes, 
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// --- CREDENCIAIS CONFIGURADAS ---
const TOKEN = '';
const CLIENT_ID = '1561461545047687188';
const DONO_ID = '1394445284527837285';
const PIX_CHAVE = 'bryansousa4798@gmail.com';

// --- BANCO DE DADOS EM ARQUIVO LOCAL (JSON) ---
const DB_FILE = path.join(__dirname, 'database.json');

function carregarDados() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ usuarios: {}, casais: {} }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { usuarios: {}, casais: {} };
  }
}

function salvarDados(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUsuario(db, userId) {
  if (!db.usuarios[userId]) {
    db.usuarios[userId] = {
      diamantes: userId === DONO_ID ? "10000000000000000000000000000" : "0",
      casadoCom: null,
      ultimoDaily: 0
    };
  }
  return db.usuarios[userId];
}

const voiceSessions = new Map();

// --- DEFINIÇÃO DOS COMANDOS SLASH ---
const commands = [
  new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('Exibe seu saldo de diamantes e status de relacionamento')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver saldo de outro usuário')),

  new SlashCommandBuilder()
    .setName('casar')
    .setDescription('Pede alguém em casamento (Custa 50.000 diamantes)')
    .addUserOption(opt => opt.setName('parceiro').setDescription('Pessoa a ser pedida em casamento').setRequired(true)),

  new SlashCommandBuilder()
    .setName('divorciar')
    .setDescription('Termina o casamento atual'),

  new SlashCommandBuilder()
    .setName('topcasais')
    .setDescription('Mostra os casais do servidor e o tempo juntos'),

  new SlashCommandBuilder()
    .setName('diario')
    .setDescription('Resgata seus diamantes diários'),

  new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Transfere diamantes para outra pessoa')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro que receberá os diamantes').setRequired(true))
    .addStringOption(opt => opt.setName('quantidade').setDescription('Quantidade de diamantes').setRequired(true)),

  new SlashCommandBuilder()
    .setName('doacao')
    .setDescription('Ajude o GB (dono do bot) com qualquer centavo no PIX!')
];

// --- REGISTRO DOS COMANDOS ---
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Registrando comandos do Bot de Casais & Diamantes...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Comandos registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
})();

client.once('clientReady', () => {
  console.log('💎 Bot de Casais online como ' + client.user.tag + '!');
});

// --- LÓGICA DAS INTERAÇÕES ---
client.on('interactionCreate', async interaction => {

  // 1. ACEITAR / RECUSAR PEDIDO DE CASAMENTO
  if (interaction.isButton()) {
    const db = carregarDados();

    if (interaction.customId.startsWith('aceitar_casamento_')) {
      const parts = interaction.customId.split('_');
      const autorId = parts[2];
      const parceiroId = parts[3];

      if (interaction.user.id !== parceiroId) {
        return interaction.reply({ content: '❌ Apenas a pessoa que recebeu o pedido pode aceitar!', flags: MessageFlags.Ephemeral });
      }

      const userAutor = getUsuario(db, autorId);
      const userParceiro = getUsuario(db, parceiroId);

      const CUSTO_CASAMENTO = 50000;
      let saldoAutor = BigInt(userAutor.diamantes || '0');

      if (saldoAutor < BigInt(CUSTO_CASAMENTO) && autorId !== DONO_ID) {
        return interaction.reply({ content: '❌ O noivo(a) não possui mais os 50.000 diamantes necessários!', flags: MessageFlags.Ephemeral });
      }

      if (autorId !== DONO_ID) {
        saldoAutor -= BigInt(CUSTO_CASAMENTO);
        userAutor.diamantes = saldoAutor.toString();
      }

      const dataInicio = Date.now();
      userAutor.casadoCom = parceiroId;
      userParceiro.casadoCom = autorId;

      db.casais[autorId + '_' + parceiroId] = {
        p1: autorId,
        p2: parceiroId,
        inicio: dataInicio
      };

      salvarDados(db);

      const embedSucesso = new EmbedBuilder()
        .setColor(0xff69b4)
        .setTitle('🎉 NOVO CASAL NO SERVIDOR! 🎉')
        .setDescription('💖 <@' + autorId + '> e <@' + parceiroId + '> agora estão **oficialmente casados**!\nQue essa união dure para sempre! 💎✨')
        .setTimestamp();

      return await interaction.update({ embeds: [embedSucesso], components: [] });
    }

    if (interaction.customId.startsWith('recusar_casamento_')) {
      const parts = interaction.customId.split('_');
      const autorId = parts[2];
      const parceiroId = parts[3];

      if (interaction.user.id !== parceiroId) {
        return interaction.reply({ content: '❌ Apenas a pessoa convidada pode recusar!', flags: MessageFlags.Ephemeral });
      }

      return await interaction.update({
        content: '💔 <@' + parceiroId + '> recusou o pedido de casamento de <@' + autorId + '>.',
        embeds: [],
        components: []
      });
    }
  }

  // 2. COMANDOS SLASH
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, user } = interaction;
  const db = carregarDados();

  // /saldo
  if (commandName === 'saldo') {
    const alvo = options.getUser('usuario') || user;
    const userData = getUsuario(db, alvo.id);

    let statusRelacionamento = 'Solteiro(a) 💔';
    if (userData.casadoCom) {
      statusRelacionamento = 'Casado(a) com <@' + userData.casadoCom + '> 💍';
    }

    const embedSaldo = new EmbedBuilder()
      .setColor(0x00ffff)
      .setTitle('💎 Perfil e Diamantes — ' + alvo.username)
      .addFields(
        { name: '💎 Diamantes:', value: '`' + userData.diamantes + '` diamantes' },
        { name: '❤️ Status:', value: statusRelacionamento }
      )
      .setThumbnail(alvo.displayAvatarURL())
      .setTimestamp();

    return interaction.reply({ embeds: [embedSaldo] });
  }

  // /casar
  if (commandName === 'casar') {
    const parceiro = options.getUser('parceiro');
    const autorData = getUsuario(db, user.id);
    const parceiroData = getUsuario(db, parceiro.id);

    if (parceiro.id === user.id) {
      return interaction.reply({ content: '❌ Você não pode casar com você mesmo!', flags: MessageFlags.Ephemeral });
    }

    if (parceiro.bot) {
      return interaction.reply({ content: '❌ Você não pode casar com um bot!', flags: MessageFlags.Ephemeral });
    }

    if (autorData.casadoCom) {
      return interaction.reply({ content: '❌ Você já está casado(a)! Use `/divorciar` antes de se casar de novo.', flags: MessageFlags.Ephemeral });
    }

    if (parceiroData.casadoCom) {
      return interaction.reply({ content: '❌ ' + parceiro.username + ' já está casado(a) com outra pessoa!', flags: MessageFlags.Ephemeral });
    }

    const CUSTO_CASAMENTO = 50000;
    const saldoAtual = BigInt(autorData.diamantes || '0');

    if (saldoAtual < BigInt(CUSTO_CASAMENTO) && user.id !== DONO_ID) {
      return interaction.reply({
        content: '❌ Casar custa **50.000 diamantes**! Seu saldo atual é de `' + autorData.diamantes + '` diamantes. Fique em call para acumular mais!',
        flags: MessageFlags.Ephemeral
      });
    }

    const embedPedido = new EmbedBuilder()
      .setColor(0xff1493)
      .setTitle('💍 PEDIDO DE CASAMENTO!')
      .setDescription('Hey <@' + parceiro.id + '>, o(a) <@' + user.id + '> está te pedindo em casamento por **50.000 diamantes**!\n\nVocê aceita se casar e formar um casal no servidor?')
      .setFooter({ text: 'Aguardando resposta...' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('aceitar_casamento_' + user.id + '_' + parceiro.id)
        .setLabel('Sim, Aceito! 💍')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('recusar_casamento_' + user.id + '_' + parceiro.id)
        .setLabel('Recusar 💔')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({ content: '<@' + parceiro.id + '>', embeds: [embedPedido], components: [row] });
  }

  // /divorciar
  if (commandName === 'divorciar') {
    const userData = getUsuario(db, user.id);

    if (!userData.casadoCom) {
      return interaction.reply({ content: '❌ Você não está casado(a) com ninguém no momento.', flags: MessageFlags.Ephemeral });
    }

    const exId = userData.casadoCom;
    const exData = getUsuario(db, exId);

    userData.casadoCom = null;
    exData.casadoCom = null;

    delete db.casais[user.id + '_' + exId];
    delete db.casais[exId + '_' + user.id];

    salvarDados(db);

    return interaction.reply({ content: '💔 O casamento entre <@' + user.id + '> e <@' + exId + '> foi encerrado. Vocês agora estão solteiros.' });
  }

  // /topcasais
  if (commandName === 'topcasais') {
    const casaisLista = Object.values(db.casais);

    if (casaisLista.length === 0) {
      return interaction.reply({ content: '📑 Ainda não existe nenhum casal registrado no servidor. Use `/casar` para ser o primeiro!' });
    }

    let textoTop = '';
    const agora = Date.now();

    casaisLista.forEach((casal, index) => {
      const diffMs = agora - casal.inicio;
      const totalSegundos = Math.floor(diffMs / 1000);

      const dias = Math.floor(totalSegundos / (3600 * 24));
      const horas = Math.floor((totalSegundos % (3600 * 24)) / 3600);
      const minutos = Math.floor((totalSegundos % 3600) / 60);

      const anos = Math.floor(dias / 365);
      const meses = Math.floor((dias % 365) / 30);
      const diasRestantes = dias % 30;

      let tempoFormatado = '';
      if (anos > 0) tempoFormatado += anos + ' ano(s), ';
      if (meses > 0) tempoFormatado += meses + ' mês(es), ';
      tempoFormatado += diasRestantes + ' dia(s), ' + horas + 'h e ' + minutos + 'm';

      textoTop += '**' + (index + 1) + '.** <@' + casal.p1 + '> ❤️ <@' + casal.p2 + '>\n';
      textoTop += '└ ⏱️ **Juntos há:** ' + tempoFormatado + '\n\n';
    });

    const embedTop = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle('👑 TOP CASAIS DO SERVIDOR')
      .setDescription(textoTop)
      .setTimestamp();

    return interaction.reply({ embeds: [embedTop] });
  }

  // /diario
  if (commandName === 'diario') {
    const userData = getUsuario(db, user.id);
    const agora = Date.now();
    const COOLDOWN = 24 * 60 * 60 * 1000;

    if (agora - userData.ultimoDaily < COOLDOWN) {
      const faltaMs = COOLDOWN - (agora - userData.ultimoDaily);
      const faltaHoras = Math.floor(faltaMs / (1000 * 60 * 60));
      const faltaMin = Math.floor((faltaMs % (1000 * 60 * 60)) / (1000 * 60));

      return interaction.reply({
        content: '⏳ Você já resgatou sua recompensa diária hoje! Volte em **' + faltaHoras + 'h ' + faltaMin + 'm**.',
        flags: MessageFlags.Ephemeral
      });
    }

    const RECOMPENSA = 1000;
    const saldoBig = BigInt(userData.diamantes || '0') + BigInt(RECOMPENSA);
    userData.diamantes = saldoBig.toString();
    userData.ultimoDaily = agora;

    salvarDados(db);

    return interaction.reply({ content: '🎁 Você resgatou seus **1.000 diamantes** diários! Saldo atual: `' + userData.diamantes + '` 💎' });
  }

  // /pay
  if (commandName === 'pay') {
    const destino = options.getUser('membro');
    const valorStr = options.getString('quantidade');

    if (destino.id === user.id) {
      return interaction.reply({ content: '❌ Você não pode transferir para você mesmo!', flags: MessageFlags.Ephemeral });
    }

    let valorBig;
    try {
      valorBig = BigInt(valorStr);
      if (valorBig <= 0n) throw new Error();
    } catch {
      return interaction.reply({ content: '❌ Informe um número inteiro positivo válido para a transferência.', flags: MessageFlags.Ephemeral });
    }

    const remetenteData = getUsuario(db, user.id);
    const destinoData = getUsuario(db, destino.id);
    const saldoRemetente = BigInt(remetenteData.diamantes || '0');

    if (saldoRemetente < valorBig && user.id !== DONO_ID) {
      return interaction.reply({ content: '❌ Você não possui diamantes suficientes!', flags: MessageFlags.Ephemeral });
    }

    if (user.id !== DONO_ID) {
      remetenteData.diamantes = (saldoRemetente - valorBig).toString();
    }

    const saldoDestino = BigInt(destinoData.diamantes || '0');
    destinoData.diamantes = (saldoDestino + valorBig).toString();

    salvarDados(db);

    return interaction.reply({ content: '💸 <@' + user.id + '> transferiu **' + valorStr + '** diamantes para <@' + destino.id + '>! 💎' });
  }

  // /doacao
  if (commandName === 'doacao') {
    const embedDoacao = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('💛 Doação para o Criador / GB')
      .setDescription('Ajude o **GB**, dono do bot, com qualquer centavo no PIX! Ele precisa de uma força para manter a infraestrutura do bot e continuar trazendo sistemas incríveis para o servidor! ✨')
      .addFields(
        { name: '💳 Chave PIX (E-mail):', value: '```' + PIX_CHAVE + '```' },
        { name: '👤 Titular:', value: 'Bryan Felipe de Sousa Zurra' }
      )
      .setFooter({ text: 'Muito obrigado por qualquer contribuição! ❤️' });

    return interaction.reply({ embeds: [embedDoacao] });
  }
});

// --- GANHO DE DIAMANTES EM CALL (300 DIMA A CADA 1 HORA) ---
client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.member.id;
  if (newState.member.user.bot) return;

  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(userId, Date.now());
  } 
  else if (oldState.channelId && !newState.channelId) {
    if (voiceSessions.has(userId)) {
      const entradaTime = voiceSessions.get(userId);
      const duracaoMs = Date.now() - entradaTime;
      voiceSessions.delete(userId);

      const horasCompletas = Math.floor(duracaoMs / (1000 * 60 * 60));

      if (horasCompletas >= 1) {
        const diamantesGanhos = horasCompletas * 300;
        const db = carregarDados();
        const userData = getUsuario(db, userId);

        const saldoAtual = BigInt(userData.diamantes || '0');
        userData.diamantes = (saldoAtual + BigInt(diamantesGanhos)).toString();

        salvarDados(db);

        newState.member.send('🎙️ Você passou **' + horasCompletas + ' hora(s)** em call e ganhou **' + diamantesGanhos + ' diamantes**! 💎').catch(() => {});
      }
    }
  }
});

client.login(TOKEN);