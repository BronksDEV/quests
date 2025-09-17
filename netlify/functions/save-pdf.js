// Este é o conteúdo completo do seu arquivo: /netlify/functions/save-pdf.js

import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';

// Função principal que a Netlify irá executar. Ela é acionada pela sua prova.
export const handler = async (event) => {
  
  // As variáveis de ambiente que configuramos no site da Netlify
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  // Verificação de segurança: Se as chaves não estiverem configuradas, retorna um erro claro.
  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro de configuração no servidor: As variáveis do Supabase não foram encontradas.' }),
    };
  }

  // Inicializa a conexão com o Supabase usando as chaves secretas.
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Pega os dados enviados pelo seu site (prova1.html)
    const data = JSON.parse(event.body);
    const { pdfData, fileName } = data; // Usaremos o fileName vindo do frontend

    // Limpa a string do PDF para pegar apenas os dados.
    const pdfBase64 = pdfData.split('base64,')[1];
    
    // Converte a string de volta para um formato binário (Buffer) que pode ser salvo.
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    
    // Define em qual "balde" (bucket) queremos salvar.
    const bucketName = 'resultados-provas'; // Lembre-se, este nome deve ser idêntico ao que você criou no Supabase.

    // Envia o arquivo para o armazém do Supabase
    const { data: uploadData, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true // Se um aluno enviar a prova duas vezes, substitui a versão antiga.
      });

    // Se o Supabase retornar um erro, lança o erro para ser capturado abaixo.
    if (error) {
      throw error;
    }

    // Se tudo deu certo, retorna uma mensagem de sucesso para o site.
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Prova salva com sucesso!' }),
    };

  } catch (error) {
    console.error('Erro na função save-pdf:', error); // Loga o erro no painel da Netlify para depuração
    // Se ocorrer qualquer erro, retorna uma mensagem detalhada para o site.
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao processar o PDF no servidor.', error: error.message }),
    };
  }
};