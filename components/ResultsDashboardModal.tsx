import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import type { Prova, StudentResultDetail, DisciplineScore } from '../types';
import { Spinner, CloseIcon } from './common';
import ActionConfirmModal from './ActionConfirmModal';

interface ResultsDashboardModalProps {
    quiz: Prova;
    onClose: () => void;
}

const ResultRow = React.memo(({ result }: { result: StudentResultDetail }) => (
    <tr className="hover:bg-slate-50 transition-colors duration-150">
        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
            <div className="font-medium text-slate-900">{result.nome_completo}</div>
            <div className="text-slate-500">Mat: {result.matricula} - {result.turma}</div>
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
            <span className={`font-bold text-lg ${result.total_questions > 0 && (result.total_correct / result.total_questions) >= 0.6 ? 'text-green-600' : 'text-red-600'}`}>
                {result.total_correct}
            </span>
            <span className="text-slate-500"> / {result.total_questions}</span>
        </td>
        <td className="px-3 py-4 text-sm text-slate-500">
            <div className="flex flex-wrap gap-2">
                {Object.entries(result.score_by_discipline).map(([discipline, score]) => {
                    const disciplineScore = score as DisciplineScore;
                    const isSuccess = disciplineScore.total > 0 && (disciplineScore.correct / disciplineScore.total) >= 0.6;
                    return (
                        <div key={discipline} className={`px-2.5 py-1 text-xs font-semibold rounded-full ${isSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {discipline}: {disciplineScore.correct}/{disciplineScore.total}
                        </div>
                    );
                })}
            </div>
        </td>
    </tr>
));


const ResultsDashboardModal: React.FC<ResultsDashboardModalProps> = ({ quiz, onClose }) => {
    const [results, setResults] = useState<StudentResultDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [debouncedFilter, setDebouncedFilter] = useState('');
    const [error, setError] = useState<string | null>(null);

    const fetchResults = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { data, error: rpcError } = await supabase.rpc('get_prova_results_with_details', { p_prova_id: quiz.id });
        
        if (rpcError) {
            console.error("Error fetching results:", rpcError);
            const errorMessage = rpcError.message || "A consulta ao banco de dados falhou. Verifique o console para mais detalhes.";
            setError(`Não foi possível carregar os resultados. ${errorMessage}`);
        } else {
            setResults(data as StudentResultDetail[]);
        }
        setLoading(false);
    }, [quiz.id]);

useEffect(() => {
    const handler = setTimeout(() => {
        setDebouncedFilter(filter);
    }, 250); // 250ms é ideal

    return () => clearTimeout(handler);
}, [filter]);

    useEffect(() => {
        fetchResults();

        const channel = supabase.channel(`resultados-prova-${quiz.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'resultados', filter: `prova_id=eq.${quiz.id}` },
                (payload) => {
                    console.log('Novo resultado recebido!', payload);
                    fetchResults();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchResults, quiz.id]);

    const filteredResults = useMemo(() => {
        if (!debouncedFilter) return results;
        const lowerFilter = debouncedFilter.toLowerCase();
        return results.filter(r =>
            r.nome_completo.toLowerCase().includes(lowerFilter) ||
            r.matricula.includes(lowerFilter)
        );
    }, [debouncedFilter, results]);

    const overallStats = useMemo(() => {
        const totalSubmissions = results.length;
        if (totalSubmissions === 0) return { avgScore: 0, participation: 0 };
        const totalCorrect = results.reduce((sum, r) => sum + r.total_correct, 0);
        const totalPossible = results[0]?.total_questions || 0;
        const avgScore = totalPossible > 0 ? (totalCorrect / (totalSubmissions * totalPossible)) * 100 : 0;
        return { avgScore: avgScore.toFixed(1), participation: totalSubmissions };
    }, [results]);
    
    return (
        <>
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 modal-backdrop">
                <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col modal-content-anim">
                    <header className="p-4 border-b flex items-center justify-between bg-white rounded-t-xl">
                        <div>
                            <h2 className="text-xl font-bold">Resultados: {quiz.title}</h2>
                            <p className="text-sm text-slate-500">{quiz.serie} - {quiz.area}</p>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition rounded-full hover:bg-slate-100"><CloseIcon /></button>
                    </header>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-100 border-b">
                        <input
                            type="text"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                            placeholder="🔎︎ Buscar por nome ou matrícula..."
                        />
                        <div className="bg-white p-3 rounded-lg border flex items-center justify-around text-center">
                            <div>
                                <span className="text-xs text-slate-500">Média da Turma</span>
                                <p className="font-bold text-lg text-blue-600">{overallStats.avgScore}%</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500">Participação</span>
                                <p className="font-bold text-lg">{overallStats.participation} <span className="text-sm font-normal text-slate-500">alunos</span></p>
                            </div>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center p-12 h-64">
                                <Spinner />
                                <p className="mt-4 text-slate-500">Carregando resultados...</p>
                            </div>
                        ) : (
                            <div className="flow-root">
                                <div className="inline-block min-w-full align-middle">
                                    <table className="min-w-full divide-y divide-slate-200">
                                        <thead className="bg-slate-100 sticky top-0">
                                            <tr>
                                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-6">Aluno</th>
                                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Resultado Geral</th>
                                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Desempenho por Disciplina</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 bg-white">
                                            {filteredResults.length > 0 ? filteredResults.map(result => (
                                                <ResultRow key={result.student_id} result={result} />
                                            )) : (
                                                <tr>
                                                    <td colSpan={3} className="text-center py-10 text-slate-500">
                                                        {results.length === 0 ? "Nenhum resultado submetido ainda." : "Nenhum aluno encontrado com o filtro atual."}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {error && (
                <ActionConfirmModal
                    type="warning"
                    title="Erro ao Carregar Resultados"
                    message={error}
                    onCancel={() => {
                        setError(null);
                        onClose();
                    }}
                />
            )}
        </>
    );
};

export default ResultsDashboardModal;