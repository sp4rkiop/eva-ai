// components/message-actions.tsx
import { Button } from './ui/button';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import { CheckCircleIcon, Copy, RefreshCw, RefreshCwOff, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

interface MessageActionsProps {
  role: string;
  content: string;
  conversationId: string | undefined;
  index: number;
}

// Dummy API call function
const rateResponse = async (conversationId: string, index: number, rating: 'like' | 'dislike') => {
  console.log(`Rating message at index ${index} in conversation ${conversationId} as ${rating}`);
  // In a real implementation, you would make an API call here
  // Example:
  /*
  try {
    const response = await fetch('/api/rate-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messageId,
        rating
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error rating message:', error);
    throw error;
  }
  */
  return { success: true }; // Simulate successful response
};

// Dummy API call function
const regenerateResponse = async (conversationId: string, index: number) => {
  console.log(`Regenerate message at index ${index} in conversation ${conversationId}`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  // In a real implementation, you would make an API call here
  // Example:
  /*
  try {
    const response = await fetch('/api/rate-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messageId,
        rating
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error rating message:', error);
    throw error;
  }
  */
  return { success: true }; // Simulate successful response
};

export const MessageActions = ({ role, content, conversationId, index, className }: MessageActionsProps & { className?: string }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const [userRating, setUserRating] = useState<'like' | 'dislike' | null>(null);
  const [isRating, setIsRating] = useState(false);
  const [regenRequested, setRegenRequested] = useState(false);

  const onCopy = () => {
    if (isCopied) return;
    copyToClipboard(content);
  };

  const handleRate = async (rating: 'like' | 'dislike') => {
    if (isRating || userRating) return;
    
    setIsRating(true);
    try {
      await rateResponse(conversationId!, index, rating);
      setUserRating(rating);
    } catch (error) {
      console.error('Rating failed:', error);
    } finally {
      setIsRating(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenRequested) return;
    setRegenRequested(true);
    try {
      await regenerateResponse(conversationId!, index);
    } catch (error) {
      console.error('Regenerate failed:', error);
    } finally {
      setRegenRequested(false);
    }
  };
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} gap-1 mt-1 text-zinc-600 dark:text-zinc-100 ${className}`}>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-zinc-200 dark:hover:bg-[#2f2f2f]"
        onClick={onCopy}
      >
        {isCopied ? <CheckCircleIcon/> : <Copy/>}
      </Button>
      
      {/* Thumbs Up Button - only shown for assistant messages */}
      {role !== 'user' && (
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 hover:bg-zinc-200 dark:hover:bg-[#2f2f2f] ${
            userRating === 'dislike' ? 'hidden' : ''
          }`}
          onClick={() => handleRate('like')}
          disabled={isRating}
        >
          {userRating === 'like' ? (
            <ThumbsUp className="fill-zinc-600 dark:fill-zinc-100" />
          ) : (
            <ThumbsUp />
          )}
        </Button>
      )}
      
      {/* Thumbs Down Button - only shown for assistant messages */}
      {role !== 'user' && (
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 hover:bg-zinc-200 dark:hover:bg-[#2f2f2f] ${
            userRating === 'like' ? 'hidden' : ''
          }`}
          onClick={() => handleRate('dislike')}
          disabled={isRating}
        >
          {userRating === 'dislike' ? (
            <ThumbsDown className="fill-zinc-600 dark:fill-zinc-100" />
          ) : (
            <ThumbsDown />
          )}
        </Button>
      )}

      {/* Regenerate Button - only shown for assistant messages */}
      {/* {role !== 'user' && (
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 hover:bg-zinc-200 dark:hover:bg-[#2f2f2f]`}
          onClick={() => handleRegenerate()}
          disabled={regenRequested}
        >
          {regenRequested ? (
            <RefreshCwOff/>
          ) : (
            <RefreshCw />
          )}
        </Button>
      )} */}
    </div>
  );
};