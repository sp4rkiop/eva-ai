import React, { useState } from 'react';
import { Button } from './ui/button';
import { Trash } from 'lucide-react';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

interface Document {
    document_id: string;
    file_name: string;
}

interface DocumentManagerProps {
    documents: Document[];
    onDelete: (docIdList: string[]) => Promise<void>;
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ documents, onDelete }) => {
    const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

    const toggleSelection = (docId: string) => {
        setSelectedDocs((prev) =>
            prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
        );
    };

    const handleDelete = async () => {
        if (selectedDocs.length > 0) {
            await onDelete(selectedDocs);
            setSelectedDocs([]); // Clear selection after deletion
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="link" className='self-center mr-2'>Files</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Files</DialogTitle>
                    <DialogDescription>
                        Available uploaded files in the chat
                    </DialogDescription>
                </DialogHeader>
                <ul className="space-y-2">
                    {documents.map((doc) => (
                        <li key={doc.document_id} className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                checked={selectedDocs.includes(doc.document_id)}
                                onChange={() => toggleSelection(doc.document_id)}
                                className="form-checkbox"
                            />
                            <span className="text-sm">{doc.file_name}</span>
                        </li>
                    ))}
                </ul>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button
                            type="submit"
                            onClick={handleDelete}
                            disabled={selectedDocs.length === 0}
                            className="mt-4 flex items-center space-x-2"
                        >
                            <Trash className="h-4 w-4" />
                            <span>Delete Selected</span>
                        </Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    );
};

export default DocumentManager;