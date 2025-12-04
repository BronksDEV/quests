import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAppStore } from '../stores/useAppStore';
import ExamCard from './ExamCard';
import { getExamStatus } from '../utils/examStatus';
import QuizTaker from './QuizTaker';
import type { Prova } from '../types';
import ActionConfirmModal from './ActionConfirmModal';

const StudentView: React.FC = () => {
    const profile = useAppStore((state) => state.profile);
    const exams = useAppStore((state) => state.exams);
    const results = useAppStore((state) => state.results);
    const loading = useAppStore((state) => state.loading);
    
    const fetchExamsAndResults = useAppStore((state) => state.fetchExamsAndResults);
    const fetchProfile = useAppStore((state) => state.fetchProfile);
    
    const [activeTab, setActiveTab] = useState<string>('Todas as Áreas');
    const [activeQuizId, setActiveQuizId] = useState<number | null>(null);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [examToStart, setExamToStart] = useState<Prova | null>(null);
    const [dataVersion, setDataVersion] = useState(0);

    useEffect(() => {
        if (profile?.id) {
            fetchProfile();
            fetchExamsAndResults();
        }
    }, [profile?.id]);

    useEffect(() => {
        if (!profile?.id) return;

        let mounted = true;

        const forceReload = async () => {
            if (!mounted) return;
            await fetchProfile();
            await fetchExamsAndResults();
            setDataVersion(prev => prev + 1);
        };

        const globalChannel = supabase
            .channel(`global-exams-${profile.id}-${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'provas' },
                forceReload
            )
            .subscribe();

        const accessChannel = supabase
            .channel(`access-individual-${profile.id}-${Date.now()}`)
            .on(
                'postgres_changes',
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'provas_acesso_individual'
                },
                forceReload
            )
            .subscribe();

        const resultsChannel = supabase
            .channel(`results-student-${profile.id}-${Date.now()}`)
            .on(
                'postgres_changes',
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'resultados', 
                    filter: `student_id=eq.${profile.id}` 
                },
                forceReload
            )
            .subscribe();

        const profileChannel = supabase
            .channel(`profile-status-${profile.id}-${Date.now()}`)
            .on(
                'postgres_changes',
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'profiles', 
                    filter: `id=eq.${profile.id}` 
                },
                async (payload) => {
                    await fetchProfile();
                    
                    if (payload.new.is_blocked) {
                        setShowBlockedModal(true);
                        setExamToStart(null);
                        setActiveQuizId(null);
                    }
                    
                    setDataVersion(prev => prev + 1);
                }
            )
            .subscribe();

        return () => {
            mounted = false;
            supabase.removeChannel(globalChannel);
            supabase.removeChannel(accessChannel);
            supabase.removeChannel(resultsChannel);
            supabase.removeChannel(profileChannel);
        };
    }, [profile?.id, fetchExamsAndResults, fetchProfile]);

    const submittedExamIds = useMemo(() => {
        return new Set(results.map(r => r.prova_id));
    }, [results]);

    const processedExams = useMemo(() => {
        if (!profile) return [];

        let filteredExams = exams;

        if (profile.role !== 'admin' && profile.role !== 'professor') {
            if (!profile.turma) return [];
            filteredExams = exams.filter(e => e.serie === profile.turma);
        }

        return filteredExams.map(exam => {
            const status = getExamStatus(exam, profile, submittedExamIds);
            return { ...exam, computedStatus: status };
        });
    }, [exams, profile, submittedExamIds, dataVersion]);

    const availableAreas = useMemo(() => {
        const areas = new Set<string>();
        processedExams.forEach(exam => { if (exam.area) areas.add(exam.area); });

        const ORDER = [
            'Linguagens, Códigos e suas Tecnologias',
            'Ciências Humanas e suas Tecnologias',
            'Ciências da Natureza e suas Tecnologias',
            'Matemática e suas Tecnologias'
        ];

        const sortedAreas = Array.from(areas).sort((a, b) => {
            const iA = ORDER.indexOf(a), iB = ORDER.indexOf(b);
            if (iA !== -1 && iB !== -1) return iA - iB;
            if (iA !== -1) return -1;
            if (iB !== -1) return 1;
            return a.localeCompare(b);
        });

        if (sortedAreas.length > 0) return ['Todas as Áreas', ...sortedAreas];
        return [];
    }, [processedExams]);

    useEffect(() => {
        if (availableAreas.length > 0 && !availableAreas.includes(activeTab)) {
            setActiveTab('Todas as Áreas');
        }
    }, [availableAreas, activeTab]);

    const displayList = useMemo(() => {
        const filtered = activeTab === 'Todas as Áreas' 
            ? processedExams 
            : processedExams.filter(e => e.area === activeTab);

        return filtered.sort((a, b) => {
            const w: Record<string, number> = { 
                available: 0, 
                locked_time: 1, 
                locked_permission: 3, 
                completed: 4, 
                expired: 5 
            };
            const wA = w[a.computedStatus] ?? 99;
            const wB = w[b.computedStatus] ?? 99;
            if (wA !== wB) return wA - wB;
            
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [processedExams, activeTab]);

    const handleStartQuiz = async (exam: Prova) => {
        await fetchProfile();
        await fetchExamsAndResults();
        
        const freshProfile = useAppStore.getState().profile;
        const freshExams = useAppStore.getState().exams;
        const freshResults = useAppStore.getState().results;
        
        if (freshProfile?.is_blocked && freshProfile.role !== 'admin') {
            setShowBlockedModal(true);
            return;
        }

        const freshExam = freshExams.find(e => e.id === exam.id);
        if (!freshExam) {
            alert('Esta avaliação não está mais disponível.');
            return;
        }

        const freshSubmitted = new Set(freshResults.map(r => r.prova_id));
        const currentStatus = getExamStatus(freshExam, freshProfile!, freshSubmitted);

        if (currentStatus === 'completed') {
            alert('Você já concluiu esta avaliação.');
            return;
        }
        if (currentStatus === 'locked_time') {
            alert('Aguarde o horário de início.');
            return;
        }
        if (currentStatus === 'locked_permission' || currentStatus === 'expired') {
            alert('Avaliação indisponível no momento.');
            return;
        }

        setExamToStart(exam); 
    };

    const executeStart = () => {
        if (examToStart) {
            setActiveQuizId(examToStart.id);
            setExamToStart(null);
        }
    };

    if (activeQuizId) {
        return <QuizTaker examId={activeQuizId} onFinish={() => { setActiveQuizId(null); fetchExamsAndResults(); }} />;
    }

    if (loading && exams.length === 0) {
        return (
            <div className="flex h-[80vh] w-full items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="text-slate-500 animate-pulse">Carregando dados...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-slate-50/50">
            <main className="max-w-7xl mx-auto p-6 sm:p-8 animate-fadeIn">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-800">Minhas Avaliações</h1>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                        <p className="text-slate-500">
                            Olá, <span className="font-bold text-blue-600">{profile?.nome_completo || 'Usuário'}</span>.
                        </p>
                        {profile?.turma && (
                            <>
                                <span className="hidden sm:block text-slate-300">|</span>
                                <p className="text-slate-500">
                                    Turma: <span className="font-bold text-slate-800">{profile.turma}</span>.
                                </p>
                            </>
                        )}
                        {(profile?.role === 'admin' || profile?.role === 'professor') && (
                            <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded border border-amber-200 ml-2 font-bold uppercase">
                                Modo Visualização ({profile.role})
                            </span>
                        )}
                    </div>
                </header>

                {availableAreas.length > 0 ? (
                    <div className="flex overflow-x-auto pb-4 mb-6 gap-2 no-scrollbar border-b border-slate-200">
                        {availableAreas.map(area => (
                            <button
                                key={area}
                                onClick={() => setActiveTab(area)}
                                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 border ${
                                    activeTab === area 
                                        ? 'bg-blue-600 text-white shadow-md border-blue-600' 
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                {area}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="mb-8 p-4 bg-yellow-50 border border-yellow-100 rounded-lg text-yellow-800 text-sm">
                        Nenhuma área de conhecimento disponível no momento.
                    </div>
                )}

                {displayList.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {displayList.map((exam) => (
                            <ExamCard
                                key={exam.id}
                                exam={exam}
                                status={(exam as any).computedStatus} 
                                onClick={() => handleStartQuiz(exam)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center opacity-60">
                        <div className="bg-white p-6 rounded-full shadow-sm mb-4 border border-slate-100">
                            <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-400">Nenhuma avaliação encontrada</h3>
                        <p className="text-slate-400 mt-2 max-w-md">Não há provas disponíveis para visualização nesta categoria.</p>
                    </div>
                )}
            </main>

            {showBlockedModal && (
                <ActionConfirmModal 
                    type="warning"
                    title="Acesso Bloqueado"
                    message="Seu acesso está bloqueado devido a violação de regras ou ação administrativa. Contate um professor."
                    confirmText="Entendido"
                    onConfirm={() => setShowBlockedModal(false)}
                    onCancel={() => setShowBlockedModal(false)}
                />
            )}

            {examToStart && (
                <ActionConfirmModal 
                    type="confirm"
                    title="Iniciar Avaliação"
                    message={`Deseja iniciar "${examToStart.title}"? O modo tela cheia será ativado e sua atividade será monitorada.`}
                    confirmText="Iniciar Agora"
                    cancelText="Cancelar"
                    onConfirm={executeStart}
                    onCancel={() => setExamToStart(null)}
                />
            )}
        </div>
    );
};

export default StudentView;