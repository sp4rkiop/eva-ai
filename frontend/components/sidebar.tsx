import React, { useState } from 'react';
import { useVisibility } from './VisibilityContext';

interface SidebarProps {
}

const Sidebar: React.FC<SidebarProps> = () => {
    const [isHovered, setIsHovered] = useState(false);
    const { chatHistoryVisible } = useVisibility();
    const { toggleChatHistoryVisibility } = useVisibility();

    return (
        <div
            className={`hidden md:block fixed top-1/2 z-40 ${!chatHistoryVisible ? 'rotate-180' : 'translateX(0px) translateY(-50%) rotate(0deg) translateZ(0px)'}`}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onClick={toggleChatHistoryVisibility}
        >
            <button>
                <span className="" data-state="closed">
                    <div className="flex h-[72px] w-8 items-center justify-center">
                        <div className="flex h-6 w-6 flex-col items-center">
                            <div className={`h-3 w-1 rounded-full ${isHovered ? 'sbRotateUp' : 'sbOrigin'}`}></div>
                            <div className={`h-3 w-1 rounded-full ${isHovered ? 'sbRotateDown' : 'sbOrigin'}`}></div>
                        </div>
                    </div>
                    <span style={{ position: 'absolute', border: '0px', width: '1px', height: '1px', padding: '0px', margin: '-1px', overflow: 'hidden', clip: 'rect(0px, 0px, 0px, 0px)', whiteSpace: 'nowrap', overflowWrap: 'normal' }}>
                        Close sidebar
                    </span>
                </span>
            </button>
        </div>
    );
};

export default Sidebar;