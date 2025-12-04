import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { Prova, Profile, Resultado } from '../types';
import type { Session } from '@supabase/supabase-js';

export const isProfileComplete = (profile: Profile | null): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'professor') return true;
    return !!(profile.nome_completo && profile.matricula && profile.turma);
};

export interface AppState {
    session: Session | null;
    profile: Profile | null;
    exams: Prova[];
    results: Resultado[];
    allStudents: Profile[];
    loading: boolean;
    setSession: (session: Session | null) => void;
    fetchProfile: () => Promise<void>;
    fetchExamsAndResults: () => Promise<void>;
    fetchAllStudents: () => Promise<void>;
    initializeRealtime: () => () => void;
    signOut: () => Promise<void>;
    logout: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
    session: null,
    profile: null,
    exams: [],
    results: [],
    allStudents: [],
    loading: true,

    setSession: (session: Session | null) => set({ session }),

    fetchProfile: async () => {
        const { session } = get();
        if (!session?.user) {
            set({ profile: null, loading: false });
            return;
        }
        
        try {
            // se já existir perfil carregado, não dá reload
            if (!get().profile) set({ loading: true });
            
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (error) {
                console.error('Erro ao buscar perfil:', error);
                
                // criar perfil se não existir
                if (error.code === 'PGRST116') {
                    const { error: insertError } = await supabase
                        .from('profiles')
                        .insert([{ 
                            id: session.user.id,
                            email: session.user.email,
                            role: (session.user.user_metadata?.role as 'aluno' | 'professor' | 'admin') || 'aluno'
                        }]);
                    
                    if (!insertError) {
                        const { data: newProfile } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', session.user.id)
                            .single();
                        
                        set({ profile: newProfile || null });
                    }
                } else {
                    set({ profile: null });
                }
            } else {
                set({ profile: data });
            }
        } catch (error) {
            console.error('Erro crítico no profile:', error);
            set({ profile: null });
        } finally {
            set({ loading: false });
        }
    },

    fetchExamsAndResults: async () => {
        const { profile } = get();
        if (!profile) return;

        try {
            const { data: examsData, error: examsError } = await supabase
                .from('provas')
                .select('*, provas_acesso_individual(student_id)')
                .order('created_at', { ascending: false });

            if (examsError) throw examsError;

            // Busca apenas os resultados do usuário logado
            const { data: resultsData, error: resultsError } = await supabase
                .from('resultados')
                .select('*')
                .eq('student_id', profile.id);

            if (resultsError) throw resultsError;

            set({ exams: examsData || [], results: resultsData || [] });
        } catch (error) {
            console.error("Erro no sync de provas:", error);
        }
    },
    
    fetchAllStudents: async () => {
        const { data, error } = await supabase.rpc('get_all_students');
        if (!error) set({ allStudents: data || [] });
    },

    signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null, profile: null, exams: [], results: [], allStudents: [] });
        window.location.reload();
    },

    logout: async () => {
        await supabase.auth.signOut();
        set({ session: null, profile: null, exams: [], results: [], allStudents: [] });
    },

    initializeRealtime: () => {
        return () => {}; 
    }
}));