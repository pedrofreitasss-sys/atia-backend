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
    const { nome, idade, sintomas, pressao, temperatura, comorbidades, alergias } = request.body;

    console.log('\n Requisição recebida em /atia');
    console.log('Dados recebidos:', { nome, idade, sintomas, pressao, temperatura, comorbidades, alergias });

    if (!nome || !idade || !sintomas) {
        reply.status(400).send({ error: 'Dados incompletos. Certifique-se de enviar nome, idade e sintomas.' });
        return;
    }

    const prompt = `
    Você é a ATIA, uma Assistente de Triagem Médica Inteligente, especializada em análise de sintomas e risco clínico com base no Protocolo de Manchester.

    Você receberá os seguintes dados do paciente:
    - Nome: ${nome}
    - Idade: ${idade}
    - Sintomas: ${sintomas}
    - Pressão Arterial: ${pressao}
    - Temperatura: ${temperatura}
    - Comorbidades: ${comorbidades}
    - Alergias: ${alergias}

    Com base nessas informações, forneça uma avaliação clara e objetiva, respondendo no seguinte formato:
    Prognóstico Clínico: Descreva de forma direta o que pode estar acontecendo com o paciente.
    Especialidade Médica Indicada: Informe qual profissional da saúde deve ser procurado.
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
            sintomas,
            pressao,
            temperatura,
            comorbidades,
            alergias,
            diagnostico: respostaIA,
            filename: nomePDF
        });

        const linkPDF = pdfResponse.data.download;

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

        const bufferPDF = await axios.get(linkPDF, { responseType: 'stream' });

        const formData = new FormData();
        formData.append('number', telefoneDestino);
        formData.append('caption', `Ficha de triagem do paciente ${nome}`);
        formData.append('document', bufferPDF.data, { filename: nomePDF });

        await axios.post(process.env.WHATSAPP_API_URL, formData, {
            headers: formData.getHeaders(),
            auth: {
                username: process.env.WHATSAPP_API_USER,
                password: process.env.WHATSAPP_API_PASS
            }
        });

        reply.send({ diagnostico: respostaIA, status: 'Relatório gerado e enviado com sucesso!' });

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
