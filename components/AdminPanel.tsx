import React, { useState, useEffect, useCallback, useRef, FormEvent, useMemo } from 'react';
import { supabase, SUPABASE_BUCKET_NAME, SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase';
import { useAppStore } from '../stores/useAppStore';
import type { Profile, Prova, Questao, Alternativa } from '../types';
import { Spinner, CloseIcon } from './common';
import ActionConfirmModal from './ActionConfirmModal';
import ResultsDashboardModal from './ResultsDashboardModal';

// Importações do KaTeX
import katex from 'katex';
import 'katex/dist/katex.min.css';

// ============================================================================
// 1. CONFIGURAÇÕES E UTILITÁRIOS
// ============================================================================

const AVAILABLE_DISCIPLINES = [
    'Matemática',
    'Física',
    'Química',
    'Biologia',
    'História',
    'Geografia',
    'Português',
    'Inglês',
    'Filosofia',
    'Sociologia',
    'Educação Física',
    'Arte',
    'Geral'
].sort();

const standardizeTitle = (str: string) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const DISCIPLINE_PRIORITY: Record<string, number> = {
    'Matemática': 1,
    'Física': 2,
    'Química': 3,
    'Biologia': 4,
    'História': 5,
    'Geografia': 6,
    'Português': 7,
    'Literatura': 8,
    'Inglês': 9,
    'Filosofia': 10,
    'Sociologia': 11,
    'Geral': 999
};

const formatToLocalDatetime = (isoString: string | undefined) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const offset = date.getTimezoneOffset();
    const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
    return adjustedDate.toISOString().slice(0, 16);
};

// Ícone Auxiliar para o Dropdown
const ChevronDown: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const ToolbarButton: React.FC<{ onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; title: string; }> = ({ onClick, children, title }) => (
    <button
        type="button"
        onMouseDown={e => { e.preventDefault(); }}
        onClick={onClick}
        title={title}
        className="p-1.5 rounded-md hover:bg-slate-200 transition text-slate-600"
    >
        {children}
    </button>
);

const ToolbarSelect: React.FC<{ onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode; }> = ({ onChange, children }) => (
     <select
        onChange={onChange}
        className="text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition bg-white"
    >
        {children}
    </select>
);

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
        }
    }, [html]);

    const Tag = tag;
    return <Tag ref={containerRef as any} className={`prose prose-sm max-w-none ${className}`} />;
};

// ============================================================================
// 2. EDITOR DE TEXTO E MATEMÁTICA
// ============================================================================

const MATH_CATEGORIES = {
    'Básico': [
        { label: 'Fração', latex: '\\frac{x}{y}', preview: '\\frac{x}{y}' },
        { label: 'Potência', latex: 'x^{2}', preview: 'x^{2}' },
        { label: 'Raiz Quadrada', latex: '\\sqrt{x}', preview: '\\sqrt{x}' },
        { label: 'Raiz N', latex: '\\sqrt[n]{x}', preview: '\\sqrt[n]{x}' },
        { label: 'Multiplicação', latex: '\\cdot', preview: '\\cdot' },
        { label: 'Divisão', latex: '\\div', preview: '\\div' },
        { label: 'Mais ou Menos', latex: '\\pm', preview: '\\pm' },
        { label: 'Diferente', latex: '\\neq', preview: '\\neq' },
        { label: 'Aproximado', latex: '\\approx', preview: '\\approx' },
    ],
    'Álgebra/Conjuntos': [
        { label: 'Infinito', latex: '\\infty', preview: '\\infty' },
        { label: 'Pertence', latex: '\\in', preview: '\\in' },
        { label: 'Não Pertence', latex: '\\notin', preview: '\\notin' },
        { label: 'União', latex: '\\cup', preview: '\\cup' },
        { label: 'Intersecção', latex: '\\cap', preview: '\\cap' },
        { label: 'Vazio', latex: '\\emptyset', preview: '\\emptyset' },
        { label: 'Existe', latex: '\\exists', preview: '\\exists' },
        { label: 'Para Todo', latex: '\\forall', preview: '\\forall' },
        { label: 'Implica', latex: '\\Rightarrow', preview: '\\Rightarrow' },
    ],
    'Geometria/Grego': [
        { label: 'Pi', latex: '\\pi', preview: '\\pi' },
        { label: 'Alpha', latex: '\\alpha', preview: '\\alpha' },
        { label: 'Beta', latex: '\\beta', preview: '\\beta' },
        { label: 'Theta', latex: '\\theta', preview: '\\theta' },
        { label: 'Delta', latex: '\\Delta', preview: '\\Delta' },
        { label: 'Graus', latex: '^\\circ', preview: '30^\\circ' },
        { label: 'Ângulo', latex: '\\angle', preview: '\\angle' },
        { label: 'Perpendicular', latex: '\\perp', preview: '\\perp' },
        { label: 'Soma', latex: '\\sum', preview: '\\sum' },
    ]
};

const MathPaletteModal: React.FC<{ onClose: () => void; onInsert: (latex: string) => void }> = ({ onClose, onInsert }) => {
    const [activeTab, setActiveTab] = useState<keyof typeof MATH_CATEGORIES>('Básico');

    const renderIcon = (latex: string) => {
        try {
            return { __html: katex.renderToString(latex, { throwOnError: false }) };
        } catch (e) {
            return { __html: latex };
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 modal-backdrop">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col modal-content-anim overflow-hidden">
                <header className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">Inserir Fórmula Matemática</h3>
                    <button onClick={onClose}><CloseIcon className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
                </header>
                <div className="flex border-b border-slate-200">
                    {Object.keys(MATH_CATEGORIES).map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveTab(cat as any)}
                            className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === cat ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
                <div className="p-6 grid grid-cols-4 gap-3 bg-slate-50/50">
                    {MATH_CATEGORIES[activeTab].map((item) => (
                        <button
                            key={item.label}
                            onClick={() => onInsert(item.latex)}
                            className="flex flex-col items-center justify-center p-2 bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all group aspect-square"
                            title={item.label}
                        >
                            <div className="text-lg mb-1 group-hover:scale-110 transition-transform" dangerouslySetInnerHTML={renderIcon(item.preview)} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const RichTextToolbar: React.FC<{ editorRef: React.RefObject<HTMLDivElement | null> }> = ({ editorRef }) => {
    const [showMathModal, setShowMathModal] = useState(false);
    
    const applyCommand = (command: string, arg?: string) => {
        if (editorRef.current) {
            editorRef.current.focus();
        }
        document.execCommand(command, false, arg);
    };

    const handleLink = () => {
        const url = prompt('Insira a URL do link:');
        if (url) applyCommand('createLink', url);
    };
    
    const handleImage = () => {
        const url = prompt('Insira a URL da imagem:');
        if (!url || !editorRef.current) return;
        
        try { new URL(url); } catch {
            alert('URL inválida.'); return;
        }

        editorRef.current.focus();
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '10px 0';
        
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
        } else {
            editorRef.current.appendChild(img);
        }
    };
    
    const handleInsertMath = (latex: string) => {
        if (editorRef.current) editorRef.current.focus();
        document.execCommand('insertText', false, ` \\( ${latex} \\) `);
        setShowMathModal(false);
    };

    return (
        <>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 p-2 bg-slate-100 border border-b-0 border-slate-300 rounded-t-md">
                <div className="relative inline-block w-28">
                    <select onChange={(e) => applyCommand('formatBlock', e.target.value)} className="w-full text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition bg-white py-1 pl-2 pr-6 cursor-pointer" defaultValue="">
                        <option value="" disabled>Formato</option>
                        <option value="p">Normal</option>
                        <option value="h3">Título 1</option>
                        <option value="h4">Título 2</option>
                        <option value="blockquote">Citação</option>
                    </select>
                </div>
                <div className="relative inline-block w-28">
                    <select onChange={(e) => applyCommand('fontName', e.target.value)} className="w-full text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition bg-white py-1 pl-2 pr-6 cursor-pointer" defaultValue="">
                        <option value="" disabled>Fonte</option>
                        <option value="Inter, sans-serif">Padrão</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Times New Roman, serif">Times New</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                    </select>
                </div>
                
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                
                <ToolbarButton onClick={() => applyCommand('bold')} title="Negrito"><b>B</b></ToolbarButton>
                <ToolbarButton onClick={() => applyCommand('italic')} title="Itálico"><i>I</i></ToolbarButton>
                <ToolbarButton onClick={() => applyCommand('underline')} title="Sublinhado"><u>U</u></ToolbarButton>

                {/* NOVO: Diminuir e Aumentar Fonte */}
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <ToolbarButton onClick={() => applyCommand('decreaseFontSize')} title="Diminuir Fonte">
                    <span className="text-xs font-bold transform scale-90">A-</span>
                </ToolbarButton>
                <ToolbarButton onClick={() => applyCommand('increaseFontSize')} title="Aumentar Fonte">
                    <span className="text-sm font-bold">A+</span>
                </ToolbarButton>
                
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                
                {/* Botões de Lista */}
                <ToolbarButton onClick={() => applyCommand('insertUnorderedList')} title="Lista (•)">•</ToolbarButton>
                <ToolbarButton onClick={() => applyCommand('insertOrderedList')} title="Lista (1.)">1.</ToolbarButton>
                
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                
                {/* Alinhamentos - COM JUSTIFICAR */}
                <ToolbarButton onClick={() => applyCommand('justifyLeft')} title="Esquerda">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M3 12h12M3 18h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </ToolbarButton>
                <ToolbarButton onClick={() => applyCommand('justifyCenter')} title="Centro">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M6 12h12M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </ToolbarButton>
                <ToolbarButton onClick={() => applyCommand('justifyRight')} title="Direita">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M9 12h12M6 18h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </ToolbarButton>
                {/* NOVO: Justificar */}
                <ToolbarButton onClick={() => applyCommand('justifyFull')} title="Justificar">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="21" y1="10" x2="3" y2="10"></line>
                        <line x1="21" y1="6" x2="3" y2="6"></line>
                        <line x1="21" y1="14" x2="3" y2="14"></line>
                        <line x1="21" y1="18" x2="3" y2="18"></line>
                    </svg>
                </ToolbarButton>
                
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                
                <ToolbarButton onClick={handleLink} title="Link">🔗</ToolbarButton>
                <ToolbarButton onClick={handleImage} title="Imagem">🖼️</ToolbarButton>
                <ToolbarButton onClick={() => setShowMathModal(true)} title="Fórmula Matemática"><span className="font-serif font-bold text-lg leading-none">∑</span></ToolbarButton>
                
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <ToolbarButton onClick={() => applyCommand('undo')} title="Desfazer"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 18H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h4m5 4-5-4 5 4zm-5 4v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
                <ToolbarButton onClick={() => applyCommand('redo')} title="Refazer"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 18h4a4 4 0 0 0 4-4V6a4 4 0 0 0-4-4h-4m-5 4 5-4-5 4zm5 4v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></ToolbarButton>
            </div>
            {showMathModal && <MathPaletteModal onClose={() => setShowMathModal(false)} onInsert={handleInsertMath} />}
        </>
    );
};

// ============================================================================
// 3. MODAIS E PAINÉIS AUXILIARES
// ============================================================================

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

            // Edge Function e Trigger cuidam do resto
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
    
    // UI Otimista
    const [quizStatus, setQuizStatus] = useState(quiz.status);
    const [savingStatus, setSavingStatus] = useState(false);

    // Efeito para carregar dados iniciais e Configurar REALTIME
    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            setLoading(true);
            await fetchAllStudents(); // Pega estado atual dos bloqueios
            
            const { data, error } = await supabase
                .from('provas_acesso_individual')
                .select('student_id')
                .eq('prova_id', quiz.id);
            
            if (isMounted) {
                if (!error && data) setAccessList(new Set(data.map(a => a.student_id)));
                setLoading(false);
            }
        };
        load();

        // 🟢 CANAL REALTIME DO ADMIN
        const accessChannel = supabase.channel(`admin-access-ctrl-${quiz.id}`)
            // Escuta tabela de acesso individual (mudança nas provas)
            .on(
                'postgres_changes', 
                { event: '*', schema: 'public', table: 'provas_acesso_individual', filter: `prova_id=eq.${quiz.id}` }, 
                (payload) => {
                    setAccessList(prev => {
                        const next = new Set(prev);
                        if (payload.eventType === 'INSERT') next.add(payload.new.student_id);
                        if (payload.eventType === 'DELETE') next.delete(payload.old.student_id);
                        return next;
                    });
                }
            )
            // 🟢 ESCUTA TABELA DE PERFIL (CRÍTICO: Atualiza Botão Bloqueado/Desbloqueado em tempo real)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles' },
                () => { 
                    console.log('Perfil de aluno alterado. Atualizando lista...');
                    fetchAllStudents(); // Recarrega para ver quem está bloqueado/desbloqueado
                }
            )
            .subscribe();

        return () => { 
            isMounted = false; 
            supabase.removeChannel(accessChannel); 
        };
    }, [quiz.id, fetchAllStudents]);

    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedFilter(filter); }, 250);
        return () => clearTimeout(handler);
    }, [filter]);

    const filteredStudents = useMemo(() => {
        const prefix = quiz.serie.charAt(0);
        const relevant = allStudents.filter(s => s.turma?.startsWith(prefix));
        if (!debouncedFilter) return relevant;
        const lower = debouncedFilter.toLowerCase();
        return relevant.filter(s => s.nome_completo?.toLowerCase().includes(lower) || s.matricula?.includes(lower));
    }, [debouncedFilter, allStudents, quiz.serie]);

    // Actions
    const toggleGlobalStatus = async () => {
        if (savingStatus) return;
        const oldS = quizStatus;
        const newS = quizStatus === 'aberta_para_todos' ? 'fechada' : 'aberta_para_todos';
        setQuizStatus(newS); setSavingStatus(true);
        const { error } = await supabase.from('provas').update({ status: newS }).eq('id', quiz.id);
        if (error) setQuizStatus(oldS);
        setSavingStatus(false);
    };

    const toggleIndividualAccess = async (studentId: string, shouldGrant: boolean) => {
        const orig = new Set(accessList);
        setAccessList(prev => {
            const n = new Set(prev);
            if (shouldGrant) n.add(studentId); else n.delete(studentId);
            return n;
        });
        const { error } = await supabase.rpc('manage_individual_access', { p_prova_id: quiz.id, p_student_id: studentId, p_grant: shouldGrant });
        if (error) { alert(error.message); setAccessList(orig); }
    };
    
    const unblockStudent = async (studentId: string) => {
        const { error } = await supabase.from('profiles').update({ is_blocked: false }).eq('id', studentId);
        if (error) alert("Erro: " + error.message);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 modal-backdrop">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col modal-content-anim">
                <header className="p-4 border-b flex items-center justify-between bg-slate-50 rounded-t-xl">
                    <div><h2 className="text-xl font-bold text-slate-800">Controle de Acesso</h2><p className="text-sm text-slate-500">{quiz.title} • {quiz.serie}</p></div>
                    <button onClick={onClose}><CloseIcon className="w-6 h-6 text-slate-400 hover:text-slate-600"/></button>
                </header>
                
                <div className="p-6 flex-grow overflow-y-auto bg-slate-50 space-y-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div><h3 className="font-semibold text-slate-800">Status Global</h3><p className="text-sm text-slate-500">Visibilidade da turma.</p></div>
                        <button onClick={toggleGlobalStatus} disabled={savingStatus} className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-all ${quizStatus==='aberta_para_todos'?'bg-red-500 hover:bg-red-600':'bg-green-600 hover:bg-green-700'}`}>
                            {savingStatus ? <Spinner size="16px" color="#fff"/> : (quizStatus==='aberta_para_todos' ? 'Fechar Prova' : 'Abrir para Todos')}
                        </button>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-4">Gestão Individual</h3>
                        <input type="text" value={filter} onChange={e=>setFilter(e.target.value)} className="w-full pl-4 py-2 rounded-lg border-slate-300 shadow-sm mb-4 focus:ring-2 focus:ring-blue-200" placeholder="Buscar aluno..." />
                        
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                             {loading ? <div className="flex justify-center p-8"><Spinner /></div> : 
                                filteredStudents.length === 0 ? <p className="text-center text-slate-500 py-8">Nenhum aluno.</p> :
                                filteredStudents.map(student => (
                                    <StudentAccessRow
                                        key={student.id}
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

const DisciplineReorderModal: React.FC<{
    disciplines: string[];
    onClose: () => void;
    onConfirm: (newOrder: string[]) => void;
}> = ({ disciplines, onClose, onConfirm }) => {
    const initialOrder = useMemo(() => 
        [...disciplines].sort((a, b) => {
            const priorityA = DISCIPLINE_PRIORITY[a] || 999;
            const priorityB = DISCIPLINE_PRIORITY[b] || 999;
            return priorityA - priorityB;
        }),
    [disciplines]);

    const [orderedDisciplines, setOrderedDisciplines] = useState<string[]>(initialOrder);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newOrder = [...orderedDisciplines];
        const draggedItem = newOrder[draggedIndex];
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(index, 0, draggedItem);

        setOrderedDisciplines(newOrder);
        setDraggedIndex(index);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 modal-backdrop">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 modal-content-anim">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Reorganizar Disciplinas</h3>
                    <button onClick={onClose}><CloseIcon /></button>
                </div>
                <p className="text-sm text-slate-600 mb-4">Arraste as disciplinas para definir a ordem das questões na prova:</p>
                <div className="space-y-2 mb-6">
                    {orderedDisciplines.map((disc, index) => (
                        <div
                            key={disc}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            className={`p-4 bg-slate-50 border-2 rounded-lg cursor-move transition-all ${
                                draggedIndex === index ? 'border-blue-500 shadow-lg scale-105' : 'border-slate-200 hover:border-blue-300'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-slate-400 text-xl">☰</span>
                                <div className="flex-grow"><span className="font-semibold text-slate-800">{disc}</span><p className="text-xs text-slate-500">Posição {index + 1}</p></div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 bg-slate-200 text-slate-700 font-semibold py-2 rounded-lg hover:bg-slate-300">Cancelar</button>
                    <button onClick={() => onConfirm(orderedDisciplines)} className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700">Aplicar Ordem</button>
                </div>
            </div>
        </div>
    );
};

const DuplicateQuizModal: React.FC<{
    quiz: Prova;
    onClose: () => void;
    onConfirm: (newSerie: string) => void;
}> = ({ quiz, onClose, onConfirm }) => {
    const [newSerie, setNewSerie] = useState(quiz.serie);
    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 modal-backdrop">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 modal-content-anim">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-800">Duplicar Avaliação</h3>
                    <button onClick={onClose}><CloseIcon/></button>
                </div>
                <div className="space-y-4">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <p className="text-sm text-slate-600 mb-1">Prova original:</p>
                        <p className="font-semibold text-slate-800">{quiz.title}</p>
                        <div className="flex gap-3 mt-2 text-xs text-slate-500"><span>Origem: <strong>{quiz.serie}</strong></span><span>Questões: <strong>{quiz.questoes?.length || 0}</strong></span></div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-700">Para qual turma você deseja copiar?</label>
                        <select value={newSerie} onChange={e => setNewSerie(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm focus:border-purple-500 focus:ring-purple-200">
                            <option value="1A">1ª Série - A</option><option value="2A">2ª Série - A</option><option value="2B">2ª Série - B</option><option value="3A">3ª Série - A</option><option value="3B">3ª Série - B</option>
                        </select>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2"><span className="text-amber-500 mt-0.5">⚠️</span><p className="text-xs text-amber-800">A nova prova será criada com status <strong>Fechada</strong> para você revisar antes de liberar.</p></div>
                </div>
                <div className="flex gap-3 mt-6 pt-4 border-t">
                    <button onClick={onClose} className="flex-1 bg-white border border-slate-300 text-slate-700 font-semibold py-2 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
                    <button onClick={() => onConfirm(newSerie)} className="flex-1 bg-purple-600 text-white font-semibold py-2 rounded-lg hover:bg-purple-700 shadow-md transition">Duplicar Prova</button>
                </div>
            </div>
        </div>
    );
};

const QuestionEditorModal: React.FC<{ quizId: number; question: Questao | null; questionNumber: number; onClose: () => void }> = ({ quizId, question, questionNumber, onClose }) => {
    const [title, setTitle] = useState(question?.title || `Item ${questionNumber}`);
    const [disciplina, setDisciplina] = useState(question?.disciplina || '');
    const [longText, setLongText] = useState(question?.long_text || '');
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedContentRef = useRef<string>(question?.long_text || '');

    const [imageUrl1, setImageUrl1] = useState<string | null>(question?.image_url_1 || null);
    const [imageUrl2, setImageUrl2] = useState<string | null>(question?.image_url_2 || null);
    const [alternatives, setAlternatives] = useState<Omit<Alternativa, 'id' | 'question_id'>[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const longTextRef = useRef<HTMLDivElement>(null);
    const image1InputRef = useRef<HTMLInputElement>(null);
    const image2InputRef = useRef<HTMLInputElement>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const handleContentChange = useCallback((html: string) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (html !== lastSavedContentRef.current) {
            saveTimerRef.current = setTimeout(() => {
                setLongText(html);
                lastSavedContentRef.current = html;
            }, 300);
        }
    }, []);

    useEffect(() => { return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }; }, []);

    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    };
    
// 1. CARREGA DADOS DO BANCO PARA O ESTADO (Sem mexer no editor visual ainda)
    useEffect(() => {
        const loadQuestion = () => {
            if (!question) {
                setAlternatives(Array.from({ length: 5 }, (_, i) => ({ text: '', is_correct: false, letter: String.fromCharCode(65 + i) })));
                setLongText('');
            } else {
                const fetchedAlts = question.alternativas?.sort((a, b) => a.letter.localeCompare(b.letter)) || [];
                setAlternatives(fetchedAlts.map(alt => ({ text: alt.text, is_correct: alt.is_correct, letter: alt.letter })));
                
                // Define apenas o estado, não o innerHTML diretamente
                setLongText(question.long_text || '');
            }
            
            setLoading(false);
        };
        loadQuestion();
    }, [question]);

    // 2. SINCRONIZA O DOM (Roda após o carregamento para injetar o texto no editor)
    useEffect(() => {
        if (!loading && longTextRef.current) {
            // Se houver texto no estado e o editor visual estiver diferente/vazio, injeta o texto
            if (longText && longTextRef.current.innerHTML.trim() !== longText.trim()) {
                longTextRef.current.innerHTML = longText;
                lastSavedContentRef.current = longText;
            }
        }
    }, [loading, longText]);
    
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
        e.target.value = ''; 
    };

 const handleSave = async () => {
        if (saving) return;
            if (!disciplina || disciplina.trim() === '') {
                alert("Por favor, selecione uma disciplina antes de salvar.");
                return;
            }
        const validAlternatives = alternatives.filter(alt => alt.text.trim() !== '');
        if (validAlternatives.length < 2) { alert("Mínimo 2 alternativas."); return; }
        if (!validAlternatives.some(alt => alt.is_correct)) { alert("Selecione a correta."); return; }
        
        setSaving(true);
        
        const currentRefHTML = longTextRef.current?.innerHTML || '';
        const currentLongText = currentRefHTML.trim() !== '' 
            ? currentRefHTML 
            : longText; 
        
        // Padronização do título
        const finalDisciplina = standardizeTitle(disciplina);

        try {
            let savedQuestionId = question?.id;
            
            if (question?.id) {
                const questionData = {
                    title: `Item ${questionNumber}`,
                    disciplina: finalDisciplina || undefined,
                    long_text: currentLongText, 
                    image_url_1: imageUrl1 || undefined,
                    image_url_2: imageUrl2 || undefined,
                    question_order: questionNumber
                };

                const { error } = await supabase.from('questoes').update(questionData).eq('id', question.id);
                if (error) throw error;
                
            } else {
                // === CRIAÇÃO (INSERT) ===
                const { data: maxOrderData } = await supabase
                    .from('questoes')
                    .select('question_order')
                    .eq('prova_id', quizId)
                    .order('question_order', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const nextOrder = maxOrderData?.question_order 
                    ? maxOrderData.question_order + 1 
                    : 1;

                const questionData = {
                    prova_id: quizId,
                    title: `Item ${nextOrder}`,
                    disciplina: finalDisciplina || undefined,
                    long_text: currentLongText, 
                    image_url_1: imageUrl1 || undefined,
                    image_url_2: imageUrl2 || undefined,
                    question_order: nextOrder
                };

                const { data, error } = await supabase.from('questoes').insert(questionData).select('id').single();
                
                if (error) {
                    if(error.code === '23505') {
                        throw new Error("Conflito de edição. Outro professor criou uma questão nesse momento. Tente salvar novamente.");
                    }
                    throw error;
                }
                savedQuestionId = data.id;
            }

            if(!savedQuestionId) throw new Error("ID da questão não retornado.");
            
            await supabase.from('alternativas').delete().eq('question_id', savedQuestionId);
            const alternativesToSave = validAlternatives.map(alt => ({ 
                question_id: savedQuestionId, 
                text: alt.text, 
                is_correct: alt.is_correct, 
                letter: alt.letter 
            }));
            
            const { error: altError } = await supabase.from('alternativas').insert(alternativesToSave);
            if (altError) throw altError;
            
            await new Promise(resolve => setTimeout(resolve, 100));
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
            <h2 className="text-xl font-bold">{question ? `Editar ${title}` : `Novo Item`}</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition rounded-full hover:bg-slate-100"><CloseIcon /></button>
          </header>

          {loading ? (
            <div className="flex-grow flex items-center justify-center"><Spinner /></div>
          ) : (
            <div className="flex-grow p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
              {/* LEFT COLUMN (form inputs) */}
              <div className="flex flex-col space-y-4 overflow-y-auto pr-3 -mr-3 pb-4">
                {/* first row: identification + disciplina (2 columns) */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Identificação</label>
                    <input type="text" value={title} disabled className="w-full rounded-lg border-slate-300 shadow-sm bg-slate-100 text-slate-500 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Disciplina <span className="text-red-500">*</span>
                    </label>
                    <select 
                      value={disciplina} 
                      onChange={e => setDisciplina(e.target.value)} 
                      className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      required
                    >
                      <option value="">Selecione uma disciplina</option>
                      {AVAILABLE_DISCIPLINES.map(disc => (
                        <option key={disc} value={disc}>{disc}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* FULL WIDTH: Enunciado / Texto de Apoio (toolbar + editor) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enunciado / Texto de Apoio</label>
                  <RichTextToolbar editorRef={longTextRef} />
                  <div 
                    ref={longTextRef} 
                    key={question?.id || 'new-question'}  
                    suppressContentEditableWarning={true}
                    onInput={(e: FormEvent<HTMLDivElement>) => handleContentChange(e.currentTarget.innerHTML)} 
                    contentEditable="true" 
                    data-placeholder="Digite o enunciado aqui..." 
                    className="border rounded-md p-4 min-h-[300px] max-h-[500px] overflow-y-auto border-slate-300 shadow-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                  />
                </div>

                {/* Imagens */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Imagem 1</label>
                    <input type="file" ref={image1InputRef} onChange={e => handleImageUpload(e as any, 1)} accept="image/*" className="hidden" />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => image1InputRef.current?.click()} className="text-sm font-semibold bg-white border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition">Escolher Imagem</button>
                      <span className="text-sm text-slate-500 truncate">{imageUrl1 ? 'Carregada' : 'Nenhuma'}</span>
                    </div>
                    {imageUrl1 && <button onClick={() => setImageUrl1(null)} className="text-xs text-red-500 mt-1 hover:underline">Remover</button>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Imagem 2</label>
                    <input type="file" ref={image2InputRef} onChange={e => handleImageUpload(e as any, 2)} accept="image/*" className="hidden" />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => image2InputRef.current?.click()} className="text-sm font-semibold bg-white border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition">Escolher Imagem</button>
                      <span className="text-sm text-slate-500 truncate">{imageUrl2 ? 'Carregada' : 'Nenhuma'}</span>
                    </div>
                    {imageUrl2 && <button onClick={() => setImageUrl2(null)} className="text-xs text-red-500 mt-1 hover:underline">Remover</button>}
                  </div>
                </div>

                {/* Alternativas */}
                <div>
                  <label className="font-semibold block text-sm text-gray-700 mb-2">Alternativas</label>
                  <div className="space-y-2">
                    {alternatives.map((alt, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input type="radio" name="correct-option" checked={alt.is_correct} onChange={() => setCorrectOption(index)} className="shrink-0 h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-slate-600">{alt.letter})</span>
                        <input type="text" value={alt.text} onChange={e => updateOptionText(index, e.target.value)} placeholder="Texto da alternativa" className="w-full rounded-md border-slate-300 shadow-sm text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN (preview) */}
              <div className="bg-slate-100 p-4 rounded-lg border border-slate-200 h-full flex flex-col overflow-hidden">
                <h3 className="font-bold mb-4 text-center text-slate-600 shrink-0">Pré-visualização</h3>
                <div className="flex-grow bg-white rounded-lg shadow-inner overflow-y-auto border border-slate-200 p-4">
                  <fieldset className="border rounded p-4 min-h-full">
                    <legend className="font-semibold px-2">{title || "Título"}</legend>
                    <RenderHtmlWithMath html={longText} />
                    { (imageUrl1 || imageUrl2) && 
                      <div className={`grid grid-cols-1 ${imageUrl1 && imageUrl2 ? 'sm:grid-cols-2' : ''} gap-4 my-4`}>
                        {imageUrl1 && <img src={imageUrl1} alt="Preview 1" className="border rounded-md w-full" />}
                        {imageUrl2 && <img src={imageUrl2} alt="Preview 2" className="border rounded-md w-full" />}
                      </div>
                    }
                    <div className="mt-2 space-y-1">
                      {alternatives.map(alt => (
                        alt.text && 
                        <div key={alt.letter} className="flex items-start gap-2 text-sm">
                          <input type="radio" name="preview_radio" className="mt-1" disabled/>
                          <span className="font-semibold mr-1">{alt.letter})</span>
                          <RenderHtmlWithMath html={alt.text} tag="span" />
                        </div>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>
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
}

const QuizEditorModal: React.FC<{ initialQuiz: Prova | null, onClose: () => void }> = ({ initialQuiz, onClose }) => {
    const [quiz, setQuiz] = useState<Prova | null>(null);
    const [currentQuizId, setCurrentQuizId] = useState<number | null>(initialQuiz?.id || null);
    const [title, setTitle] = useState(initialQuiz?.title || '');
    const [serieId, setSerieId] = useState(initialQuiz?.serie_id_string || '');
    const [serie, setSerie] = useState(initialQuiz?.serie || '1A');
    const [area, setArea] = useState(initialQuiz?.area || 'Linguagens, Códigos e suas Tecnologias');
    const [dataInicio, setDataInicio] = useState(initialQuiz?.data_inicio ? formatToLocalDatetime(initialQuiz.data_inicio) : '');
    const [dataFim, setDataFim] = useState(initialQuiz?.data_fim ? formatToLocalDatetime(initialQuiz.data_fim) : '');
    
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isQuestionEditorOpen, setQuestionEditorOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Questao | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    
    const [isDuplicateModalOpen, setDuplicateModalOpen] = useState(false);
    const [quizToDuplicate, setQuizToDuplicate] = useState<Prova | null>(null);
    const [isReorderModalOpen, setReorderModalOpen] = useState(false);
    const [isReordering, setIsReordering] = useState(false);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

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
    
    // Listener em Tempo Real (CORRIGIDO PARA NOVA AVALIAÇÃO)
    useEffect(() => {
        if (!currentQuizId) {
            setLoading(false); 
            return;
        }
        
        fetchQuizData(currentQuizId);

        const channel = supabase.channel(`quiz-editor-${currentQuizId}`)
            .on(
                'postgres_changes', 
                { event: '*', schema: 'public', table: 'questoes', filter: `prova_id=eq.${currentQuizId}` }, 
                () => { 
                    console.log("Detectada alteração nas questões por outro usuário, recarregando...");
                    fetchQuizData(currentQuizId); 
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchQuizData, currentQuizId]);

    const sortedQuestions = useMemo(() => {
        if (!quiz?.questoes) return [];
        return [...quiz.questoes].sort((a, b) => {
            const orderA = a.question_order ?? 999999;
            const orderB = b.question_order ?? 999999;
            if (orderA !== orderB) return orderA - orderB;
            return a.id - b.id;
        });
    }, [quiz?.questoes]);

    const handleMoveQuestion = async (index: number, direction: 'up' | 'down') => {
        if (!quiz?.questoes || isReordering || !quiz?.id) return;
        
        const questions = [...sortedQuestions];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        if (targetIndex < 0 || targetIndex >= questions.length) return;
        
        const currentDisciplina = questions[index].disciplina || 'Geral';
        const targetDisciplina = questions[targetIndex].disciplina || 'Geral';
        
        if (currentDisciplina !== targetDisciplina) return;

        setIsReordering(true);
        [questions[index], questions[targetIndex]] = [questions[targetIndex], questions[index]];

        const updates = questions.map((q, idx) => ({
            id: q.id,
            prova_id: quiz.id, 
            question_order: idx + 1,
            title: `Item ${idx + 1}`,
            disciplina: q.disciplina 
        }));
        
   
        setQuiz(prev => prev ? { ...prev, questoes: questions } : null);

        try {

            const { error } = await supabase.rpc('reorder_questions', { payload: updates });
            
            if (error) throw error;
            await fetchQuizData(currentQuizId);
        } catch (error: any) {
            console.error("Erro ao mover:", error);
            alert("Erro ao reordenar: " + error.message);
            fetchQuizData(currentQuizId); 
        } finally {
            setIsReordering(false);
        }
    };

    const openReorderModal = () => {
        setReorderModalOpen(true);
    };

 const handleReorderByDiscipline = async (newDisciplineOrder: string[]) => {
        if (!quiz?.questoes || !quiz.id) return;
        setLoading(true);
        setReorderModalOpen(false);

        try {
            const grouped = sortedQuestions.reduce((acc, q) => {
                const disc = q.disciplina || 'Geral';
                if (!acc[disc]) acc[disc] = [];
                acc[disc].push(q);
                return acc;
            }, {} as Record<string, Questao[]>);

            const reordered: Questao[] = [];
            newDisciplineOrder.forEach(disc => {
                if (grouped[disc]) {
                    reordered.push(...grouped[disc]);
                }
            });
            
            Object.keys(grouped).forEach(disc => {
               if(!newDisciplineOrder.includes(disc)) {
                   reordered.push(...grouped[disc]);
               }
            });

            // Recalcula a sequência
            const updates = reordered.map((q, idx) => ({
                id: q.id,
                prova_id: quiz.id,
                title: `Item ${idx + 1}`,
                question_order: idx + 1,
                disciplina: q.disciplina,
            }));

            setQuiz(prev => prev ? { ...prev, questoes: reordered.map((q, idx) => ({ ...q, title: `Item ${idx + 1}`, question_order: idx + 1 })) } : null);


            const { error } = await supabase.rpc('reorder_questions', { payload: updates });
            
            if (error) throw error;
            
            await fetchQuizData(currentQuizId);
            
        } catch (error: any) {
            alert("Erro: " + error.message);
            fetchQuizData(currentQuizId);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveQuiz = async () => {
        const quizData = { 
            title, 
            serie_id_string: serieId, 
            serie, 
            area, 
            data_inicio: new Date(dataInicio).toISOString(), 
            data_fim: new Date(dataFim).toISOString() 
        };
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

    const openDuplicateModal = (quiz: Prova) => {
        setQuizToDuplicate(quiz);
        setDuplicateModalOpen(true);
    };

    const handleDuplicateConfirm = async (newSerie: string) => {
        if (!quizToDuplicate) return;
        setLoading(true);
        setDuplicateModalOpen(false);

        try {
            const { data: fullQuiz, error: fetchError } = await supabase
                .from('provas')
                .select('*, questoes(*, alternativas(*))')
                .eq('id', quizToDuplicate.id)
                .single();
            
            if (fetchError) throw fetchError;

            const newQuizData = {
                title: fullQuiz.title + ' (Cópia)',
                serie_id_string: `${fullQuiz.serie_id_string}_COPY_${Date.now()}`,
                serie: newSerie,
                area: fullQuiz.area,
                data_inicio: fullQuiz.data_inicio,
                data_fim: fullQuiz.data_fim,
                status: 'fechada'
            };

            const { data: newQuiz, error: createError } = await supabase
                .from('provas')
                .insert(newQuizData)
                .select()
                .single();

            if (createError) throw createError;

            if (fullQuiz.questoes && fullQuiz.questoes.length > 0) {
                for (const q of fullQuiz.questoes) {
                    const { data: newQ, error: qError } = await supabase
                        .from('questoes')
                        .insert({
                            prova_id: newQuiz.id,
                            title: q.title,
                            disciplina: q.disciplina,
                            long_text: q.long_text,
                            image_url_1: q.image_url_1,
                            image_url_2: q.image_url_2,
                            question_order: q.question_order
                        })
                        .select()
                        .single();
                    
                    if (qError) throw qError;

                    if (q.alternativas && q.alternativas.length > 0) {
                        const newAlts = q.alternativas.map((alt: Alternativa) => ({
                            question_id: newQ.id,
                            text: alt.text,
                            is_correct: alt.is_correct,
                            letter: alt.letter
                        }));
                        
                        const { error: altError } = await supabase.from('alternativas').insert(newAlts);
                        if (altError) throw altError;
                    }
                }
            }

            alert("Prova duplicada com sucesso!");

        } catch (error: any) {
            console.error("Erro ao duplicar:", error);
            alert("Erro ao duplicar prova: " + error.message);
        } finally {
            setLoading(false);
            setQuizToDuplicate(null);
        }
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
                        {loading && !quiz ? <div className="flex justify-center p-8"><Spinner/></div> : (
                            <>
                                <div className="bg-white p-6 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 shadow-sm">
                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Título da Avaliação</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Avaliação de Matemática - 1º Bimestre" className="w-full rounded-lg border-slate-300 shadow-sm"/></div>
                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">ID Único da Série/Prova</label><input type="text" value={serieId} onChange={e => setSerieId(e.target.value)} placeholder="Ex: 1A_MATEMATICA (sem espaços ou acentos)" className="w-full rounded-lg border-slate-300 shadow-sm"/></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Turma</label><select value={serie} onChange={e => setSerie(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm"><option value="1A">1ª Série - A</option><option value="2A">2ª Série - A</option><option value="2B">2ª Série - B</option><option value="3A">3ª Série - A</option><option value="3B">3ª Série - B</option></select></div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Área de Conhecimento</label>
                                        <select value={area} onChange={e => setArea(e.target.value)} className="w-full rounded-lg border-slate-300 shadow-sm">
                                            <option value="Linguagens, Códigos e suas Tecnologias">Linguagens</option><option value="Ciências Humanas e suas Tecnologias">Humanas</option><option value="Ciências da Natureza e suas Tecnologias">Natureza</option><option value="Matemática e suas Tecnologias">Matemática</option>
                                            <option value="Provão">Provão</option>
                                        </select>
                                    </div>
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
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={openReorderModal}
                                                disabled={!currentQuizId || sortedQuestions.length === 0}
                                                className="bg-purple-100 text-purple-700 font-semibold text-sm py-2 px-3 rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                <span>⇅</span> Reorganizar Disciplinas
                                            </button>
                                            <button onClick={() => openQuestionEditor(null)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed shadow-md hover:shadow-lg" disabled={!currentQuizId}>+ Nova Questão</button>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {loading ? <div className="flex justify-center p-4"><Spinner/></div> :
                                        (() => {
                                            const grouped = sortedQuestions.reduce((acc, q) => {
                                                const disc = q.disciplina || 'Geral';
                                                if (!acc[disc]) acc[disc] = [];
                                                acc[disc].push(q);
                                                return acc;
                                            }, {} as Record<string, Questao[]>);
                                            
                                                const sortedDisciplinesList = [
                                                     ...new Set(sortedQuestions.map(q => q.disciplina || 'Geral'))
                                                ];

                                            return sortedDisciplinesList.map(discipline => (
                                                <div key={discipline} className="space-y-2 mb-4">
                                                    <div className="bg-slate-100 border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between">
                                                        <span className="font-bold text-slate-700 text-sm uppercase tracking-wide">
                                                            {discipline}
                                                        </span>
                                                        <span className="text-xs text-slate-500 font-medium bg-white px-2 py-0.5 rounded-full border border-slate-200">
                                                            {grouped[discipline].length} itens
                                                        </span>
                                                    </div>
                                                    {grouped[discipline].map((q, groupIndex) => {
                                                        const globalIndex = sortedQuestions.findIndex(sq => sq.id === q.id);
                                                        const isFirstInGroup = groupIndex === 0;
                                                        const isLastInGroup = groupIndex === grouped[discipline].length - 1;

                                                        return (
                                                            <div key={q.id} className="border p-3 rounded-md flex justify-between items-center bg-slate-50 transition-all hover:bg-slate-100 ml-2 border-l-4 border-l-blue-500">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex flex-col gap-1">
                                                                        <button 
                                                                            onClick={() => handleMoveQuestion(globalIndex, 'up')} 
                                                                            disabled={isFirstInGroup || isReordering}
                                                                            className="p-1 text-slate-400 hover:text-blue-600 disabled:text-slate-200 disabled:cursor-not-allowed transition-colors"
                                                                            title="Mover para cima"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleMoveQuestion(globalIndex, 'down')} 
                                                                            disabled={isLastInGroup || isReordering}
                                                                            className="p-1 text-slate-400 hover:text-blue-600 disabled:text-slate-200 disabled:cursor-not-allowed transition-colors"
                                                                            title="Mover para baixo"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                                        </button>
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-semibold text-slate-800 block">Item {groupIndex + 1} (Global: {globalIndex + 1})</span>
                                                                    </div>
                                                                </div>
                                                                <button onClick={() => openQuestionEditor(q)} className="text-sm text-blue-600 font-semibold hover:underline px-3 py-1 rounded hover:bg-blue-50 transition-colors">Editar</button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ));
                                        })()
                                        }
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
                    questionNumber={editingQuestion ? sortedQuestions.findIndex(q => q.id === editingQuestion.id) + 1 : sortedQuestions.length + 1}
                    onClose={() => {
                        setQuestionEditorOpen(false);
                        setEditingQuestion(null);
                        fetchQuizData(currentQuizId);
                    }}
                />
            )}
            {isReorderModalOpen && (
                <DisciplineReorderModal
                    disciplines={[...new Set(sortedQuestions.map(q => q.disciplina || 'Geral'))]}
                    onClose={() => setReorderModalOpen(false)}
                    onConfirm={handleReorderByDiscipline}
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
            {isDuplicateModalOpen && quizToDuplicate && (
                <DuplicateQuizModal 
                    quiz={quizToDuplicate} 
                    onClose={() => setDuplicateModalOpen(false)} 
                    onConfirm={handleDuplicateConfirm} 
                />
            )}
        </>
    );
};

// ============================================================================
// 4. COMPONENTE PRINCIPAL DO PAINEL (PAI)
// ============================================================================

const AdminPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const profile = useAppStore((state) => state.profile);
    const exams = useAppStore((state) => state.exams);
    const fetchExamsAndResults = useAppStore((state) => state.fetchExamsAndResults);
    
    const [activePanel, setActivePanel] = useState('provas-avancado');
    const [loadingQuizzes, setLoadingQuizzes] = useState(true);

    // Controle dos Accordions/Dropdowns (estado inicial vazio = tudo fechado)
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

    const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);
    
    const selectedQuiz = useMemo(() => 
        exams.find(e => e.id === selectedQuizId) || null
    , [exams, selectedQuizId]);
    
    const [isQuizEditorOpen, setQuizEditorOpen] = useState(false);
    const [isAccessControlOpen, setAccessControlOpen] = useState(false);
    const [isResultsDashboardOpen, setResultsDashboardOpen] = useState(false);
    const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<number | null>(null);
    
    const [isDuplicateModalOpen, setDuplicateModalOpen] = useState(false);
    const [quizToDuplicate, setQuizToDuplicate] = useState<Prova | null>(null);

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

    const handleCloseAllModals = async () => {
        setQuizEditorOpen(false);
        setAccessControlOpen(false);
        setResultsDashboardOpen(false);
        setConfirmModalOpen(false);
        setDuplicateModalOpen(false);
        setSelectedQuizId(null);
        setQuizToDelete(null);
        setQuizToDuplicate(null);
        
        // Reload data to reflect changes
        await fetchExamsAndResults();
    };

    const handleOpenModal = (modal: 'editor' | 'access' | 'results', quiz: Prova | null) => {
        if (quiz) {
            setSelectedQuizId(quiz.id); 
        } else {
            setSelectedQuizId(null);
        }
        
        if (modal === 'editor') setQuizEditorOpen(true);
        if (modal === 'access') setAccessControlOpen(true);
        if (modal === 'results') setResultsDashboardOpen(true);
    };
    
    const openDuplicateModal = (quiz: Prova) => {
        setQuizToDuplicate(quiz);
        setDuplicateModalOpen(true);
    };

    const handleDuplicateConfirm = async (newSerie: string) => {
        if (!quizToDuplicate) return;
        setLoadingQuizzes(true);
        setDuplicateModalOpen(false);

        try {
            const { data: fullQuiz, error: fetchError } = await supabase
                .from('provas')
                .select('*, questoes(*, alternativas(*))')
                .eq('id', quizToDuplicate.id)
                .single();
            
            if (fetchError) throw fetchError;

            const newQuizData = {
                title: fullQuiz.title + ' (Cópia)',
                serie_id_string: `${fullQuiz.serie_id_string}_COPY_${Date.now()}`,
                serie: newSerie,
                area: fullQuiz.area,
                data_inicio: fullQuiz.data_inicio,
                data_fim: fullQuiz.data_fim,
                status: 'fechada'
            };

            const { data: newQuiz, error: createError } = await supabase
                .from('provas')
                .insert(newQuizData)
                .select()
                .single();

            if (createError) throw createError;

            if (fullQuiz.questoes && fullQuiz.questoes.length > 0) {
                for (const q of fullQuiz.questoes) {
                    const { data: newQ, error: qError } = await supabase
                        .from('questoes')
                        .insert({
                            prova_id: newQuiz.id,
                            title: q.title,
                            disciplina: q.disciplina,
                            long_text: q.long_text,
                            image_url_1: q.image_url_1,
                            image_url_2: q.image_url_2,
                            question_order: q.question_order
                        })
                        .select()
                        .single();
                    
                    if (qError) throw qError;

                    if (q.alternativas && q.alternativas.length > 0) {
                        const newAlts = q.alternativas.map((alt: Alternativa) => ({
                            question_id: newQ.id,
                            text: alt.text,
                            is_correct: alt.is_correct,
                            letter: alt.letter
                        }));
                        
                        const { error: altError } = await supabase.from('alternativas').insert(newAlts);
                        if (altError) throw altError;
                    }
                }
            }

            alert("Prova duplicada com sucesso!");
            await fetchExamsAndResults(); 

        } catch (error: any) {
            console.error("Erro ao duplicar:", error);
            alert("Erro ao duplicar prova: " + error.message);
        } finally {
            setLoadingQuizzes(false);
            setQuizToDuplicate(null);
        }
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
        } else {
             await fetchExamsAndResults(); 
        }
        handleCloseAllModals();
    }

    // --- Lógica de Organização 
    const toggleSection = (sectionName: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionName]: !prev[sectionName]
        }));
    };

    const groupedAndSortedExams = useMemo(() => {
        const groups: Record<string, Prova[]> = {};
        
        exams.forEach(exam => {
            const area = exam.area || 'Outros';
            if (!groups[area]) groups[area] = [];
            groups[area].push(exam);
        });

        const ORDERED_AREAS = [
            'Linguagens, Códigos e suas Tecnologias',
            'Matemática e suas Tecnologias',
            'Ciências da Natureza e suas Tecnologias',
            'Ciências Humanas e suas Tecnologias',
            'Provão',
            'Outros'
        ];

        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const indexA = ORDERED_AREAS.indexOf(a);
            const indexB = ORDERED_AREAS.indexOf(b);
            
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            
            return a.localeCompare(b);
        });

        return sortedKeys.map(areaKey => {
            const sortedExams = groups[areaKey].sort((a, b) => {
                const serieA = a.serie || '';
                const serieB = b.serie || '';
                const compareSerie = serieA.localeCompare(serieB, undefined, { numeric: true });
                
                if (compareSerie !== 0) return compareSerie;

                return (a.title || '').localeCompare(b.title || '');
            });

            return {
                area: areaKey,
                exams: sortedExams
            };
        });

    }, [exams]);

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
                                <div className="space-y-6">
                                    <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="text-xl font-bold">Gerenciador de Avaliações</h2>
                                            <button onClick={() => handleOpenModal('editor', null)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition shadow-md hover:shadow-lg flex items-center gap-2">
                                                <span>+</span> Nova Avaliação
                                            </button>
                                        </div>

                                        {loadingQuizzes ? (
                                            <div className="flex justify-center p-8"><Spinner /></div>
                                        ) : exams.length === 0 ? (
                                            <p className="text-center text-slate-500 py-8">Nenhuma avaliação cadastrada.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {/* INÍCIO DO AGRUPAMENTO (Dropdowns) */}
                                                {groupedAndSortedExams.map((group) => {
                                                    const isOpen = expandedSections[group.area];
                                                    const count = group.exams.length;
                                                    
                                                    return (
                                                        <div key={group.area} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                                            {/* Cabeçalho do Grupo */}
                                                            <button 
                                                                onClick={() => toggleSection(group.area)}
                                                                className={`w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors ${isOpen ? 'border-b border-slate-200' : ''}`}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`p-1.5 rounded-lg font-bold text-lg w-10 h-10 flex items-center justify-center transition-colors ${isOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                                                                        {group.area.charAt(0)}
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <h3 className="font-bold text-slate-800">{group.area}</h3>
                                                                        <p className="text-xs text-slate-500 font-medium">{count} Avaliaç{count !== 1 ? 'ões' : 'ão'}</p>
                                                                    </div>
                                                                </div>
                                                                <div className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                                                                    <ChevronDown />
                                                                </div>
                                                            </button>

                                                            {/* Lista de Provas (Conteúdo) */}
                                                            {isOpen && (
                                                                <div className="bg-slate-50/50 p-4 space-y-3">
                                                                    {group.exams.map(quiz => (
                                                                        <div key={quiz.id} className="bg-white p-4 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-4 hover:border-blue-300 transition-colors shadow-sm relative group">
                                                                             {/* Bordinha Lateral indicando status */}
                                                                             <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${quiz.status === 'aberta_para_todos' ? 'bg-green-500' : 'bg-red-400'}`}></div>

                                                                            <div className="pl-3">
                                                                                <p className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{quiz.title}</p>
                                                                                <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                                                                                    <span className="font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">{quiz.serie}</span>
                                                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${quiz.status === 'aberta_para_todos' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                                                        {quiz.status === 'aberta_para_todos' ? 'Aberta' : 'Fechada'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex gap-2 flex-wrap ml-auto">
                                                                                <button onClick={() => handleOpenModal('results', quiz)} className="bg-green-50 text-green-700 border border-green-200 font-semibold text-xs py-2 px-3 rounded-lg hover:bg-green-100 whitespace-nowrap">Resultados</button>
                                                                                <button onClick={() => handleOpenModal('access', quiz)} className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-xs py-2 px-3 rounded-lg hover:bg-indigo-100 whitespace-nowrap">Acesso</button>
                                                                                <button onClick={() => handleOpenModal('editor', quiz)} className="bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-xs py-2 px-3 rounded-lg hover:bg-blue-100 whitespace-nowrap">Editar</button>
                                                                                <button onClick={() => openDuplicateModal(quiz)} className="bg-purple-50 text-purple-700 border border-purple-200 font-semibold text-xs py-2 px-3 rounded-lg hover:bg-purple-100 whitespace-nowrap">Duplicar</button>
                                                                                <button onClick={() => confirmDeleteQuiz(quiz.id)} className="bg-red-50 text-red-700 border border-red-200 font-semibold text-xs py-2 px-3 rounded-lg hover:bg-red-100 whitespace-nowrap">Excluir</button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {/* FIM DO AGRUPAMENTO */}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {activePanel === 'criar-conta' && <CreateUserPanel />}
                        </main>
                    </div>
                </div>
            </div>
            
            {/* AGORA TODOS OS ONCLOSE chamam handleCloseAllModals, QUE ATUALIZA O DB */}
            
            {isQuizEditorOpen && <QuizEditorModal initialQuiz={selectedQuizId ? selectedQuiz : null} onClose={handleCloseAllModals} />}
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
            {isDuplicateModalOpen && quizToDuplicate && (
                <DuplicateQuizModal 
                    quiz={quizToDuplicate} 
                    onClose={() => setDuplicateModalOpen(false)} 
                    onConfirm={handleDuplicateConfirm} 
                />
            )}
        </>
    );
};

export default AdminPanel;