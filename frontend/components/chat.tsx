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

    const scrollToBottom = useCallback(() => {
      if (messagesEndRef.current) {
        const currentScroll = window.scrollY || document.documentElement.scrollTop;
        const targetScroll = messagesEndRef.current.offsetTop;
        
        const animateScroll = (start: number, end: number, duration: number) => {
          let startTime: number;
    
          const step = (currentTime: number) => {
            if (!startTime) startTime = currentTime;
            const progress = Math.min((currentTime - startTime) / duration, 1);
            window.scrollTo(0, start + (end - start) * progress);
            if (progress < 1) requestAnimationFrame(step);
          };
    
          requestAnimationFrame(step);
        };
    
        animateScroll(currentScroll, targetScroll, 300);
      }
      setUserInteracted(false);
    }, []);
    // const [hastoken, sethastoken] = useState<boolean>(false);
    const getuId_token = async () => {
      const userData = {
        emailId: uMail,
        firstName: fName,
        lastName: lName,
        partner: partner,
      };
        await fetch(`${process.env.NEXT_PUBLIC_BLACKEND_API_URL}/api/Users/UserId`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(userData),
        }).then(async (response) => {
            if (!response.ok) {
              throw new Error("Failed to send user data to the server");
            }
            const userid = await response.text();
            const back_auth = response.headers.get('authorization');
            // Update session with new token
            await update({
              back_auth: back_auth,
              userid: userid  // Use the resolved text value
            });
        
            return [back_auth, userid];
          })
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
            
            var response = await fetch(`${process.env.NEXT_PUBLIC_BLACKEND_API_URL}/api/Semantic`, {
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
            if (response.status == 401 || !response.ok) {
                const newToken = await getuId_token();
                response = await fetch(`${process.env.NEXT_PUBLIC_BLACKEND_API_URL}/api/Semantic`, {
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
            }
            const newChatId = await response.text();
            if(newChatId!=null && newChatId.length!= 0) {
                setCurrentChatId(newChatId);
                window.history.pushState({}, '', `/c/${newChatId}`);
            }
        } catch (error) {
            console.error('Error:', error);
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
      window.history.pushState({}, '', `/`);
      setCurrentChatId(undefined);
      setAssistantTyping(false);
    };
    const handleOldChat = async (iD?: string) => {
      if(currentChatId !== iD) {
        setMessages([]);
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
        fetch(`${process.env.NEXT_PUBLIC_BLACKEND_API_URL}/api/Users/conversation/${currentChatId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${back_auth}`
          },
        }
        )
          .then((response) => 
            response.status == 401 ? getuId_token() : response.json())
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
            }
            setloadingConversaion(false);
          });
      } catch (error) {
        console.error("Error fetching chat history:", error);
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
    const handleUserInteraction = () => {
        setUserInteracted(true);
    };

    window.addEventListener('scroll', handleUserInteraction);
    window.addEventListener('click', handleUserInteraction);

    return () => {
        window.removeEventListener('scroll', handleUserInteraction);
        window.removeEventListener('click', handleUserInteraction);
    };
}, []);

  useEffect(() => {
      if (!userInteracted) {
        scrollToBottom();
          // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
  }, [messages, userInteracted]);

    return (
        <VisibilityProvider>
            <div className="relative z-0 flex h-screen w-full overflow-hidden">
                <ChatHistory firstName={fName} lastName={lName} userImage={uImg} uMail={uMail} partner={partner} chatId={currentChatId} chatService={chatService} getuId_token={getuId_token} back_auth={back_auth} onNewChatClick={() => handleNewChat()} onOldChatClick={(iD? : string) => handleOldChat(iD)}/>
                <div className="relative flex-1 flex-col overflow-hidden">
                    <div className='h-screen w-full flex-1 overflow-auto'>
                        <Sidebar/>
                        <div className="flex h-screen flex-col">
                            <HeaderMobile service={chatService} onNewChatClick={() => handleNewChat()} getuId_token={getuId_token} back_auth={back_auth} /><HeaderDesktop service={chatService} getuId_token={getuId_token} back_auth={back_auth} />
                            <div className='flex flex-col-reverse h-full overflow-y-auto'>
                                <div className="translateZ(0px)">
                                {loadingConversaion ? <LoadingSpinner show={true} /> : (messages.length === 0) ? <Greet /> : 
                                    (messages.map((message, index) => (
                                            <div key={index} className={`px-4 py-2 w-full justify-center text-base md:gap-6 mb-8 `}>
                                              {/* <div className="h-1 bg-gradient-to-r from-black to-black mx-auto gap-3 md:px-5 lg:px-1 xl:px-5 mb-5 md:max-w-3xl lg:max-w-[40rem] xl:max-w-[48rem]"></div> */}
                                                <div className='flex flex-1 w-full text-base mx-auto gap-3 md:px-5 lg:px-1 xl:px-5 md:max-w-3xl lg:max-w-[40rem] xl:max-w-[48rem] group'>
                                                    <div className="flex-shrink-0 flex flex-col relative items-end">
                                                        <div>
                                                            <div className="pt-0.5">
                                                                <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                                                                    <div className="relative flex">
                                                                    {message.role === 'user' ? 
                                                                    (<img alt="User" loading="lazy" width="24" height="24" decoding="async" data-nimg="1" className="rounded-sm" style={{color: 'transparent'}} src={uImg}/>) 
                                                                    : (<img className="mx-auto h-6 w-6 " src="/icon.svg" alt="Eva" />)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className='relative overflow-hidden flex w-full flex-col'>
                                                        <div className="font-bold select-none capitalize">
                                                          {message.role==='user'? (fName):('Eva')}</div>
                                                          <div className={`flex ${message.role === 'user' ? 'place-content-end' : ''}`}>
                                                            <div className={`min-h-[20px] flex flex-col mt-1 overflow-x-auto ${message.role === 'user' ? 'bg-gray-300 dark:bg-[#2f2f2f] dark:text-white rounded-xl px-5 py-1.5 w-fit' : ''}`}>
                                                              {message.isPlaceholder ? (
                                                                  <SkeletonLoader />
                                                              ) : (
                                                                  message.role === 'assistant' ? (<MemoizedReactMarkdown
                                                                    className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 dark:text-white text-base"
                                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                                    components={{
                                                                      p({ children }) {
                                                                        return <p className="mb-2 last:mb-0">{children}</p>
                                                                      },
                                                                      code({ node, inline, className, children, ...props }) {
                                                                        if (children.length) {
                                                                          if (children[0] == '▍') {
                                                                            return (
                                                                              <span className="mt-1 cursor-default animate-pulse">▍</span>
                                                                            )
                                                                          }
                                                          
                                                                          children[0] = (children[0] as string).replace('`▍`', '▍')
                                                                        }
                                                          
                                                                        const match = /language-(\w+)/.exec(className || '')
                                                          
                                                                        if (inline) {
                                                                          return (
                                                                            <code className={className} {...props}>
                                                                              {children}
                                                                            </code>
                                                                          )
                                                                        }
                                                          
                                                                        return (
                                                                          <CodeBlock
                                                                            key={Math.random()}
                                                                            language={(match && match[1]) || ''}
                                                                            value={String(children).replace(/\n$/, '')}
                                                                            {...props}
                                                                          />
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
                            {/* <ButtonScrollToBottom isAtBottom={userInteracted} scrollToBottom={scrollToBottom} /> */}
                            <Input isActive={isAssistantTyping} onSubmit={handleMessageSubmit} messagesLength={messages.length} showSampleInput={loadingConversaion}/>
                        </div>
                    </div>
                </div>
            </div>
        </VisibilityProvider>
    );
};

export default Chat;
