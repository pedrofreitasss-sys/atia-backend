require('dotenv').config(); // Carregando as variáveis do ambiente
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const OpenAI = require('openai'); // openai@4.x

// Permitir acessos de qualquer origem
fastify.register(cors);

// sintaxe da v4.x
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Função para gerar o PDF do relatório (ainda sem funcionar)
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
    const { nome, idade, sintomas, pressao, temperatura, comorbidades, alergias } = request.body;

    // Log de requisição recebida
    console.log('\n Requisição recebida em /atia');
    console.log('Dados recebidos:', {
        nome, idade, sintomas, pressao, temperatura, comorbidades, alergias
    });

    if (!nome || !idade || !sintomas) {
        console.warn('Dados incompletos! Nome, idade ou sintomas ausentes.');
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
- Entre outros.

Com base nessas informações, forneça uma avaliação clara e objetiva, respondendo no seguinte formato:
Prognóstico Clínico: Descreva de forma direta o que pode estar acontecendo com o paciente.
Especialidade Médica Indicada: Informe qual profissional da saúde deve ser procurado.
Classificação de Manchester: Indique a cor correspondente à gravidade e o tempo máximo de espera.
Exame(s) Recomendado(s): Caso julgue necessário e relevante, indique exames básicos que podem ajudar no diagnóstico.

Utilize linguagem acessível, sem termos técnicos excessivos, pois a resposta será ouvida por um paciente. Seja objetiva, empática e focada na orientação.

A resposta tem que ser objetiva e não muito prolongada, exemplo de respostas que se espera: 
"Prognóstico Clínico: Pedro pode estar enfrentando um quadro de problemas cardíacos, visto que apresenta dor no peito, falta de ar e tontura.
Especialidade Médica Indicada: Cardiologia.
Classificação de Manchester: Vermelha – Atendimento de emergência dentro de 10 minutos.
Exames Recomendados: Eletrocardiograma, exames de sangue (enzimas cardíacas)."
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

        await gerarPDF({
            nome, idade, sintomas, pressao, temperatura, comorbidades, alergias, diagnostico: respostaIA
        }, caminhoPDF);

        reply.send({ diagnostico: respostaIA, status: 'Relatório gerado com sucesso!' });

        fs.unlinkSync(caminhoPDF);
    } catch (error) {
        console.error('Erro ao chamar a OpenAI:', error.message);
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
