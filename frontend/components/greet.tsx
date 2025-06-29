import React from 'react';
import { IconEva } from './ui/icons';

const Greet: React.FC = () => {
    return (
        <div className="flex flex-row items-center -ml-4">
            <div className="relative">
                <div className="size-10 md:size-12">
                    <img src="/icon.svg" alt="Eva" />
                </div>
            </div>
            <div className="ml-3 text-3xl md:text-4xl font-medium">Eva AI</div>
        </div>
    );
}

export default Greet;
