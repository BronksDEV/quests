import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../App';
// FIX: Import `Prova` type to correctly type exam data from Supabase.
import type { ExamArea, ExamForCard, Prova } from '../types';
import ProfileModal from './ProfileModal';
import { Spinner } from './common';
import ExamCard from './ExamCard';

const StudentView: React.FC<{ onStartExam: (examId: number) => void }> = ({ onStartExam }) => {
    const { profile, refreshProfile } = useAuth();
    const [isProfileModalOpen, setProfileModalOpen] = useState(false);
    const [examSchedule, setExamSchedule] = useState<ExamArea[]>([]);
    const [submittedExamIds, setSubmittedExamIds] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [activeAreaId, setActiveAreaId] = useState<string>('all');
    
    const fetchExamsAndResults = useCallback(async () => {
        if (!profile) {
            setLoading(false);
            return;
        }
        setLoading(true);

        const { data: examsData, error: examsError } = await supabase.from('provas').select('*').order('area', { ascending: true }).order('serie', { ascending: true });
        
        if (examsError) {
            console.error("Erro ao buscar provas:", examsError);
            setLoading(false);
            return;
        }

        const { data: resultsData, error: resultsError } = await supabase.from('resultados').select('prova_id').eq('student_id', profile.id);
        if (resultsError) {
            console.error("Erro ao buscar resultados:", resultsError);
        } else {
            setSubmittedExamIds(new Set(resultsData.map(r => r.prova_id)));
        }
        
        // FIX: Type the exam data from Supabase to prevent `any` type propagation. This resolves the TypeScript error on the `.reduce` method.
        // Security Filter: Admins see all exams. Students see only exams for their specific class ('turma').
        const allExams = (examsData as Prova[]) || [];
        const examsForUser = profile.role === 'admin'
            ? allExams
            : allExams.filter(exam => exam.serie === profile.turma);

        // Group exams by their 'area' to ensure each unique area gets its own tab and section.
        const groupedByArea = examsForUser.reduce<{ [key: string]: ExamArea }>((acc, exam) => {
            const { id, area, serie, data_inicio, data_fim, title, status } = exam;
            if (!acc[area]) {
                // Use the area name itself as the unique ID for the group.
                acc[area] = { area: area, id: area, exams: [] };
            }
            acc[area].exams.push({ id, area, serie, series: serie, startDate: data_inicio, endDate: data_fim, areaName: area, title, status });
            return acc;
        }, {});


        setExamSchedule(Object.values(groupedByArea));
        setLoading(false);
    }, [profile]);
    
    useEffect(() => {
        if (profile?.role === 'aluno' && (!profile.nome_completo || !profile.matricula || !profile.turma)) {
            setProfileModalOpen(true);
        }
        fetchExamsAndResults();
    }, [profile, fetchExamsAndResults]);

    const handleExamClick = useCallback(async (exam: ExamForCard) => {
        await refreshProfile();
        
        if (profile?.is_blocked && profile.role !== 'admin') {
            alert('Seu acesso está bloqueado por violação das regras. Fale com um professor para liberar seu acesso.');
            return;
        }

        if (profile?.role === 'aluno' && (!profile.nome_completo || !profile.matricula || !profile.turma)) {
            setProfileModalOpen(true);
            return;
        }

        onStartExam(exam.id);
    }, [profile, onStartExam, refreshProfile]);

    const filteredSchedule = useMemo(() => {
        if (activeAreaId === 'all') return examSchedule;
        return examSchedule.filter(group => group.id === activeAreaId);
    }, [activeAreaId, examSchedule]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 h-96">
                <Spinner />
                <p className="mt-4 text-slate-500">Carregando agendamento de provas...</p>
            </div>
        );
    }

    return (
        <div className="animate-fadeIn space-y-8">
            <header className="text-center">
                <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Avaliações Agendadas</h2>
                <p className="text-lg text-slate-600 mt-2 max-w-2xl mx-auto">Selecione uma avaliação para iniciar.</p>
            </header>

            {examSchedule.length > 0 ? (
                <>
                    <div className="border-b border-slate-200">
                        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                            <button
                                onClick={() => setActiveAreaId('all')}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm transition-colors ${
                                    activeAreaId === 'all'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                }`}
                            >
                                Todas as Áreas
                            </button>
                            {examSchedule.map(group => (
                                <button
                                    key={group.id}
                                    onClick={() => setActiveAreaId(group.id)}
                                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm transition-colors ${
                                        activeAreaId === group.id
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }`}
                                >
                                    {group.area}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="space-y-12">
                        {filteredSchedule.map((areaGroup, index) => (
                            <section key={areaGroup.id} className="animate-fadeIn" style={{ animationDelay: `${index * 100}ms` }}>
                                {activeAreaId === 'all' && (
                                    <h3 className="text-xl font-bold text-slate-800 pb-3 mb-6 border-b border-slate-200">{areaGroup.area}</h3>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                    {areaGroup.exams.map((exam, examIndex) => (
                                        <div key={exam.id} className="animate-fadeIn" style={{ animationDelay: `${(examIndex * 50) + (index * 100)}ms` }}>
                                            <ExamCard 
                                                exam={exam} 
                                                onClick={handleExamClick}
                                                isCompleted={submittedExamIds.has(exam.id)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </>
            ) : (
                <div className="text-center bg-white border border-slate-200 rounded-xl p-12 mt-8 shadow-sm">
                    <h3 className="text-xl font-semibold text-slate-800">Nenhuma Avaliação Disponível</h3>
                    <p className="text-slate-500 mt-2">Não há avaliações agendadas ou liberadas para sua turma no momento. Verifique novamente mais tarde.</p>
                </div>
            )}

            {isProfileModalOpen && <ProfileModal onClose={() => setProfileModalOpen(false)} />}
        </div>
    );
};

export default StudentView;