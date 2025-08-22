import React, { useState, useRef, useEffect } from 'react';
import SampleInput from './sample-input';
import { File, FileText, Loader2, Paperclip, X } from 'lucide-react';

interface InputProps {
    isActive: boolean;
    onSubmit: (text: string, files?: File[]) => void;
    messagesLength: number;
    showSampleInput?: boolean;
}

const Input: React.FC<InputProps> = ({ isActive, onSubmit, messagesLength, showSampleInput }) => {
    const [text, setText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB in bytes
    const MAX_FILES = 5;

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

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);

        // Allowed file types
        const allowedDocumentTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv',
            'application/rtf',
            'application/vnd.oasis.opendocument.text',
            'application/vnd.oasis.opendocument.spreadsheet',
            'application/vnd.oasis.opendocument.presentation'
        ];

        // const allowedImageTypes = [
        //     'image/jpeg',
        //     'image/jpg',
        //     'image/png',
        //     'image/gif',
        //     'image/webp',
        //     'image/svg+xml',
        //     'image/bmp',
        //     'image/tiff',
        //     'image/ico'
        // ];

        const allowedTypes = [...allowedDocumentTypes];

        if (selectedFiles.length + files.length > MAX_FILES) {
            alert(`You can select a maximum of ${MAX_FILES} files.`);
            return;
        }

        // Create a Set of existing file names for duplicate checking
        const existingFileNames = new Set(selectedFiles.map(file => file.name));

        const validFiles: File[] = [];
        const invalidFiles: string[] = [];
        const duplicateFiles: string[] = [];
        const unsupportedFiles: string[] = [];

        files.forEach(file => {
            // Check for duplicates
            if (existingFileNames.has(file.name)) {
                duplicateFiles.push(file.name);
                return;
            }

            // Check file type
            if (!allowedTypes.includes(file.type)) {
                unsupportedFiles.push(`${file.name} (unsupported type: ${file.type || 'unknown'})`);
                return;
            }

            // Check file size
            if (file.size > MAX_FILE_SIZE) {
                invalidFiles.push(`${file.name} (exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB)`);
                return;
            }

            validFiles.push(file);
        });

        // Show error messages for various validation failures
        const errorMessages: string[] = [];

        if (duplicateFiles.length > 0) {
            errorMessages.push(`Duplicate files (already selected):\n${duplicateFiles.join('\n')}`);
        }

        if (unsupportedFiles.length > 0) {
            errorMessages.push(`Unsupported file types (only documents and images are allowed):\n${unsupportedFiles.join('\n')}`);
        }

        if (invalidFiles.length > 0) {
            errorMessages.push(`Files exceed 50MB limit:\n${invalidFiles.join('\n')}`);
        }

        if (errorMessages.length > 0) {
            alert(errorMessages.join('\n\n'));
        }

        if (validFiles.length > 0) {
            setSelectedFiles(prev => [...prev, ...validFiles]);
        }

        // Reset the input value to allow selecting files again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handlePaperclipClick = () => {
        fileInputRef.current?.click();
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (text.trim().length > 0) {
            onSubmit(text, selectedFiles);
            setText('');
            setSelectedFiles([]);
            setIsTyping(false);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
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
        <div className="w-auto pt-2 mx-2 lg:mx-auto lg:w-4/5 lg:max-w-3xl dark:border-white/20 md:border-transparent md:dark:border-transparent">
            {selectedFiles.length > 0 && (
                <div className="flex pb-2 space-x-1 overflow-x-scroll">
                    {selectedFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between bg-blue-200 dark:bg-neutral-600 rounded-md p-2 border border-neutral-400 dark:border-neutral-400 max-w-56">
                            <div className="flex items-center space-x-2 flex-1 min-w-0">
                                <div className="flex-shrink-0">
                                    <FileText className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                        {file.name}
                                    </p>
                                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                        {formatFileSize(file.size)}
                                    </p>
                                </div>
                            </div>
                            {isActive ?
                                <Loader2 className="ml-1 size-4 text-neutral-500 dark:text-neutral-200 animate-spin" />
                                :
                                <button
                                    type="button"
                                    onClick={() => handleRemoveFile(index)}
                                    className="flex-shrink-0 ml-1 p-1 rounded-sm hover-light-dark"
                                    aria-label="Remove file"
                                >
                                    <X className="size-4 text-neutral-500 dark:text-neutral-200" />
                                </button>
                            }

                        </div>
                    ))}
                </div>
            )}
            <form onSubmit={handleSubmit} className='stretch flex flex-row '>
                <div className="relative flex h-full flex-1 items-stretch flex-col">
                    {/* {messagesLength === 0 && !showSampleInput && <SampleInput  onClick={onSubmit}/>} */}

                    <div className={`flex w-full justify-between items-stretch dark:text-white rounded-lg bg-[#f4f4f4] dark:bg-[--main-surface-secondary]`}>
                        <button
                            type="button"
                            onClick={handlePaperclipClick}
                            disabled={isActive}
                            className={`self-end m-2 md:m-2.5 ml-2 md:ml-2.5 h-8 w-8 rounded-md hover-light-dark disabled:opacity-50 disabled:cursor-not-allowed`}
                            aria-label="Attach file"
                        >
                            <Paperclip className="h-4 w-4 m-auto" />
                        </button>

                        {/* Hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp"
                            multiple
                            disabled={isActive}
                        />

                        <div className="flex grow items-center flex-col m-auto">
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
                                className={`w-full resize-none outline-none py-2 bg-transparent placeholder-black/60 dark:placeholder-white/60 text-base ${isActive && 'opacity-50 cursor-wait'}`}
                                style={{ maxHeight: '240px', overflowY: 'auto' }}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!isTyping || text.trim().length === 0}
                            className={`self-end h-8 w-8 mr-2 md:mr-2.5 m-2 md:m-2.5 rounded-md disabled:opacity-20 bg-black dark:bg-white ${isActive && 'hidden'}`}
                        >
                            <span className="flex justify-center" data-state="closed">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white dark:text-black">
                                    <path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                                </svg>
                            </span>
                        </button>
                        <div className={`self-end mr-2 md:mr-2.5 m-2 md:m-2.5 rounded-md ${isActive ? 'block' : 'hidden'}`}>
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                        {/* <button type="reset" 
                            className={`self-end h-8 w-8 mr-2 md:mr-2.5 m-2 md:m-2.5 rounded-md  bg-black dark:bg-white ${isActive? 'block': 'hidden'}`}>
                                <span className="flex justify-center" data-state="closed">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white dark:text-black">
                                    <rect x="7" y="7" width="10" height="10" rx="1.25" fill="currentColor"></rect>
                                </svg>
                                </span>
                            </button> */}
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