require('dotenv').config(); // Carregando as variáveis do ambiente
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai'); // openai@4.x
const twilio = require('twilio'); // para ligação automatizada
const axios = require('axios'); // para envio via API WhatsApp
const FormData = require('form-data');
const puppeteer = require('puppeteer'); // para gerar PDF profissional
const cron = require('node-cron');

// Permitir acessos de qualquer origem
fastify.register(cors);

// Configuração do OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Configuração do Twilio (ligação)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const telefoneDestino = process.env.NUMERO_DESTINO_TESTE || '+550000000000';

// Gera PDF personalizado com puppeteer
async function gerarPDF(dados, nomeArquivo) {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const conteudoHTML = `
    <html>
      <head>
        <style>
          body { font-family: 'Times New Roman', serif; padding: 40px; font-size: 12pt; }
          .titulo { text-align: center; font-size: 18pt; font-weight: bold; margin-bottom: 20px; }
          .quadro { border: 1px solid #000; padding: 15px; margin-bottom: 15px; }
          .qrcode { text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="titulo">Relatório ATIA – Triagem Inteligente</div>
        <div class="quadro">
          <p><strong>Nome:</strong> ${dados.nome}</p>
          <p><strong>Idade:</strong> ${dados.idade}</p>
          <p><strong>Sintomas:</strong> ${dados.sintomas}</p>
          <p><strong>Pressão Arterial:</strong> ${dados.pressao}</p>
          <p><strong>Temperatura:</strong> ${dados.temperatura}</p>
          <p><strong>Comorbidades:</strong> ${dados.comorbidades}</p>
          <p><strong>Alergias:</strong> ${dados.alergias}</p>
        </div>
        <div class="quadro">
          <p><strong>Diagnóstico ATIA:</strong><br>${dados.diagnostico.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="qrcode">
          <img src="https://cdn.glitch.global/22a46256-a326-4e9a-b92e-f35048388683/ATIA%20QrCode.png?v=1743189247514" width="90">
        </div>
      </body>
    </html>`;

    await page.setContent(conteudoHTML, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    const caminhoFinal = path.join(__dirname, 'public');
    if (!fs.existsSync(caminhoFinal)) fs.mkdirSync(caminhoFinal);
    fs.writeFileSync(path.join(caminhoFinal, nomeArquivo), pdfBuffer);
}

// Excluir PDF após 10 minutos
cron.schedule('* * * * *', () => {
    const dir = path.join(__dirname, 'public');
    fs.readdir(dir, (err, files) => {
        if (err) return;
        const agora = Date.now();
        files.forEach(file => {
            if (file.endsWith('.pdf')) {
                const caminho = path.join(dir, file);
                fs.stat(caminho, (err, stats) => {
                    if (!err && agora - stats.mtimeMs > 10 * 60 * 1000) {
                        fs.unlink(caminho, () => {});
                    }
                });
            }
        });
    });
});

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
        const nomePDF = `relatorio_${Date.now()}.pdf`;
        const caminhoPDF = path.join(__dirname, 'public', nomePDF);

        await gerarPDF({ nome, idade, sintomas, pressao, temperatura, comorbidades, alergias, diagnostico: respostaIA }, nomePDF);

        if (respostaIA.toLowerCase().includes('vermelha')) {
            await twilioClient.calls.create({
                to: telefoneDestino,
                from: process.env.TWILIO_PHONE_NUMBER,
                twiml: `<Response><Say voice="alice" language="pt-BR">Paciente ${nome} está em estado grave. Diagnóstico: ${respostaIA}</Say></Response>`
            });
        }

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
