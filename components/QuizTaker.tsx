import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// ========================== COMPONENTES AUXILIARES ==========================

const RenderHtmlWithMath = React.memo(({ html, className, tag = 'div' }: { html: string; className?: string; tag?: 'div' | 'span' }) => {
    const containerRef = useRef<HTMLElement>(null);
    const lastHtmlRef = useRef<string>('');

    useEffect(() => {
        if (!containerRef.current || lastHtmlRef.current === html) return;
        
        lastHtmlRef.current = html;
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
                        try {
                            katex.render(match.slice(2, -2), span, { displayMode: match.startsWith('$$'), throwOnError: false });
                        } catch { span.innerText = match; }
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
            link.onclick = (e) => e.preventDefault();
        });

        return () => {
            if (containerRef.current) containerRef.current.innerHTML = '';
        };
    }, [html]);

    const Tag = tag;
    return <Tag ref={containerRef as any} className={className} />;
});

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
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            <div className="flex flex-col leading-none">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Progresso Seguro</span>
                <span className="text-xs font-semibold text-emerald-600">{lastSavedTime ? `Salvo às ${lastSavedTime}` : 'Sincronizado'}</span>
            </div>
        </div>
    );
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
            <h3 className="text-2xl font-bold text-slate-800 text-center">Sem Conexão com a Internet</h3>
            <p className="text-slate-600 mt-2 text-center">Não é possível enviar a prova agora. Suas respostas estão salvas.</p>
            <button onClick={onRetry} className="mt-6 w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700">Tentar Enviar Novamente</button>
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
                    <li>Prova em <strong>modo tela cheia</strong> obrigatório.</li>
                    <li>Sair da tela cheia ou usar atalhos (Alt+Tab) causará bloqueio.</li>
                    <li>Bloqueio de copiar, colar e botão direito do mouse.</li>
                    <li>Progresso salvo automaticamente no dispositivo.</li>
                </ul>
            </div>
            <div className="mt-8 flex justify-between items-center gap-4">
                <button onClick={onCancel} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-lg hover:bg-slate-300">Cancelar</button>
                <button onClick={onConfirm} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700">Concordo. Iniciar.</button>
            </div>
        </div>
    </div>
);

// ========================== COMPONENTE PRINCIPAL ==========================

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
    const [showSessionWarning, setShowSessionWarning] = useState(false);

    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
    const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
    const [isNetworkError, setIsNetworkError] = useState(false);

    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(5);
    
    // Referências de Controle
    const countdownIntervalRef = useRef<number | null>(null);
    const isBlockingRef = useRef(false);
    const isExitingLegitimately = useRef(false);
    const fullscreenViolationsRef = useRef(0);
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef(Date.now());
    const sessionRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Chaves LocalStorage
    const TERMS_KEY_REF = useRef<string | null>(null);
    const PAGE_KEY_REF = useRef<string | null>(null);
    const STORAGE_KEY = profile ? `quiz_progress_${profile.id}_${examId}` : null;

    const MAX_VIOLATIONS = 1;

    useEffect(() => {
        if (!profile) return;
        TERMS_KEY_REF.current = `quiz_terms_accepted_${profile.id}_${examId}`;
        PAGE_KEY_REF.current = `quiz_page_${profile.id}_${examId}`;

        const accepted = localStorage.getItem(TERMS_KEY_REF.current);
        if (accepted === 'true') {
            setShowTerms(false);
            setTimeout(() => {
                setIsQuizStarted(true);
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                }
            }, 100);
        } else {
            setShowTerms(true);
        }

        const storedPage = localStorage.getItem(PAGE_KEY_REF.current);
        if (storedPage) setCurrentPage(Number(storedPage) || 0);
    }, [profile, examId]);

    // ------------------- HEARTBEAT (PROTEÇÃO CONTRA SESSÃO) -------------------
    useEffect(() => {
        const handleActivity = () => { lastActivityRef.current = Date.now(); };

        document.addEventListener('click', handleActivity);
        document.addEventListener('keydown', handleActivity);
        document.addEventListener('touchstart', handleActivity);

        // Verifica atividade a cada 5min e renova sessão se usuário estiver ativo
        sessionRefreshIntervalRef.current = setInterval(async () => {
            const timeSinceLastActivity = Date.now() - lastActivityRef.current;
            if (timeSinceLastActivity < 5 * 60 * 1000) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) await supabase.auth.refreshSession();
            }
        }, 5 * 60 * 1000);

        return () => {
            document.removeEventListener('click', handleActivity);
            document.removeEventListener('keydown', handleActivity);
            document.removeEventListener('touchstart', handleActivity);
            if (sessionRefreshIntervalRef.current) clearInterval(sessionRefreshIntervalRef.current);
        };
    }, []);

    // ------------------- DETECTOR DE PERDA DE SESSÃO -------------------
    useEffect(() => {
        const checkSession = setInterval(async () => {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (!session || error) {
                if (STORAGE_KEY && Object.keys(answers).length > 0) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
                    localStorage.setItem(STORAGE_KEY + '_backup', JSON.stringify({ answers, timestamp: Date.now(), page: currentPage }));
                }
                setShowSessionWarning(true);
            }
        }, 30000); // Check a cada 30s

        return () => clearInterval(checkSession);
    }, [answers, currentPage, STORAGE_KEY]);

    // ------------------- NAVEGAÇÃO -------------------
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

    // ------------------- SEGURANÇA TECLAS/CLIQUES -------------------
    useEffect(() => {
        const prevent = (e: Event) => { e.preventDefault(); e.stopPropagation(); return false; };
        const preventKeys = (e: KeyboardEvent) => {
            if (e.key === 'F12' || (e.ctrlKey && (e.key === 'I' || e.key === 'p' || e.key === 'u'))) { e.preventDefault(); }
        };
        document.addEventListener('contextmenu', prevent);
        document.addEventListener('copy', prevent);
        document.addEventListener('paste', prevent);
        document.addEventListener('keydown', preventKeys);
        return () => {
            document.removeEventListener('contextmenu', prevent);
            document.removeEventListener('copy', prevent);
            document.removeEventListener('paste', prevent);
            document.removeEventListener('keydown', preventKeys);
        };
    }, []);

    // ------------------- AUTO-SAVE -------------------
    useEffect(() => {
        if (STORAGE_KEY && Object.keys(answers).length > 0) {
            setSaveStatus('saving');
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            
            saveTimerRef.current = setTimeout(() => {
                try {
                    const existingData = localStorage.getItem(STORAGE_KEY);
                    const parsedExisting = existingData ? JSON.parse(existingData) : {};
                    const mergedAnswers = { ...parsedExisting, ...answers };
                    
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedAnswers));
                    setSaveStatus('saved');
                    setLastSavedTime(new Date().toLocaleTimeString());
                } catch { setSaveStatus('error'); }
            }, 600);
        }
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [answers, STORAGE_KEY]);

    useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentPage]);

    // ------------------- BLOQUEIO DE ALUNO -------------------
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
        } catch { onFinish(); }
    }, [profile, onFinish]);

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
            
            if (!document.fullscreenElement && isQuizStarted && !isBlockingRef.current) {
                fullscreenViolationsRef.current++;

                if (fullscreenViolationsRef.current > MAX_VIOLATIONS) {
                    setShowWarning(true);
                    setCountdown(5);
                    countdownIntervalRef.current = window.setInterval(() => {
                        setCountdown(prev => {
                            if (prev <= 1) {
                                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                                blockStudentAndExit();
                                return 0;
                            }
                            return prev - 1;
                        });
                    }, 1000);
                } else {
                    alert("⚠️ ATENÇÃO: Você saiu do modo tela cheia!\n\nRetorne imediatamente. A próxima saída resultará em bloqueio.");
                    requestFullscreen();
                }
            }
        };
        
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        if (isQuizStarted && !document.fullscreenElement && profile?.role !== 'admin' && !showTerms) {
             setShowWarning(true);
             setCountdown(5);
        }
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [isQuizStarted, blockStudentAndExit, profile, showTerms, requestFullscreen]);

    // ------------------- SUBMISSÃO -------------------
    const handleSubmit = useCallback(async () => {
        if (!profile) return;
        if (!navigator.onLine) { setIsNetworkError(true); return; }

        const missingQuestionIndex = questions.findIndex(q => !answers[q.id] || answers[q.id].trim() === '');
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

            if (STORAGE_KEY) localStorage.removeItem(STORAGE_KEY);
            if (TERMS_KEY_REF.current) localStorage.removeItem(TERMS_KEY_REF.current);
            if (PAGE_KEY_REF.current) localStorage.removeItem(PAGE_KEY_REF.current);

            if (document.fullscreenElement) await document.exitFullscreen();
            setShowSuccessAnimation(true);
            setTimeout(() => onFinish(), 3000);
        } catch (err: any) {
            setIsNetworkError(true);
            setSubmitting(false);
            isExitingLegitimately.current = false;
        }
    }, [examId, profile, answers, onFinish, questions, STORAGE_KEY, goToPage]);

    // ------------------- CARGA DE DADOS -------------------
    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const { data: qData } = await supabase.from('provas').select('*').eq('id', examId).single();
                setQuiz(qData);
                const { data: qQuest } = await supabase.from('student_questions_view').select('*').eq('prova_id', examId);
                const sortedQ = (qQuest || []).sort((a, b) => {
                    const orderA = a.question_order ?? Infinity;
                    const orderB = b.question_order ?? Infinity;
                    if (orderA !== orderB) return orderA - orderB;
                    return a.id - b.id; 
                });
                setQuestions(sortedQ);

                if (STORAGE_KEY) {
                    const savedAnswers = localStorage.getItem(STORAGE_KEY);
                    if (savedAnswers) {
                        try {
                            const parsed = JSON.parse(savedAnswers);
                            setAnswers(parsed);
                            setLastSavedTime(new Date().toLocaleTimeString());
                        } catch (e) { console.error(e); }
                    }
                }
            } catch { setError('Erro ao carregar dados da avaliação.'); } finally { setLoading(false); }
        };
        fetch();
    }, [examId, STORAGE_KEY]);

    const startQuiz = async () => {
        if (profile?.role === 'admin') {
            if(TERMS_KEY_REF.current) localStorage.setItem(TERMS_KEY_REF.current, 'true');
            setShowTerms(false);
            setIsQuizStarted(true);
            return;
        }
        if(TERMS_KEY_REF.current) localStorage.setItem(TERMS_KEY_REF.current, 'true');
        setShowTerms(false);
        setTimeout(async () => {
            try { await requestFullscreen(); } catch (e) { console.error(e); }
            setIsQuizStarted(true); 
        }, 100);
    };

    if (loading) return <div className="flex justify-center p-12 h-96"><Spinner /></div>;
    if (showErrorModal) return <ActionConfirmModal type="warning" title="Erro" message={error} onConfirm={() => setShowErrorModal(false)} confirmText="OK" />;
    if (showBlockedModal) return <ActionConfirmModal type="warning" title="Bloqueado" message="Acesso bloqueado." onConfirm={onFinish} confirmText="OK" />;
    if (showSuccessAnimation) return <SubmissionSuccessAnimation />;
    if (showTerms && profile?.role !== 'admin') return <TermsModal onConfirm={startQuiz} onCancel={onFinish} />;
    if (missingQuestionModal.show) return <ActionConfirmModal type="info" title="Atenção" message={`A questão ${missingQuestionModal.questionIndex} não foi respondida.`} onConfirm={() => setMissingQuestionModal({show:false, questionIndex:-1})} confirmText="OK" />;

    // Estado Limbo / Recovery
    if (!isQuizStarted && !showTerms) {
        return (
             <div className="flex flex-col items-center justify-center p-12 h-96 animate-fadeIn">
                <Spinner />
                <p className="mt-4 text-slate-600 mb-6">Iniciando ambiente seguro...</p>
                <button 
                    onClick={() => { localStorage.removeItem(TERMS_KEY_REF.current || ''); setShowTerms(true); }}
                    className="text-sm text-blue-500 hover:text-blue-700 underline"
                >
                    Não carregou? Clique aqui para reiniciar.
                </button>
            </div>
        );
    }

    if (!quiz || questions.length === 0) return <ActionConfirmModal type="info" title="Erro" message="Prova indisponível." onConfirm={onFinish} confirmText="Voltar" />;

    const startIndex = currentPage * QUESTIONS_PER_PAGE;
    const questionsOnPage = questions.slice(startIndex, startIndex + QUESTIONS_PER_PAGE);

    return (
        <>
            {showWarning && <FullscreenExitWarningModal countdown={countdown} onRequestFullscreen={requestFullscreen} />}
            {isNetworkError && <OfflineWarningModal onRetry={handleSubmit} />}
            
            {showSessionWarning && (
                <div className="fixed inset-0 z-[300] bg-red-900/90 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-8 max-w-md text-center border-4 border-red-500">
                        <h2 className="text-2xl font-bold text-red-600 mb-4">⚠️ Sessão Expirada</h2>
                        <p className="mb-4 text-slate-700 font-semibold">
                            Sua conexão de segurança expirou. Mas não se preocupe! 
                            <br/>Suas respostas estão salvas no seu dispositivo.
                        </p>
                        <p className="mb-6 text-sm text-slate-500">Faça login novamente para continuar exatamente de onde parou.</p>
                        <button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition">
                            Fazer Login Novamente
                        </button>
                    </div>
                </div>
            )}

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
                    <div className="text-right flex flex-col items-end">
                        <p className="text-xs font-bold uppercase text-slate-400 mb-1">Progresso</p>
                        <p className="text-3xl font-bold text-slate-800">{startIndex + 1}-{Math.min(startIndex + QUESTIONS_PER_PAGE, questions.length)}<span className="text-slate-400 text-xl">/{questions.length}</span></p>
                        <SaveStatusIndicator status={saveStatus} lastSavedTime={lastSavedTime} />
                    </div>
                </header>

                <main className="bg-white p-6 sm:p-8 rounded-xl shadow-md border border-slate-200/80">
                    {questionsOnPage.map((question) => (
                        <fieldset key={question.id} className="mb-10 last:mb-2">
                            <legend className="font-semibold text-lg px-2 -mb-3 text-slate-800">{question.title}</legend>
                            <div className="border rounded-lg p-5 pt-7 bg-slate-50/50">
                                <div className="mb-5 text-slate-800"><RenderHtmlWithMath html={question.long_text || ''} /></div>
                                <div className={`grid grid-cols-1 ${question.image_url_1 && question.image_url_2 ? 'sm:grid-cols-2' : ''} gap-4 my-5`}>
                                    {question.image_url_1 && <img src={question.image_url_1} className="border rounded-md w-full shadow-sm" alt="" />}
                                    {question.image_url_2 && <img src={question.image_url_2} className="border rounded-md w-full shadow-sm" alt="" />}
                                </div>
                                <div className="mt-5 space-y-3">
                                    {(question.alternativas || []).map(alt => (
                                        <label key={alt.id} className={`flex items-start p-4 border rounded-lg cursor-pointer transition-all ${answers[question.id!] === alt.letter ? 'bg-blue-50 border-blue-400 ring-1' : 'bg-white hover:border-blue-300'}`}>
                                            <input type="radio" checked={answers[question.id!] === alt.letter} onChange={() => setAnswers(p => ({ ...p, [question.id!]: alt.letter }))} className="mr-4 mt-1" />
                                            <div className="flex-1 text-slate-700 flex items-center"><span className="font-bold mr-2">{alt.letter})</span><RenderHtmlWithMath html={alt.text} tag="span" /></div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </fieldset>
                    ))}

                    <div className="mt-10 pt-6 border-t border-slate-200 flex justify-between">
                        <button onClick={goPrev} disabled={currentPage === 0} className="bg-white border border-slate-300 px-6 py-2.5 rounded-lg disabled:opacity-50">Anterior</button>
                        {currentPage === Math.ceil(questions.length / QUESTIONS_PER_PAGE) - 1 ? 
                            <button onClick={handleSubmit} disabled={submitting} className="bg-green-600 text-white px-8 py-2.5 rounded-lg flex items-center gap-2">{submitting && <Spinner size="20px" color="#fff" />} Finalizar</button> :
                            <button onClick={goNext} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg">Próxima</button>
                        }
                    </div>
                </main>
            </div>
        </>
    );
};

export default QuizTaker;