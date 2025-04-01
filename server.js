require('dotenv').config(); // Carrega as variáveis do ambiente
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const OpenAI = require('openai');

// Permitir acessos de qualquer origem
fastify.register(cors);

// Configuração da OpenAI usando variável de ambiente
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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

// Rota principal que recebe os dados e retorna um diagnóstico
fastify.post('/atia', async (request, reply) => {
    // Extraindo dados da requisição
    const { nome, idade, sintomas, pressao, temperatura, comorbidades, alergias } = request.body;
    
    // Validação básica dos dados recebidos
    if (!nome || !idade || !sintomas) {
        reply.status(400).send({ error: 'Dados incompletos. Certifique-se de enviar nome, idade e sintomas.' });
        return;
    }
    
    // Montar a pergunta para a IA com formatação estruturada
    const prompt = `
    Você é a ATIA, uma Assistente de Triagem Médica Inteligente.
    Seu objetivo é avaliar os sintomas e fornecer um prognóstico baseado no Protocolo de Manchester.
    Você receberá as seguintes informações do paciente:
    - Nome: ${nome}
    - Idade: ${idade}
    - Sintomas: ${sintomas}
    - Pressão Arterial: ${pressao}
    - Temperatura: ${temperatura}
    - Comorbidades: ${comorbidades}
    - Alergias: ${alergias}
    
    Com base nesses dados, forneça um prognóstico inicial e recomende uma especialidade médica apropriada.
    
    Responda no seguinte formato:
    1. Prognóstico: [descreva o que pode estar acontecendo]
    2. Especialidade Médica Recomendável: [médico indicado]
    3. Classificação no Protocolo de Manchester: [cor correspondente]
    `;
    
    try {
        // Chamar a IA da OpenAI
        const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        });
        
        const respostaIA = response.data.choices[0].message.content;
        
        // Criar nome do arquivo PDF único
        const caminhoPDF = `./relatorio_${Date.now()}.pdf`;
        
        // Gerar o PDF com as informações e o diagnóstico
        await gerarPDF({
            nome, idade, sintomas, pressao, temperatura, comorbidades, alergias, diagnostico: respostaIA
        }, caminhoPDF);
        
        // Resposta para a Alexa ou site
        reply.send({ diagnostico: respostaIA, status: 'Relatório gerado com sucesso!' });
        
        // Remover o PDF do servidor após envio (opcional)
        fs.unlinkSync(caminhoPDF);
    } catch (error) {
        console.error('Erro ao chamar a OpenAI:', error);
        reply.status(500).send({ error: 'Erro ao processar a solicitação.' });
    }
});

// Rota de teste para verificar se o backend está rodando
fastify.get('/', async (request, reply) => {
    return { mensagem: 'ATIA Backend rodando com sucesso!' };
});

// Iniciar o servidor na porta configurada
const PORT = process.env.PORT || 3000;
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) throw err;
    console.log(`Servidor rodando em ${address}`);
});