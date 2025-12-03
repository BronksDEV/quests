import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { Spinner } from './common';
import { useAppStore, AppState } from '../stores/useAppStore';

const CompleteProfileView: React.FC = () => {
    const profile = useAppStore((state) => state.profile);
    const fetchProfile = useAppStore((state: AppState) => state.fetchProfile);
    const signOut = useAppStore((state) => state.signOut);
    
    const [nome, setNome] = useState('');
    const [matricula, setMatricula] = useState('');
    const [turma, setTurma] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    
    const hasInitialized = useRef(false);
    const isSaving = useRef(false);

    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        const initializeUser = async () => {
            try {
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                
                if (authError || !user) {
                    setError('Sessão perdida. Faça logout e entre novamente.');
                    return;
                }

                setUserId(user.id);

                if (profile) {
                    setNome(profile.nome_completo || '');
                    setMatricula(profile.matricula || '');
                    setTurma(profile.turma || '');
                }
            } catch (err: any) {
                console.error('Erro ao inicializar:', err);
                setError('Erro ao carregar dados do usuário.');
            }
        };

        initializeUser();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isSaving.current) {
            return;
        }
        
        if (!nome.trim() || !matricula.trim() || !turma) {
            setError("Todos os campos são obrigatórios.");
            return;
        }

        if (!userId) {
            setError("Sessão não encontrada. Faça logout e tente novamente.");
            return;
        }

        isSaving.current = true;
        setLoading(true);
        setError('');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            
            // Usando upsert para garantir atualização ou criação segura
            const { error: upsertError } = await supabase
                .from('profiles')
                .upsert({
                    id: userId,
                    email: user?.email,
                    role: (user?.user_metadata?.role as 'aluno' | 'professor' | 'admin') || 'aluno',
                    nome_completo: nome.trim().toUpperCase(),
                    matricula: matricula.trim(),
                    turma
                }, {
                    onConflict: 'id'
                });

            if (upsertError) {
                throw new Error(`Erro ao salvar: ${upsertError.message}`);
            }
            
            // Pequeno delay para garantir propagação
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await fetchProfile();

        } catch (err: any) {
            console.error('❌ Erro no handleSubmit:', err);
            setError(err.message || 'Erro ao salvar perfil.');
            isSaving.current = false; 
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="w-full h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200">
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">Finalize seu Cadastro</h3>
                    <p className="text-sm text-slate-500 mt-2">Preencha seus dados para acessar o sistema.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4 mt-8">
                    <input 
                        type="text" 
                        value={nome} 
                        onChange={e => setNome(e.target.value)} 
                        className="w-full rounded border-slate-300 p-3" 
                        placeholder="Nome Completo" 
                        required 
                        disabled={loading}
                    />
                    <input 
                        type="text" 
                        value={matricula} 
                        onChange={e => setMatricula(e.target.value)} 
                        className="w-full rounded border-slate-300 p-3" 
                        placeholder="Matrícula" 
                        required 
                        disabled={loading}
                    />
                    <select 
                        value={turma} 
                        onChange={e => setTurma(e.target.value)} 
                        className="w-full rounded border-slate-300 p-3" 
                        required
                        disabled={loading}
                    >
                        <option value="" disabled>Selecione a Turma</option>
                        <option value="1A">1ª Série - Turma A</option>
                        <option value="2A">2ª Série - Turma A</option>
                        <option value="2B">2ª Série - Turma B</option>
                        <option value="3A">3ª Série - Turma A</option>
                        <option value="3B">3ª Série - Turma B</option>
                    </select>
                    <button 
                        type="submit" 
                        disabled={loading || !userId} 
                        className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 transition flex justify-center gap-2 disabled:bg-blue-300 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Spinner size="20px" color="#fff" />
                                <span>Salvando...</span>
                            </>
                        ) : (
                            'Salvar e Continuar'
                        )}
                    </button>
                </form>
                {error && (
                    <div className="mt-4 text-center">
                        <p className="text-xs text-red-500 bg-red-50 p-3 rounded border border-red-200">{error}</p>
                        <button 
                            onClick={signOut} 
                            className="mt-2 text-xs text-slate-400 underline hover:text-slate-600"
                        >
                            Fazer logout e tentar novamente
                        </button>
                    </div>
                )}
                {!userId && !error && (
                    <div className="mt-4 text-center">
                        <Spinner size="20px" />
                        <p className="text-xs text-slate-500 mt-2">Carregando dados...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompleteProfileView;