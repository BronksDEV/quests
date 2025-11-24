import type { AuthSession } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email?: string;
  nome_completo?: string;
  matricula?: string;
  turma?: string;
  role: 'aluno' | 'professor' | 'admin';
  is_blocked?: boolean;
}

export interface Alternativa {
  id: number;
  question_id: number;
  text: string;
  is_correct: boolean;
  letter: string;
}

export interface Questao {
  id: number;
  prova_id: number;
  title: string;
  disciplina?: string;
  long_text?: string;
  image_url_1?: string;
  image_url_2?: string;
  question_order?: number;
  alternativas?: Alternativa[];
}

export interface Prova {
  id: number;
  title: string;
  serie_id_string: string;
  serie: string;
  area: string;
  data_inicio: string;
  data_fim: string;
  created_at: string;
  status: 'fechada' | 'aberta_para_todos';
  questoes?: Questao[];
  provas_acesso_individual?: { student_id: string }[];
}

export interface Resultado {
  id: number;
  prova_id: number;
  student_id: string;
  respostas: { [key: number]: string };
  created_at: string;
}


export interface ExamArea {
    id: string;
    area: string;
    exams: Prova[]; 
}
  

export interface ExamForCard {
    id: number;
    area: string;
    serie: string;
    series: string;
    startDate: string;
    endDate: string;
    areaName: string;
    title: string;
    status: 'fechada' | 'aberta_para_todos';
}

export type StudentQuestao = Omit<Questao, 'alternativas'> & {
    alternativas: Omit<Alternativa, 'is_correct'>[];
};

export interface DisciplineScore {
    correct: number;
    total: number;
}
  
export interface StudentResultDetail {
    student_id: string;
    nome_completo: string;
    matricula: string;
    turma: string;
    total_correct: number;
    total_questions: number;
    score_by_discipline: Record<string, DisciplineScore>;
}