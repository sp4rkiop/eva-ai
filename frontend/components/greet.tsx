import React from 'react';
import { IconEva } from './ui/icons';

const Greet: React.FC = () => {
    return (
        <div className="flex flex-col items-center">
            <div className="relative">
                <div className="h-12 w-12 md:h-16 md:w-16">
                    <img src="/icon.svg" alt="Eva" />
                </div>
            </div>
            <div className="pt-6 text-2xl md:text-4xl font-medium">Eva the Assistant</div>
        </div>
    );
}

export default Greet;
