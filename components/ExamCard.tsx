import React from 'react';
import type { ExamForCard } from '../types';

interface ExamCardProps {
    exam: ExamForCard;
    onClick: (exam: ExamForCard) => void;
    isCompleted: boolean;
}

const StatusDisplay: React.FC<{ status: 'locked' | 'expired' | 'available' | 'completed'; startDate: Date }> = ({ status, startDate }) => {
    
    const statusConfig = {
        locked: { text: `Disponível em ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(startDate)}`, color: 'text-slate-500' },
        expired: { text: 'Avaliação Encerrada', color: 'text-red-500 font-medium' },
        available: { text: 'Disponível para Iniciar', color: 'text-green-600 font-semibold' },
        completed: { text: 'Avaliação Concluída', color: 'text-slate-500' },
    };

    const currentStatus = statusConfig[status];

    return (
        <p className={`text-sm text-center ${currentStatus.color}`}>
            {currentStatus.text}
        </p>
    );
};

const ExamCard: React.FC<ExamCardProps> = ({ exam, onClick, isCompleted }) => {
    const animationStyle = `
        @keyframes rotate-gradient {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .gradient-glow::before {
            content: '';
            position: absolute;
            z-index: -1;
            inset: -50%;
            background: conic-gradient(from 90deg at 50% 50%, #818cf8, #c084fc, #67e8f9, #f472b6, #818cf8);
            animation: rotate-gradient 8s linear infinite;
            
            /* CONTROLE DE DENSIDADE: Ajuste a opacidade (0.0 a 1.0) para a intensidade do brilho. */
            opacity: 0.4;
            transition: animation-duration 0.5s ease, opacity 0.5s ease;
        }
        .group:hover .gradient-glow::before {
            animation-duration: 3s;
            opacity: 0.6; /* Aumenta a intensidade no hover */
        }
    `;

    const now = new Date();
    const startDate = new Date(exam.startDate);
    const endDate = new Date(exam.endDate);

    let status: 'locked' | 'expired' | 'available' | 'completed' = 'locked';
    if (isCompleted) {
        status = 'completed';
    } else if (now >= startDate && now <= endDate) {
        status = 'available';
    } else if (now > endDate) {
        status = 'expired';
    }
    
    const isClickable = status === 'available';

    const baseClasses = "relative w-full h-72 p-6 rounded-2xl transition-all duration-300 flex flex-col text-center justify-between overflow-hidden shadow-lg";
    
    const stateClasses = isClickable
        ? 'group cursor-pointer bg-white/60 hover:shadow-2xl hover:-translate-y-2 backdrop-blur-xl border border-white/80'
        : 'bg-white/50 backdrop-blur-sm border border-white/20 shadow-md opacity-70 cursor-not-allowed';

    return (
        <div 
            className={`${baseClasses} ${stateClasses}`} 
            onClick={isClickable ? () => onClick(exam) : undefined}
        >
            <style>{animationStyle}</style>
            
            {isClickable && <div className="gradient-glow"></div>}

            <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-white/80 border-2 border-white flex items-center justify-center mb-3 shadow-inner">
                    <span className="text-3xl font-bold text-blue-600">
                        {exam.series.charAt(0)}ª
                    </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Série</h2>
                <p className="text-sm text-slate-600 mt-1">{exam.areaName}</p>
            </div>
            
            <div className="z-10">
                <StatusDisplay status={status} startDate={startDate} />
            </div>
        </div>
    );
};

export default React.memo(ExamCard);