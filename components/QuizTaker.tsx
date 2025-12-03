import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import type { Prova, StudentQuestao } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { Spinner } from './common';
import ActionConfirmModal from './ActionConfirmModal';
import SubmissionSuccessAnimation from './SubmissionSuccessAnimation';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface QuizTakerProps {
    examId: number;
    onFinish: () => void;
}

const QUESTIONS_PER_PAGE = 5;

// ============================================================================
// COMPONENTES AUXILIARES E VISUAIS
// ============================================================================

const SaveStatusIndicator: React.FC<{ status: 'saved' | 'saving' | 'error'; lastSavedTime: string | null }> = ({ status, lastSavedTime }) => {
    if (status === 'saving') {
        return (
            <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 shadow-sm transition-all duration-200">
                <Spinner size="16px" color="currentColor" thickness="3px" />
                <span className="text-xs font-bold uppercase tracking-wide">Salvando...</span>
            </div>
        );
    }
    if (status === 'error') {
        return (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-200 shadow-sm animate-pulse">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-xs font-bold uppercase">Não salvo (Offline)</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-200 shadow-sm transition-all duration-500">
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <div className="flex flex-col leading-none">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Progresso Seguro</span>
                <span className="text-xs font-semibold text-emerald-600">
                    {lastSavedTime ? `Salvo às ${lastSavedTime}` : 'Sincronizado'}
                </span>
            </div>
        </div>
    );
};

const RenderHtmlWithMath: React.FC<{ html: string; className?: string; tag?: 'div' | 'span' }> = ({ html, className, tag = 'div' }) => {
    const containerRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.innerHTML = html;
            const renderMathInNode = (node: Node) => {
                if (node.nodeType === 3 && node.textContent) {
                    const text = node.textContent;
                    const regex = /(\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\))/g;
                    if (regex.test(text)) {
                        const fragment = document.createDocumentFragment();
                        let lastIndex = 0;
                        text.replace(regex, (match, tex, index) => {
                            fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
                            const span = document.createElement('span');
                            const isDisplayMode = match.startsWith('$$');
                            const cleanTex = match.slice(2, -2);
                            try {
                                katex.render(cleanTex, span, { displayMode: isDisplayMode, throwOnError: false });
                            } catch (e) { span.innerText = match; }
                            fragment.appendChild(span);
                            lastIndex = index + match.length;
                            return match;
                        });
                        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
                        node.parentNode?.replaceChild(fragment, node);
                    }
                } else if (node.nodeType === 1) {
                    const tagName = (node as HTMLElement).tagName.toLowerCase();
                    if (tagName !== 'script' && tagName !== 'style' && tagName !== 'textarea') {
                        Array.from(node.childNodes).forEach(child => renderMathInNode(child));
                    }
                }
            };
            renderMathInNode(containerRef.current);
            const links = containerRef.current.querySelectorAll('a');
            links.forEach(link => {
                link.style.pointerEvents = 'none';
                link.style.cursor = 'default';
                link.style.textDecoration = 'none';
                link.style.color = 'inherit';
                link.setAttribute('href', '#');
                link.onclick = (e) => e.preventDefault();
            });
        }
    }, [html]);

    const Tag = tag;
    return <Tag ref={containerRef as any} className={className} />;
};

const FullscreenExitWarningModal: React.FC<{ countdown: number; onRequestFullscreen: () => void; }> = ({ countdown, onRequestFullscreen }) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-red-950/70 backdrop-blur-md select-none">
        <div className="text-center text-white p-8 max-w-lg mx-auto bg-slate-800/50 rounded-xl shadow-2xl border border-slate-700">
            <h2 className="text-4xl font-bold text-red-400">Atenção!</h2>
            <p className="mt-4 text-lg">Você saiu do modo de tela cheia. Sua prova será bloqueada em:</p>
            <p className="text-7xl font-mono font-bold my-4 text-red-300">{countdown}</p>
            <button onClick={onRequestFullscreen} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-transform hover:scale-105 shadow-lg">Voltar à Tela Cheia</button>
            <p className="text-slate-400 mt-4 text-sm">Retorne imediatamente para evitar o bloqueio.</p>
        </div>
    </div>
);

const OfflineWarningModal: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm select-none">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md border-l-8 border-yellow-500 animate-bounce-short">
            <div className="flex flex-col items-center text-center">
                <svg className="w-16 h-16 text-yellow-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-2xl font-bold text-slate-800">Sem Conexão com a Internet</h3>
                <p className="text-slate-600 mt-2">
                    Não é possível enviar a prova agora.
                    <br /><strong>Não feche esta janela.</strong>
                    <br />Suas respostas estão seguras no seu dispositivo.
                </p>
                <div className="mt-6 flex items-center gap-2 text-sm text-blue-600 font-semibold bg-blue-50 px-4 py-2 rounded-full">
                    <Spinner size="16px" color="currentColor" thickness="2px" />
                    Aguardando reconexão...
                </div>
                <button
                    onClick={onRetry}
                    className="mt-4 w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Tentar Enviar Novamente
                </button>
            </div>
        </div>
    </div>
);

const TermsModal: React.FC<{ onConfirm: () => void; onCancel: () => void; }> = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 select-none" style={{ backdropFilter: 'blur(8px)' }}>
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg modal-content-anim border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 text-center">Termos da Avaliação</h2>
            <div className="prose prose-sm max-w-none mt-4 text-slate-600 max-h-60 overflow-y-auto pr-3">
                <p>Ao iniciar esta avaliação, você concorda com os seguintes termos:</p>
                <ul>
                    <li>A prova deve ser realizada em <strong>modo tela cheia</strong> durante todo o tempo.</li>
                    <li>Sair do modo tela cheia, alternar de janela ou usar atalhos (como Alt+Tab) é estritamente proibido.</li>
                    <li>Qualquer tentativa de sair da tela cheia resultará no bloqueio imediato do seu acesso à prova.</li>
                    <li>Não é permitido copiar, colar ou usar o botão direito do mouse.</li>
                    <li>Seu progresso é salvo automaticamente neste computador a cada resposta.</li>
                </ul>
            </div>
            <div className="mt-8 flex justify-between items-center gap-4">
                <button onClick={onCancel} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-lg hover:bg-slate-300 transition">Cancelar</button>
                <button onClick={onConfirm} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition">Li e Concordo. Iniciar Prova.</button>
            </div>
        </div>
    </div>
);

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

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
    const [missingQuestionModal, setMissingQuestionModal] = useState<{ show: boolean, questionIndex: number }>({ show: false, questionIndex: -1 });

    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
    const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

    const [isNetworkError, setIsNetworkError] = useState(false);

    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(5);
    const countdownIntervalRef = useRef<number | null>(null);
    const isBlockingRef = useRef(false);
    const isExitingLegitimately = useRef(false);

    // keys para persistência
    const TERMS_KEY_REF = useRef<string | null>(null);
    const PAGE_KEY_REF = useRef<string | null>(null);

    const STORAGE_KEY = profile ? `quiz_progress_${profile.id}_${examId}` : null;

    useEffect(() => {
        if (!profile) return;
        TERMS_KEY_REF.current = `quiz_terms_accepted_${profile.id}_${examId}`;
        PAGE_KEY_REF.current = `quiz_page_${profile.id}_${examId}`;

        // ======= CORREÇÃO DO RELOAD / TELA TRAVADA =======
        // Verifica se os termos já foram aceitos no localStorage
        const accepted = localStorage.getItem(TERMS_KEY_REF.current);
        if (accepted === 'true') {
            setShowTerms(false);
            setIsQuizStarted(true); 
            // Como setIsQuizStarted vai para true, o useEffect de fullscreen (mais abaixo) 
            // vai detectar que não está em fullscreen e exibir o alerta vermelho (FullscreenExitWarningModal),
            // permitindo que o aluno volte à tela cheia em vez de ficar na tela branca.
        } else {
            setShowTerms(true);
        }
        // =================================================

        const storedPage = localStorage.getItem(PAGE_KEY_REF.current);
        if (storedPage) {
            const p = Number(storedPage);
            if (!Number.isNaN(p)) setCurrentPage(p);
        }
    }, [profile, examId]);

    const goToPage = useCallback((page: number) => {
        setCurrentPage(page);
        if (PAGE_KEY_REF.current) localStorage.setItem(PAGE_KEY_REF.current, String(page));
    }, []);

    const goNext = useCallback(() => {
        setCurrentPage(prev => {
            const next = Math.min(Math.ceil(questions.length / QUESTIONS_PER_PAGE) - 1, prev + 1);
            if (PAGE_KEY_REF.current) localStorage.setItem(PAGE_KEY_REF.current, String(next));
            return next;
        });
    }, [questions.length]);

    const goPrev = useCallback(() => {
        setCurrentPage(prev => {
            const next = Math.max(0, prev - 1);
            if (PAGE_KEY_REF.current) localStorage.setItem(PAGE_KEY_REF.current, String(next));
            return next;
        });
    }, []);

    // -----------------------------------------------------------
    // SEGURANÇA: Previne Links e Clique em imagens com Link
    // -----------------------------------------------------------
    useEffect(() => {
        const preventLinks = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a');
            if (link) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        document.addEventListener('click', preventLinks, true);
        return () => document.removeEventListener('click', preventLinks, true);
    }, []);

    // -----------------------------------------------------------
    // MONITORAMENTO DE REDE
    // -----------------------------------------------------------
    useEffect(() => {
        const handleOnline = () => {
            setIsOffline(false);
            setIsNetworkError(false);
        };
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // -----------------------------------------------------------
    // PERSISTÊNCIA: Carregar Respostas Salvas
    // -----------------------------------------------------------
    useEffect(() => {
        if (STORAGE_KEY) {
            const savedAnswers = localStorage.getItem(STORAGE_KEY);
            if (savedAnswers) {
                try {
                    const parsed = JSON.parse(savedAnswers);
                    setAnswers(parsed);
                    setLastSavedTime(new Date().toLocaleTimeString());
                } catch (e) {
                    console.error("Erro ao carregar progresso salvo:", e);
                }
            }
        }
    }, [STORAGE_KEY]);

    // -----------------------------------------------------------
    // PERSISTÊNCIA: Salvar Respostas Automaticamente (Auto-Save)
    // -----------------------------------------------------------
    useEffect(() => {
        if (STORAGE_KEY && Object.keys(answers).length > 0) {
            setSaveStatus('saving');
            const timer = setTimeout(() => {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
                    setSaveStatus('saved');
                    setLastSavedTime(new Date().toLocaleTimeString());
                } catch (e) {
                    setSaveStatus('error');
                    console.error("Erro ao salvar no localStorage", e);
                }
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [answers, STORAGE_KEY]);

    // -----------------------------------------------------------
    // Scroll para o topo ao mudar de página
    // -----------------------------------------------------------
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentPage]);

    // -----------------------------------------------------------
    // SEGURANÇA AVANÇADA: Bloqueio de Teclas, ContextMenu, Copy/Paste
    // -----------------------------------------------------------
    useEffect(() => {
        const preventActions = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        const preventKeys = (e: KeyboardEvent) => {
            // Bloqueia F12, DevTools (Ctrl+Shift+I), Print (Ctrl+P), View Source (Ctrl+U)
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'p') || (e.ctrlKey && e.key === 'u')) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // Adiciona listeners
        document.addEventListener('contextmenu', preventActions);
        document.addEventListener('copy', preventActions);
        document.addEventListener('cut', preventActions);
        document.addEventListener('paste', preventActions);
        document.addEventListener('selectstart', preventActions);
        document.addEventListener('dragstart', preventActions);
        document.addEventListener('keydown', preventKeys);

        // Remove listeners ao desmontar
        return () => {
            document.removeEventListener('contextmenu', preventActions);
            document.removeEventListener('copy', preventActions);
            document.removeEventListener('cut', preventActions);
            document.removeEventListener('paste', preventActions);
            document.removeEventListener('selectstart', preventActions);
            document.removeEventListener('dragstart', preventActions);
            document.removeEventListener('keydown', preventKeys);
        };
    }, []);

    // -----------------------------------------------------------
    // Lógica de Bloqueio do Estudante
    // -----------------------------------------------------------
    const blockStudentAndExit = useCallback(async () => {
        if (!profile || profile.role === 'admin' || isBlockingRef.current) return;
        isBlockingRef.current = true;
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        try {
            if (navigator.onLine) await supabase.from('profiles').update({ is_blocked: true }).eq('id', profile.id);
            if (document.fullscreenElement) {
                isExitingLegitimately.current = true;
                await document.exitFullscreen();
            }
            setShowBlockedModal(true);
        } catch (error) {
            console.error("Erro ao bloquear estudante:", error);
            onFinish();
        }
    }, [profile, onFinish]);

    // -----------------------------------------------------------
    // Controle de Tela Cheia
    // -----------------------------------------------------------
    const requestFullscreen = useCallback(async () => {
        try { await document.documentElement.requestFullscreen(); } catch (err) { console.error(err); }
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (isExitingLegitimately.current || profile?.role === 'admin') return;
            if (document.fullscreenElement) {
                setShowWarning(false);
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                return;
            }
            // Se saiu da tela cheia, mas a prova começou e não é admin...
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

    // -----------------------------------------------------------
    // Envio do Formulário (Submit)
    // -----------------------------------------------------------
    const handleSubmit = useCallback(async () => {
        if (!profile) return;

        setIsNetworkError(false);

        if (!navigator.onLine) {
            setIsNetworkError(true);
            return;
        }

        const missingQuestionIndex = questions.findIndex(q => !answers[q.id]);
        if (missingQuestionIndex !== -1) {
            const targetPage = Math.floor(missingQuestionIndex / QUESTIONS_PER_PAGE);
            goToPage(targetPage);
            setMissingQuestionModal({ show: true, questionIndex: missingQuestionIndex + 1 });
            return;
        }

        setSubmitting(true);
        isExitingLegitimately.current = true;

        try {
            const { error } = await supabase.from('resultados').insert({
                prova_id: examId,
                student_id: profile.id,
                respostas: answers
            });
            if (error) throw error;

            // Limpa dados salvos ao finalizar com sucesso
            if (STORAGE_KEY) localStorage.removeItem(STORAGE_KEY);
            if (TERMS_KEY_REF.current) localStorage.removeItem(TERMS_KEY_REF.current);
            if (PAGE_KEY_REF.current) localStorage.removeItem(PAGE_KEY_REF.current);

            setIsNetworkError(false);

            if (document.fullscreenElement) await document.exitFullscreen();

            setShowSuccessAnimation(true);
            setTimeout(() => onFinish(), 3000);

        } catch (err: any) {
            console.error("Erro ao enviar:", err);

            if (!navigator.onLine || err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('Failed to fetch')) {
                setIsNetworkError(true);
                isExitingLegitimately.current = false; 
            } else {
                setError("Erro ao enviar avaliação: " + err.message);
                setShowErrorModal(true);
                isExitingLegitimately.current = false;
            }
            setSubmitting(false);
        }
    }, [examId, profile, answers, onFinish, questions, STORAGE_KEY, goToPage]);

    // -----------------------------------------------------------
    // Carga de Dados da Prova
    // -----------------------------------------------------------
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
                const sortedQuestions = (questionsData || []).sort((a, b) => {
                    const orderA = a.question_order ?? 999999;
                    const orderB = b.question_order ?? 999999;
                    if (orderA !== orderB) return orderA - orderB;
                    return a.id - b.id;
                });
                setQuestions(sortedQuestions as StudentQuestao[]);
            } catch (err: any) {
                setError('Falha ao carregar a avaliação. Tente novamente.');
            } finally {
                setLoading(false);
            }
        };
        fetchQuiz();
    }, [examId]);

    // -----------------------------------------------------------
    // Início da Prova
    // -----------------------------------------------------------
    const startQuiz = async () => {
        // Admin pula termos e fullscreen
        if (profile?.role === 'admin') {
            if (TERMS_KEY_REF.current) localStorage.setItem(TERMS_KEY_REF.current, 'true');
            setShowTerms(false);
            setIsQuizStarted(true);
            return;
        }

        try {
            await requestFullscreen();
        } catch (err) {
            console.error('Erro ao entrar em fullscreen:', err);
        } finally {
            if (TERMS_KEY_REF.current) localStorage.setItem(TERMS_KEY_REF.current, 'true');
            setShowTerms(false);
            setIsQuizStarted(true);
        }
    };

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================

    if (loading) return <div className="flex justify-center p-12 h-96"><Spinner /></div>;
    
    // Se o usuário não é admin e os termos ainda devem ser mostrados
    if (showTerms && profile?.role !== 'admin') return <TermsModal onConfirm={startQuiz} onCancel={onFinish} />;
    
    if (showSuccessAnimation) return <SubmissionSuccessAnimation />;

    if (showErrorModal) {
        return <ActionConfirmModal type="warning" title="Erro no Envio" message={error} onConfirm={() => setShowErrorModal(false)} confirmText='Entendido' />
    }
    if (showBlockedModal) {
        return <ActionConfirmModal type="warning" title="Acesso Bloqueado" message="Você violou as regras da avaliação (saída da tela cheia). Contate um professor para liberar seu acesso." onConfirm={onFinish} confirmText="Entendido" />
    }
    if (missingQuestionModal.show) {
        return <ActionConfirmModal type="info" title="Questão em Branco" message={`Você não respondeu a questão ${missingQuestionModal.questionIndex}. Por favor, marque uma alternativa antes de enviar.`} onConfirm={() => setMissingQuestionModal({ show: false, questionIndex: -1 })} confirmText="Entendido" />
    }

    // Tela de Carregamento Segura (Prevenção de Loop Infinito)
    if (!isQuizStarted && !showTerms) {
        return (
             <div className="flex flex-col items-center justify-center p-12 h-96 animate-fadeIn">
                <Spinner />
                <p className="mt-4 text-slate-600 mb-6">Iniciando ambiente seguro...</p>
                <button 
                    onClick={() => {
                        // Reset de emergência caso trave: limpa o flag 'accepted' e força exibição dos termos
                        localStorage.removeItem(TERMS_KEY_REF.current || '');
                        setShowTerms(true);
                    }}
                    className="text-sm text-blue-500 hover:text-blue-700 underline"
                >
                    Travou nesta tela? Clique aqui para tentar de novo.
                </button>
            </div>
        );
    }

    if (!quiz || questions.length === 0) {
        return (
            <ActionConfirmModal type="info" title="Avaliação Indisponível" message="Esta avaliação não foi encontrada ou não possui questões." onConfirm={onFinish} confirmText="Voltar" />
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
            {isNetworkError && <OfflineWarningModal onRetry={handleSubmit} />}

            <div className="w-full max-w-5xl mx-auto animate-fadeIn select-none">
                <header className="mb-6 bg-white p-5 rounded-xl shadow-md border border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{quiz.title}</h1>
                        <p className="text-sm font-semibold text-blue-600 mt-1">{quiz.area}</p>
                        <div className="mt-2 flex flex-col text-sm text-slate-500">
                            <span className="font-bold uppercase text-slate-700">{profile?.nome_completo}</span>
                            <span>Matrícula: {profile?.matricula} • Turma: {profile?.turma}</span>
                        </div>
                    </div>
                    <div className="text-right self-end sm:self-center flex flex-col items-end">
                        <p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Progresso</p>
                        <p className="text-3xl font-bold text-slate-800">{firstQuestionNum}-{lastQuestionNum}<span className="text-slate-400 font-normal text-xl">/{questions.length}</span></p>
                        <SaveStatusIndicator status={saveStatus} lastSavedTime={lastSavedTime} />
                    </div>
                </header>

                <main className="bg-white p-6 sm:p-8 rounded-xl shadow-md border border-slate-200/80">
                    {questionsOnPage.map((question) => (
                        <fieldset key={question.id} className="mb-10 last:mb-2">
                            <legend className="font-semibold text-lg px-2 -mb-3 text-slate-800">{question.title}</legend>
                            <div className="border rounded-lg p-5 pt-7 bg-slate-50/50">
                                <div className="mb-5 text-slate-800">
                                    <RenderHtmlWithMath html={question.long_text || ''} />
                                </div>
                                <div className={`grid grid-cols-1 ${question.image_url_1 && question.image_url_2 ? 'sm:grid-cols-2' : ''} gap-4 my-5`}>
                                    {question.image_url_1 && <img src={question.image_url_1} alt="Imagem 1 da questão" className="border rounded-md w-full shadow-sm" />}
                                    {question.image_url_2 && <img src={question.image_url_2} alt="Imagem 2 da questão" className="border rounded-md w-full shadow-sm" />}
                                </div>
                                <div className="mt-5 space-y-3">
                                    {(question.alternativas || []).map(alt => (
                                        <label key={alt.id} className={`flex items-start p-4 border rounded-lg cursor-pointer transition-all ${answers[question.id!] === alt.letter ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-200 shadow-sm' : 'bg-white hover:bg-white hover:border-blue-300 border-slate-200'}`}>
                                            <input type="radio" name={`question-${question.id}`} value={alt.letter} checked={answers[question.id!] === alt.letter} onChange={() => setAnswers(prev => ({ ...prev, [question.id!]: alt.letter }))} className="mr-4 mt-1 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300" />
                                            <div className="flex-1 text-slate-700 flex items-center text-base">
                                                <span className="font-bold mr-2 text-slate-900">{alt.letter})</span>
                                                <RenderHtmlWithMath html={alt.text} tag="span" />
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </fieldset>
                    ))}

                    <div className="mt-10 pt-6 border-t border-slate-200 flex justify-between items-center">
                        <button onClick={goPrev} disabled={currentPage === 0} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2.5 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm">
                            Anterior
                        </button>
                        {currentPage === totalPages - 1 ? (
                            <button onClick={handleSubmit} disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-8 rounded-lg disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center gap-2 shadow-md transition-all transform hover:scale-105">
                                {submitting ? (
                                    <>
                                        <Spinner size="20px" color="#fff" />
                                        <span>Enviando...</span>
                                    </>
                                ) : (
                                    'Finalizar e Enviar'
                                )}
                            </button>
                        ) : (
                            <button onClick={goNext} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg shadow-sm transition-colors">
                                Próxima
                            </button>
                        )}
                    </div>
                </main>
            </div>
        </>
    );
};

export default QuizTaker;