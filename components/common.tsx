
import React from 'react';

export const Spinner: React.FC<{ size?: string; color?: string; thickness?: string }> = ({ size = '24px', color = '#3b82f6', thickness = '3px' }) => (
    <div className="spinner" style={{ width: size, height: size, borderLeftColor: color, borderWidth: thickness }}></div>
);

export const CloseIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);
