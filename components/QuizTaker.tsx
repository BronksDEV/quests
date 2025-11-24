import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import type { Prova, StudentQuestao } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { Spinner } from './common';
import ActionConfirmModal from './ActionConfirmModal';
import SubmissionSuccessAnimation from './SubmissionSuccessAnimation';

interface QuizTakerProps {
    examId: number;
    onFinish: () => void;
}

const QUESTIONS_PER_PAGE = 5;

const FullscreenExitWarningModal: React.FC<{ countdown: number; onRequestFullscreen: () => void; }> = ({ countdown, onRequestFullscreen }) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-red-950/70 backdrop-blur-md">
        <div className="text-center text-white p-8 max-w-lg mx-auto bg-slate-800/50 rounded-xl shadow-2xl border border-slate-700">
            <h2 className="text-4xl font-bold text-red-400">Atenção!</h2>
            <p className="mt-4 text-lg">Você saiu do modo de tela cheia. Sua prova será bloqueada em:</p>
            <p className="text-7xl font-mono font-bold my-4 text-red-300">{countdown}</p>
            <button 
                onClick={onRequestFullscreen}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-transform hover:scale-105 shadow-lg"
            >
                Voltar à Tela Cheia
            </button>
            <p className="text-slate-400 mt-4 text-sm">Retorne imediatamente para evitar o bloqueio.</p>
        </div>
    </div>
);

const TermsModal: React.FC<{ onConfirm: () => void; onCancel: () => void; }> = ({ onConfirm, onCancel }) => (
     <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4" style={{backdropFilter: 'blur(8px)'}}>
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg modal-content-anim border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 text-center">Termos da Avaliação</h2>
            <div className="prose prose-sm max-w-none mt-4 text-slate-600 max-h-60 overflow-y-auto pr-3">
                <p>Ao iniciar esta avaliação, você concorda com os seguintes termos:</p>
                <ul>
                    <li>A prova deve ser realizada em <strong>modo tela cheia</strong> durante todo o tempo.</li>
                    <li>Sair do modo tela cheia, alternar de janela ou usar atalhos (como Alt+Tab) é estritamente proibido.</li>
                    <li><strong>Qualquer tentativa de sair da tela cheia resultará no bloqueio imediato do seu acesso à prova.</strong></li>
                    <li>Uma vez bloqueado, você precisará contatar um professor para solicitar o desbloqueio.</li>
                    <li>Não é permitido consultar materiais externos, comunicar-se com outros alunos ou utilizar qualquer forma de assistência não autorizada.</li>
                </ul>
                <p>O descumprimento destas regras pode resultar em anulação da sua avaliação. Clicando em "Iniciar", você confirma que leu e concorda com todas as regras.</p>
            </div>
            <div className="mt-8 flex justify-between items-center gap-4">
                <button onClick={onCancel} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-lg hover:bg-slate-300 transition">Cancelar</button>
                <button onClick={onConfirm} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition">
                    Li e Concordo. Iniciar Prova.
                </button>
            </div>
        </div>
    </div>
);


const QuizTaker: React.FC<QuizTakerProps> = ({ examId, onFinish }) => {
    const profile = useAppStore((state) => state.profile);
    const [quiz, setQuiz] = useState<Omit<Prova, 'questoes'> | null>(null);
    const [questions, setQuestions] = useState<StudentQuestao[]>([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [answers, setAnswers] = useState<{ [key: number]: string }>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isQuizStarted, setIsQuizStarted] = useState(false);
    const [showTerms, setShowTerms] = useState(true);
    const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    
    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(5);
    const countdownIntervalRef = useRef<number | null>(null);
    const isBlockingRef = useRef(false);
    const isExitingLegitimately = useRef(false);

    const blockStudentAndExit = useCallback(async () => {
        if (!profile || profile.role === 'admin' || isBlockingRef.current) return;
        isBlockingRef.current = true;
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

        try {
            await supabase.from('profiles').update({ is_blocked: true }).eq('id', profile.id);
            if(document.fullscreenElement) {
                isExitingLegitimately.current = true;
                await document.exitFullscreen();
            }
            setShowBlockedModal(true);
        } catch (error) {
            console.error("Erro ao bloquear estudante:", error);
            onFinish();
        }
    }, [profile, onFinish]);
    
    const requestFullscreen = useCallback(async () => {
        try {
            await document.documentElement.requestFullscreen();
        } catch (err) {
            console.error("Falha ao tentar entrar em tela cheia:", err);
        }
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (isExitingLegitimately.current || profile?.role === 'admin') {
                return;
            }

            if (document.fullscreenElement) {
                setShowWarning(false);
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                }
                return;
            }
            
            if (!document.fullscreenElement && isQuizStarted && !isBlockingRef.current) {
                setShowWarning(true);
                setCountdown(5);
                countdownIntervalRef.current = window.setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) {
                            clearInterval(countdownIntervalRef.current!);
                            blockStudentAndExit();
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [isQuizStarted, blockStudentAndExit, profile]);

    const handleSubmit = useCallback(async () => {
        if (!profile) return;
        setSubmitting(true);
        isExitingLegitimately.current = true;
        try {
            const { error } = await supabase.from('resultados').insert({
                prova_id: examId,
                student_id: profile.id,
                respostas: answers
            });
            if (error) throw error;
            
            if(document.fullscreenElement) await document.exitFullscreen();
            
            setShowSuccessAnimation(true);
            setTimeout(() => onFinish(), 3000);

        } catch (err: any) {
            setError("Erro ao enviar avaliação: " + err.message);
            setShowErrorModal(true);
            setSubmitting(false);
            isExitingLegitimately.current = false;
        }
    }, [examId, profile, answers, onFinish]);

    useEffect(() => {
        const fetchQuiz = async () => {
            setLoading(true);
            setError('');
            try {
                const { data: quizData, error: quizError } = await supabase.from('provas').select('*').eq('id', examId).single();
                if (quizError) throw quizError;
                setQuiz(quizData as Prova);
                const { data: questionsData, error: questionsError } = await supabase.from('student_questions_view').select('*').eq('prova_id', examId);
                if (questionsError) throw questionsError;
                const sortedQuestions = (questionsData || []).sort((a,b) => (a.question_order || 0) - (b.question_order || 0));
                setQuestions(sortedQuestions as StudentQuestao[]);
            } catch (err: any) {
                setError('Falha ao carregar a avaliação. Tente novamente.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchQuiz();
    }, [examId]);

    const startQuiz = async () => {
        setShowTerms(false);
        if (profile?.role === 'admin') {
            setIsQuizStarted(true);
            return;
        }
        await requestFullscreen();
        setIsQuizStarted(true);
    };
    
    if (loading) return <div className="flex justify-center p-12 h-96"><Spinner /></div>;
    if (showTerms && profile?.role !== 'admin') return <TermsModal onConfirm={startQuiz} onCancel={onFinish} />;
    if (showSuccessAnimation) return <SubmissionSuccessAnimation />;
    
    if (showErrorModal) {
        return <ActionConfirmModal type="warning" title="Erro no Envio" message={error} onConfirm={() => setShowErrorModal(false)} confirmText='Tentar Novamente' />
    }
    if (showBlockedModal) {
        return <ActionConfirmModal type="warning" title="Acesso Bloqueado" message="Você violou as regras da avaliação (saída da tela cheia). Contate um professor para liberar seu acesso." onConfirm={onFinish} confirmText="Entendido"/>
    }

    if (!isQuizStarted && !showTerms) {
        return <div className="flex justify-center p-12 h-96"><Spinner /><p className="ml-4">Iniciando ambiente seguro...</p></div>;
    }
    
    if (!quiz || questions.length === 0) {
        return (
             <ActionConfirmModal type="info" title="Avaliação Indisponível" message="Esta avaliação não foi encontrada ou não possui questões." onConfirm={onFinish} confirmText="Voltar"/>
        );
    }

    const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);
    const startIndex = currentPage * QUESTIONS_PER_PAGE;
    const questionsOnPage = questions.slice(startIndex, startIndex + QUESTIONS_PER_PAGE);

    const firstQuestionNum = startIndex + 1;
    const lastQuestionNum = Math.min(startIndex + QUESTIONS_PER_PAGE, questions.length);
    
    return (
        <>
            {showWarning && <FullscreenExitWarningModal countdown={countdown} onRequestFullscreen={requestFullscreen} />}

            <div className="w-full max-w-5xl mx-auto animate-fadeIn">
                <header className="mb-6 flex items-center justify-between bg-white p-4 rounded-xl shadow-md border border-slate-200/80">
                    <div><h1 className="text-xl font-bold">{quiz.title}</h1><p className="text-sm text-slate-600">{profile?.nome_completo}</p></div>
                    <div className="text-right"><p className="text-sm font-medium text-slate-600">Questões</p><p className="text-2xl font-bold">{firstQuestionNum}-{lastQuestionNum}<span className="text-slate-400 font-normal text-lg">/{questions.length}</span></p></div>
                </header>

                <main className="bg-white p-6 sm:p-8 rounded-xl shadow-md border border-slate-200/80">
                    {questionsOnPage.map((question) => (
                        <fieldset key={question.id} className="mb-8 last:mb-0">
                            <legend className="font-semibold text-lg px-2 -mb-3">{question.title}</legend>
                            <div className="border rounded-lg p-4 pt-6">
                                {question.long_text && <div className="prose prose-slate max-w-none mb-4" dangerouslySetInnerHTML={{ __html: question.long_text }} />}
                                <div className={`grid grid-cols-1 ${question.image_url_1 && question.image_url_2 ? 'sm:grid-cols-2' : ''} gap-4 my-4`}>
                                    {question.image_url_1 && <img src={question.image_url_1} alt="Imagem 1 da questão" className="border rounded-md w-full" />}
                                    {question.image_url_2 && <img src={question.image_url_2} alt="Imagem 2 da questão" className="border rounded-md w-full" />}
                                </div>
                                <div className="mt-4 space-y-2">
                                    {(question.alternativas || []).map(alt => (
                                        <label key={alt.id} className={`flex items-start p-3 border rounded-lg cursor-pointer transition-all ${answers[question.id!] === alt.letter ? 'bg-blue-50 border-blue-400 ring-2' : 'bg-white hover:bg-slate-50 border-slate-200'}`}>
                                            <input type="radio" name={`question-${question.id}`} value={alt.letter} checked={answers[question.id!] === alt.letter} onChange={() => setAnswers(prev => ({ ...prev, [question.id!]: alt.letter }))} className="mr-3 mt-1 h-4 w-4" />
                                            <div className="flex-1 text-slate-800"><span className="font-semibold">{alt.letter})</span><span className="ml-2">{alt.text}</span></div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </fieldset>
                    ))}

                    <div className="mt-8 pt-6 border-t border-slate-200 flex justify-between items-center">
                        <button onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0} className="bg-slate-200 text-slate-700 font-semibold py-2 px-5 rounded-lg disabled:opacity-50">Anterior</button>
                        {currentPage === totalPages - 1 ? (
                            <button onClick={handleSubmit} disabled={submitting} className="bg-green-600 text-white font-semibold py-2 px-5 rounded-lg disabled:bg-green-400 flex items-center gap-2">
                                {submitting ? <Spinner size="20px" color="#fff" /> : 'Finalizar e Enviar'}
                            </button>
                        ) : (
                            <button onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))} className="bg-blue-600 text-white font-semibold py-2 px-5 rounded-lg">Próxima</button>
                        )}
                    </div>
                </main>
            </div>
        </>
    );
};

export default QuizTaker;