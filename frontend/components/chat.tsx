import React, { useCallback, useEffect, useState, useRef} from 'react';
import Input from './input';
import ChatHistory from './chat-history';
import Sidebar from './sidebar';
import HeaderMobile from './header-mobile';
import HeaderDesktop from './header-desktop';
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


const Chat: React.FC<ChatProps> = ({chatService,chatId, fName, lName, uMail, uImg, partner, userid, back_auth}) => {
    const { data: session, status, update } = useSession();
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | undefined>(chatId);
    const [loadingConversaion, setloadingConversaion] = useState<boolean>(false);
    const [isAssistantTyping, setAssistantTyping] = useState<boolean>(false);
    const [userInteracted, setUserInteracted] = useState<boolean>(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const userInteractedRef = useRef(userInteracted);
    const isAtBottomRef = useRef(isAtBottom);
    const { toast } = useToast();

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
        const userData = {
            emailId: uMail,
            firstName: fName,
            lastName: lName,
            partner: partner,
        };
    
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Users/UserId`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(userData),
        });
    
        if (!response.ok) {
          toast({
            variant: "destructive",
            title: "Uh oh! Something went wrong.",
            description: "There was a problem verifying your account. Code: " + response.status,
            duration: 1500
          });
            // throw new Error("Failed to send user data to the server");
        }
    
        const userid = await response.text();
        const back_auth = response.headers.get('authorization');
    
        // Update session with new token
        await update({
            back_auth: back_auth,
            userid: userid,
        });
    
        // Return the token
        return back_auth;
    };
    const handleMessageSubmit = async (text: string) => {
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
            
            var response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Semantic`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    "Authorization": `Bearer ${back_auth}`
                },
                body: JSON.stringify({
                    modelId: chatService.selectedModelId$.value,
                    userInput: text,
                    chatId: currentChatId
                })
            });
            if (!response.ok) {
                toast({
                  variant: "destructive",
                  title: "Uh oh! Something went wrong.",
                  description: `There was a problem with your conversation. Status: ${response.status} : ${await response.text().then(t => t.split('\n')[0])}`,
                  duration: 1500
                });
                if (response.status === 401) {
                    const newToken = await getuId_token();
                    response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Semantic`, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          "Authorization": `Bearer ${newToken}`
                      },
                      body: JSON.stringify({
                          modelId: chatService.selectedModelId$.value,
                          userInput: text,
                          chatId: currentChatId
                      })
                    });
                } else {
                    return;
                }
            }
            const newChatId = await response.text();
            if(newChatId!=null && newChatId.length!= 0) {
                setCurrentChatId(newChatId);
                window.history.pushState({}, '', `/c/${newChatId}`);
            }
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Uh oh! Something went wrong.",
            description: "Failed to send your message. Error: "+error as string,
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
    const handleNewChat = () => {
      setMessages([]);
      setIsAtBottom(true);
      window.history.pushState({}, '', `/`);
      setCurrentChatId(undefined);
      setAssistantTyping(false);
    };
    const handleOldChat = async (iD?: string) => {
      if(currentChatId !== iD) {
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
      try{
        setloadingConversaion(true);
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Users/conversation/${currentChatId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${back_auth}`
          },
        }
        )
          .then((response) => 
            response.status === 401 ? getuId_token() : response.json())
          .then((data) => {
            if (data && data.length > 0) {
              const newMessages: Message[] = data
                .filter((chat: any) => {
                  // Check for valid roles and non-empty messages
                  return (chat.Role.Label === "assistant" || chat.Role.Label === "user") && chat.Items[0].Text.trim() !== "";
                })
                .map((chat: any) => ({
                  role: chat.Role.Label,
                  text: chat.Items[0].Text,
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
      if(currentChatId!==undefined) {
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
      }else {
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

    const endStreamSub = chatService.endStream$.subscribe(() => {
      setAssistantTyping(false);
    })

    return () => {
      subscription.unsubscribe();
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
              <HeaderMobile service={chatService} onNewChatClick={() => handleNewChat()} getuId_token={getuId_token} back_auth={back_auth} />
              <HeaderDesktop service={chatService} getuId_token={getuId_token} back_auth={back_auth} />
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
                          <div key={index} className={`px-4 py-2 w-full justify-center text-base md:gap-6 mb-8 `}>
                            <div className='flex flex-1 w-full text-base mx-auto gap-3 md:max-w-3xl lg:max-w-[40rem] xl:max-w-[48rem] group'>
                              <div className="flex-shrink-0 flex flex-col relative items-end">
                                <div>
                                  <div className="pt-0.5">
                                    <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                                      <div className="relative flex">
                                        {message.role === 'user' ?
                                          (<img alt="User" loading="lazy" width="24" height="24" decoding="async" data-nimg="1" className="rounded-sm" style={{ color: 'transparent' }} src={uImg} />)
                                          : (<img className="mx-auto h-6 w-6 " src="/icon.svg" alt="Eva" />)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className='relative overflow-hidden flex w-full flex-col'>
                                <div className="font-bold select-none capitalize">
                                  {message.role === 'user' ? (fName) : ('Eva')}</div>
                                <div className={`flex ${message.role === 'user' ? 'place-content-end' : ''}`}>
                                  <div className={`min-h-[20px] z-10 flex flex-col mt-1 overflow-x-auto ${message.role === 'user' ? 'bg-gray-300 dark:bg-[#2f2f2f] dark:text-white rounded-md px-5 py-1.5 w-fit' : ''}`}>
                                    {message.isPlaceholder ? (
                                      <SkeletonLoader />
                                    ) : (
                                      message.role === 'assistant' ? (<MemoizedReactMarkdown
                                        className="pl-4 prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 dark:text-white text-base"
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
