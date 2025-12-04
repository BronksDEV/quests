import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../services/supabase';
import type { Prova, StudentQuestao } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { Spinner } from './common';
import ActionConfirmModal from './ActionConfirmModal';
import SubmissionSuccessAnimation from './SubmissionSuccessAnimation';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify';

interface QuizTakerProps {
    examId: number;
    onFinish: () => void;
}

const QUESTIONS_PER_PAGE = 5;

// ========================== COMPONENTES AUXILIARES ==========================

const RenderHtmlWithMath = React.memo(({ html, className, tag = 'div' }: { html: string; className?: string; tag?: 'div' | 'span' }) => {
    const containerRef = useRef<HTMLElement>(null);
    const lastHtmlRef = useRef<string>('');

    // LISTA EXPANDIDA PARA ACEITAR FORMATAÇÃO DO PROFESSOR (TABELAS, ALINHAMENTOS, ETC)
    const sanitizedHtml = useMemo(() => {
        return DOMPurify.sanitize(html, {
            ADD_TAGS: ['span', 'div', 'p', 'b', 'i', 'u', 'img', 'br', 'sub', 'sup', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'blockquote', 'font', 'center', 'hr'],
            ADD_ATTR: ['src', 'alt', 'class', 'style', 'width', 'height', 'align', 'border', 'cellpadding', 'cellspacing', 'color', 'face', 'size', 'bgcolor'],
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'style'], 
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
        });
    }, [html]);

    useEffect(() => {
        if (!containerRef.current || lastHtmlRef.current === sanitizedHtml) return;
        
        lastHtmlRef.current = sanitizedHtml;
        containerRef.current.innerHTML = sanitizedHtml;
        
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
        
        // Bloqueia interações em links para não sair da prova
        containerRef.current.querySelectorAll('a').forEach(link => {
            link.style.pointerEvents = 'none'; 
            link.style.color = 'inherit';
            link.style.textDecoration = 'none';
            link.removeAttribute('href');
        });
        
        // Previne drag-and-drop
        containerRef.current.querySelectorAll('img').forEach(img => {
            img.style.pointerEvents = 'none';
        });

    }, [sanitizedHtml]);

    const Tag = tag;
    return <Tag ref={containerRef as any} className={className} onCopy={(e: any) => e.preventDefault()} />;
});

// INDICADORES DE STATUS
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
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-200 shadow-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="text-xs font-bold uppercase">Salvo Offline</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-200 shadow-sm transition-all duration-500">
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            <div className="flex flex-col leading-none">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Progresso Seguro</span>
                <span className="text-xs font-semibold text-emerald-600">{lastSavedTime ? `Salvo no dispositivo às ${lastSavedTime}` : 'Sincronizado'}</span>
            </div>
        </div>
    );
};

// MODALS DE ALTA SEGURANÇA
const FullscreenExitWarningModal: React.FC<{ countdown: number; onRequestFullscreen: () => void }> = ({ countdown, onRequestFullscreen }) => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-red-950/95 backdrop-blur-xl select-none w-screen h-screen">
        <div className="text-center text-white p-8 max-w-lg mx-auto bg-slate-900/90 rounded-2xl shadow-2xl border-2 border-red-500 animate-pulse-fast">
            <div className="flex justify-center mb-4 text-red-500">
                <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h2 className="text-4xl font-extrabold text-white mb-2 tracking-tight">RETORNE À PROVA!</h2>
            <p className="mt-4 text-xl font-medium">Violação de ambiente detectada.</p>
            <p className="text-base text-red-200 mt-2">Você saiu da tela cheia, perdeu o foco ou trocou de aba.</p>
            <div className="text-9xl font-mono font-bold my-8 text-red-500 tabular-nums shadow-red-500/50 drop-shadow-lg">{countdown}</div>
            <button 
                onClick={onRequestFullscreen} 
                className="w-full bg-white text-red-600 font-black py-4 px-10 rounded-xl text-xl hover:bg-gray-100 transition-all shadow-xl uppercase tracking-wider"
            >
                Retornar Imediatamente
            </button>
        </div>
    </div>
);

const OfflineWarningModal: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
    useEffect(() => {
        const handleOnline = () => { onRetry(); };
        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [onRetry]);

    return (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm select-none">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md border-l-8 border-yellow-500 text-center animate-bounce-short">
                <h3 className="text-2xl font-bold text-slate-800">Sem Conexão com a Internet</h3>
                <div className="my-6 flex justify-center"><Spinner size="40px" color="#EAB308" /></div>
                <p className="text-slate-600 text-lg mb-2">Seus dados estão salvos localmente.</p>
                <p className="text-sm text-slate-400 mb-6">Não feche a aba. Aguardando conexão para envio...</p>
                <button onClick={onRetry} className="w-full bg-yellow-500 text-white font-bold py-3 px-4 rounded hover:bg-yellow-600 shadow-lg">
                    Tentar Enviar Manualmente
                </button>
            </div>
        </div>
    );
};

const TermsModal: React.FC<{ onConfirm: () => void; onCancel: () => void; }> = ({ onConfirm, onCancel }) => {
    const [agreed, setAgreed] = useState(false);
    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[5000] flex items-center justify-center p-4 select-none backdrop-blur-md">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg modal-content-anim border-t-8 border-blue-600">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-4 bg-blue-50 rounded-full mb-4 ring-4 ring-blue-100"><span className="text-4xl">🛡️</span></div>
                    <h2 className="text-2xl font-bold text-slate-800 text-center">Ambiente Seguro de Avaliação</h2>
                </div>
                
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-sm text-slate-700 mb-6 leading-relaxed">
                    <p className="font-bold mb-3 text-slate-900 uppercase text-xs tracking-wider">Protocolos Ativos:</p>
                    <ul className="space-y-3 list-disc pl-5">
                        <li>Prova realizada estritamente em <strong>Tela Cheia</strong>.</li>
                        <li>Sair da tela, dar <strong>Alt+Tab</strong> ou clicar fora ativará o alerta.</li>
                        <li>Monitoramento de atividade de rede e teclado ativo.</li>
                        <li>Tentativas persistentes de burlar o sistema causarão <strong>bloqueio automático</strong>.</li>
                    </ul>
                </div>

                <label className="flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors mb-6 shadow-sm">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                    <span className="text-sm text-slate-600 font-medium">
                        Li, compreendi e concordo em realizar a prova no ambiente monitorado.
                    </span>
                </label>

                <div className="flex justify-between gap-4">
                    <button onClick={onCancel} className="w-1/3 bg-white border border-slate-300 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50 transition">Voltar</button>
                    <button 
                        onClick={onConfirm} 
                        disabled={!agreed}
                        className="w-2/3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-3 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg hover:shadow-xl flex justify-center items-center gap-2"
                    >
                        <span>Confirmar e Iniciar</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

// ========================== COMPONENTE PRINCIPAL ==========================

const QuizTaker: React.FC<QuizTakerProps> = ({ examId, onFinish }) => {
    // Hooks
    const profile = useAppStore((state) => state.profile);
    const onFinishRef = useRef(onFinish);
    useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

    // Data & UI State
    const [quiz, setQuiz] = useState<Omit<Prova, 'questoes'> | null>(null);
    const [questions, setQuestions] = useState<StudentQuestao[]>([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [answers, setAnswers] = useState<{ [key: number]: string }>({});
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [isQuizStarted, setIsQuizStarted] = useState(false);
    const [showTerms, setShowTerms] = useState(true);
    const [isSubmittingLockdown, setIsSubmittingLockdown] = useState(false);
    
    // Status Modals
    const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [missingQuestionModal, setMissingQuestionModal] = useState<{ show: boolean, questionIndex: number }>({ show: false, questionIndex: -1 });
    const [isOfflineWaitMode, setIsOfflineWaitMode] = useState(false);
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
    const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

    // Anticheat State
    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(5);
    const countdownIntervalRef = useRef<number | null>(null);
    const isBlockingRef = useRef(false);
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef(Date.now());
    const sessionRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isSubmittingRef = useRef(false);

    // Refs Lógica Crítica
    const latestStateRef = useRef({
        isQuizStarted,
        isBlockingRef: isBlockingRef.current,
        isExitingLegitimately: false,
        isSubmittingLockdown,
        profileRole: profile?.role
    });

    useEffect(() => {
        latestStateRef.current = {
            ...latestStateRef.current,
            isQuizStarted,
            isSubmittingLockdown,
            profileRole: profile?.role
        };
    }, [isQuizStarted, isSubmittingLockdown, profile]);

    // Keys
    const TERMS_KEY_REF = useRef<string | null>(null);
    const PAGE_KEY_REF = useRef<string | null>(null);
    const STORAGE_KEY = profile ? `quiz_progress_${profile.id}_${examId}` : null;

    // --- LÓGICA DE NEGÓCIO ---

    // Inicialização (FIXED: Não pula termos)
    useEffect(() => {
        if (!profile) return;
        TERMS_KEY_REF.current = `quiz_terms_accepted_${profile.id}_${examId}`;
        PAGE_KEY_REF.current = `quiz_page_${profile.id}_${examId}`;

        setShowTerms(true);

        const storedPage = localStorage.getItem(PAGE_KEY_REF.current);
        if (storedPage) setCurrentPage(Number(storedPage) || 0);
    }, [profile, examId]);

    // Bloqueio
    const blockStudentAndExit = useCallback(async () => {
        const state = latestStateRef.current;
        if (!profile || state.profileRole === 'admin' || isBlockingRef.current) return;
        
        isBlockingRef.current = true;
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        
        try {
            if (navigator.onLine) await supabase.from('profiles').update({ is_blocked: true }).eq('id', profile.id);
            
            latestStateRef.current.isExitingLegitimately = true;
            if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
            
            setShowBlockedModal(true);
        } catch { onFinishRef.current(); }
    }, [profile]);

    const requestFullscreen = useCallback(async () => {
        try { 
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
            setTimeout(() => window.focus(), 100);
        } catch (e) { console.error(e); }
    }, []);

    // Monitoramento Centralizado (Foco, Visibilidade e Fullscreen)
    useEffect(() => {
        const triggerSecurityCheck = () => {
            const state = latestStateRef.current;
            if (state.isExitingLegitimately || state.profileRole === 'admin' || state.isSubmittingLockdown || isBlockingRef.current) return;

            const isFullscreen = !!document.fullscreenElement;
            const hasFocus = document.hasFocus(); 
            const isVisible = !document.hidden;
            const isSafe = isFullscreen && hasFocus && isVisible;

            if (isSafe) {
                setShowWarning(false);
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
            } else if (state.isQuizStarted) {
                if (countdownIntervalRef.current !== null) return; 

                setShowWarning(true);
                setCountdown(5);

                countdownIntervalRef.current = window.setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) {
                            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                            countdownIntervalRef.current = null;
                            blockStudentAndExit(); 
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            }
        };

        document.addEventListener('fullscreenchange', triggerSecurityCheck); 
        window.addEventListener('blur', triggerSecurityCheck); 
        window.addEventListener('focus', triggerSecurityCheck); 
        document.addEventListener('visibilitychange', triggerSecurityCheck);

        const timer = setTimeout(() => {
             const state = latestStateRef.current;
             if(state.isQuizStarted && !showTerms && state.profileRole !== 'admin') triggerSecurityCheck();
        }, 1500);

        return () => {
            document.removeEventListener('fullscreenchange', triggerSecurityCheck);
            window.removeEventListener('blur', triggerSecurityCheck);
            window.removeEventListener('focus', triggerSecurityCheck);
            document.removeEventListener('visibilitychange', triggerSecurityCheck);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            clearTimeout(timer);
        };
    }, [blockStudentAndExit, showTerms]);

    // Sessão
    useEffect(() => {
        const handleActivity = () => { lastActivityRef.current = Date.now(); };
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        
        sessionRefreshIntervalRef.current = setInterval(async () => {
            if (Date.now() - lastActivityRef.current < 10 * 60 * 1000) {
                const { data } = await supabase.auth.getSession();
                if (data.session) await supabase.auth.refreshSession();
            }
        }, 4 * 60 * 1000);
        
        const sessionCheck = setInterval(async () => {
            const { data, error } = await supabase.auth.getSession();
            if (!navigator.onLine) { /* Ignora offline */ }
            else if (!data.session || error) setShowSessionWarning(true);
        }, 30000);

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            if (sessionRefreshIntervalRef.current) clearInterval(sessionRefreshIntervalRef.current);
            clearInterval(sessionCheck);
        };
    }, []);

    // Persistência
    useEffect(() => {
        if (STORAGE_KEY && Object.keys(answers).length > 0) {
            setSaveStatus('saving');
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
                    setSaveStatus('saved');
                    setLastSavedTime(new Date().toLocaleTimeString());
                } catch { setSaveStatus('error'); }
            }, 600);
        }
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [answers, STORAGE_KEY]);

    // Anti-atalhos
    useEffect(() => {
        const preventDefault = (e: Event) => e.preventDefault();
        const preventKeys = (e: KeyboardEvent) => {
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey) || e.key === 'Meta' || e.key === 'Alt') {} 
        };
        document.addEventListener('contextmenu', preventDefault);
        document.addEventListener('selectstart', preventDefault);
        document.addEventListener('keydown', preventKeys);
        return () => { 
            document.removeEventListener('contextmenu', preventDefault);
            document.removeEventListener('selectstart', preventDefault);
            document.removeEventListener('keydown', preventKeys); 
        };
    }, []);

    // Load Data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: qData, error: e1 } = await supabase.from('provas').select('*').eq('id', examId).single();
                if(e1) throw e1;
                setQuiz(qData);
                
                const { data: qQuest, error: e2 } = await supabase.from('student_questions_view').select('*').eq('prova_id', examId);
                if(e2) throw e2;
                
                const sorted = (qQuest || []).sort((a, b) => (a.question_order ?? 99) - (b.question_order ?? 99));
                setQuestions(sorted);
                
                if (STORAGE_KEY) {
                    try { 
                        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                        if (Object.keys(saved).length > 0) {
                            setAnswers(saved); 
                            setLastSavedTime("Recuperado");
                        }
                    } catch {}
                }
            } catch (err: any) { 
                setErrorMessage(err.message || 'Erro ao carregar prova.'); 
                setShowErrorModal(true); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchData();
    }, [examId, STORAGE_KEY]);

    // Submit
    const handleSubmit = useCallback(async () => {
        if (!profile || isSubmittingRef.current) return;

        const missing = questions.findIndex(q => !answers[q.id] || !answers[q.id].trim());
        if (missing !== -1) {
            setCurrentPage(Math.floor(missing/QUESTIONS_PER_PAGE));
            setMissingQuestionModal({ show: true, questionIndex: missing + 1 });
            return;
        }

        if (!navigator.onLine) {
            setIsOfflineWaitMode(true);
            isSubmittingRef.current = false;
            return;
        }

        setSubmitting(true);
        isSubmittingRef.current = true;
        latestStateRef.current.isExitingLegitimately = true; 
        setIsSubmittingLockdown(true);

        try {
            const { data: exist } = await supabase.from('resultados').select('id').eq('prova_id', examId).eq('student_id', profile.id).maybeSingle();
            
            if (exist) {
                alert("Prova já enviada.");
                cleanupLocalData();
                onFinishRef.current();
                return;
            }

            const { error } = await supabase.from('resultados').insert({ 
                prova_id: examId, 
                student_id: profile.id, 
                respostas: answers 
            });

            if (error && error.code !== '23505') throw error;

            cleanupLocalData();
            
            if (document.fullscreenElement) await document.exitFullscreen().catch(()=>{});

            setShowSuccessAnimation(true);
            setIsOfflineWaitMode(false);
            
            setTimeout(() => onFinishRef.current(), 3500);

        } catch (err: any) {
            setSubmitting(false);
            setIsSubmittingLockdown(false);
            isSubmittingRef.current = false;
            latestStateRef.current.isExitingLegitimately = false;

            if (!navigator.onLine || err.message?.includes('fetch')) {
                setIsOfflineWaitMode(true);
            } else {
                setErrorMessage('Erro de envio: ' + err.message);
                setShowErrorModal(true);
            }
        }
    }, [examId, profile, answers, questions, STORAGE_KEY]);

    const cleanupLocalData = () => {
        localStorage.removeItem(STORAGE_KEY!);
        localStorage.removeItem(TERMS_KEY_REF.current!);
        localStorage.removeItem(PAGE_KEY_REF.current!);
    };

    const startQuiz = async () => {
        if (!profile) return;
        try {
            if (profile.role !== 'admin') await document.documentElement.requestFullscreen();
            if (TERMS_KEY_REF.current) localStorage.setItem(TERMS_KEY_REF.current, 'true');
            setShowTerms(false);
            setIsQuizStarted(true); 
        } catch { alert("Modo Tela Cheia é obrigatório."); }
    };

    const goToPage = (page: number) => {
        const safe = Math.max(0, Math.min(page, Math.ceil(questions.length/QUESTIONS_PER_PAGE)-1));
        setCurrentPage(safe);
        if (PAGE_KEY_REF.current) localStorage.setItem(PAGE_KEY_REF.current, String(safe));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // --- RENDERIZACAO VISUAL ---

    if (loading) return <div className="flex justify-center items-center h-screen bg-slate-50"><div className="flex flex-col items-center gap-4"><Spinner size="48px"/><span className="text-slate-500 font-medium">Preparando ambiente...</span></div></div>;
    
    if (showSessionWarning) return (
        <div className="fixed inset-0 z-[6000] bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-8 max-w-md text-center shadow-2xl">
                <h2 className="text-2xl font-bold mb-4">Sessão Expirada</h2>
                <button onClick={()=>window.location.reload()} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold w-full">Recarregar</button>
            </div>
        </div>
    );

    if (showBlockedModal) return <ActionConfirmModal type="warning" title="BLOQUEADO" message="Violação de segurança detectada." confirmText="Sair" onConfirm={onFinish} />;
    if (showWarning) return <FullscreenExitWarningModal countdown={countdown} onRequestFullscreen={requestFullscreen} />;
    if (showTerms && profile?.role !== 'admin') return <TermsModal onConfirm={startQuiz} onCancel={onFinish} />;
    if (showSuccessAnimation) return <SubmissionSuccessAnimation />;
    if (missingQuestionModal.show) return <ActionConfirmModal type="info" title="Atenção" message={`Responda a questão ${missingQuestionModal.questionIndex}.`} confirmText="Voltar" onConfirm={() => setMissingQuestionModal({show:false, questionIndex:-1})} />;
    if (showErrorModal) return <ActionConfirmModal type="warning" title="Erro" message={errorMessage} confirmText="OK" onConfirm={() => setShowErrorModal(false)} />;

    if (!isQuizStarted && !showTerms) return <div className="flex h-screen items-center justify-center bg-black"><Spinner size="60px" color="#fff" /></div>;
    
    if (!quiz) return null;

    const startIdx = currentPage * QUESTIONS_PER_PAGE;
    const qOnPage = questions.slice(startIdx, startIdx + QUESTIONS_PER_PAGE);

    return (
        <div className="min-h-screen bg-slate-100 select-none pb-20"> 
            {isOfflineWaitMode && <OfflineWarningModal onRetry={handleSubmit} />}

            <div className="w-full max-w-5xl mx-auto pt-6 px-4">
                
                {/* HEADER MANTIDO (MODERNO) + NOME/MATRICULA ADICIONADOS */}
                <header className="mb-6 bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-4 z-40 transition-all">
                    <div>
                        <h1 className="text-lg sm:text-xl font-bold text-slate-800 line-clamp-1">{quiz.title}</h1>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-1">
                            {/* Série (Card cinza mantido) */}
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide text-slate-600">{quiz.serie}</span>
                            
                            {/* INFORMAÇÕES DO ALUNO SOLICITADAS */}
                            <span className="hidden sm:inline text-slate-300">|</span>
                            <span className="text-blue-700 font-semibold truncate max-w-[200px]">{profile?.nome_completo || 'Aluno'}</span>
                            {profile?.matricula && (
                                <span className="text-slate-400 font-mono text-xs">({profile.matricula})</span>
                            )}

                            <span className="hidden sm:inline text-slate-300">|</span>
                            <span className="truncate max-w-[200px] italic">{quiz.area}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                         <div className="text-right"><SaveStatusIndicator status={saveStatus} lastSavedTime={lastSavedTime} /></div>
                         <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-1 text-center min-w-[80px]">
                            <span className="text-[10px] text-slate-400 font-black block uppercase tracking-wider">Questão</span>
                            <span className="text-xl font-black text-slate-800">{startIdx + 1}</span>
                            <span className="text-slate-400 text-xs font-semibold">/{questions.length}</span>
                        </div>
                    </div>
                </header>

                <main className="space-y-8">
                    {qOnPage.map((q, index) => {
                        const globalIndex = startIdx + index;
                        const isAnswered = !!answers[q.id]?.trim();
                        
                        return (
                            // MANTIDO DESIGN HIGH LEVEL DO CARD
                            <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-md transition-shadow duration-300">
                                
                                {/* Header do Card simplificado para ITEM X conforme pedido */}
                                <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-slate-700 text-base uppercase tracking-wide">
                                            Item {q.question_order ?? (globalIndex + 1)}
                                        </h3>
                                    </div>
                                    {isAnswered && <span className="text-xs font-bold text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-100 flex items-center gap-1">✓ Respondida</span>}
                                </div>
                                
                                <div className="p-6 sm:p-8">
                                    
                                    {/* CONTEÚDO HTML DO PROFESSOR (MANTIDO PURO) */}
                                    <div className="mb-6 text-slate-900 leading-relaxed overflow-x-auto">
                                        {/* Fonte normal, cor escura, suporte a formatação rica */}
                                        <RenderHtmlWithMath html={q.long_text || ''} />
                                    </div>
                                    
                                    {/* IMAGENS NATURAIS (LAYOUT FLUIDO, SEM GRID/CROP) */}
                                    {(q.image_url_1 || q.image_url_2) && (
                                        <div className="flex flex-col gap-6 mb-8 w-full">
                                            {q.image_url_1 && (
                                                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 w-fit max-w-full self-center">
                                                    <img src={q.image_url_1} className="w-auto h-auto max-w-full rounded" alt="Figura 1" />
                                                </div>
                                            )}
                                            {q.image_url_2 && (
                                                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 w-fit max-w-full self-center">
                                                    <img src={q.image_url_2} className="w-auto h-auto max-w-full rounded" alt="Figura 2" />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ALTERNATIVAS COM DESIGN TOPO DE LINHA (CARDS GRANDES) MANTIDO */}
                                    <div className="grid grid-cols-1 gap-3">
                                        {q.alternativas?.map(alt => {
                                            const isSelected = answers[q.id] === alt.letter;
                                            return (
                                                <label 
                                                    key={alt.id} 
                                                    className={`
                                                        relative flex items-start p-4 sm:p-5 rounded-xl cursor-pointer transition-all duration-200 border-2 select-none
                                                        ${isSelected 
                                                            ? 'bg-blue-50/50 border-blue-500 shadow-sm z-10' 
                                                            : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                                                        }
                                                    `}
                                                >
                                                    <input 
                                                        type="radio" 
                                                        name={`question_${q.id}`}
                                                        checked={isSelected} 
                                                        onChange={() => setAnswers(prev => ({ ...prev, [q.id]: alt.letter }))} 
                                                        className="mt-1.5 w-5 h-5 text-blue-600 focus:ring-blue-500 border-gray-300 transition-transform active:scale-90" 
                                                    />
                                                    <div className="ml-4 w-full">
                                                        <span className={`text-sm font-black mb-1 block ${isSelected ? 'text-blue-600' : 'text-slate-400'}`}>{alt.letter})</span>
                                                        <div className={`text-base ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                                                            <RenderHtmlWithMath html={alt.text} tag="span" />
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </main>

                {/* BARRA DE NAVEGAÇÃO INFERIOR MANTIDA (COM GRADIENTES) */}
                <div className="sticky bottom-6 z-30 mt-10">
                     <div className="bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200/60 p-4 rounded-2xl flex justify-between items-center max-w-5xl mx-auto ring-1 ring-slate-900/5">
                        <button 
                            onClick={() => goToPage(currentPage - 1)} 
                            disabled={currentPage === 0} 
                            className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                            Anterior
                        </button>
                        
                        <div className="hidden sm:flex gap-1">
                            {Array.from({length: Math.ceil(questions.length / QUESTIONS_PER_PAGE)}).map((_, idx) => (
                                <div key={idx} className={`w-2 h-2 rounded-full transition-all ${idx === currentPage ? 'bg-blue-600 w-6' : 'bg-slate-300'}`} />
                            ))}
                        </div>

                        {currentPage === Math.ceil(questions.length / QUESTIONS_PER_PAGE) - 1 ? (
                            <button 
                                onClick={handleSubmit} 
                                disabled={submitting} 
                                className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-bold hover:from-green-700 hover:to-green-800 shadow-lg shadow-green-600/20 disabled:opacity-70 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                            >
                                {submitting ? <Spinner size="20px" color="#fff" /> : <span>Finalizar Prova</span>}
                                {!submitting && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                            </button>
                        ) : (
                            <button 
                                onClick={() => goToPage(currentPage + 1)} 
                                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                            >
                                Próxima
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuizTaker;