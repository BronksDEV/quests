import type { Prova, Profile } from '../types';

export type ExamStatus = 'available' | 'completed' | 'expired' | 'locked_time' | 'locked_permission';

export const getExamStatus = (
    exam: Prova, 
    profile: Profile, 
    submittedExamIds: Set<number>
): ExamStatus => {
    if (submittedExamIds.has(exam.id)) {
        return 'completed';
    }

    const now = new Date();
    const endDate = new Date(exam.data_fim);

    if (now > endDate) {
        return 'expired';
    }

    const hasGlobalAccess = exam.status === 'aberta_para_todos';
    const hasIndividualAccess = exam.provas_acesso_individual?.some(
        (acesso) => acesso.student_id === profile.id
    );
    
    const hasPermission = profile.role === 'admin' || hasGlobalAccess || hasIndividualAccess;

    if (!hasPermission) {
        return 'locked_permission';
    }

    const startDate = new Date(exam.data_inicio);
    if (now < startDate) {
        return 'locked_time';
    }

    return 'available';
};