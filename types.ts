
export interface Profile {
  id: string;
  role: 'aluno' | 'professor' | 'admin';
  email: string;
  nome_completo?: string;
  matricula?: string;
  turma?: string;
  presenca_liberada_ate?: string; // Legacy, can be removed later
  permitido_individual?: boolean; // Legacy, can be removed later
  is_blocked?: boolean;
}

export interface Exam {
  id: number;
  area: string;
  id_area: string;
  serie: string;
  arquivo_url: string;
  data_inicio: string;
  data_fim: string;
  title: string;
  status: 'fechada' | 'aberta_para_todos';
}

export interface ExamForCard extends Omit<Exam, 'serie_id_string' | 'arquivo_url' | 'data_inicio' | 'data_fim' | 'id_area'> {
  series: string;
  startDate: string;
  endDate: string;
  areaName: string;
}

export interface ExamArea {
    area: string;
    id: string;
    exams: ExamForCard[];
}

export interface Alternativa {
  id?: number;
  question_id?: number;
  text: string;
  is_correct: boolean;
  letter: string;
}

export interface Questao {
  id?: number;
  prova_id: number;
  title: string;
  disciplina?: string;
  long_text?: string;
  image_url_1?: string;
  image_url_2?: string;
  question_order?: number;
  alternativas?: Alternativa[];
}

// Tipos seguros para a visão do aluno (sem a resposta correta)
export interface StudentAlternativa {
    id: number;
    text: string;
    letter: string;
}

export interface StudentQuestao extends Omit<Questao, 'alternativas'> {
    alternativas?: StudentAlternativa[];
}

export interface Prova {
    id: number;
    title: string;
    serie_id_string: string;
    serie: string;
    area: string;
    questoes?: Questao[];
    created_at: string;
    status: 'fechada' | 'aberta_para_todos';
    data_inicio: string;
    data_fim: string;
}

// Tipos para o Dashboard de Resultados
export type DisciplineScore = {
    correct: number;
    total: number;
};

export interface StudentResultDetail {
    student_id: string;
    nome_completo: string;
    matricula: string;
    turma: string;
    total_questions: number;
    total_correct: number;
    score_by_discipline: Record<string, DisciplineScore>;
}
