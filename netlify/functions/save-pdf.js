// ARQUIVO ATUALIZADO: /netlify/functions/save-pdf.js

import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';

export const handler = async (event) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro de configuração: Variáveis do Supabase não encontradas.' }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const data = JSON.parse(event.body);
    const { pdfData, filePath } = data; // 

    if (!pdfData || !filePath) {
        throw new Error("Dados incompletos recebidos. Faltando PDF ou caminho do arquivo.");
    }

    const pdfBase64 = pdfData.split('base64,')[1];
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    
    const bucketName = 'resultados-provas';

    
    const { data: uploadData, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, pdfBuffer, { // 
        contentType: 'application/pdf',
        upsert: true 
      });

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Prova salva com sucesso!', path: filePath }),
    };

  } catch (error) {
    console.error('Erro na função save-pdf:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao processar o PDF no servidor.', error: error.message }),
    };
  }
};
