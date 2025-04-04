require('dotenv').config(); // Carregando as variáveis do ambiente
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai'); // openai@4.x
const twilio = require('twilio'); // para ligação automatizada
const axios = require('axios'); // para envio via API WhatsApp
const FormData = require('form-data');

// Permitir acessos de qualquer origem
fastify.register(cors);

// Configuração do OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Configuração do Twilio (ligação)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const telefoneDestino = process.env.NUMERO_DESTINO_TESTE || '+550000000000';

fastify.post('/atia', async (request, reply) => {
  const {
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
    numero 
  } = request.body;

  console.log('\n Requisição recebida em /atia');
  console.log('Dados recebidos:', {
    nome, idade, genero, sintomas, pressao, temperatura, frequencia_cardiaca, saturacao,
    doencas_preexistentes, uso_medicamentos, alergias, cirurgias_anteriores, habitos,
    historico_genetico, nivel_consciencia, dor, dificuldade_respiratoria, sinais_choque,
    inicio_sintomas, numero
  });

    if (!nome || !idade || !sintomas) {
        reply.status(400).send({ error: 'Dados incompletos. Certifique-se de enviar nome, idade e sintomas.' });
        return;
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
    Prognóstico Clínico: Descreva de forma direta, empática e profissional (como se fosse um médico) o que pode estar acontecendo com o paciente.
    Especialidade Médica Indicada: Informe qual profissional da saúde deve ser procurado para tratar da condição dele.
    Classificação de Manchester: Indique a cor correspondente à gravidade e o tempo máximo de espera.
    Exame(s) Recomendado(s): Caso julgue necessário e relevante, indique exames básicos que podem ajudar no diagnóstico.
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        });

        const respostaIA = completion.choices[0].message.content;
        const nomePDF = `ficha_ATIA_${Date.now()}.pdf`;

        // Chama o Glitch para gerar o PDF
        const pdfResponse = await axios.post('https://ficha-pdf.glitch.me/gerar-pdf', {
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
            numero,
            diagnostico: respostaIA,
            filename: nomePDF
        });

        const linkPDF = pdfResponse.data.download;
        console.log('Link do PDF:', linkPDF);

        if (!linkPDF) {
            throw new Error('PDF não foi gerado corretamente pelo Glitch');
        }

        if (respostaIA.toLowerCase().includes('vermelha')) {
            await twilioClient.calls.create({
                to: telefoneDestino,
                from: process.env.TWILIO_PHONE_NUMBER,
                twiml: `<Response><Say voice="alice" language="pt-BR">Paciente ${nome} está em estado grave. Diagnóstico: ${respostaIA}</Say></Response>`
            });
        }

        // Aqui termina a lógica. PDF será enviado por outro backend.
        reply.send({ diagnostico: respostaIA, linkFicha: linkPDF, status: 'Relatório gerado com sucesso!' });

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
