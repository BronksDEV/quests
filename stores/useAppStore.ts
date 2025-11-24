import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { Prova, Profile, Resultado } from '../types';
import type { AuthSession } from '@supabase/supabase-js';

export interface AppState {
    session: AuthSession | null;
    profile: Profile | null;
    exams: Prova[];
    results: Resultado[];
    allStudents: Profile[];
    loading: boolean;
    setSession: (session: AuthSession | null) => void;
    fetchProfile: () => Promise<void>;
    fetchExamsAndResults: () => Promise<void>;
    fetchAllStudents: () => Promise<void>;
    initializeRealtime: () => () => void;
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

    setSession: (session: AuthSession | null) => set({ session }),

    fetchProfile: async () => {
        const { session } = get();
        if (!session?.user) {
            set({ profile: null, loading: false });
            return;
        }
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            set({ profile: data });
        } catch (error) {
            console.error('Error fetching profile:', error);
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

    logout: async () => {
        await supabase.auth.signOut();
        set({ session: null, profile: null, exams: [], results: [], allStudents: [] });
    },

    initializeRealtime: () => {
        console.log("Inicializando listener Realtime para TODAS as mudanças...");
        const channel = supabase
            .channel('app-global-changes')
            .on('postgres_changes', { event: '*', schema: 'public' },
                (payload) => {
                    console.log('Mudança detectada no DB, atualizando tudo:', payload);
                    get().fetchProfile();
                    get().fetchExamsAndResults();
                    get().fetchAllStudents();
                }
            )
            .subscribe((status) => {
                 if (status === 'SUBSCRIBED') {
                    console.log('Conectado ao canal de realtime global!');
                 }
            });

        return () => {
            console.log("Removendo listener Realtime.");
            supabase.removeChannel(channel);
        };
    }
}));