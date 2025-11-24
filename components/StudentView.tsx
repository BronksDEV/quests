import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import type { ExamArea, Prova, Resultado, Profile } from '../types';
import { Spinner } from './common';
import ExamCard from './ExamCard';
import { getExamStatus } from '../utils/examStatus';

const StudentView: React.FC<{ onStartExam: (examId: number) => void }> = ({ onStartExam }) => {
    const { profile, exams, results, loading, fetchExamsAndResults, fetchProfile } = useAppStore();
    const [activeAreaId, setActiveAreaId] = useState<string>('all');
    
    useEffect(() => {
        if (profile) {
            fetchExamsAndResults();
        }
    }, [profile, fetchExamsAndResults]);

    const submittedExamIds = useMemo(() => new Set(results.map((r: Resultado) => r.prova_id)), [results]);

    const handleExamClick = useCallback(async (exam: Prova) => {
        await fetchProfile();
        const latestProfile = useAppStore.getState().profile;
        
        if (latestProfile?.is_blocked && latestProfile.role !== 'admin') {
            alert('Seu acesso está bloqueado por violação das regras. Fale com um professor para liberar seu acesso.');
            return;
        }

        onStartExam(exam.id);
    }, [onStartExam, fetchProfile]);

    const examSchedule = useMemo(() => {
        if (!profile) return [];
        
        const examsForUser = profile.role === 'admin'
            ? exams
            : exams.filter((exam: Prova) => exam.serie === profile.turma);

        const groupedByArea = examsForUser.reduce<{ [key: string]: ExamArea }>((acc, exam: Prova) => {
            if (!acc[exam.area]) {
                acc[exam.area] = { area: exam.area, id: exam.area, exams: [] };
            }
            acc[exam.area].exams.push(exam); 
            return acc;
        }, {});

        return Object.values(groupedByArea);
    }, [exams, profile]);
    
    const filteredSchedule = useMemo(() => {
        if (activeAreaId === 'all') return examSchedule;
        return examSchedule.filter((group: ExamArea) => group.id === activeAreaId);
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
                            <button onClick={() => setActiveAreaId('all')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm transition-colors ${activeAreaId === 'all' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                                Todas as Áreas
                            </button>
                            {examSchedule.map((group: ExamArea) => (
                                <button key={group.id} onClick={() => setActiveAreaId(group.id)} className={`whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm transition-colors ${activeAreaId === group.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                                    {group.area}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="space-y-12">
                        {filteredSchedule.map((areaGroup: ExamArea, index: number) => (
                            <section key={areaGroup.id} className="animate-fadeIn" style={{ animationDelay: `${index * 100}ms` }}>
                                {activeAreaId === 'all' && (
                                    <h3 className="text-xl font-bold text-slate-800 pb-3 mb-6 border-b border-slate-200">{areaGroup.area}</h3>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                    {areaGroup.exams.map((exam: Prova, examIndex: number) => {
                                        const status = getExamStatus(exam, profile as Profile, submittedExamIds);
                                        return (
                                            <div key={exam.id} className="animate-fadeIn" style={{ animationDelay: `${(examIndex * 50) + (index * 100)}ms` }}>
                                                <ExamCard 
                                                    exam={exam} 
                                                    status={status}
                                                    onClick={handleExamClick}
                                                />
                                            </div>
                                        );
                                    })}
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
        </div>
    );
};

export default StudentView;