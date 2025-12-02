import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { Prova, Profile, Resultado } from '../types';
import type { Session } from '@supabase/supabase-js';

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

export const isProfileComplete = (profile: Profile | null): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'professor') return true;
    return !!(profile.nome_completo && profile.matricula && profile.turma);
};

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
            set({ loading: true });
            
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (error) {
                console.error('Erro ao buscar perfil:', error);
                
                // Se não existe perfil, cria um vazio
                if (error.code === 'PGRST116') {
                    console.log('Perfil não encontrado, criando novo...');
                    const { error: insertError } = await supabase
                        .from('profiles')
                        .insert([{ 
                            id: session.user.id,
                            email: session.user.email,
                            role: (session.user.user_metadata?.role as 'aluno' | 'professor' | 'admin') || 'aluno'
                        }]);
                    
                    if (insertError) {
                        console.error('Erro ao criar perfil:', insertError);
                    } else {
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
            console.error('Erro crítico ao buscar perfil:', error);
            set({ profile: null });
        } finally {
            set({ loading: false });
        }
    },

    fetchExamsAndResults: async () => {
        const { profile } = get();
        if (!profile) {
            set({ exams: [], results: [] });
            return;
        }
        try {
            const { data: examsData, error: examsError } = await supabase.from('provas').select('*, provas_acesso_individual(student_id)');
            if (examsError) throw examsError;
            const { data: resultsData, error: resultsError } = await supabase.from('resultados').select('*').eq('student_id', profile.id);
            if (resultsError) throw resultsError;
            set({ exams: examsData || [], results: resultsData || [] });
        } catch (error) {
            console.error("Error fetching exams/results:", error);
        }
    },
    
    fetchAllStudents: async () => {
        const { data, error } = await supabase.rpc('get_all_students');
        if (error) {
            console.error("Erro ao buscar todos os alunos:", error);
        } else {
            set({ allStudents: data || [] });
        }
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
        const channel = supabase
            .channel('app-global-changes')
            .on('postgres_changes', { event: '*', schema: 'public' },
                () => {
                    get().fetchProfile();
                    get().fetchExamsAndResults();
                    const profile = get().profile;
                    if (profile?.role === 'admin' || profile?.role === 'professor') {
                        get().fetchAllStudents();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
}));