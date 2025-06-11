import React, { useState, useRef, useEffect } from 'react';
import SampleInput from './sample-input';
import { File, Loader2, Paperclip } from 'lucide-react';
interface InputProps {
    isActive: boolean;
    onSubmit: (text: string) => void;
    messagesLength: number;
    showSampleInput?: boolean;
}

const Input: React.FC<InputProps> = ({ isActive, onSubmit, messagesLength, showSampleInput }) => {
    const [text, setText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            // Adjust the height of the textarea based on its scrollHeight
            textareaRef.current.style.height = 'auto'; // Reset the height
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;

        }
    }, [text]); // Re-run this effect whenever the text changes
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus(); // Focus the textarea when the component mounts
        }
    }, []);

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = event.target.value;
        setText(newText);
        setIsTyping(newText.trim().length > 0);
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (text.trim().length > 0) {
            onSubmit(text);
            setText('');
            setIsTyping(false);
        }
    };
    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            // Check if device is mobile/tablet using touch detection
            //   const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            //   console.log(isTouchDevice);
            const isMobileDevice = () => {
                return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            };

            if (!isMobileDevice()) {
                event.preventDefault();
                handleSubmit(event as any);
            }
        }
    };

    return (
        <div className="w-full pt-2 md:pt-0 dark:border-white/20 md:border-transparent md:dark:border-transparent">
            <form onSubmit={handleSubmit} className='stretch mx-2 flex flex-row gap-3 last:mb-2 md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl'>
                <div className="relative flex h-full flex-1 items-stretch md:flex-col">
                    {/* {messagesLength === 0 && !showSampleInput && <SampleInput  onClick={onSubmit}/>} */}
                    <div className="flex w-full items-center">
                        <div className={`flex w-full justify-between items-stretch dark:text-white rounded-[26px] bg-[#f4f4f4] dark:bg-[--main-surface-secondary]`}>
                            <button className={`self-end m-auto ml-2 md:ml-2.5 h-8 w-8 rounded-full `}>
                                <Paperclip className="h-5 w-5 m-auto" />
                            </button>
                            <div className="flex grow items-center">
                                <textarea
                                    ref={textareaRef}
                                    id="prompt-textarea"
                                    tabIndex={0}
                                    rows={1}
                                    placeholder={isActive ? 'I am working on it...' : 'Hi Eva here, how can I help you?'}
                                    value={text}
                                    onChange={handleChange}
                                    onFocus={() => setIsTyping(true)}
                                    onBlur={() => setIsTyping(text.trim().length > 0)}
                                    onKeyDown={handleKeyDown}
                                    disabled={isActive}
                                    className={`w-full resize-none outline-none bg-transparent dark:bg-transparent py-2 pl-3 md:pl-4 placeholder-black/60 dark:placeholder-white/60 text-base ${isActive && 'opacity-50 cursor-wait'}`}
                                    style={{ maxHeight: '240px', overflowY: 'auto' }}
                                />
                            </div>
                            <button type="submit" disabled={!isTyping || text.trim().length === 0}
                                className={`self-end h-8 w-8 mr-2 md:mr-2.5 m-2 md:m-2.5 rounded-full  disabled:opacity-20 bg-black dark:bg-white ${isActive && 'hidden'}`}>
                                <span className="flex justify-center" data-state="closed">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white dark:text-black">
                                        <path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                                    </svg>
                                </span>
                            </button>
                            <div className={`self-end mr-2 md:mr-2.5 m-2 md:m-2.5 rounded-full ${isActive ? 'block' : 'hidden'}`}>
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                            {/* <button type="reset" 
                            className={`self-end h-8 w-8 mr-2 md:mr-2.5 m-2 md:m-2.5 rounded-full  bg-black dark:bg-white ${isActive? 'block': 'hidden'}`}>
                                <span className="flex justify-center" data-state="closed">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white dark:text-black">
                                    <rect x="7" y="7" width="10" height="10" rx="1.25" fill="currentColor"></rect>
                                </svg>
                                </span>
                            </button> */}
                        </div>
                    </div>
                </div>
            </form>
            <div className="relative px-2 py-2 text-center text-xs text-neutral-500">
                <span>Consider checking important information.</span>
            </div>
        </div>
    );
};

export default Input;
