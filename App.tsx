import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { supabase } from './services/supabase';
import { Spinner } from './components/common';
import { useAppStore, isProfileComplete } from './stores/useAppStore';
import type { Profile } from './types';

// Lazy loading
const LoginModal = lazy(() => import('./components/LoginModal'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const StudentView = lazy(() => import('./components/StudentView'));
const QuizTaker = lazy(() => import('./components/QuizTaker'));
const CompleteProfileView = lazy(() => import('./components/CompleteProfileView'));

const Header: React.FC = () => {
    const { profile, logout } = useAppStore();
    const [isLoginModalOpen, setLoginModalOpen] = useState(false);
    const [isAdminPanelOpen, setAdminPanelOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);

    const handleLogout = useCallback(async () => {
        setIsLoggingOut(true);
        await logout();
        setIsLoggingOut(false);
        setProfileMenuOpen(false);
    }, [logout]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isAdminOrProfessor = profile?.role === 'admin' || profile?.role === 'professor';

    return (
        <>
            <header className="w-full bg-white/80 backdrop-blur-lg border-b border-[var(--color-border)] sticky top-0 z-30">
                <div className="w-full max-w-7xl mx-auto flex justify-between items-center p-4">
                    <div className="flex items-center gap-2">
                        <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Portal CEJA</h1>
                    </div>
                    <div>
                        {!profile ? (
                            <button onClick={() => setLoginModalOpen(true)} className="bg-blue-600 text-white font-semibold py-2 px-5 rounded-lg hover:bg-blue-700 transition text-sm shadow-sm hover:shadow-md">
                                Login
                            </button>
                        ) : (
                            <div className="relative" ref={profileMenuRef}>
                                <button onClick={() => setProfileMenuOpen(prev => !prev)} className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white shadow-inner focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition">
                                    <svg className="w-5 h-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" /></svg>
                                </button>
                                {isProfileMenuOpen && (
                                    <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200/80 p-2 origin-top-right animate-fadeIn" style={{ animationDuration: '200ms' }}>
                                        <div className="p-3 text-center border-b border-slate-100">
                                            <p className="font-bold text-slate-800 text-base truncate" title={profile.nome_completo || profile.email}>{profile.nome_completo || profile.email}</p>
                                            <p className="text-sm text-slate-500 capitalize">{profile.role}</p>
                                        </div>
                                        <div className="py-2">
                                            {isAdminOrProfessor && (
                                                <button onClick={() => { setAdminPanelOpen(true); setProfileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 rounded-lg hover:bg-slate-100 transition">
                                                    <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 12h9.75M10.5 18h9.75M3.75 6H7.5M3.75 12H7.5M3.75 18H7.5" /></svg>
                                                    <span>Painel do Professor</span>
                                                </button>
                                            )}
                                            <button onClick={handleLogout} disabled={isLoggingOut} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
                                                {isLoggingOut ? <Spinner size="20px" color="currentColor" /> : <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>}
                                                <span>Sair</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <Suspense fallback={<div className="flex justify-center p-4"><Spinner /></div>}>
                {isLoginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
                {isAdminPanelOpen && <AdminPanel onClose={() => setAdminPanelOpen(false)} />}
            </Suspense>
        </>
    );
};

function App() {
    const { session, profile, loading, setSession, fetchProfile, initializeRealtime } = useAppStore();
    const [currentView, setCurrentView] = useState<'dashboard' | 'quiz_taker'>('dashboard');
    const [activeExamId, setActiveExamId] = useState<number | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            fetchProfile();
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if(session) fetchProfile();
        });

        const cleanupRealtime = initializeRealtime();

        return () => {
            subscription.unsubscribe();
            cleanupRealtime();
        };
    }, [setSession, fetchProfile, initializeRealtime]);

    const startExam = useCallback((examId: number) => {
        setActiveExamId(examId);
        setCurrentView('quiz_taker');
    }, []);

    const endExam = useCallback(() => {
        setActiveExamId(null);
        setCurrentView('dashboard');
        useAppStore.getState().fetchExamsAndResults();
    }, []);

    const renderMainContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center p-12 h-96">
                    <Spinner /><p className="mt-4 text-slate-500">Carregando...</p>
                </div>
            );
        }

        if (!session) {
            return (
                <div className="text-center py-20 animate-fadeIn">
                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                       <svg className="w-10 h-10 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Portal de Avaliações 2025</h2>
                    <p className="text-lg text-slate-600 mt-2 max-w-xl mx-auto">Faça o login com suas credenciais para acessar as provas agendadas para sua turma.</p>
                </div>
            );
        }
        
        if (currentView === 'quiz_taker' && activeExamId) {
            return <Suspense fallback={<Spinner />}><QuizTaker examId={activeExamId} onFinish={endExam} /></Suspense>;
        }
        
        return <Suspense fallback={<Spinner />}><StudentView onStartExam={startExam} /></Suspense>;
    };

    // IMPORTANTE: Verifica se precisa completar perfil APENAS quando session existe e loading acabou
    if (session && !loading && !isProfileComplete(profile)) {
        return (
            <Suspense fallback={<div className="flex justify-center p-12"><Spinner /></div>}>
                <CompleteProfileView />
            </Suspense>
        );
    }
    
    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <main className="w-full max-w-7xl mx-auto flex-grow p-4 sm:p-6 lg:p-8">
                {renderMainContent()}
            </main>
            <footer className="py-8 text-sm text-slate-500 text-center border-t border-slate-200">
                COLÉGIO ESTADUAL JOSÉ ABÍLIO © 2025
            </footer>
        </div>
    );
}

export default App;