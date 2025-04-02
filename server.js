require('dotenv').config(); // Carregando as variáveis do ambiente
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const OpenAI = require('openai'); // openai@4.x
const twilio = require('twilio'); // para ligação automatizada
const axios = require('axios'); // para envio via API WhatsApp

// Permitir acessos de qualquer origem
fastify.register(cors);

// Configuração do OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Configuração do Twilio (ligação)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const telefoneDestino = process.env.NUMERO_DESTINO_TESTE || '+550000000000';

// Função para gerar o PDF do relatório
function gerarPDF(dados, caminhoPDF) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument();
            doc.pipe(fs.createWriteStream(caminhoPDF));

            doc.fontSize(20).text('Relatório ATIA – Triagem Inteligente', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Nome: ${dados.nome}`);
            doc.text(`Idade: ${dados.idade}`);
            doc.text(`Sintomas: ${dados.sintomas}`);
            doc.text(`Pressão Arterial: ${dados.pressao}`);
            doc.text(`Temperatura: ${dados.temperatura}`);
            doc.text(`Comorbidades: ${dados.comorbidades}`);
            doc.text(`Alergias: ${dados.alergias}`);
            doc.moveDown();
            doc.fontSize(14).text('Diagnóstico ATIA:');
            doc.fontSize(12).text(`${dados.diagnostico}`);

            doc.end();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// Rota principal
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
        console.log('Enviando prompt para a OpenAI...');
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        });

        const respostaIA = completion.choices[0].message.content;
        console.log('Diagnóstico gerado pela IA:', respostaIA);

        const caminhoPDF = `./relatorio_${Date.now()}.pdf`;
        await gerarPDF({ nome, idade, sintomas, pressao, temperatura, comorbidades, alergias, diagnostico: respostaIA }, caminhoPDF);

        // Se identificar "Manchester: Vermelha", dispara uma ligação
        if (respostaIA.toLowerCase().includes('vermelha')) {
            await twilioClient.calls.create({
                to: telefoneDestino,
                from: process.env.TWILIO_PHONE_NUMBER,
                twiml: `<Response><Say voice="alice" language="pt-BR">Paciente ${nome} está em estado grave e requer atendimento urgente. Diagnóstico: ${respostaIA}</Say></Response>`
            });
        }

        // Envio por WhatsApp (exemplo com Z-API ou similar)
        const formData = new FormData();
        formData.append('number', telefoneDestino);
        formData.append('caption', `Ficha de triagem do paciente ${nome}`);
        formData.append('document', fs.createReadStream(caminhoPDF));

        await axios.post(process.env.WHATSAPP_API_URL, formData, {
            headers: formData.getHeaders(),
            auth: {
                username: process.env.WHATSAPP_API_USER,
                password: process.env.WHATSAPP_API_PASS
            }
        });

        reply.send({ diagnostico: respostaIA, status: 'Relatório gerado e enviado com sucesso!' });

        fs.unlinkSync(caminhoPDF);
    } catch (error) {
        console.error('Erro ao processar:', error.message);
        reply.status(500).send({ error: 'Erro ao processar a solicitação.' });
    }
});

// Rota de teste
fastify.get('/', async (request, reply) => {
    return { mensagem: 'ATIA Backend rodando com sucesso!' };
});

// Iniciando o servidor
const PORT = process.env.PORT || 3000;
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) throw err;
    console.log(`Servidor rodando em ${address}`);
});
