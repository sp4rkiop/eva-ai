import React, { useEffect, useRef, useState } from 'react';
import { useVisibility } from './VisibilityContext';
import { ChatService } from '@/lib/service';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from './ui/use-toast';
interface Model {
  id: number;
  name: string;
  lastSelected: boolean;
}

interface HeaderProps {
  service: ChatService;
  onNewChatClick: () => void;
  getuId_token: () => Promise<void>;
  back_auth: string;
}

const Header: React.FC<HeaderProps> = ({ service, onNewChatClick, getuId_token, back_auth}) => {
  const { toggleChatHistoryVisibility } = useVisibility();
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const fetchedRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    const getModels = async (): Promise<void> => {
      try{
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/v1/user/models`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${back_auth}`
          },
        });
        if (response.status === 401) {
          toast({
            variant: "destructive",
            title: "Uh oh! Something went wrong.",
            description: "Token expired. Trying to refresh. Code: " + response.status,
            duration: 1500
          });
          await getuId_token();
          return getModels();
        }
        const data = await response.text();
        if(data!=null && data.length!= 0) {
          const models = JSON.parse(data);
          models.forEach((model: Model) => model.lastSelected = false);
          setModels(models);
          window.localStorage.setItem('models', JSON.stringify(models));
          setSelectedModel(models[0].name);
          service.selectedModelId$.next(models[0].id);
        }
      }
      catch(error) {
        toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: "Failed to fetch Models:" + error as string,
          duration: 1500
        });
        // console.error('Error:', error);
      }
    };
    // Load models from session storage if available
    const savedModels = window.localStorage.getItem('models');
    if (savedModels!==null) {
      const parsedModels = JSON.parse(savedModels);
      setModels(parsedModels);
      if (parsedModels.length > 0) {
        //check if any model lastSelected is true
        const lastSelectedModel = parsedModels.find((model: Model) => model.lastSelected === true);
        if (lastSelectedModel) {
          setSelectedModel(lastSelectedModel.name);
          service.selectedModelId$.next(lastSelectedModel.id);
        } else {
          setSelectedModel(parsedModels[0].name);
          service.selectedModelId$.next(parsedModels[0].id);
        }
      }
    }
    else if (!fetchedRef.current) {
      getModels();
      fetchedRef.current = true;
  }
  }, []);
  

  const handleModelChange = (modelName: string, id: number, lastSelected: boolean) => {
    setSelectedModel(modelName);
    service.selectedModelId$.next(id);
    // edit the model in session storage to update lastSelected value to the corresponding model with same id
    const model = window.localStorage.getItem('models');
    if (model) {
      const parsedModels = JSON.parse(model);
      parsedModels.forEach((m: Model) => m.lastSelected = false);
      const modelIndex = parsedModels.findIndex((m: Model) => m.id === id);
      if (modelIndex !== -1) {
        parsedModels[modelIndex].lastSelected = lastSelected;
        window.localStorage.setItem('models', JSON.stringify(parsedModels));
      }
    }
  };
  
  return (
    <div className="text-token-primary sticky top-0 z-10 flex flex-grow items-center justify-center md:justify-start min-h-[40px] md:min-h-[60px] pl-1">
      <button type="button" className="md:hidden absolute bottom-0 left-0 top-0 inline-flex items-center rounded-md px-3 hover-light-dark dark:hover:bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white active:opacity-50" onClick={toggleChatHistoryVisibility}>
        <span className="sr-only">Open sidebar</span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M3 8C3 7.44772 3.44772 7 4 7H20C20.5523 7 21 7.44772 21 8C21 8.55228 20.5523 9 20 9H4C3.44772 9 3 8.55228 3 8ZM3 16C3 15.4477 3.44772 15 4 15H14C14.5523 15 15 15.4477 15 16C15 16.5523 14.5523 17 14 17H4C3.44772 17 3 16.5523 3 16Z" fill="currentColor"></path>
        </svg>
      </button>
      <div className="flex cursor-pointer gap-1 rounded-md hover-light-dark dark:hover:bg-neutral-950">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex w-full justify-center gap-x-1.5  px-3 py-2 text-sm font-semibold uppercase">
              {selectedModel || 'Default Model'}
              <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Models</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
              {models.length <= 0 ? (
                  <DropdownMenuItem className="animate-pulse">
                      <div className="skeleton">Finding</div>
                  </DropdownMenuItem>
              ):(
                  models.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => handleModelChange(model.name, model.id, true)}
                    className="uppercase"
                  >
                    {model.name}
                  </DropdownMenuItem>
                ))
              )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="md:hidden absolute bottom-0 right-0 top-0 flex">
        <button type="button" className="px-3" onClick={(e) => {e.preventDefault(); onNewChatClick();}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M16.7929 2.79289C18.0118 1.57394 19.9882 1.57394 21.2071 2.79289C22.4261 4.01184 22.4261 5.98815 21.2071 7.20711L12.7071 15.7071C12.5196 15.8946 12.2652 16 12 16H9C8.44772 16 8 15.5523 8 15V12C8 11.7348 8.10536 11.4804 8.29289 11.2929L16.7929 2.79289ZM19.7929 4.20711C19.355 3.7692 18.645 3.7692 18.2071 4.2071L10 12.4142V14H11.5858L19.7929 5.79289C20.2308 5.35499 20.2308 4.64501 19.7929 4.20711ZM6 5C5.44772 5 5 5.44771 5 6V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V14C19 13.4477 19.4477 13 20 13C20.5523 13 21 13.4477 21 14V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V6C3 4.34314 4.34315 3 6 3H10C10.5523 3 11 3.44771 11 4C11 4.55228 10.5523 5 10 5H6Z" fill="currentColor"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Header;
