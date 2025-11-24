import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { useAppStore } from '../stores/useAppStore';
import { Spinner, CloseIcon } from './common';

interface LoginModalProps {
    onClose: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ onClose }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const fetchProfile = useAppStore((state) => state.fetchProfile);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

        if (signInError) {
            setError('Email ou senha inválidos.');
        } else {
            await fetchProfile();
            onClose();
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
            <div className="bg-white relative rounded-xl shadow-2xl p-8 w-full max-w-sm modal-content-anim border border-slate-200">
                <button onClick={onClose} className="absolute top-3 right-3 p-2 text-slate-400 hover:text-slate-600 transition rounded-full hover:bg-slate-100">
                    <CloseIcon />
                </button>
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">Acesso ao Portal</h3>
                    <p className="text-sm text-slate-500 mt-2">Insira suas credenciais para continuar.</p>
                </div>
                <form onSubmit={handleLogin} className="space-y-4 mt-8">
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border-slate-300 py-3 px-4 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" 
                        placeholder="seu-email@dominio.com"
                        required
                    />
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg border-slate-300 py-3 px-4 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" 
                        placeholder="••••••••"
                        required
                    />
                    <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:bg-blue-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg">
                        {loading ? <Spinner size="20px" color="#fff" /> : <span>Entrar</span>}
                    </button>
                </form>
                <p className="text-xs text-red-500 mt-3 h-4 text-center">{error}</p>
            </div>
        </div>
    );
};

export default LoginModal;