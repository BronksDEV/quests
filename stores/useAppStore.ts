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
                if (error.code === 'PGRST116') {
                    // Tenta criar silenciosamente
                    const { error: insertError } = await supabase
                        .from('profiles')
                        .insert([{ 
                            id: session.user.id,
                            email: session.user.email,
                            role: (session.user.user_metadata?.role as 'aluno' | 'professor' | 'admin') || 'aluno'
                        }]);
                    
                    if (!insertError) {
                        const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
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
        const currentExams = get().exams;
        if (currentExams.length === 0) set({ loading: true });

        try {

            const { data: examsData, error: examsError } = await supabase
                .from('provas')
                .select('*, provas_acesso_individual(student_id)')
                .order('created_at', { ascending: false });

            if (examsError) throw examsError;

            // Busca resultados
            const { profile } = get();
            let resultsData: Resultado[] = [];
            
            if (profile) {
                let query = supabase.from('resultados').select('*');
                // Se NÃO for admin/professor, pega só os meus resultados
                if (profile.role !== 'admin' && profile.role !== 'professor') {
                    query = query.eq('student_id', profile.id);
                }
                const { data, error } = await query;
                if (!error && data) resultsData = data;
            }

            set({ exams: examsData || [], results: resultsData || [], loading: false });
        } catch (error) {
            console.error("Erro ao atualizar dados:", error);
            set({ loading: false });
        }
    },
    
    fetchAllStudents: async () => {
        const { data, error } = await supabase.rpc('get_all_students');
        if (!error) {
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

    // ⚡ REALTIME OTIMIZADO ⚡
    initializeRealtime: () => {
        const { session } = get();
        if (!session?.user) return () => {};

        const channelName = `public:subscription:${session.user.id}:${Date.now()}`;
        
        console.log("📡 Conectando Realtime:", channelName);

        const channel = supabase.channel(channelName)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'provas' },
                (payload) => {
                    console.log('🔔 Provas alteradas:', payload.eventType);
                    get().fetchExamsAndResults();
                }
            )
            // 2. Acessos Individuais
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'provas_acesso_individual' },
                () => get().fetchExamsAndResults()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'resultados' },
                () => get().fetchExamsAndResults()
            )
            .on(
                'postgres_changes',
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'profiles',
                    filter: `id=eq.${session.user.id}`
                },
                () => get().fetchProfile()
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    get().fetchExamsAndResults();
                }
            });

        return () => {
            console.log('🔌 Desconectando Realtime...');
            supabase.removeChannel(channel);
        };
    }
}));