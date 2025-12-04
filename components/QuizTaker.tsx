import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../services/supabase';
import type { Prova, StudentQuestao } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { Spinner } from './common';
import ActionConfirmModal from './ActionConfirmModal';
import SubmissionSuccessAnimation from './SubmissionSuccessAnimation';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify'; // PROTEÇÃO XSS OBRIGATÓRIA

interface QuizTakerProps {
    examId: number;
    onFinish: () => void;
}

const QUESTIONS_PER_PAGE = 5;

// ========================== COMPONENTES AUXILIARES ==========================

// FIX DE SEGURANÇA: RenderHtmlWithMath agora sanitiza HTML antes de injetar
const RenderHtmlWithMath = React.memo(({ html, className, tag = 'div' }: { html: string; className?: string; tag?: 'div' | 'span' }) => {
    const containerRef = useRef<HTMLElement>(null);
    const lastHtmlRef = useRef<string>('');

    // Sanitiza o HTML para evitar scripts maliciosos (XSS)
    const sanitizedHtml = useMemo(() => {
        return DOMPurify.sanitize(html, {
            ADD_TAGS: ['span', 'div', 'p', 'b', 'i', 'u', 'img', 'br', 'sub', 'sup'], // Lista branca estrita
            ADD_ATTR: ['src', 'alt', 'class', 'style'],
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
        });
    }, [html]);

    useEffect(() => {
        if (!containerRef.current || lastHtmlRef.current === sanitizedHtml) return;
        
        lastHtmlRef.current = sanitizedHtml;
        containerRef.current.innerHTML = sanitizedHtml;
        
        // Renderiza matemática DEPOIS de sanitizar o HTML
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
        
        // Bloqueia cliques em links injetados
        containerRef.current.querySelectorAll('a').forEach(link => {
            link.style.pointerEvents = 'none'; 
            link.style.cursor = 'default';
            link.removeAttribute('href');
            link.onclick = (e) => e.preventDefault();
        });
        
        // Previne drag-and-drop de imagens para fora
        containerRef.current.querySelectorAll('img').forEach(img => {
            img.style.pointerEvents = 'none';
        });

        return () => { if (containerRef.current) containerRef.current.innerHTML = ''; };
    }, [sanitizedHtml]);

    const Tag = tag;
    return <Tag ref={containerRef as any} className={className} onCopy={(e: any) => e.preventDefault()} />;
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
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-200 shadow-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="text-xs font-bold uppercase">Offline - Salvo Local</span>
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

const FullscreenExitWarningModal: React.FC<{ countdown: number; onRequestFullscreen: () => void }> = ({ countdown, onRequestFullscreen }) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-red-950/90 backdrop-blur-md select-none">
        <div className="text-center text-white p-8 max-w-lg mx-auto bg-slate-800/90 rounded-xl shadow-2xl border border-red-500/50">
            <h2 className="text-4xl font-bold text-red-400 mb-2">⚠️ ATENÇÃO!</h2>
            <p className="mt-4 text-xl">Você saiu do modo de tela cheia.</p>
            <p className="text-base text-gray-300">Retorne imediatamente ou sua prova será bloqueada e enviada automaticamente.</p>
            <p className="text-8xl font-mono font-bold my-6 text-red-500">{countdown}</p>
            <button onClick={onRequestFullscreen} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-10 rounded-lg text-lg transition-transform hover:scale-105 shadow-lg w-full">RETORNAR À PROVA AGORA</button>
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
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm select-none">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md border-l-8 border-yellow-500 text-center animate-bounce-short">
                <h3 className="text-2xl font-bold text-slate-800">Sem Conexão com a Internet</h3>
                <div className="my-6 flex justify-center"><Spinner size="40px" /></div>
                <p className="text-slate-600 text-lg mb-2">Seus dados estão salvos localmente.</p>
                <p className="text-sm text-slate-400 mb-6">Aguardando reconexão para envio seguro...</p>
                <button onClick={onRetry} className="w-full bg-blue-100 text-blue-700 font-bold py-2 px-4 rounded hover:bg-blue-200">Tentar Enviar Agora</button>
            </div>
        </div>
    );
};

// FIX DE UI: Termos mais sérios com Checkbox obrigatório
const TermsModal: React.FC<{ onConfirm: () => void; onCancel: () => void; }> = ({ onConfirm, onCancel }) => {
    const [agreed, setAgreed] = useState(false);
    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4 select-none backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg modal-content-anim border-t-4 border-blue-600">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-blue-50 rounded-full mb-3"><span className="text-3xl">🛡️</span></div>
                    <h2 className="text-2xl font-bold text-slate-800 text-center">Ambiente Seguro de Avaliação</h2>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-700 mb-6">
                    <p className="font-bold mb-2">Protocolos de Segurança Ativos:</p>
                    <ul className="space-y-2 list-disc pl-5">
                        <li>A prova deve ser realizada obrigatoriamente em <strong>Tela Cheia</strong>.</li>
                        <li>Trocar de aba, minimizar o navegador ou abrir outros programas acionará o <strong>Bloqueio Automático</strong>.</li>
                        <li>Cópia, Cola e Menu de Contexto (botão direito) estão <strong>Desativados</strong>.</li>
                        <li>Sua atividade de conexão e foco está sendo monitorada.</li>
                    </ul>
                </div>

                <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 rounded transition-colors mb-6">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                    <span className="text-sm text-slate-600">
                        Declaro que li as regras acima, sou o titular desta conta e comprometo-me a realizar a avaliação sem consultas externas indevidas.
                    </span>
                </label>

                <div className="flex justify-between gap-4">
                    <button onClick={onCancel} className="w-1/3 bg-white border border-slate-300 text-slate-700 font-bold py-3 rounded-lg hover:bg-slate-50 transition">Voltar</button>
                    <button 
                        onClick={onConfirm} 
                        disabled={!agreed}
                        className="w-2/3 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg hover:shadow-xl flex justify-center items-center gap-2"
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
    // Hooks / Store
    const profile = useAppStore((state) => state.profile);
    
    // Ref segura para chamar onFinish mesmo se closure estiver velha
    const onFinishRef = useRef(onFinish);
    useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

    // Data State
    const [quiz, setQuiz] = useState<Omit<Prova, 'questoes'> | null>(null);
    const [questions, setQuestions] = useState<StudentQuestao[]>([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [answers, setAnswers] = useState<{ [key: number]: string }>({});
    
    // UI State
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [isQuizStarted, setIsQuizStarted] = useState(false);
    const [showTerms, setShowTerms] = useState(true);
    const [isSubmittingLockdown, setIsSubmittingLockdown] = useState(false);
    
    // Modals & Warnings
    const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [missingQuestionModal, setMissingQuestionModal] = useState<{ show: boolean, questionIndex: number }>({ show: false, questionIndex: -1 });
    const [isOfflineWaitMode, setIsOfflineWaitMode] = useState(false);
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
    const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

    // Fullscreen / Anticheat State
    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(5);

    // Refs Lógica
    const countdownIntervalRef = useRef<number | null>(null);
    const isBlockingRef = useRef(false);
    const isExitingLegitimately = useRef(false);
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef(Date.now());
    const sessionRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isSubmittingRef = useRef(false);

    // Reference para acessar estado mais atual dentro de EventListeners
    const latestStateRef = useRef({
        isQuizStarted,
        isBlockingRef: isBlockingRef.current,
        isExitingLegitimately: isExitingLegitimately.current,
        isSubmittingLockdown,
        profileRole: profile?.role
    });

    useEffect(() => {
        latestStateRef.current = {
            isQuizStarted,
            isBlockingRef: isBlockingRef.current,
            isExitingLegitimately: isExitingLegitimately.current,
            isSubmittingLockdown,
            profileRole: profile?.role
        };
    }, [isQuizStarted, isSubmittingLockdown, profile]);

    // Storage Keys
    const TERMS_KEY_REF = useRef<string | null>(null);
    const PAGE_KEY_REF = useRef<string | null>(null);
    const STORAGE_KEY = profile ? `quiz_progress_${profile.id}_${examId}` : null;

    // --- 1. Inicialização ---
    useEffect(() => {
        if (!profile) return;
        TERMS_KEY_REF.current = `quiz_terms_accepted_${profile.id}_${examId}`;
        PAGE_KEY_REF.current = `quiz_page_${profile.id}_${examId}`;

        // Verifica se já aceitou (Recovery mode)
        const accepted = localStorage.getItem(TERMS_KEY_REF.current);
        if (accepted === 'true') {
            setShowTerms(false);
            // Pequeno delay para permitir que o DOM renderize antes de pedir fullscreen se necessário
            setTimeout(() => {
                setIsQuizStarted(true);
            }, 100);
        } else {
            setShowTerms(true);
        }

        const storedPage = localStorage.getItem(PAGE_KEY_REF.current);
        if (storedPage) setCurrentPage(Number(storedPage) || 0);
    }, [profile, examId]);


    // --- 2. Monitor de Tela Cheia e Anticheat ---
    const blockStudentAndExit = useCallback(async () => {
        // Ignora administradores ou se já estiver em processo de bloqueio
        if (!profile || profile.role === 'admin' || isBlockingRef.current) return;
        
        isBlockingRef.current = true;
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        
        try {
            // Tenta bloquear no servidor
            if (navigator.onLine) {
                 await supabase.from('profiles').update({ is_blocked: true }).eq('id', profile.id);
            }
            
            // Força saída de tela cheia limpa
            if (document.fullscreenElement) {
                latestStateRef.current.isExitingLegitimately = true;
                isExitingLegitimately.current = true;
                await document.exitFullscreen().catch(() => {});
            }
            
            // Exibe modal bloqueante (a Store ouvirá o evento do Realtime depois e reforçará)
            setShowBlockedModal(true);
            
            // Força um submit das respostas atuais para não perder tudo? (Opcional, arriscado se fraude)
            // Aqui optamos por apenas bloquear.
            
        } catch { 
            // Fallback
            onFinishRef.current(); 
        }
    }, [profile]);

    const requestFullscreen = useCallback(async () => {
        try { 
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            }
        } catch (e) {
            console.error("Fullscreen blocked:", e);
        }
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const state = latestStateRef.current;
            
            // Ignora se for admin, ou se for saída autorizada (botão de enviar), ou bloqueio em curso
            if (state.isExitingLegitimately || state.profileRole === 'admin' || state.isSubmittingLockdown || state.isBlockingRef) {
                return;
            }

            const isFullscreenNow = !!document.fullscreenElement;

            if (isFullscreenNow) {
                // Voltou para tela cheia: cancela contagem
                setShowWarning(false);
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
            } else if (state.isQuizStarted) {
                // Saiu da tela cheia indevidamente
                if (countdownIntervalRef.current !== null) return; // Já está contando

                setShowWarning(true);
                setCountdown(5); // Reset

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

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        
        // Check inicial tardio para pegar F5 refresh
        const checkInitial = () => {
            const state = latestStateRef.current;
            if (state.isQuizStarted && !document.fullscreenElement && state.profileRole !== 'admin' && !showTerms) {
                handleFullscreenChange();
            }
        };
        setTimeout(checkInitial, 800); // Aumentei o delay para garantir carregamento

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [blockStudentAndExit, showTerms]);

    // --- 3. Monitor de Sessão ---
    useEffect(() => {
        const handleActivity = () => { lastActivityRef.current = Date.now(); };
        window.addEventListener('mousemove', handleActivity); // Adicionado mousemove
        window.addEventListener('click', handleActivity);
        window.addEventListener('keydown', handleActivity);
        
        sessionRefreshIntervalRef.current = setInterval(async () => {
            // Se ativo nos ultimos 10 min, refresh token
            if (Date.now() - lastActivityRef.current < 10 * 60 * 1000) {
                const { data } = await supabase.auth.getSession();
                if (data.session) await supabase.auth.refreshSession();
            }
        }, 5 * 60 * 1000);
        
        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            if (sessionRefreshIntervalRef.current) clearInterval(sessionRefreshIntervalRef.current);
        };
    }, []);

    // Verificador de Token Valido (Caso seja revogado)
    useEffect(() => {
        const check = setInterval(async () => {
            const { data, error } = await supabase.auth.getSession();
            if (!data.session || error) {
                // Salva progresso emergencial
                if (STORAGE_KEY && Object.keys(answers).length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
                setShowSessionWarning(true);
            }
        }, 30000);
        return () => clearInterval(check);
    }, [answers, STORAGE_KEY]);

    // --- 4. Persistência Local ---
    useEffect(() => {
        if (STORAGE_KEY && Object.keys(answers).length > 0) {
            setSaveStatus('saving');
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
                try {
                    // Aqui poderia ter criptografia, mas por performance mantemos JSON puro
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
                    setSaveStatus('saved');
                    setLastSavedTime(new Date().toLocaleTimeString());
                } catch {
                    setSaveStatus('error');
                }
            }, 600); // Debounce de 600ms
        }
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [answers, STORAGE_KEY]);

    // --- 5. Bloqueio de Atalhos e Teclado ---
    useEffect(() => {
        const preventDefault = (e: Event) => e.preventDefault();
        
        const preventKeys = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            // Bloqueia F12, Ctrl+P (Print), Ctrl+Shift+I (DevTools), Ctrl+U (Source)
            if (
                e.key === 'F12' || 
                (e.ctrlKey && (k === 'p' || k === 'u' || k === 's' || k === 'f')) ||
                (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'c' || k === 'j')) ||
                e.metaKey // Bloqueia tecla windows/command para evitar minimizar
            ) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // Bloqueia Menu Contexto e Seleção
        document.addEventListener('contextmenu', preventDefault);
        document.addEventListener('selectstart', preventDefault); // Bloqueia seleção de texto
        document.addEventListener('copy', preventDefault);
        document.addEventListener('paste', preventDefault);
        document.addEventListener('cut', preventDefault);
        document.addEventListener('keydown', preventKeys);

        return () => { 
            document.removeEventListener('contextmenu', preventDefault);
            document.removeEventListener('selectstart', preventDefault);
            document.removeEventListener('copy', preventDefault);
            document.removeEventListener('paste', preventDefault);
            document.removeEventListener('cut', preventDefault);
            document.removeEventListener('keydown', preventKeys); 
        };
    }, []);

    // --- 6. Fetch Inicial de Dados ---
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Prova
                const { data: qData, error: e1 } = await supabase.from('provas').select('*').eq('id', examId).single();
                if(e1) throw e1;
                setQuiz(qData);
                
                // Fetch Questões (Seguro pela View)
                const { data: qQuest, error: e2 } = await supabase.from('student_questions_view').select('*').eq('prova_id', examId);
                if(e2) throw e2;
                
                const sorted = (qQuest || []).sort((a, b) => (a.question_order ?? 99) - (b.question_order ?? 99));
                setQuestions(sorted);
                
                // Recupera Respostas
                if (STORAGE_KEY) {
                    try { 
                        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                        setAnswers(saved); 
                        setLastSavedTime(new Date().toLocaleTimeString()); 
                    } catch {}
                }
            } catch (err: any) { 
                console.error(err);
                setErrorMessage(err.message || 'Erro ao carregar dados da prova.'); 
                setShowErrorModal(true); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchData();
    }, [examId, STORAGE_KEY]);


    // --- 7. Envio (Submit) ---
    const handleSubmit = useCallback(async () => {
        if (!profile || isSubmittingRef.current) return;

        // Check preenchimento
        const missing = questions.findIndex(q => !answers[q.id] || !answers[q.id].trim());
        if (missing !== -1) {
            const t = Math.floor(missing/QUESTIONS_PER_PAGE);
            setCurrentPage(t);
            setMissingQuestionModal({ show: true, questionIndex: missing + 1 });
            return;
        }

        // Offline mode check
        if (!navigator.onLine) {
            setIsOfflineWaitMode(true);
            isSubmittingRef.current = false;
            return;
        }

        setSubmitting(true);
        isSubmittingRef.current = true; // Lock de ref para evitar duplos cliques
        isExitingLegitimately.current = true; // Flag para ignorar detector de fullscreen
        latestStateRef.current.isExitingLegitimately = true;
        setIsSubmittingLockdown(true);

        try {
            // Check duplo se já enviou
            const { data: exist } = await supabase.from('resultados').select('id').eq('prova_id', examId).eq('student_id', profile.id).maybeSingle();
            
            if (exist) {
                alert("Esta prova já consta como enviada no sistema.");
                // Limpeza segura
                cleanupLocalData();
                onFinishRef.current();
                return;
            }

            // INSERT principal
            const { error } = await supabase.from('resultados').insert({ 
                prova_id: examId, 
                student_id: profile.id, 
                respostas: answers 
                // Metadata extra poderia ir aqui se a tabela suportar (ex: fullscreen_breaches)
            });

            if (error && error.code !== '23505') throw error; // Ignora duplicidade se acontecer

            cleanupLocalData();
            
            // Exit Fullscreen apenas se der certo
            if (document.fullscreenElement) {
                await document.exitFullscreen().catch(()=>{});
            }

            setShowSuccessAnimation(true);
            setIsOfflineWaitMode(false);
            
            // Timeout para animação terminar
            setTimeout(() => onFinishRef.current(), 3500);

        } catch (err: any) {
            // Reverte travas se der erro (ex: internet caiu no meio do request)
            setSubmitting(false);
            setIsSubmittingLockdown(false);
            isSubmittingRef.current = false;
            latestStateRef.current.isExitingLegitimately = false;
            isExitingLegitimately.current = false;

            if (!navigator.onLine || err.message?.includes('fetch') || err.message?.includes('network')) {
                setIsOfflineWaitMode(true);
            } else {
                setErrorMessage('Ocorreu um erro ao enviar. Tente novamente em instantes. \n' + err.message);
                setShowErrorModal(true);
            }
        }
    }, [examId, profile, answers, questions, STORAGE_KEY]);

    const cleanupLocalData = () => {
        localStorage.removeItem(STORAGE_KEY!);
        localStorage.removeItem(TERMS_KEY_REF.current!);
        localStorage.removeItem(PAGE_KEY_REF.current!);
    };


    // --- 8. Controle de Início ---
    const startQuiz = async () => {
        if (!profile) return;
        
        try {
            // FIX CRÍTICO: RequestFullscreen DEVE ser direto aqui
            if (profile.role !== 'admin') {
                await document.documentElement.requestFullscreen();
            }

            // Marca termo como aceito
            if (TERMS_KEY_REF.current) localStorage.setItem(TERMS_KEY_REF.current, 'true');
            
            setShowTerms(false);
            setIsQuizStarted(true); // Renderiza o conteúdo
            
        } catch (error) {
            console.error(error);
            alert("A avaliação exige que a tela esteja cheia. Autorize o modo Tela Cheia do seu navegador para continuar.");
        }
    };

    // Navegação
    const goToPage = (page: number) => {
        const safe = Math.max(0, Math.min(page, Math.ceil(questions.length/QUESTIONS_PER_PAGE)-1));
        setCurrentPage(safe);
        if (PAGE_KEY_REF.current) localStorage.setItem(PAGE_KEY_REF.current, String(safe));
        // Rola pro topo
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // --- Renderização Condicional ---

    if (loading) return <div className="flex justify-center items-center h-screen bg-white"><div className="flex flex-col items-center gap-3"><Spinner size="40px"/><span className="text-slate-500">Preparando prova...</span></div></div>;
    
    // Tratamento de Sessão Perdida
    if (showSessionWarning) return (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-8 max-w-md text-center border-t-4 border-red-500 shadow-2xl">
                <h2 className="text-2xl font-bold mb-4 text-slate-800">Sessão Expirada</h2>
                <p className="text-slate-600 mb-6">Por segurança, precisamos reconectar sua conta. Suas respostas atuais estão salvas localmente.</p>
                <button onClick={()=>window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold w-full transition">
                    Recarregar Página
                </button>
            </div>
        </div>
    );

    // Modal de Bloqueio Definitivo
    if (showBlockedModal) return (
        <ActionConfirmModal 
            type="warning" 
            title="Avaliação Interrompida" 
            message="Violação de segurança detectada ou bloqueio administrativo aplicado. O acesso a esta prova foi suspenso." 
            confirmText="Sair da Prova" 
            onConfirm={onFinish}
            // Remove botão cancelar para obrigar saída
        />
    );

    // Termos de Uso (Estado inicial)
    if (showTerms && profile?.role !== 'admin') return <TermsModal onConfirm={startQuiz} onCancel={onFinish} />;

    // Animação de Sucesso
    if (showSuccessAnimation) return <SubmissionSuccessAnimation />;
    
    // Avisos menores
    if (missingQuestionModal.show) return (
        <ActionConfirmModal 
            type="info" 
            title="Questão em branco" 
            message={`Você esqueceu de responder a Questão ${missingQuestionModal.questionIndex}.`} 
            confirmText="Vou corrigir" 
            onConfirm={() => {
                setMissingQuestionModal({show:false, questionIndex:-1});
                // Rolar até a questão
                // Logica extra poderia vir aqui para focar no elemento
            }} 
        />
    );
    
    if (showErrorModal) return (
        <ActionConfirmModal 
            type="warning" 
            title="Erro de Envio" 
            message={errorMessage} 
            confirmText="Tentar Novamente" 
            onConfirm={() => setShowErrorModal(false)} 
        />
    );

    // Render de Segurança de "Ambiente Preparando" (se saiu do termo mas state n mudou)
    if (!isQuizStarted && !showTerms) return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50 animate-fadeIn">
            <Spinner />
            <p className="mt-4 text-slate-600">Configurando ambiente seguro...</p>
        </div>
    );

    if (!quiz) return <ActionConfirmModal type="info" title="Prova Indisponível" message="Não foi possível carregar os dados desta prova." onConfirm={onFinish} confirmText="Voltar" />;

    // --- Renderização Principal (Paginação) ---
    const startIdx = currentPage * QUESTIONS_PER_PAGE;
    const qOnPage = questions.slice(startIdx, startIdx + QUESTIONS_PER_PAGE);

    return (
        <div className="min-h-screen bg-slate-100 select-none pb-20"> {/* BG e Select None Global */}
            
            {showWarning && <FullscreenExitWarningModal countdown={countdown} onRequestFullscreen={requestFullscreen} />}
            {isOfflineWaitMode && <OfflineWarningModal onRetry={handleSubmit} />}

            <div className="w-full max-w-4xl mx-auto pt-6 px-4">
                
                {/* Header Fixo/Stick */}
                <header className="mb-6 bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-4 z-10">
                    <div>
                        <h1 className="text-lg sm:text-xl font-bold text-slate-800">{quiz.title}</h1>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-semibold uppercase">{quiz.serie}</span>
                            <span>{quiz.area}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                         <div className="text-right">
                             <SaveStatusIndicator status={saveStatus} lastSavedTime={lastSavedTime} />
                         </div>
                         <div className="bg-slate-100 rounded-lg px-3 py-1 text-center">
                            <span className="text-xs text-slate-500 font-bold block">QUESTÃO</span>
                            <span className="text-xl font-bold text-blue-600">{startIdx + 1}</span>
                            <span className="text-slate-400 text-sm"> / {questions.length}</span>
                        </div>
                    </div>
                </header>

                {/* Lista de Questões */}
                <main className="space-y-6">
                    {qOnPage.map((q, index) => {
                        const globalIndex = startIdx + index;
                        const isAnswered = !!answers[q.id]?.trim();
                        
                        return (
                            <div key={q.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700">Questão {q.question_order ?? (globalIndex + 1)}</h3>
                                    {isAnswered && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100">Respondida</span>}
                                </div>
                                
                                <div className="p-5 sm:p-6">
                                    {/* Enunciado Sanitizado */}
                                    <div className="mb-6 text-slate-800 leading-relaxed text-lg question-content">
                                        <RenderHtmlWithMath html={q.long_text || ''} />
                                    </div>
                                    
                                    {/* Imagens */}
                                    {(q.image_url_1 || q.image_url_2) && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                            {q.image_url_1 && <img src={q.image_url_1} className="rounded-lg border shadow-sm w-full object-contain max-h-[400px]" alt="Imagem de apoio 1" />}
                                            {q.image_url_2 && <img src={q.image_url_2} className="rounded-lg border shadow-sm w-full object-contain max-h-[400px]" alt="Imagem de apoio 2" />}
                                        </div>
                                    )}

                                    {/* Alternativas */}
                                    <div className="space-y-3 mt-4">
                                        {q.alternativas?.map(alt => {
                                            const isSelected = answers[q.id] === alt.letter;
                                            return (
                                                <label 
                                                    key={alt.id} 
                                                    className={`
                                                        flex p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 group
                                                        ${isSelected 
                                                            ? 'bg-blue-50 border-blue-500 shadow-md transform scale-[1.01]' 
                                                            : 'bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50'
                                                        }
                                                    `}
                                                >
                                                    <input 
                                                        type="radio" 
                                                        name={`question_${q.id}`}
                                                        checked={isSelected} 
                                                        onChange={() => setAnswers(prev => ({ ...prev, [q.id]: alt.letter }))} 
                                                        className="mt-1.5 w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300" 
                                                    />
                                                    <div className="ml-3 flex gap-2">
                                                        <span className={`font-bold ${isSelected ? 'text-blue-700' : 'text-slate-500 group-hover:text-blue-500'}`}>{alt.letter})</span>
                                                        <div className={isSelected ? 'text-slate-800' : 'text-slate-600'}>
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

                {/* Navegação Inferior */}
                <div className="sticky bottom-4 z-20 mt-8">
                     <div className="bg-white/90 backdrop-blur shadow-lg border border-slate-200 p-4 rounded-xl flex justify-between items-center max-w-4xl mx-auto">
                        <button 
                            onClick={() => goToPage(currentPage - 1)} 
                            disabled={currentPage === 0} 
                            className="px-6 py-2.5 border border-slate-300 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            ← Anterior
                        </button>
                        
                        <div className="text-sm font-semibold text-slate-400 hidden sm:block">
                            Página {currentPage + 1} de {Math.ceil(questions.length / QUESTIONS_PER_PAGE)}
                        </div>

                        {currentPage === Math.ceil(questions.length / QUESTIONS_PER_PAGE) - 1 ? (
                            <button 
                                onClick={handleSubmit} 
                                disabled={submitting} 
                                className="px-8 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed transition flex items-center gap-2 transform active:scale-95"
                            >
                                {submitting && <Spinner size="20px" color="#fff" />} 
                                <span>Finalizar e Entregar</span>
                            </button>
                        ) : (
                            <button 
                                onClick={() => goToPage(currentPage + 1)} 
                                className="px-8 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md hover:shadow-lg transition flex items-center gap-2"
                            >
                                Próxima →
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuizTaker;