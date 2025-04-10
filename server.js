require('dotenv').config(); // Carregando as variáveis do ambiente
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai'); // openai@4.x
const axios = require('axios');
const FormData = require('form-data');

// Permitir acessos de qualquer origem
fastify.register(cors);

// Configuração do OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

fastify.post('/atia', async (request, reply) => {
  let {
    nome,
    idade,
    genero,
    sintomas,
    pressao,
    temperatura,
    frequencia_cardiaca,
    saturacao,
    doencas_preexistentes,
    uso_medicamentos,
    alergias,
    cirurgias_anteriores,
    habitos,
    historico_genetico,
    nivel_consciencia,
    dor,
    dificuldade_respiratoria,
    sinais_choque,
    inicio_sintomas,
    email
  } = request.body;

  console.log('\n Requisição recebida em /atia');
  console.log('Dados recebidos:', {
    nome, idade, genero, sintomas, pressao, temperatura, frequencia_cardiaca, saturacao,
    doencas_preexistentes, uso_medicamentos, alergias, cirurgias_anteriores, habitos,
    historico_genetico, nivel_consciencia, dor, dificuldade_respiratoria, sinais_choque,
    inicio_sintomas, email
  });

  if (!nome || !idade || !sintomas || !email) {
    reply.status(400).send({ error: 'Dados incompletos. Certifique-se de enviar nome, idade, sintomas e e-mail.' });
    return;
  }

  // Conversão da idade falada para formato de data (dd/mm/aaaa)
  try {
    const promptData = `
Você receberá uma data de nascimento falada por voz em português. 
Sua tarefa é converter isso para o formato dd/mm/aaaa. 
Retorne apenas a data formatada corretamente. 
Exemplo: "dois de maio de mil novecentos e noventa e sete", converteria para: 02/05/1997

Entrada: ${idade}
    `;

    const respostaData = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: promptData }],
      max_tokens: 20
    });

    const idadeFormatada = respostaData.choices[0].message.content.trim();
    console.log("Idade convertida para data:", idadeFormatada);

    // Corrigir caso venha com "Saída:" ou prefixos extras
    const apenasData = idadeFormatada.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || idadeFormatada;

    // Calcular idade detalhada
    try {
  const [dia, mes, ano] = apenasData.split('/').map(Number);
  const nascimento = new Date(ano, mes - 1, dia);
  const hoje = new Date();

  let anos = hoje.getFullYear() - nascimento.getFullYear();
  let meses = hoje.getMonth() - nascimento.getMonth();
  let dias = hoje.getDate() - nascimento.getDate();

  if (dias < 0) {
    meses--;
    dias += new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate();
  }

  if (meses < 0) {
    anos--;
    meses += 12;
  }

  idade = `${apenasData} (${anos} anos / ${meses} meses / ${dias} dias)`;
  console.log("Idade formatada completa:", idade);
} catch (erro) {
  console.error("Erro ao calcular idade completa:", erro.message);
  idade = apenasData;
}

  } catch (erro) {
    console.error("Erro ao converter a idade:", erro.message);
  }

  // Revisar campos do paciente
  try {
    const promptRevisao = `
Você é um corretor ortográfico médico. Irei te enviar um objeto JSON com dados de um paciente. Corrija **apenas os VALORES RECEBIDOS** do objeto. **Não altere as chaves. Não adicione ou remova campos.**

Regras:
- Corrija ortografia, pontuação e gramática conforme as normas do português brasileiro.
- Apenas nomes próprios (como nomes de pessoas, medicamentos, lugares) devem começar com letra maiúscula.
- Frases comuns devem começar apenas com a primeira letra maiúscula.
- NÃO transforme tudo em maiúsculas estilo título (ex: "Dor Generalizada" está errado).
- Converta números por extenso para numerais (ex: "trinta e seis ponto oito" → "36.8").
- Separe com vírgulas onde necessário, como em "perna, 10", "ombro, 5", "corpo, 8".
- Para alergias:
   - Se o valor for "não" ou "nenhuma", retorne exatamente: "o paciente não informou quadros de alergias."
   - Caso contrário, retorne: "o paciente tem alergia(s) a: ..."

Retorne apenas o JSON corrigido:

${JSON.stringify({
  nome,
  genero,
  sintomas,
  temperatura,
  dor,
  alergias,
  doencas_preexistentes,
  uso_medicamentos,
  cirurgias_anteriores,
  habitos,
  historico_genetico
})}
`;

    const respostaCorrigida = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: promptRevisao }],
      max_tokens: 700
    });

    const corrigido = JSON.parse(respostaCorrigida.choices[0].message.content.trim());

    nome = corrigido.nome;
    genero = corrigido.genero;
    sintomas = corrigido.sintomas;
    temperatura = corrigido.temperatura;
    dor = corrigido.dor;
    alergias = corrigido.alergias;
    doencas_preexistentes = corrigido.doencas_preexistentes;
    uso_medicamentos = corrigido.uso_medicamentos;
    cirurgias_anteriores = corrigido.cirurgias_anteriores;
    habitos = corrigido.habitos;
    historico_genetico = corrigido.historico_genetico;

    console.log("Campos revisados com sucesso.");
  } catch (erro) {
    console.error("Erro ao revisar os dados:", erro.message);
  }

  const prompt = `
Você é a ATIA, uma Assistente de Triagem Médica Inteligente, especializada em análise de sintomas e risco clínico com base no Protocolo de Manchester.

Você receberá os seguintes dados do paciente:
- Nome: ${nome}
- Idade: ${idade}
- Gênero: ${genero}
- Sintomas: ${sintomas}
- Pressão Arterial: ${pressao}
- Temperatura: ${temperatura}
- Frequência Cardíaca: ${frequencia_cardiaca}
- Saturação de Oxigênio: ${saturacao}
- Doenças Preexistentes: ${doencas_preexistentes}
- Uso de Medicamentos: ${uso_medicamentos}
- Alergias: ${alergias}
- Cirurgias Anteriores: ${cirurgias_anteriores}
- Hábitos: ${habitos}
- Histórico Genético Familiar: ${historico_genetico}
- Nível de Consciência: ${nivel_consciencia}
- Dor: ${dor}
- Dificuldade Respiratória: ${dificuldade_respiratoria}
- Sinais de Choque: ${sinais_choque}
- Início dos Sintomas: ${inicio_sintomas} dias atrás

Com base nessas informações, forneça uma avaliação clara e objetiva, respondendo no seguinte formato:
- Avaliação Inicial: Com base nas informações relatadas, descreva de forma geral e cuidadosa a possibilidade de condições comuns, **sem emitir diagnóstico médico**. Use linguagem acessível e empática, sem termos técnicos, e sempre recomende procurar um profissional de saúde qualificado para avaliação presencial.
- Especialidade Médica Indicada: Informe qual profissional da saúde deve ser procurado para acompanhar a condição relatada.
- Classificação de Manchester: Indique a cor correspondente à gravidade e o tempo máximo de espera segundo o protocolo de Manchester.
- Exame(s) Recomendado(s): Caso julgue necessário, indique exames básicos que possam ajudar na investigação inicial.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500
    });

    const respostaIA = completion.choices[0].message.content;
    const nomePDF = `ficha_ATIA_${Date.now()}.pdf`;

    reply.send({
      diagnostico: respostaIA,
      status: 'Análise finalizada com sucesso. A ficha será enviada por e-mail separadamente.'
    });

    axios.post('https://ficha-pdf.glitch.me/gerar-pdf', {
      nome,
      idade,
      genero,
      sintomas,
      pressao,
      temperatura,
      frequencia_cardiaca,
      saturacao,
      doencas_preexistentes,
      uso_medicamentos,
      alergias,
      cirurgias_anteriores,
      habitos,
      historico_genetico,
      nivel_consciencia,
      dor,
      dificuldade_respiratoria,
      sinais_choque,
      inicio_sintomas,
      email,
      diagnostico: respostaIA,
      filename: nomePDF
    }).then(() => {
      console.log("PDF enviado para geração no Glitch.");
    }).catch((err) => {
      console.error("Erro ao enviar dados ao Glitch:", err.message);
    });

  } catch (error) {
    console.error('Erro ao processar:', error.message);
    reply.status(500).send({ error: 'Erro ao processar a solicitação.' });
  }
});

fastify.get('/', async (request, reply) => {
  return { mensagem: 'ATIA Backend rodando com sucesso!' };
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/baixar/',
});

const PORT = process.env.PORT || 3000;
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) throw err;
  console.log(`Servidor rodando em ${address}`);
});
