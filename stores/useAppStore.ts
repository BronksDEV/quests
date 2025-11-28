import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Spinner } from './common';
import { useAppStore, AppState } from '../stores/useAppStore';

const CompleteProfileView: React.FC = () => {
    const profile = useAppStore((state) => state.profile);
    const fetchProfile = useAppStore((state: AppState) => state.fetchProfile);
    const logout = useAppStore((state) => state.logout); // ✅ CORRIGIDO
    
    const [nome, setNome] = useState(profile?.nome_completo || '');
    const [matricula, setMatricula] = useState(profile?.matricula || '');
    const [turma, setTurma] = useState(profile?.turma || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [retryCount, setRetryCount] = useState(0); // ✅ CORRIGIDO: useState

    // ✅ CORRIGIDO: Retry sem loop infinito
    useEffect(() => {
        if (profile?.id) {
            setNome(prev => prev || profile.nome_completo || '');
            setMatricula(prev => prev || profile.matricula || '');
            setTurma(prev => prev || profile.turma || '');
            return;
        }

        if (retryCount >= 3) {
            setError('Não foi possível carregar seus dados. Faça logout e tente novamente.');
            return;
        }

        const timeoutId = setTimeout(async () => {
            console.log(`Buscando perfil... Tentativa ${retryCount + 1}/3`);
            await fetchProfile();
            setRetryCount(prev => prev + 1);
        }, 2000);

        return () => clearTimeout(timeoutId);
    }, [profile?.id, retryCount, fetchProfile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nome || !matricula || !turma) {
            setError("Todos os campos são obrigatórios.");
            return;
        }
        setLoading(true);
        setError('');

        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            
            if (authError || !user) {
                throw new Error("Sessão perdida. Tente relogar.");
            }

            const targetUserId = user.id;

            let attempts = 0;
            let success = false;
            let writeError = null;

            while (attempts < 3 && !success) {
                const { error: dbError } = await supabase
                    .from('profiles')
                    .update({ 
                        nome_completo: nome.trim().toUpperCase(), 
                        matricula: matricula.trim(), 
                        turma 
                    })
                    .eq('id', targetUserId);

                if (!dbError) {
                    success = true;
                } else {
                    writeError = dbError;
                    attempts++;
                    await new Promise(r => setTimeout(r, 1000 * attempts));
                }
            }

            if (!success) {
                throw writeError || new Error("Falha de conexão ao salvar.");
            }
            
            await fetchProfile();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="w-full h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200">
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">Finalize seu Cadastro</h3>
                    <p className="text-sm text-slate-500 mt-2">Dados obrigatórios para acesso.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4 mt-8">
                    <input 
                        type="text" 
                        value={nome} 
                        onChange={e => setNome(e.target.value)} 
                        className="w-full rounded border-slate-300 p-3" 
                        placeholder="Nome Completo" 
                        required 
                    />
                    <input 
                        type="text" 
                        value={matricula} 
                        onChange={e => setMatricula(e.target.value)} 
                        className="w-full rounded border-slate-300 p-3" 
                        placeholder="Matrícula" 
                        required 
                    />
                    <select 
                        value={turma} 
                        onChange={e => setTurma(e.target.value)} 
                        className="w-full rounded border-slate-300 p-3" 
                        required
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
                        disabled={loading} 
                        className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 transition flex justify-center gap-2"
                    >
                        {loading ? <Spinner size="20px" color="#fff" /> : 'Salvar'}
                    </button>
                </form>
                
                {error && (
                    <div className="mt-4 text-center">
                        <p className="text-xs text-red-500">{error}</p>
                        <button 
                            onClick={logout} // ✅ CORRIGIDO
                            className="mt-2 text-xs text-slate-400 underline hover:text-slate-600"
                        >
                            Sair da conta
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompleteProfileView;