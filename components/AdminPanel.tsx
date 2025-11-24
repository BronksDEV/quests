import React, { useState, useEffect, useCallback, useRef, FormEvent, useMemo } from 'react';
import { supabase, SUPABASE_BUCKET_NAME, SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase';
import { useAppStore } from '../stores/useAppStore';
import type { Profile, Prova, Questao, Alternativa } from '../types';
import { Spinner, CloseIcon } from './common';
import ActionConfirmModal from './ActionConfirmModal';
import ResultsDashboardModal from './ResultsDashboardModal';


//  Sub componentes do Painel de Admin 

const CreateUserPanel: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'aluno' | 'professor' | 'admin'>('aluno');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const handleCreateUser = async () => {
        if (!email || !password) {
            setFeedback({ message: 'Email e senha são obrigatórios.', type: 'error' });
            return;
        }
        setLoading(true);
        setFeedback(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Usuário não autenticado.");
    
            const response = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ email, password, role })
            });
            
            const responseData = await response.json();
    
            if (!response.ok) {
                throw new Error(responseData.error || responseData.message || 'Falha ao criar usuário na autenticação.');
            }

            const newUserId = responseData.user?.id;
            if (!newUserId) {
                throw new Error("A função de criação não retornou o ID do novo usuário.");
            }

            const { error: profileError } = await supabase
                .from('profiles')
                .insert({ id: newUserId, email: email, role: role });

            if (profileError) {
                console.error("Usuário Auth criado, mas falha ao criar o perfil no banco:", profileError);
                throw new Error(`Usuário criado, mas falha ao salvar o perfil: ${profileError.message}`);
            }
    
            setFeedback({ message: 'Usuário e perfil criados com sucesso!', type: 'success' });
            setEmail('');
            setPassword('');
        } catch (error: any) {
            setFeedback({ message: `Erro: ${error.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Criar Novo Usuário</h3>
            <div className="max-w-md mx-auto">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="new-user-email" className="block text-sm font-medium text-gray-700 mb-1">Email do Usuário</label>
                        <input type="email" id="new-user-email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" placeholder="email@exemplo.com" />
                    </div>
                    <div>
                        <label htmlFor="new-user-password" className="block text-sm font-medium text-gray-700 mb-1">Senha Inicial</label>
                        <input type="password" id="new-user-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" placeholder="••••••••" />
                    </div>
                    <div>
                        <label htmlFor="new-user-role" className="block text-sm font-medium text-gray-700 mb-1">Função (Role)</label>
                        <select id="new-user-role" value={role} onChange={e => setRole(e.target.value as any)} className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition">
                            <option value="aluno">Aluno</option>
                            <option value="professor">Professor</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                    <button onClick={handleCreateUser} disabled={loading} className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:bg-blue-400 shadow-md hover:shadow-lg">
                        {loading ? <Spinner size="20px" color="#fff" /> : <span>Criar Usuário</span>}
                    </button>
                    {feedback && <p className={`text-sm h-4 text-center ${feedback.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>{feedback.message}</p>}
                </div>
            </div>
        </div>
    );
};

const StudentAccessRow = React.memo(({ student, hasIndividualAccess, onToggleAccess, onUnblock }: { student: Profile; hasIndividualAccess: boolean; onToggleAccess: (studentId: string, grant: boolean) => void; onUnblock: (studentId: string) => void; }) => {
    const isBlocked = student.is_blocked;
                                    
    let statusText = 'Acesso Padrão';
    let statusColor = 'text-slate-500';
    if(isBlocked) { statusText = 'Bloqueado'; statusColor = 'text-red-600 font-bold'; }
    else if(hasIndividualAccess) { statusText = 'Acesso Individual Liberado'; statusColor = 'text-blue-600'; }

    return (
        <div className="p-3 rounded-lg flex items-center gap-4 border bg-slate-50">
            <div className="flex-grow min-w-0">
                <p className="font-semibold text-sm text-slate-800 truncate">{student.nome_completo || 'Nome não preenchido'}</p>
                <p className="text-xs text-slate-500">
                    {student.turma || 'Turma N/A'} ・ Matrícula: {student.matricula || 'N/A'}
                </p>
                <p className={`text-xs font-medium mt-1 ${statusColor}`}>{statusText}</p>
            </div>
            <div className="flex items-center gap-2">
                {isBlocked ? (
                    <button onClick={() => onUnblock(student.id)} className="w-28 text-center text-xs font-bold text-white rounded-md transition shadow-sm bg-orange-500 hover:bg-orange-600 px-2 py-1.5">Desbloquear</button>
                ) : hasIndividualAccess ? (
                    <button onClick={() => onToggleAccess(student.id, false)} className="w-28 text-center text-xs font-bold text-white rounded-md transition shadow-sm bg-red-500 hover:bg-red-600 px-2 py-1.5">Revogar Acesso</button>
                ) : (
                    <button onClick={() => onToggleAccess(student.id, true)} className="w-28 text-center text-xs font-bold text-white rounded-md transition shadow-sm bg-blue-500 hover:bg-blue-600 px-2 py-1.5">Liberar Individual</button>
                )}
            </div>
        </div>
    );
});


const AccessControlModal: React.FC<{ quiz: Prova; onClose: () => void }> = ({ quiz, onClose }) => {
    const allStudents = useAppStore((state) => state.allStudents);
    const fetchAllStudents = useAppStore((state) => state.fetchAllStudents);

    const [accessList, setAccessList] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState('');
    const [debouncedFilter, setDebouncedFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [quizStatus, setQuizStatus] = useState(quiz.status);
    const [savingStatus, setSavingStatus] = useState(false);

    const quizSeriesPrefix = quiz.serie.charAt(0);

    const fetchAccessList = useCallback(async () => {
        const { data, error } = await supabase.from('provas_acesso_individual').select('student_id').eq('prova_id', quiz.id);
        if (error) {
            console.error('Erro ao buscar lista de acesso:', error);
            setAccessList(new Set());
        } else {
            setAccessList(new Set(data.map(a => a.student_id)));
        }
    }, [quiz.id]);
    
    useEffect(() => {
        setLoading(true);
        Promise.all([fetchAllStudents(), fetchAccessList()]).finally(() => setLoading(false));

        const channel = supabase
            .channel(`access-control-modal-realtime-${quiz.id}`)
            .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'provas_acesso_individual',
                    filter: `prova_id=eq.${quiz.id}`
                }, 
                () => {
                    fetchAccessList();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchAllStudents, fetchAccessList, quiz.id]);
    
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedFilter(filter); }, 250);
        return () => clearTimeout(handler);
    }, [filter]);
    
    const filteredStudents = useMemo(() => {
        const relevantStudents = allStudents.filter(s => s.turma?.startsWith(quizSeriesPrefix));
        if (!debouncedFilter) return relevantStudents;
        const lowerFilter = debouncedFilter.toLowerCase();
        return relevantStudents.filter(s =>
            s.nome_completo?.toLowerCase().includes(lowerFilter) ||
            s.matricula?.includes(lowerFilter)
        );
    }, [debouncedFilter, allStudents, quizSeriesPrefix]);
    
    const toggleGlobalStatus = async () => {
        const newStatus = quizStatus === 'aberta_para_todos' ? 'fechada' : 'aberta_para_todos';
        setSavingStatus(true);
        const { error } = await supabase.from('provas').update({ status: newStatus }).eq('id', quiz.id);
        if (error) {
            alert("Erro ao atualizar status da prova: " + error.message);
        } else {
            setQuizStatus(newStatus);
        }
        setSavingStatus(false);
    };

const toggleIndividualAccess = useCallback(async (studentId: string, shouldGrant: boolean) => {
    // 1. Pega o estado original para rollback em caso de erro.
    const originalAccessList = new Set(accessList);

    // 2. Muda a UI imediatamente no frontend.
    setAccessList(prev => {
        const next = new Set(prev);
        if (shouldGrant) {
            next.add(studentId);
        } else {
            next.delete(studentId);
        }
        return next;
    });

    // 3. Executa a ação no banco de dados com a função RPC (refatorar isso depois).
    const { error } = await supabase.rpc('manage_individual_access', {
        p_prova_id: quiz.id,
        p_student_id: studentId,
        p_grant: shouldGrant
    });

    // 4. Se a ação no banco falhar, avisa o usuário e reverte a mudança na UI.
    if (error) {
        alert("Erro ao gerenciar acesso individual: " + error.message);
        setAccessList(originalAccessList);
    }
}, [quiz.id, accessList]); // Adiciona 'accessList' como dependência para garantir que a reversão funcione.
    
    const unblockStudent = useCallback(async (studentId: string) => {
        setLoading(true);
    
        const { error } = await supabase
            .from('profiles')
            .update({ is_blocked: false })
            .eq('id', studentId);
    
        if (error) {
            alert("Erro ao desbloquear aluno: " + error.message);
            setLoading(false);
            return;
        }
    
        await fetchAllStudents();
    
        setAccessList(prev => {
            const next = new Set(prev);
            next.delete(studentId);
            return next;
        });
    
        setLoading(false);
    }, [fetchAllStudents]);

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 modal-backdrop">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col modal-content-anim">
                <header className="p-4 border-b flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold">Controle de Acesso: {quiz.title}</h2>
                        <p className="text-sm text-slate-500">{quiz.serie} - {quiz.area}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition rounded-full hover:bg-slate-100"><CloseIcon /></button>
                </header>
                <div className="p-6 flex-grow overflow-y-auto bg-slate-50 space-y-6">
                    <p className="text-sm text-slate-600 bg-slate-100 p-3 rounded-md border border-slate-200">
                        Use esta tela para controlar quem pode acessar esta avaliação. Você pode abrir ou fechar a prova para todos, ou conceder permissões individuais para casos especiais como segunda chamada.
                    </p>
                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <h3 className="font-semibold mb-2">Status Global da Avaliação</h3>
                        <div className="flex items-center justify-between">
                            <span className={`font-bold ${quizStatus === 'aberta_para_todos' ? 'text-green-600' : 'text-red-600'}`}>
                                {quizStatus === 'aberta_para_todos' ? 'Aberta para Todos' : 'Fechada'}
                            </span>
                             <button onClick={toggleGlobalStatus} disabled={savingStatus} className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition ${quizStatus === 'aberta_para_todos' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}>
                                {savingStatus ? <Spinner size="20px" color="#fff"/> : (quizStatus === 'aberta_para_todos' ? 'Fechar Prova' : 'Abrir para Todos')}
                             </button>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <h3 className="font-semibold mb-2">Acesso Individual dos Alunos</h3>
                        <input type="text" value={filter} onChange={e => setFilter(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" placeholder="🔎︎ Buscar aluno..." />
                        
                        <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-2">
                             {loading ? <div className="flex justify-center p-8"><Spinner /></div> : 
                                filteredStudents.length === 0 ? <p className="text-center text-slate-500 py-4">Nenhum aluno encontrado.</p> :
                                filteredStudents.map(student => (
                                    <StudentAccessRow
                                        key={`${student.id}-${student.is_blocked ? 'b' : 'u'}-${accessList.has(student.id) ? 'a' : 'n'}`}
                                        student={student}
                                        hasIndividualAccess={accessList.has(student.id)}
                                        onToggleAccess={toggleIndividualAccess}
                                        onUnblock={unblockStudent}
                                    />
                                ))
                             }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


const AdminPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const profile = useAppStore((state) => state.profile);
    const exams = useAppStore((state) => state.exams);
    const fetchExamsAndResults = useAppStore((state) => state.fetchExamsAndResults);
    
    const [activePanel, setActivePanel] = useState('provas-avancado');
    const [loadingQuizzes, setLoadingQuizzes] = useState(true);
    
    const [isQuizEditorOpen, setQuizEditorOpen] = useState(false);
    const [isAccessControlOpen, setAccessControlOpen] = useState(false);
    const [isResultsDashboardOpen, setResultsDashboardOpen] = useState(false);
    const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
    
    const [selectedQuiz, setSelectedQuiz] = useState<Prova | null>(null);
    const [quizToDelete, setQuizToDelete] = useState<number | null>(null);

    const TABS_BASE = [ { id: 'provas-avancado', label: 'Gerenciar Avaliações' } ];
    const TABS_ADMIN = [ { id: 'criar-conta', label: 'Criar Contas' } ];
    const TABS = profile?.role === 'admin' ? [...TABS_BASE, ...TABS_ADMIN] : TABS_BASE;

    const loadInitialData = useCallback(async () => {
        setLoadingQuizzes(true);
        await fetchExamsAndResults();
        setLoadingQuizzes(false);
    }, [fetchExamsAndResults]);

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]);

    const handleOpenModal = (modal: 'editor' | 'access' | 'results', quiz: Prova | null) => {
        setSelectedQuiz(quiz);
        if (modal === 'editor') setQuizEditorOpen(true);
        if (modal === 'access' && quiz) setAccessControlOpen(true);
        if (modal === 'results' && quiz) setResultsDashboardOpen(true);
    };
    
    const handleCloseAllModals = () => {
        setQuizEditorOpen(false);
        setAccessControlOpen(false);
        setResultsDashboardOpen(false);
        setConfirmModalOpen(false);
        setSelectedQuiz(null);
        setQuizToDelete(null);
    };

    const confirmDeleteQuiz = (quizId: number) => {
        setQuizToDelete(quizId);
        setConfirmModalOpen(true);
    }

    const executeDeleteQuiz = async () => {
        if (!quizToDelete) return;
        const { error } = await supabase.from('provas').delete().eq('id', quizToDelete);
        if (error) {
            alert("Erro ao excluir avaliação: " + error.message);
        }
        handleCloseAllModals();
    }

    return (
        <>
            <div className="fixed inset-0 bg-slate-900/60 z-40 flex justify-end modal-backdrop">
                <div id="admin-area-content" className="w-full max-w-5xl h-full bg-slate-50 shadow-2xl transform translate-x-full" ref={(node) => {if(node) node.classList.remove('translate-x-full')}}>
                    <div className="flex flex-col h-full">
                        <header className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between bg-white">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">Painel do Professor</h2>
                                <p className="text-sm text-slate-500">{profile?.email}</p>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800 transition rounded-full hover:bg-slate-100"><CloseIcon className="w-7 h-7" /></button>
                        </header>
                        <main className="flex-grow p-4 sm:p-6 overflow-y-auto">
                            <nav className="flex space-x-2 mb-6 bg-slate-200 p-1 rounded-xl">
                                {TABS.map(tab => (
                                    <button key={tab.id} onClick={() => setActivePanel(tab.id)}
                                        className={`w-full text-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 ${activePanel === tab.id ? 'bg-white text-blue-600 shadow-md' : 'text-slate-600 hover:bg-white/60'}`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </nav>

                            {activePanel === 'provas-avancado' && (
                                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-xl font-bold">Gerenciador de Avaliações</h2>
                                        <button onClick={() => handleOpenModal('editor', null)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition shadow-md hover:shadow-lg">
                                            + Nova Avaliação
                                        </button>
                                    </div>
                                    {loadingQuizzes ? <div className="flex justify-center p-8"><Spinner /></div> : (
                                        <div className="space-y-3">
                                            {exams.length === 0 ? <p className="text-center text-slate-500 py-8">Nenhuma avaliação cadastrada.</p> :
                                                [...exams].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(quiz => (
                                                    <div key={quiz.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                                                        <div>
                                                            <p className="font-bold text-slate-800">{quiz.title}</p>
                                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                                <span>{quiz.serie} - {quiz.area}</span>
                                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${quiz.status === 'aberta_para_todos' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                                    {quiz.status === 'aberta_para_todos' ? 'Aberta' : 'Fechada'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2 flex-wrap">
                                                            <button onClick={() => handleOpenModal('results', quiz)} className="bg-green-100 text-green-700 font-semibold text-sm py-2 px-3 rounded-lg hover:bg-green-200">Resultados</button>
                                                            <button onClick={() => handleOpenModal('access', quiz)} className="bg-indigo-100 text-indigo-700 font-semibold text-sm py-2 px-3 rounded-lg hover:bg-indigo-200">Acesso</button>
                                                            <button onClick={() => handleOpenModal('editor', quiz)} className="bg-blue-100 text-blue-700 font-semibold text-sm py-2 px-3 rounded-lg hover:bg-blue-200">Editar</button>
                                                            <button onClick={() => confirmDeleteQuiz(quiz.id)} className="bg-red-100 text-red-700 font-semibold text-sm py-2 px-3 rounded-lg hover:bg-red-200">Excluir</button>
                                                        </div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}
                                </div>
                            )}
                            {activePanel === 'criar-conta' && <CreateUserPanel />}
                        </main>
                    </div>
                </div>
            </div>
            {isQuizEditorOpen && <QuizEditorModal initialQuiz={selectedQuiz} onClose={handleCloseAllModals} />}
            {isAccessControlOpen && selectedQuiz && <AccessControlModal quiz={selectedQuiz} onClose={handleCloseAllModals} />}
            {isResultsDashboardOpen && selectedQuiz && <ResultsDashboardModal quiz={selectedQuiz} onClose={handleCloseAllModals} />}
            {isConfirmModalOpen && (
                <ActionConfirmModal
                    type="confirm"
                    title="Confirmar Exclusão"
                    message="Tem certeza? Isso excluirá permanentemente a avaliação, todas as suas questões e resultados associados. Esta ação não pode ser desfeita."
                    onConfirm={executeDeleteQuiz}
                    onCancel={handleCloseAllModals}
                    confirmText="Sim, Excluir"
                />
            )}
        </>
    );
};

const QuizEditorModal: React.FC<{ initialQuiz: Prova | null, onClose: () => void }> = ({ initialQuiz, onClose }) => {
    const [quiz, setQuiz] = useState<Prova | null>(null);
    const [currentQuizId, setCurrentQuizId] = useState<number | null>(initialQuiz?.id || null);
    const [title, setTitle] = useState(initialQuiz?.title || '');
    const [serieId, setSerieId] = useState(initialQuiz?.serie_id_string || '');
    const [serie, setSerie] = useState(initialQuiz?.serie || '1A');
    const [area, setArea] = useState(initialQuiz?.area || 'Linguagens, Códigos e suas Tecnologias');
    const [dataInicio, setDataInicio] = useState(initialQuiz?.data_inicio ? initialQuiz.data_inicio.slice(0, 16) : '');
    const [dataFim, setDataFim] = useState(initialQuiz?.data_fim ? initialQuiz.data_fim.slice(0, 16) : '');
    
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isQuestionEditorOpen, setQuestionEditorOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Questao | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const fetchQuizData = useCallback(async (id: number | null) => {
        if (!id) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const { data, error } = await supabase.from('provas').select('*, questoes(*, alternativas(*))').eq('id', id).single();
        if (error) {
            console.error(error);
            onClose();
        } else {
            const fetchedQuiz = data as Prova;
            setQuiz(fetchedQuiz);
        }
        setLoading(false);
    }, [onClose]);
    
    useEffect(() => {
        fetchQuizData(currentQuizId);
    }, [fetchQuizData, currentQuizId]);

    const handleSaveQuiz = async () => {
        const quizData = { title, serie_id_string: serieId, serie, area, data_inicio: dataInicio, data_fim: dataFim };
        setIsSaving(true);
        if (currentQuizId) {
             const { error } = await supabase.from('provas').update(quizData).eq('id', currentQuizId);
             if (error) { alert("Erro ao salvar: " + error.message); }
             else { setShowSuccessModal(true); }
        } else {
            const { data, error } = await supabase.from('provas').insert(quizData).select().single();
            if (error) { alert("Erro ao criar: " + error.message); }
            else { 
                setCurrentQuizId(data.id);
                setShowSuccessModal(true);
            }
        }
        setIsSaving(false);
    };
    
    const openQuestionEditor = (question: Questao | null) => {
        if (!currentQuizId) {
             alert("Salve primeiro os dados da avaliação para poder adicionar questões.");
             return;
        }
        setEditingQuestion(question);
        setQuestionEditorOpen(true);
    };

    return (
        <>
            <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 modal-backdrop">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col modal-content-anim">
                    <header className="p-4 border-b flex items-center justify-between">
                        <h2 className="text-xl font-bold">{initialQuiz ? 'Editar Avaliação' : 'Nova Avaliação'}</h2>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition rounded-full hover:bg-slate-100"><CloseIcon/></button>
                    </header>
                    <div className="p-6 flex-grow overflow-y-auto bg-slate-50">
                        {loading && !initialQuiz ? <div className="flex justify-center p-8"><Spinner/></div> : (
                            <>
                                <div className="bg-white p-6 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 shadow-sm">
                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Título da Avaliação</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Avaliação de Matemática - 1º Bimestre" className="w-full rounded-lg border-slate-300 shadow-sm"/></div>
                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">ID Único da Série/Prova</label><input type="text" value={serieId} onChange={e => setSerieId(e.target.value)} placeholder="Ex: 1A_MATEMATICA (sem espaços ou acentos)" className="w-full rounded-lg border-slate-300 shadow-sm"/></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Turma</label><select value={serie} onChange={e => setSerie(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm"><option value="1A">1ª Série - A</option><option value="2A">2ª Série - A</option><option value="2B">2ª Série - B</option><option value="3A">3ª Série - A</option><option value="3B">3ª Série - B</option></select></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Área de Conhecimento</label><select value={area} onChange={e => setArea(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm"><option value="Linguagens, Códigos e suas Tecnologias">Linguagens</option><option value="Ciências Humanas e suas Tecnologias">Humanas</option><option value="Ciências da Natureza e suas Tecnologias">Natureza</option><option value="Matemática e suas Tecnologias">Matemática</option></select></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Data de Início</label><input type="datetime-local" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm"/></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Data de Fim</label><input type="datetime-local" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm"/></div>
                                    <div className="md:col-span-2 flex justify-end">
                                        <button onClick={handleSaveQuiz} disabled={isSaving} className="bg-green-600 text-white font-semibold py-2 px-5 rounded-lg hover:bg-green-700 transition shadow-md hover:shadow-lg disabled:bg-green-400">
                                            {isSaving ? <Spinner size="20px" color="#fff" /> : 'Salvar Dados'}
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold">Questões</h3>
                                        <button onClick={() => openQuestionEditor(null)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed shadow-md hover:shadow-lg" disabled={!currentQuizId}>+ Nova Questão</button>
                                    </div>
                                    <div className="space-y-3">
                                        {loading ? <div className="flex justify-center p-4"><Spinner/></div> :
                                        quiz && quiz.questoes && quiz.questoes.sort((a, b) => (a.question_order || 0) - (b.question_order || 0)).map(q => (
                                            <div key={q.id} className="border p-3 rounded-md flex justify-between items-center bg-slate-50">
                                                <div>
                                                    <span className="font-semibold">{q.title}</span>
                                                    {q.disciplina && <span className="ml-2 text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{q.disciplina}</span>}
                                                </div>
                                                <button onClick={() => openQuestionEditor(q)} className="text-sm text-blue-600 font-semibold hover:underline">Editar</button>
                                            </div>
                                        ))}
                                        {(!quiz || !quiz.questoes || quiz.questoes.length === 0) && !loading && <p className="text-sm text-center text-slate-400 py-4">Nenhuma questão adicionada.</p>}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {isQuestionEditorOpen && currentQuizId && (
                <QuestionEditorModal
                    quizId={currentQuizId}
                    question={editingQuestion}
                    onClose={() => {
                        setQuestionEditorOpen(false);
                        setEditingQuestion(null);
                        fetchQuizData(currentQuizId);
                    }}
                />
            )}
            {showSuccessModal && (
                <ActionConfirmModal
                    type="success"
                    title="Sucesso!"
                    message="Os dados da avaliação foram salvos."
                    onCancel={() => setShowSuccessModal(false)}
                />
            )}
        </>
    );
};

const ToolbarButton: React.FC<{ onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; title: string; }> = ({ onClick, children, title }) => (
    <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={onClick}
        title={title}
        className="p-1.5 rounded-md hover:bg-slate-200 transition text-slate-600"
    >
        {children}
    </button>
);

const ToolbarSelect: React.FC<{ onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode; }> = ({ onChange, children }) => (
     <select
        onMouseDown={e => e.preventDefault()}
        onChange={onChange}
        className="text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition bg-white"
    >
        {children}
    </select>
);

const RichTextToolbar: React.FC = () => {
    const handleCommand = (command: string, arg?: string) => {
        document.execCommand(command, false, arg);
    };

    const handleLink = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') {
            alert('Por favor, selecione o texto que deseja transformar em link.');
            return;
        }
        const url = prompt('Insira a URL do link:');
        if (url) {
            handleCommand('createLink', url);
        }
    };
    
    const handleImage = () => {
        const url = prompt('Insira a URL da imagem:');
        if (url) {
            handleCommand('insertImage', url);
        }
    };

    return (
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 p-2 bg-slate-100 border border-b-0 border-slate-300 rounded-t-md">
            <ToolbarSelect onChange={(e) => handleCommand('formatBlock', e.target.value)}>
                <option value="p">Parágrafo</option>
                <option value="h3">Título 1</option>
                <option value="h4">Título 2</option>
            </ToolbarSelect>
             <ToolbarSelect onChange={(e) => handleCommand('fontName', e.target.value)}>
                <option value="Inter, sans-serif">Padrão</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="Times New Roman, serif">Times New Roman</option>
                <option value="Verdana, sans-serif">Verdana</option>
            </ToolbarSelect>
            <div className="w-px h-5 bg-slate-300 mx-1"></div>
            <ToolbarButton onClick={() => handleCommand('bold')} title="Negrito"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6V4zm0 8h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6v-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <ToolbarButton onClick={() => handleCommand('italic')} title="Itálico"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 4H10m9 16H5m7.5-16L7.5 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <ToolbarButton onClick={() => handleCommand('underline')} title="Sublinhado"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <div className="w-px h-5 bg-slate-300 mx-1"></div>
            <ToolbarButton onClick={() => handleCommand('insertUnorderedList')} title="Lista (•)"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 6h12M4 6.01h.01M8 12h12M4 12.01h.01M8 18h12M4 18.01h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <ToolbarButton onClick={() => handleCommand('insertOrderedList')} title="Lista (1.)"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 6h12M8 12h12M8 18h12M4 6h1v4M4 12h1.5l-1.5 2h2M3 18h2a1 1 0 0 1 1 1v.5a.5.5 0 0 1-.5.5h-2.5a.5.5 0 0 1-.5-.5V19a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <div className="w-px h-5 bg-slate-300 mx-1"></div>
             <ToolbarButton onClick={() => handleCommand('justifyLeft')} title="Alinhar à Esquerda"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M3 12h12M3 18h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <ToolbarButton onClick={() => handleCommand('justifyCenter')} title="Centralizar"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M6 12h12M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <ToolbarButton onClick={() => handleCommand('justifyRight')} title="Alinhar à Direita"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M9 12h12M6 18h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <div className="w-px h-5 bg-slate-300 mx-1"></div>
            <ToolbarButton onClick={handleLink} title="Inserir Link"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72m-5.05 2.58-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <ToolbarButton onClick={handleImage} title="Inserir Imagem"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7m8 2-3-3m0 0L9 12m6-6v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <div className="w-px h-5 bg-slate-300 mx-1"></div>
            <ToolbarButton onClick={() => handleCommand('undo')} title="Desfazer"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 18H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h4m5 4-5-4 5 4zm-5 4v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            <ToolbarButton onClick={() => handleCommand('redo')} title="Refazer"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 18h4a4 4 0 0 0 4-4V6a4 4 0 0 0-4-4h-4m-5 4 5-4-5 4zm5 4v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
        </div>
    );
};

const QuestionEditorModal: React.FC<{ quizId: number; question: Questao | null; onClose: () => void }> = ({ quizId, question, onClose }) => {
    const [title, setTitle] = useState(question?.title || '');
    const [disciplina, setDisciplina] = useState(question?.disciplina || '');
    const [longText, setLongText] = useState(question?.long_text || '');
    const [imageUrl1, setImageUrl1] = useState<string | null>(question?.image_url_1 || null);
    const [imageUrl2, setImageUrl2] = useState<string | null>(question?.image_url_2 || null);
    const [alternatives, setAlternatives] = useState<Omit<Alternativa, 'id' | 'question_id'>[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const longTextRef = useRef<HTMLDivElement>(null);
    const image1InputRef = useRef<HTMLInputElement>(null);
    const image2InputRef = useRef<HTMLInputElement>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Helper compatible UUID do aluno.
    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    };
    
    useEffect(() => {
        const loadQuestion = () => {
            if (!question) {
                setAlternatives(Array.from({ length: 5 }, (_, i) => ({ text: '', is_correct: false, letter: String.fromCharCode(65 + i) })));
            } else {
                const fetchedAlts = question.alternativas?.sort((a, b) => a.letter.localeCompare(b.letter)) || [];
                setAlternatives(fetchedAlts.map(alt => ({ text: alt.text, is_correct: alt.is_correct, letter: alt.letter })));
            }
            
            const initialLongText = question?.long_text || '';
            setLongText(initialLongText);
            if (longTextRef.current) {
                longTextRef.current.innerHTML = initialLongText;
            }
            
            setLoading(false);
        };
        loadQuestion();
    }, [question]);
    
    const updateOptionText = (index: number, text: string) => setAlternatives(prev => prev.map((alt, i) => i === index ? { ...alt, text } : alt));
    const setCorrectOption = (index: number) => setAlternatives(prev => prev.map((alt, i) => ({ ...alt, is_correct: i === index })));

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, imageNumber: 1 | 2) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        const fileName = `${generateUUID()}-${file.name}`;
        const { error } = await supabase.storage.from(SUPABASE_BUCKET_NAME).upload(fileName, file);
        if (error) { alert('Erro no upload: ' + error.message); return; }
        const { data } = supabase.storage.from(SUPABASE_BUCKET_NAME).getPublicUrl(fileName);
        if (imageNumber === 1) setImageUrl1(data.publicUrl); else setImageUrl2(data.publicUrl);
        e.target.value = ''; // Reset file input
    };

    const handleSave = async () => {
        if (!title.trim()) { alert("O título da questão é obrigatório."); return; }
        const validAlternatives = alternatives.filter(alt => alt.text.trim() !== '');
        if (validAlternatives.length < 2) { alert("A questão deve ter pelo menos duas alternativas preenchidas."); return; }
        if (!validAlternatives.some(alt => alt.is_correct)) { alert("Uma alternativa deve ser marcada como correta."); return; }
        
        setSaving(true);
        const questionData: Omit<Questao, 'id' | 'alternativas'> = {
            prova_id: quizId,
            title,
            disciplina: disciplina || undefined,
            long_text: longTextRef.current?.innerHTML || '',
            image_url_1: imageUrl1 || undefined,
            image_url_2: imageUrl2 || undefined,
        };

        try {
            let savedQuestionId = question?.id;
            if (question?.id) {
                const { error } = await supabase.from('questoes').update(questionData).eq('id', question.id);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('questoes').insert(questionData).select('id').single();
                if (error) throw error;
                savedQuestionId = data.id;
            }

            if(!savedQuestionId) throw new Error("Não foi possível obter o ID da questão salva.");
            await supabase.from('alternativas').delete().eq('question_id', savedQuestionId);
            const alternativesToSave = validAlternatives.map(alt => ({ question_id: savedQuestionId, text: alt.text, is_correct: alt.is_correct, letter: alt.letter }));
            const { error: altError } = await supabase.from('alternativas').insert(alternativesToSave);
            if (altError) throw altError;
            onClose();
        } catch (error: any) {
            alert("Erro ao salvar: " + error.message);
        } finally {
            setSaving(false);
        }
    };
    
    const executeDelete = async () => {
        if (!question?.id) return;
        const { error } = await supabase.from('questoes').delete().eq('id', question.id);
        if (error) alert("Erro ao excluir: " + error.message);
        else onClose();
    }
    
    return (
        <>
            <div className="fixed inset-0 bg-slate-900/60 z-[80] flex items-center justify-center p-4 modal-backdrop">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col modal-content-anim">
                    <header className="p-4 border-b flex items-center justify-between shrink-0">
                        <h2 className="text-xl font-bold">{question ? 'Editar Questão' : 'Nova Questão'}</h2>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition rounded-full hover:bg-slate-100"><CloseIcon /></button>
                    </header>
                    {loading ? <div className="flex-grow flex items-center justify-center"><Spinner /></div> : (
                        <div className="flex-grow p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
                            <div className="flex flex-col space-y-4 overflow-y-auto pr-3 -mr-3 pb-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Título (Ex: Item 1)</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Disciplina</label><input type="text" value={disciplina} onChange={e => setDisciplina(e.target.value)} placeholder="Ex: Física" className="w-full rounded-lg border-slate-300 shadow-sm" /></div>
                                </div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Enunciado / Texto de Apoio</label><RichTextToolbar /><div ref={longTextRef} onInput={(e: FormEvent<HTMLDivElement>) => setLongText(e.currentTarget.innerHTML)} contentEditable="true" data-placeholder="Digite o enunciado aqui..." className="border rounded-b-md p-2 h-32 overflow-y-auto border-slate-300 shadow-sm" /></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Imagem 1</label>
                                        <input type="file" ref={image1InputRef} onChange={e => handleImageUpload(e, 1)} accept="image/*" className="hidden" />
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => image1InputRef.current?.click()} className="text-sm font-semibold bg-white border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition">Escolher Imagem</button>
                                            <span className="text-sm text-slate-500 truncate">{imageUrl1 ? 'Imagem carregada' : 'Nenhuma imagem'}</span>
                                        </div>
                                        {imageUrl1 && <button onClick={() => setImageUrl1(null)} className="text-xs text-red-500 mt-1 hover:underline">Remover</button>}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Imagem 2</label>
                                        <input type="file" ref={image2InputRef} onChange={e => handleImageUpload(e, 2)} accept="image/*" className="hidden" />
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => image2InputRef.current?.click()} className="text-sm font-semibold bg-white border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition">Escolher Imagem</button>
                                            <span className="text-sm text-slate-500 truncate">{imageUrl2 ? 'Imagem carregada' : 'Nenhuma imagem'}</span>
                                        </div>
                                        {imageUrl2 && <button onClick={() => setImageUrl2(null)} className="text-xs text-red-500 mt-1 hover:underline">Remover</button>}
                                    </div>
                                </div>
                                <div>
                                    <label className="font-semibold block text-sm text-gray-700 mb-2">Alternativas</label>
                                    <div className="space-y-2">{alternatives.map((alt, index) => (<div key={index} className="flex items-center gap-2"><input type="radio" name="correct-option" checked={alt.is_correct} onChange={() => setCorrectOption(index)} className="shrink-0 h-4 w-4 text-blue-600" /><span className="font-semibold text-slate-600">{alt.letter})</span><input type="text" value={alt.text} onChange={e => updateOptionText(index, e.target.value)} placeholder="Texto da alternativa" className="w-full rounded-md border-slate-300 shadow-sm text-sm" /></div>))}</div>
                                </div>
                            </div>
                            <div className="bg-slate-100 p-4 rounded-lg border border-slate-200 h-full flex flex-col"><h3 className="font-bold mb-4 text-center text-slate-600 shrink-0">Pré-visualização</h3><div className="flex-grow bg-white rounded-lg shadow-inner overflow-y-auto border border-slate-200 p-4"><fieldset className="border rounded p-4 h-full"><legend className="font-semibold px-2">{title || "Título"}</legend>{longText && <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: longText }} />}{ (imageUrl1 || imageUrl2) && <div className={`grid grid-cols-1 ${imageUrl1 && imageUrl2 ? 'sm:grid-cols-2' : ''} gap-4 my-4`}>{imageUrl1 && <img src={imageUrl1} alt="Preview 1" className="border rounded-md w-full" />}{imageUrl2 && <img src={imageUrl2} alt="Preview 2" className="border rounded-md w-full" />}</div>}<div className="mt-2 space-y-1">{alternatives.map(alt => (alt.text && <div key={alt.letter} className="flex items-start gap-2 text-sm"><input type="radio" name="preview_radio" className="mt-1" disabled/><span><span className="font-semibold">{alt.letter})</span> {alt.text}</span></div>))}</div></fieldset></div></div>
                        </div>
                    )}
                    <footer className="p-4 border-t flex justify-between items-center gap-3 shrink-0">
                        <div>{question?.id && <button onClick={() => setShowConfirmModal(true)} className="bg-red-100 text-red-700 font-semibold py-2 px-4 rounded-lg hover:bg-red-200">Excluir Questão</button>}</div>
                        <button onClick={handleSave} disabled={saving} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 min-w-[150px] text-center shadow-md">{saving ? <Spinner size="20px" color="#fff" /> : 'Salvar Questão'}</button>
                    </footer>
                </div>
            </div>
            {showConfirmModal && <ActionConfirmModal type="confirm" title="Excluir Questão" message="Tem certeza? Esta ação não pode ser desfeita." onConfirm={executeDelete} onCancel={() => setShowConfirmModal(false)} />}
        </>
    );
};

export default AdminPanel;
