import React from 'react';
import type { Prova } from '../types';
import { ExamStatus } from '../utils/examStatus';

interface ExamCardProps {
    exam: Prova; 
    status: ExamStatus;
    onClick: (exam: Prova) => void;
}

const StatusDisplay: React.FC<{ status: ExamStatus; startDate: string }> = ({ status, startDate }) => {
    let formattedDate = '--:--';
    try {
        formattedDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(startDate));
    } catch (e) { console.error("Invalid date", startDate); }

    const statusConfig = {
        locked_time: { text: `Disponível em ${formattedDate}`, color: 'text-slate-500' },
        locked_permission: { text: 'Aguardando Liberação', color: 'text-amber-600 font-medium' },
        expired: { text: 'Avaliação Encerrada', color: 'text-red-500 font-medium' },
        available: { text: 'Disponível para Iniciar', color: 'text-green-600 font-semibold' },
        completed: { text: 'Avaliação Concluída', color: 'text-slate-500' },
    };

    const currentStatus = statusConfig[status] || statusConfig['locked_permission'];

    return (
        <p className={`text-sm text-center ${currentStatus.color} transition-colors duration-300`}>
            {currentStatus.text}
        </p>
    );
};

const ExamCard: React.FC<ExamCardProps> = ({ exam, status, onClick }) => {
    const animationStyle = `
        @keyframes rotate-gradient {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .gradient-glow::before {
            content: ''; position: absolute; z-index: -1; inset: -50%;
            background: conic-gradient(from 90deg at 50% 50%, #818cf8, #c084fc, #67e8f9, #f472b6, #818cf8);
            animation: rotate-gradient 8s linear infinite; opacity: 0.4;
            transition: animation-duration 0.5s ease, opacity 0.5s ease;
        }
        .group:hover .gradient-glow::before { animation-duration: 3s; opacity: 0.6; }
    `;

    const isClickable = status === 'available';

    // Estado visual based on status (atualiza automaticamente quando status muda via prop)
    const baseClasses = "relative w-full h-72 p-6 rounded-2xl transition-all duration-300 flex flex-col text-center justify-between overflow-hidden shadow-lg transform";
    
    const stateClasses = isClickable
        ? 'group cursor-pointer bg-white/60 hover:shadow-2xl hover:-translate-y-2 backdrop-blur-xl border border-white/80'
        : 'bg-white/50 backdrop-blur-sm border border-white/20 shadow-md opacity-70 cursor-not-allowed grayscale-[0.3]';

    return (
        <div 
            className={`${baseClasses} ${stateClasses}`} 
            onClick={isClickable ? () => onClick(exam) : undefined}
        >
            <style>{animationStyle}</style>
            
            {isClickable && <div className="gradient-glow"></div>}

            <div className="flex flex-col items-center">
                <div className={`w-20 h-20 rounded-full bg-white/80 border-2 flex items-center justify-center mb-3 shadow-inner transition-colors ${isClickable ? 'border-blue-400' : 'border-slate-300'}`}>
                    <span className={`text-3xl font-bold ${isClickable ? 'text-blue-600' : 'text-slate-400'}`}>
                        {exam.serie.charAt(0)}ª
                    </span>
                </div>
                <h2 className="text-xl font-bold text-slate-800">{exam.title}</h2>
                <p className="text-sm text-slate-600 mt-1">{exam.area}</p>
            </div>
            
            <div className="z-10">
                <StatusDisplay status={status} startDate={exam.data_inicio} />
            </div>
        </div>
    );
};

export default React.memo(ExamCard);