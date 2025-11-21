
import React from 'react';

const SubmissionSuccessAnimation: React.FC = () => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm modal-backdrop">
            <style>
                {`
                .success-animation { width: 150px; height: 150px; }
                .success-animation .checkmark { width: 100px; height: 100px; border-radius: 50%; display: block; stroke-width: 4; stroke: #fff; stroke-miterlimit: 10; box-shadow: inset 0px 0px 0px #4bb71b; animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both; position: relative; }
                .success-animation .checkmark__circle { stroke-dasharray: 166; stroke-dashoffset: 166; stroke-width: 4; stroke-miterlimit: 10; stroke: #4bb71b; fill: none; animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards; }
                .success-animation .checkmark__check { transform-origin: 50% 50%; stroke-dasharray: 48; stroke-dashoffset: 48; animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards; }
                @keyframes stroke { 100% { stroke-dashoffset: 0; } }
                @keyframes scale { 0%, 100% { transform: none; } 50% { transform: scale3d(1.1, 1.1, 1); } }
                @keyframes fill { 100% { box-shadow: inset 0px 0px 0px 80px #4bb71b; } }
                `}
            </style>
            <div className="text-center text-white">
                <div className="success-animation mx-auto">
                    <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                        <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                    </svg>
                </div>
                <h2 className="text-3xl font-bold mt-6 animate-fadeIn" style={{ animationDelay: '1.2s' }}>Avaliação Concluída!</h2>
                <p className="text-slate-300 mt-2 animate-fadeIn" style={{ animationDelay: '1.4s' }}>Suas respostas foram enviadas com sucesso.</p>
            </div>
        </div>
    );
};

export default SubmissionSuccessAnimation;