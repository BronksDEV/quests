
import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../App';
import { Spinner, CloseIcon } from './common';

interface ProfileModalProps {
    onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ onClose }) => {
    const { profile, refreshProfile } = useAuth();
    const [nome, setNome] = useState(profile?.nome_completo || '');
    const [matricula, setMatricula] = useState(profile?.matricula || '');
    const [turma, setTurma] = useState(profile?.turma || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nome || !matricula || !turma) {
            setError("Todos os campos são obrigatórios.");
            return;
        }
        setLoading(true);
        setError('');

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ nome_completo: nome.toUpperCase(), matricula, turma })
            .eq('id', profile!.id);
        
        if (updateError) {
            setError("Erro ao salvar perfil: " + updateError.message);
        } else {
            await refreshProfile();
            onClose();
        }
        setLoading(false);
    };
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
            <div className="bg-white relative rounded-xl shadow-2xl p-8 w-full max-w-md modal-content-anim border border-slate-200">
                <button onClick={onClose} className="absolute top-3 right-3 p-2 text-slate-400 hover:text-slate-600 transition rounded-full hover:bg-slate-100"><CloseIcon /></button>
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">Complete seu Cadastro</h3>
                    <p className="text-sm text-slate-500 mt-2">Preencha suas informações para realizar as avaliações. Você só precisará fazer isso uma vez.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4 mt-8">
                    <input type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full rounded-lg border-slate-300 py-3 px-4 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" placeholder="Nome Completo (em caixa alta)" required />
                    <input type="text" value={matricula} onChange={e => setMatricula(e.target.value)} className="w-full rounded-lg border-slate-300 py-3 px-4 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" placeholder="Sua Matrícula (Ex: 202512345)" required />
                    <select value={turma} onChange={e => setTurma(e.target.value)} className="w-full rounded-lg border-slate-300 py-3 px-4 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" required>
                        <option value="" disabled>Selecione sua Turma</option>
                        <option value="1A">1ª Série - Turma A</option>
                        <option value="2A">2ª Série - Turma A</option>
                        <option value="2B">2ª Série - Turma B</option>
                        <option value="3A">3ª Série - Turma A</option>
                        <option value="3B">3ª Série - Turma B</option>
                    </select>
                    <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:bg-blue-400 shadow-md hover:shadow-lg">
                        {loading ? <Spinner size="20px" color="#fff" /> : <span>Salvar Informações</span>}
                    </button>
                </form>
                <p className="text-xs text-red-500 mt-3 h-4 text-center">{error}</p>
            </div>
        </div>
    );
};

export default ProfileModal;
