import React, { useCallback, useEffect, useState, useRef } from 'react';
import Input from './input';
import ChatHistory from './chat-history';
import Sidebar from './sidebar';
import Header from './header';
import Greet from './greet';
import { VisibilityProvider } from './VisibilityContext';
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { ChatService } from '@/lib/service';
import { useSession } from "next-auth/react";
import { CodeBlock, generateRandomString } from './ui/codeblock';
import { MemoizedReactMarkdown } from './markdown';
import LoadingSpinner from './ui/loading-spinner';
import { ButtonScrollToBottom } from './ui/button-scroll-to-bottom';
import 'katex/dist/katex.min.css';
import rehypeKatex from 'rehype-katex';
import { BlockMath } from 'react-katex';
import { useToast } from './ui/use-toast';
import { authenticateUser } from '@/lib/utils';
import { MessageActions } from './message-actions';
import { Loader2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import DocumentManager from './document-manager';

interface ChatProps {
  chatId?: string;
  fName: string;
  lName: string;
  uMail: string;
  uImg: string;
  partner: string;
  userid: string;
  back_auth: string;
  chatService: ChatService;
}

interface Message {
  role: string;
  text: string;
  isPlaceholder?: boolean;
}

interface Document {
  document_id: string;
  file_name: string;
}

const Chat: React.FC<ChatProps> = ({ chatService, chatId, fName, lName, uMail, uImg, partner, userid, back_auth }) => {
  const { data: session, status, update } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [toolMessage, setToolMessage] = useState<string>("");
  const [currentChatId, setCurrentChatId] = useState<string | undefined>(chatId);
  const [loadingConversaion, setloadingConversaion] = useState<boolean>(false);
  const [isAssistantTyping, setAssistantTyping] = useState<boolean>(false);
  const [userInteracted, setUserInteracted] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userInteractedRef = useRef(userInteracted);
  const isAtBottomRef = useRef(isAtBottom);
  const refreshTryCount = useRef(0);
  const { toast } = useToast();

  // Add hover state for message actions
  const [hoveredMessageIndex, setHoveredMessageIndex] = useState<number | null>(null);

  const scrollToBottom = useCallback((instant = false, isUser = false) => {
    if (isUser) {
      setUserInteracted(false);
    }
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: instant ? 'auto' : 'smooth'
      });
    }
  }, []);

  const getuId_token = async () => {
    if (refreshTryCount.current >= 2) return;
    try {
      refreshTryCount.current += 1;

      const userData = {
        email_id: uMail,
        first_name: fName,
        last_name: lName,
        partner: partner,
      };

      const { back_auth, userid } = await authenticateUser(userData);

      // Update session with new token
      await update({
        back_auth: back_auth,
        userid: userid,
      });

      return back_auth;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "There was a problem verifying your account.");
    }
  };

  const handleMessageSubmit = async (text: string, files?: File[]) => {
    try {
      // Add user's input text as a message in the current chat
      const userMessage: Message = {
        role: 'user',
        text: text
      };
      setMessages((prevMessages) => [...prevMessages, userMessage]);
      // Add a placeholder for the assistant's response
      const placeholderMessage: Message = {
        role: 'assistant',
        text: '',
        isPlaceholder: true
      };
      setMessages((prevMessages) => [...prevMessages, placeholderMessage]);
      setAssistantTyping(true);

      let uploadChatId = undefined;
      if (files && (files.length > 0)) {
        uploadChatId = await handleFileUpload(files);
      }
      var response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/chat/ai_request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "Authorization": `Bearer ${back_auth}`
        },
        body: JSON.stringify({
          model_id: chatService.selectedModelId$.value,
          user_input: text,
          chat_id: currentChatId || uploadChatId
        })
      });
      if (!response.ok) {
        if (response.status === 401) {
          const newToken = await getuId_token();
          response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/chat/ai_request`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              "Authorization": `Bearer ${newToken}`
            },
            body: JSON.stringify({
              modelId: chatService.selectedModelId$.value,
              userInput: text,
              chatId: currentChatId || uploadChatId
            })
          });
        } else {
          throw new Error(`There was a problem with your conversation. Status: ${response.status} : ${await response.text().then(t => t.split('\n')[0])}`);
        }
      }
      const responseJson = await response.json();
      if (responseJson.success) {
        const newChatId = responseJson.chat_id;
        if (currentChatId === undefined && newChatId != null && newChatId.length != 0) {
          setCurrentChatId(newChatId);
          window.history.pushState({}, '', `/c/${newChatId}`);
        }
      } else {
        const errorMessage = responseJson.error_message;
        toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: errorMessage,
          duration: 1500
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: "Failed to send your message. Error: " + error as string,
        duration: 1500
      });
      // console.error('Error:', error);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    let chatId = currentChatId;
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/document/upload${chatId ? `?chat_id=${chatId}` : '' }`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${back_auth}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Failed to upload: ${response.status} ${response.statusText}`);
        }
        const responseJson = await response.json();
        if (responseJson.success) {
          toast({
            variant: "default",
            title: `${file.name} uploaded successfully.`,
            duration: 1500
          })
        } else {
          const errorMessage = responseJson.error_message;
          toast({
            variant: "destructive",
            title: "Uh oh! Something went wrong.",
            description: errorMessage,
            duration: 1500
          });
        }
        const newChatId = responseJson.chat_id;
        if (currentChatId === undefined && newChatId != null && newChatId.length != 0) {
          chatId = newChatId;
          setCurrentChatId(newChatId);
          window.history.pushState({}, '', `/c/${newChatId}`);
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: "" + error as string,
          duration: 3000
        })
      }
    }
    return chatId;
  };

  const handleFileDelete = async (docIdList: string[]) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/document/delete_file`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          "Authorization": `Bearer ${back_auth}`
        },
        body: JSON.stringify(
          docIdList
        )
      });
      if (!response.ok) {
        const resJson = await response.json();
        throw new Error(resJson.detail);
      }
      toast({
        description: "Selected files deleted successfully.",
        duration: 1500
      });
      setDocuments(documents.filter((doc) => !docIdList.includes(doc.document_id)));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: "Failed to delete. " + error as string,
        duration: 1500
      });
      // console.error('Error:', error);
    }
  };

  const SkeletonLoader = () => (
    <div className="mt-1 flex flex-col space-y-2 animate-pulse w-fit md:w-[calc(100%-2rem)]">
      <div className="flex items-center w-full">
        <div className="h-2.5 bg-gray-200 rounded-full dark:bg-gray-700 w-40"></div>
        <div className="h-2.5 ms-2 bg-gray-300 rounded-full dark:bg-gray-600 w-24"></div>
        <div className="h-2.5 ms-2 bg-gray-300 rounded-full dark:bg-gray-600 w-full"></div>
      </div>
      <div className="flex items-center w-full ">
        <div className="h-2.5 bg-gray-200 rounded-full dark:bg-gray-700 w-full"></div>
        <div className="h-2.5 ms-2 bg-gray-300 rounded-full dark:bg-gray-600 w-full"></div>
        <div className="h-2.5 ms-2 bg-gray-300 rounded-full dark:bg-gray-600 w-24"></div>
      </div>
      <div className="flex items-center w-full max-md:hidden">
        <div className="h-2.5 bg-gray-300 rounded-full dark:bg-gray-600 w-full"></div>
        <div className="h-2.5 ms-2 bg-gray-200 rounded-full dark:bg-gray-700 w-80"></div>
        <div className="h-2.5 ms-2 bg-gray-300 rounded-full dark:bg-gray-600 w-full"></div>
      </div>
    </div>
  );

  const ToolMessageLoader = () => (
    <div className="mt-1 flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-[#2f2f2f] w-fit">
      <Loader2 className="h-4 w-4 animate-spin" />
      <div className="text-sm">
        {toolMessage}
      </div>
    </div>
  );

  const handleNewChat = () => {
    setMessages([]);
    setIsAtBottom(true);
    window.history.pushState({}, '', `/`);
    setCurrentChatId(undefined);
    setAssistantTyping(false);
  };

  const handleOldChat = async (iD?: string) => {
    if (currentChatId !== iD) {
      setMessages([]);
      setIsAtBottom(true);
      window.history.pushState({}, '', `/c/${iD}`);
      setCurrentChatId(iD);
      setAssistantTyping(false);
    }
  };

  useEffect(() => {
    // Fetch latest chat history
    if (currentChatId && messages.length === 0) {
      try {
        setloadingConversaion(true);
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/user/conversations/${currentChatId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${back_auth}`
          },
        })
          .then((response) =>
            response.status === 401 ? getuId_token().then(() => window.location.reload()) : response.json())
          .then((data) => {
            const rawMessages = data?.conversation?.main?.messages || [];
            const tokensConsumed = data?.tokensConsumed || 0;
            setDocuments(data?.files || []);
            if (rawMessages.length > 0) {
              const newMessages: Message[] = rawMessages
                .filter((message: any) => {
                  // Check for valid roles and non-empty messages
                  return (
                    (message.type === "human" || message.type === "AIMessageChunk") &&
                    message.content?.trim() !== ""
                  );
                })
                .map((message: any) => ({
                  role: message.type === "human" ? "user" : "assistant",
                  text: message.content,
                }));
              setMessages(newMessages);
              setTimeout(() => scrollToBottom(true), 50);
            }
            setloadingConversaion(false);
          });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: "Failed to retrieve conversation:" + error as string,
          duration: 1500
        });
        // console.error("Error fetching chat history:", error);
        setloadingConversaion(false);
      }
    }
    const subscription = chatService.msgs$.subscribe((msgs) => {
      setToolMessage("");
      if (currentChatId !== undefined) {
        if (msgs && msgs[currentChatId]) {
          const newMessage: Message = {
            role: "assistant", // Assuming all messages from Redis are from assistant
            text: msgs[currentChatId].join(''),
          };
          setMessages((prevMessages) => {
            // Check if the last message is from the assistant and update it
            if (
              prevMessages.length > 0 &&
              prevMessages[prevMessages.length - 1].role === "assistant"
            ) {
              return prevMessages.slice(0, -1).concat(newMessage);
            } else {
              // If the last message is not from the assistant, add the new message
              return [...prevMessages, newMessage];
            }
          });
        }
      } else {
        if (msgs && msgs[userid || '']) {
          // console.log('msgs:', msgs[userId || ''].join(''));
          const newMessage: Message = {
            role: "assistant", // Assuming all messages from Redis are from assistant
            text: msgs[userid || ''].join(''),
          };
          setMessages((prevMessages) => {
            // Check if the last message is from the assistant and update it
            if (
              prevMessages.length > 0 &&
              prevMessages[prevMessages.length - 1].role === "assistant"
            ) {
              return prevMessages.slice(0, -1).concat(newMessage);
            } else {
              // If the last message is not from the assistant, add the new message
              return [...prevMessages, newMessage];
            }
          });
        }
      }
    });
    const toolMsgSubscription = chatService.toolProcess$.subscribe((toolMsg) => {
      if (currentChatId !== undefined) {
        if (toolMsg && toolMsg[currentChatId]) {
          const placeholderMessage: Message = {
            role: 'assistant',
            text: '',
            isPlaceholder: true
          };
          setMessages((prevMessages) => {
            // Check if the last message is from the assistant and update it
            if (
              prevMessages.length > 0 &&
              prevMessages[prevMessages.length - 1].role === "assistant"
            ) {
              const lastMsg = prevMessages[prevMessages.length - 1];
              return prevMessages.slice(0, -1).concat({ ...lastMsg, isPlaceholder: true });
            } else {
              // If the last message is not from the assistant, add the new message
              return [...prevMessages, placeholderMessage];
            }
          });
          setToolMessage(""); // Clear previous tool message
          setToolMessage(toolMsg[currentChatId]);
        }
      } else if (toolMsg && toolMsg[userid || '']) {
        const placeholderMessage: Message = {
          role: 'assistant',
          text: '',
          isPlaceholder: true
        };
        setMessages((prevMessages) => {
          // Check if the last message is from the assistant and update it
          if (
            prevMessages.length > 0 &&
            prevMessages[prevMessages.length - 1].role === "assistant"
          ) {
            const lastMsg = prevMessages[prevMessages.length - 1];
            return prevMessages.slice(0, -1).concat({ ...lastMsg, isPlaceholder: true });
          } else {
            // If the last message is not from the assistant, add the new message
            return [...prevMessages, placeholderMessage];
          }
        });
        setToolMessage(""); // Clear previous tool message
        setToolMessage(toolMsg[userid || '']);
      }
    });
    const endStreamSub = chatService.endStream$.subscribe(() => {
      setAssistantTyping(false);
    })
    return () => {
      subscription.unsubscribe();
      toolMsgSubscription.unsubscribe();
      endStreamSub.unsubscribe();
    };
  }, [currentChatId]);

  useEffect(() => {
    userInteractedRef.current = userInteracted;
  }, [userInteracted]);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    let scrollCause: 'user' | 'system' | null = null;
    let lastUserInteractionTime = 0;
    const SCROLL_ORIGIN_THRESHOLD = 100; // ms
    // Detect potential user scroll initiations
    const handlePotentialUserScroll = () => {
      scrollCause = 'user';
      lastUserInteractionTime = Date.now();
    };
    // Unified hardware input listeners
    const hardwareEvents = ['pointerdown', 'wheel', 'keydown'];
    hardwareEvents.forEach(event => {
      container.addEventListener(event, handlePotentialUserScroll, {
        passive: true,
        capture: true
      });
    });
    // Main scroll handler
    const handleScroll = () => {
      // Update bottom detection
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - (scrollTop + clientHeight) < 50;

      // Only update isAtBottom if value changed
      if (atBottom !== isAtBottomRef.current) {
        setIsAtBottom(atBottom);
        if (atBottom) setUserInteracted(false);
      }
      const isRecentUserScroll = Date.now() - lastUserInteractionTime < SCROLL_ORIGIN_THRESHOLD;

      if (scrollCause === 'user' && isRecentUserScroll && !userInteractedRef.current) {
        setUserInteracted(true);
      }
      // Reset scroll origin detection
      scrollCause = null;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      hardwareEvents.forEach(event => {
        container.removeEventListener(event, handlePotentialUserScroll);
      });
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!userInteracted) {
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [messages, userInteracted]);

  return (
    <VisibilityProvider>
      <div className="relative z-0 flex h-dvh w-full overflow-hidden">
        <ChatHistory firstName={fName} lastName={lName} userImage={uImg} uMail={uMail} partner={partner} chatId={currentChatId} chatService={chatService} getuId_token={getuId_token} back_auth={back_auth} onNewChatClick={() => handleNewChat()} onOldChatClick={(iD?: string) => handleOldChat(iD)} />
        <div className="relative flex-1 flex-col overflow-hidden">
          <div className='flex-1 overflow-auto'>
            <Sidebar />
            <div className="flex h-dvh flex-col">
              <div className="flex flex-row place-content-between border-b">
                <Header service={chatService} onNewChatClick={() => handleNewChat()} getuId_token={getuId_token} back_auth={back_auth} />
                {documents.length > 0 && (
                  <DocumentManager
                    documents={documents}
                    onDelete={handleFileDelete} // Pass the handleFileDelete function
                  />
                )}
              </div>
              <div className='flex h-full overflow-y-auto'>
                <div
                  ref={chatContainerRef}
                  className="relative flex-1 overflow-y-auto"
                  style={{ scrollBehavior: 'smooth' }}
                >
                  <div className="flex flex-col-reverse">
                    <div className="translateZ(0px)">
                      {(messages.length > 0) &&
                        (messages.map((message, index) => (
                          <div key={index} className={`px-4 py-2 w-full justify-center text-base md:gap-6 md:mb-6 `}>
                            <div className='flex flex-1 w-full text-base mx-auto gap-3 md:max-w-3xl lg:max-w-[40rem] xl:max-w-[48rem] group'>
                              <div className="hidden flex-shrink-0 md:flex flex-col relative items-end">
                                <div>
                                  <div className="pt-0.5">
                                    {message.role === 'user' ?
                                      (
                                        <Avatar className="h-6 w-6 rounded-full">
                                          <AvatarImage src={uImg} alt={fName} />
                                          <AvatarFallback className="rounded-full">{fName[0]}{lName[0]}</AvatarFallback>
                                        </Avatar>
                                      )
                                      : (
                                        <Avatar className="h-6 w-6 rounded-full">
                                          <AvatarImage src="/icon.svg" alt="Eva" />
                                          <AvatarFallback className="rounded-full">Eva</AvatarFallback>
                                        </Avatar>
                                      )}
                                  </div>
                                </div>
                              </div>
                              <div
                                className='relative overflow-hidden flex w-full flex-col'
                                onPointerEnter={() => message.role === 'user' && setHoveredMessageIndex(index)} //support hover for both mouse and touch inputs
                                onMouseLeave={() => message.role === 'user' && setHoveredMessageIndex(null)}
                              >
                                <div className="hidden md:inline-block font-bold select-none capitalize">
                                  {message.role === 'user' ? (fName) : ('Eva')}
                                </div>
                                <div className={`flex ${message.role === 'user' ? 'place-content-end' : ''}`}>
                                  <div className={`min-h-[20px] z-10 flex flex-col mt-1 overflow-x-auto ${message.role === 'user' ? 'bg-gray-300 dark:bg-[#2f2f2f] dark:text-white rounded-md px-5 py-1.5 w-fit' : ''}`}>
                                    {message.isPlaceholder ?
                                      (toolMessage.length > 0 ? <ToolMessageLoader /> : <SkeletonLoader />)
                                      : (
                                        message.role === 'assistant' ? (<MemoizedReactMarkdown
                                          className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 dark:text-white text-base" //pl-4
                                          remarkPlugins={[remarkGfm, remarkMath]}
                                          rehypePlugins={[rehypeKatex]}
                                          components={{
                                            p({ children }) {
                                              return <p className="mb-2 last:mb-0">{children}</p>
                                            },
                                            a({ node, children, href, ...props }) {
                                              const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
                                              return (
                                                <a
                                                  {...props}
                                                  href={href}
                                                  target={isExternal ? "_blank" : undefined}
                                                  rel={isExternal ? "noopener noreferrer" : undefined}
                                                >
                                                  {children}
                                                </a>
                                              );
                                            },
                                            code({ node, className, children, ...props }) {
                                              if (className?.startsWith('math')) {
                                                return <BlockMath math={String(children)} />
                                              }
                                              if (className === 'language-math') {
                                                return <BlockMath math={String(children).replace(/\n$/, '')} />
                                              }
                                              const match = /language-(\w+)/.exec(className || '')
                                              return match ? (
                                                <CodeBlock
                                                  key={Math.random()}
                                                  language={(match && match[1]) || ''}
                                                  value={String(children).replace(/\n$/, '')}
                                                  {...props}
                                                />
                                              ) : (
                                                <code className={className} {...props}>
                                                  {children}
                                                </code>
                                              )
                                            }
                                          }}
                                        >
                                          {message.text}
                                        </MemoizedReactMarkdown>
                                        ) : (
                                          <div className="text-left whitespace-pre-wrap text-base">{message.text}</div>
                                        )
                                      )}
                                  </div>
                                </div>
                                {/* MessageActions with conditional visibility */}
                                {message.role === 'user' ? (
                                  // Show only on hover for user messages
                                  hoveredMessageIndex === index ?
                                    <MessageActions
                                      role={message.role}
                                      content={message.text}
                                      conversationId={currentChatId}
                                      index={index}
                                      className="chat-title-enter-active"
                                    /> : <MessageActions
                                      role={message.role}
                                      content={message.text}
                                      conversationId={currentChatId}
                                      index={index}
                                      className="chat-title-exit-active"
                                    />
                                ) : (
                                  // Always show for assistant messages
                                  <MessageActions
                                    role={message.role}
                                    content={message.text}
                                    conversationId={currentChatId}
                                    index={index}
                                    className={isAssistantTyping && message.role === 'assistant' && index === messages.length - 1 ? 'hidden' : ''}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                        )}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                  <div className="sticky bottom-4 right-4 z-20 flex justify-center">
                    <ButtonScrollToBottom
                      isAtBottom={isAtBottom}
                      scrollToBottom={() => scrollToBottom(false, true)}
                    />
                  </div>
                  {/* Conditional rendering for empty state */}
                  {messages.length === 0 && !loadingConversaion && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="py-2 md:py-8">
                        <Greet />
                      </div>
                      <div className="w-full max-w-3xl">
                        <Input
                          isActive={isAssistantTyping}
                          onSubmit={handleMessageSubmit}
                          messagesLength={messages.length}
                          showSampleInput={loadingConversaion}
                        />
                      </div>
                    </div>
                  )}

                  {loadingConversaion && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="py-16">
                        <LoadingSpinner show={true} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Regular input position when messages exist */}
              {messages.length > 0 && (
                <Input
                  isActive={isAssistantTyping}
                  onSubmit={handleMessageSubmit}
                  messagesLength={messages.length}
                  showSampleInput={loadingConversaion}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </VisibilityProvider>
  );
};

export default Chat;