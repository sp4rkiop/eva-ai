import React, {useEffect, useRef, useState} from 'react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { ChatService } from '@/lib/service';
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
interface ModelSelectProps {
    service:ChatService;
    getuId_token: () => Promise<string | null>;
    back_auth: string;
}

const HeaderDesktop: React.FC<ModelSelectProps> = ({service, getuId_token, back_auth}) => {
    const [models, setModels] = useState<Model[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const fetchedRef = useRef(false);
    const { toast } = useToast();
    
    useEffect(() => {
      const getModels = async (newToken?: string | null): Promise<void> => {
        try{
          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Users/models`, {
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
              description: "There was a problem verifying your account. Code: " + response.status,
              duration: 1500
            });
            const newToken = await getuId_token();
            return getModels(newToken);
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
            description: "Failed to maintain Models:" + error as string,
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
        <div className="hidden md:block left-0 right-0 py-2">
            <div className="sticky top-0 mb-1.5 flex items-center justify-between z-10 h-14 p-2 font-semibold bg-token-main-surface-primary">
                <div className="absolute left-1/2 -translate-x-1/2"></div>
                <div className="flex items-center gap-2 hover-light-dark dark:hover:bg-neutral-900 rounded-md">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex w-full justify-center gap-x-1.5  px-3 py-2 text-sm font-semibold">
                          {selectedModel || 'Default Model'}
                          <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuLabel>Models</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        
                          {models.length <= 0 ? (
                              <DropdownMenuItem className="animate-pulse">
                                  <div className="skeleton">finding</div>
                              </DropdownMenuItem>
                          ):(
                             models.map((model) => (
                              <DropdownMenuItem
                                key={model.id}
                                onClick={() => handleModelChange(model.name, model.id, true)}
                              >
                                {model.name}
                              </DropdownMenuItem>
                            ))
                          )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="flex gap-2 pr-1"></div>
            </div>
        </div>
    );
};

export default HeaderDesktop;
