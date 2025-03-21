import React, { useEffect, useRef, useState } from 'react';
import { useVisibility } from './VisibilityContext';
import { IconClose, IconEva } from '@/components/ui/icons';
import { signOut } from 'next-auth/react';
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChatService } from '@/lib/service';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { Search } from 'lucide-react';
interface ChatTitle {
  id: string;
  title: string;
  lastActivity: string;
}

interface ChatHistoryProps {
  uMail: string;
  firstName: string;
  lastName: string;
  userImage: string;
  partner: string;
  chatId: string | undefined;
  chatService: ChatService;
  getuId_token: () => Promise<void>;
  back_auth: string;
  onNewChatClick: () => void;
  onOldChatClick: (iD?: string) => void;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ uMail, firstName, lastName, userImage, partner, chatId, chatService, getuId_token, back_auth, onNewChatClick, onOldChatClick }) => {
  const { chatHistoryVisible } = useVisibility();
  const { toggleChatHistoryVisibility } = useVisibility();
  const [chatTitles, setChatTitles] = useState<ChatTitle[]>([]); // State to store chat titles
  const [isFetchingChatTitles, setIsFetchingChatTitles] = useState(true);
  const { toast } = useToast()
  const [title, setTitle] = useState("");
  const fetchedRef = useRef(false);
  
  // Search functionality states
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filteredTitles, setFilteredTitles] = useState<ChatTitle[]>([]);

  // Use a Map to store refs for each chat item
  const nodeRefs = useRef(new Map());

  const toggleSearch = () => {
    if (showSearch) {
      // Reset search when closing
      setSearchText("");
      setFilteredTitles([]);
    }
    setShowSearch(!showSearch);
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchText(value);
    
    if (value.trim() === "") {
      setFilteredTitles([]);
    } else {
      const filtered = chatTitles.filter(chat => 
        chat.title.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredTitles(filtered);
    }
  };

  const handleLogout = async () => {
    window.localStorage.clear();
    await signOut({ callbackUrl: '/login' }); // Redirects to the login page after logout
  };

  const handleRename = (chatId: string, newTitle: string) => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Users/conversation/${chatId}/?title=${newTitle}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${back_auth}`
      },
    }).then(async (res) => {
      if(res.status === 401) {
        await getuId_token();
        return handleRename(chatId, newTitle);
      }else if (res.status === 204) {
        toast({
          description: "Chat title updated",
        })
        const updatedTitles = chatTitles.map((t) => {
          if (t.id === chatId) {
            return { ...t, title: newTitle };
          }
          return t;
        });
        setChatTitles(updatedTitles);
        
        // Update filtered titles if we're in search mode
        if (searchText.trim() !== "") {
          setFilteredTitles(updatedTitles.filter(chat => 
            chat.title.toLowerCase().includes(searchText.toLowerCase())
          ));
        }
    }
      })
  };
  
  const handleDelete = (chatId: string) => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Users/conversation/${chatId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${back_auth}`
      },
      body: JSON.stringify({ delete: true }),
    }).then(async (res) => {
      if(res.status === 401) {
        await getuId_token();
        return handleDelete(chatId);
      }else if (res.status === 204) {
        toast({
          description: "Chat removed",
        })
        const updatedTitles = chatTitles.filter((t) => t.id !== chatId);
        setChatTitles(updatedTitles);
        
        // Update filtered titles if we're in search mode
        if (searchText.trim() !== "") {
          setFilteredTitles(updatedTitles.filter(chat => 
            chat.title.toLowerCase().includes(searchText.toLowerCase())
          ));
        }
        
        onNewChatClick();
    }})
  };
  
  const groupChatsByDate = (chats: ChatTitle[]): { [key: string]: ChatTitle[] } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Midnight today
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
    const groups: { [key: string]: ChatTitle[] } = {};
  
    chats.forEach((chat) => {
      const lastActivity = new Date(chat.lastActivity);
      
      if (lastActivity >= today) {
        if (!groups['Today']) groups['Today'] = [];
        groups['Today'].push(chat);
      } else if (lastActivity >= yesterday) {
        if (!groups['Yesterday']) groups['Yesterday'] = [];
        groups['Yesterday'].push(chat);
      } else if (lastActivity >= sevenDaysAgo) {
        if (!groups['7 Days Ago']) groups['7 Days Ago'] = [];
        groups['7 Days Ago'].push(chat);
      } else if (lastActivity >= thirtyDaysAgo) {
        if (!groups['30 Days Ago']) groups['30 Days Ago'] = [];
        groups['30 Days Ago'].push(chat);
      } else {
        const year = lastActivity.getFullYear().toString();
        if (!groups[year]) groups[year] = [];
        groups[year].push(chat);
      }
    });
  
    return groups;
  };
  
  // Determine which chats to display based on search state
  const chatsToDisplay = searchText.trim() !== "" ? filteredTitles : chatTitles;
  const groupedChats = groupChatsByDate(chatsToDisplay);
  const sortedGroups = Object.entries(groupedChats)
  .sort(([a], [b]) => {
    const categoryOrder = ['Today', 'Yesterday', '7 Days Ago', '30 Days Ago'];
    const aIsYear = !isNaN(Number(a));
    const bIsYear = !isNaN(Number(b));
    
    if (categoryOrder.includes(a) && categoryOrder.includes(b)) {
      return categoryOrder.indexOf(a) - categoryOrder.indexOf(b);
    }
    if (categoryOrder.includes(a)) return -1;
    if (categoryOrder.includes(b)) return 1;
    if (aIsYear && bIsYear) return parseInt(b) - parseInt(a);
    return 0;
  })
  .map(([name, chats]) => ({ name, chats }));

  useEffect(() => {
    const getConversations = async (newToken?: void): Promise<void> => {
      try{
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Users/conversations`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${back_auth}`
          },
        });
        if (response.status == 401) {
          const newToken = await getuId_token();
          return getConversations(newToken);
        }
        const data = await response.json();
        if(data!=null && data.length!= 0) {
          if (Object.keys(data).length === 0) {
            // Handle empty JSON object
            setChatTitles([]);
          } else {
            data.sort((a: ChatTitle, b: ChatTitle) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
            setChatTitles(data);
            window.localStorage.setItem('chatTitles', JSON.stringify(data));
          }
        } else {
          // Handle empty response
          setChatTitles([]);
        }
        setIsFetchingChatTitles(false);
      }
      catch(error) {
        console.error('Error:', error);
        setIsFetchingChatTitles(false);
        setChatTitles([]);
      }
    };

    if (!fetchedRef.current) {
      getConversations();
      fetchedRef.current = true;
    }

    // Subscribe to the endStream$ observable
    const subscription = chatService.endStream$.subscribe(() => {
      setTimeout(() => {
        getConversations();
      }, 1000);
    });
    // Cleanup subscription on component unmount
    return () => subscription.unsubscribe();
  }, [chatService]); 

  // Create or get a ref for a chat item
  const getOrCreateRef = (id: string) => {
    if (!nodeRefs.current.has(id)) {
      nodeRefs.current.set(id, React.createRef());
    }
    return nodeRefs.current.get(id);
  };

  return (
    <div className={`w-80 inset-0 z-50 md:flex-shrink-0 md:overflow-x-hidden max-md:fixed transition-all ${chatHistoryVisible ? 'max-md:-translate-x-full md:block md:w-64' : 'block md:-translate-x-full md:w-0'}`}>
      <div className="md:hidden block absolute top-1 right-0 mr-2 z-50">
        <button
          type="button"
          className="ml-1 flex h-10 w-10 items-center justify-center text-black dark:text-white focus:ring-2 focus:ring-white hover-light-dark"
          onClick={toggleChatHistoryVisibility}
        >
          <span className="sr-only">Close sidebar</span>
          <IconClose className="size-6" />
        </button>
      </div>
      <div className="h-full chat-history overflow-y-auto">
        <nav className="flex flex-col justify-between h-full w-full px-3 py-3" aria-label="Chat history">
          <div className="max-md:pt-10">
            {showSearch ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Search chats..."
                  value={searchText}
                  onChange={handleSearchChange}
                  className="h-10 w-full"
                  autoFocus
                />
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-md hover-light-dark"
                  onClick={toggleSearch}
                  aria-label="Close search"
                >
                  <IconClose className="size-6" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  className={`flex grow h-10 items-center gap-2 rounded-md p-2 font-bold hover-light-dark`}
                  onClick={(e) => {
                    e.preventDefault();
                    if (window.innerWidth < 768) {
                      toggleChatHistoryVisibility();
                    }
                    onNewChatClick();
                  }}
                >
                  <div className="h-7 w-7">
                    <div className="relative flex h-full items-center justify-center rounded-full text-gray-950">
                      <IconEva className="mx-auto size-10" />
                    </div>
                  </div>
                  <span className="group-hover:text-gray-950 dark:group-hover:text-gray-200">New Chat</span>
                </button>
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-md hover-light-dark"
                  onClick={toggleSearch}
                  aria-label="Search chats"
                >
                  < Search className='size-6'/>
                </button>
              </div>
            )}
          </div>
          {isFetchingChatTitles ? (
            <div className="flex flex-col grow gap-2 pt-6 pb-4 text-sm animate-pulse">
              <div className="h-6 rounded mb-2 skeleton"></div>
              <div className="h-6 rounded mb-2 skeleton"></div>
              <div className="h-6 rounded mb-2 skeleton"></div>
              <div className="h-6 rounded mb-2 skeleton"></div>
              <div className="h-6 rounded mb-2 skeleton"></div>
              <div className="h-6 rounded mb-2 skeleton"></div>
            </div>
          ) : chatTitles.length === 0 ? (
            <div className={`grow gap-2 pt-8 pb-4 text-sm text-center`}>Hi there.<div className='pt-2'>Go Ahead with your first chat</div></div>
          ) : searchText.trim() !== "" && filteredTitles.length === 0 ? (
            <div className={`grow gap-2 pt-8 pb-4 text-sm text-center`}>No match found for "<span className="italic">{searchText}</span>"</div>
          ) : (
            <div className="grow flex-col gap-2 pt-4 pb-4 text-sm overflow-y-auto">
              {sortedGroups.map((group) => (
                <div key={group.name} className="mb-2">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-2">
                    {group.name}
                  </div>
                  <TransitionGroup component={null}>
                    {group.chats.map((chatTitle) => (
                      <CSSTransition
                        key={chatTitle.id}
                        nodeRef={getOrCreateRef(chatTitle.id)}
                        timeout={500}
                        classNames={{
                          enter: 'chat-title-enter',
                          enterActive: 'chat-title-enter-active',
                          exit: 'chat-title-exit',
                          exitActive: 'chat-title-exit-active',
                        }}
                      >
                        <div ref={getOrCreateRef(chatTitle.id)} className={`relative pt-1 pb-1 overflow-x-hidden group`}>
                          <div className={`group flex items-center h-8 rounded-md px-2 font-medium hover-light-dark ${chatTitle.id == chatId ? 'skeleton' : ''}`}>
                            <button
                              className={`w-full h-full text-left group-hover:text-gray-950 dark:group-hover:text-gray-200 truncate hover:text-clip`}
                              onClick={(e) => { 
                                e.preventDefault(); 
                                onOldChatClick(chatTitle.id); 
                                if (window.innerWidth < 768) {
                                  toggleChatHistoryVisibility();
                                }
                              }}
                            >{chatTitle.title}</button>
                          </div>
                          {/* Dropdown menu for each chat title */}
                          <div className={`absolute right-0 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100`}>
                            <Dialog>
                              <DropdownMenu modal={false}>
                                <DropdownMenuTrigger className="backdrop-blur-sm inline-flex justify-center w-full p-2 text-sm font-medium text-gray-800 dark:text-white rounded-r-lg focus:outline-none">
                                    <svg className="w-5 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 3">
                                      <path d="M2 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6.041 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM14 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
                                    </svg>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DialogTrigger asChild className="block w-full text-left text-sm">
                                    <DropdownMenuItem >Rename</DropdownMenuItem>
                                  </DialogTrigger>
                                  <DropdownMenuItem onClick={() => {handleDelete(chatTitle.id)}}
                                          >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <DialogContent className="max-w-[400px] md:max-w-[425px]">
                                <DialogHeader className="max-md:text-left">
                                  <DialogTitle>Edit Chat Title</DialogTitle>
                                  <DialogDescription>
                                    Click save when you&apos;re done.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4 max-md:justify-start">
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">
                                      Title
                                    </Label>
                                    <Input
                                      id="name"
                                      defaultValue={chatTitle.title}
                                      onChange={(e) => setTitle(e.target.value)}
                                      className="col-span-3"
                                    />
                                  </div>
                                </div>
                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button type="button" className="w-fit ml-auto" onClick={() => {handleRename(chatTitle.id, title)}}>
                                      Save changes
                                    </Button>
                                  </DialogClose>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      </CSSTransition>
                    ))}
                  </TransitionGroup>
                </div>
              ))}
            </div>
          )}
          <div className="w-full left-0 right-0 chat-history">
            <DropdownMenu>
              <div className="flex items-center gap-2 rounded-md p-2 text-sm hover-light-dark w-full">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center overflow-hidden rounded-full">
                    <div className="relative flex">
                      <img
                        alt="User"
                        loading="lazy"
                        width="32"
                        height="32"
                        decoding="async"
                        data-nimg="1"
                        className="rounded-sm"
                        style={{ color: 'transparent' }}
                        src={userImage}
                      />
                    </div>
                  </div>
                </div>
                <div className="relative -top-px grow -space-y-px overflow-hidden text-ellipsis whitespace-nowrap text-left">
                  <div>
                    {firstName} {lastName}
                  </div>
                </div>
                <DropdownMenuTrigger>
                  <svg className="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 3">
                    <path d="M2 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6.041 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM14 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
                  </svg>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent>
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                {/* <DropdownMenuItem>Billing</DropdownMenuItem> */}
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default ChatHistory;