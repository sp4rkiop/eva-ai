import React, {useEffect, useRef, useState} from 'react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { ChatService } from '@/lib/service';

interface Model {
  id: number;
  name: string;
  lastSelected: boolean;
}
interface ModelSelectProps {
    service:ChatService;
    getuId_token: () => Promise<void>;
    back_auth: string;
}

const HeaderDesktop: React.FC<ModelSelectProps> = ({service, getuId_token, back_auth}) => {
    const [models, setModels] = useState<Model[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const fetchedRef = useRef(false);
    
    useEffect(() => {
      const getModels = async (newToken?: void): Promise<void> => {
        try{
          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/Users/models`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${back_auth}`
            },
          });
          if (response.status == 401) {
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
          console.error('Error:', error);
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
                <div className="flex items-center gap-2 hover-light-dark dark:hover:bg-neutral-900 rounded-xl">
                    <Menu as="div" className="relative inline-block text-left">
                        <div>
                            <MenuButton className="inline-flex w-full justify-center gap-x-1.5 rounded-xl  px-3 py-2 text-sm font-semibold">
                                {selectedModel || 'Default Model'}
                                <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" aria-hidden="true" />
                            </MenuButton>
                        </div>
                        <Transition
                            enter="transition ease-out duration-100"
                            enterFrom="transform opacity-0 scale-95"
                            enterTo="transform opacity-100 scale-100"
                            leave="transition ease-in duration-75"
                            leaveFrom="transform opacity-100 scale-100"
                            leaveTo="transform opacity-0 scale-95"
                        >
                            <MenuItems className="absolute left-0 z-10 mt-2 w-48 origin-top-right rounded-2xl  shadow-xl ring-1 ring-black ring-opacity-5 bg-neutral-300 dark:bg-[#171717]">
                            {models.length <= 0 ? (
                                <div className="py-1 px-1">
                                    <MenuItem>
                                    <div className="animate-pulse">
                                        <div className="mb-1 h-6 rounded-xl skeleton"></div>
                                        <div className="mb-1 h-6 rounded-xl skeleton"></div>
                                        <div className="h-6 rounded-xl skeleton"></div>
                                    </div>
                                    </MenuItem>
                                </div>
                            ):(
                                <div className="py-1 px-1">
                                    {models.map((model) => (
                                        <MenuItem key={model.id} >
                                            {({ focus }) => (
                                                <button
                                                    onClick={() => {handleModelChange(model.name, model.id, true)}}
                                                    className={`rounded-xl px-4 w-full py-2 text-sm text-left ${focus? 'bg-neutral-400 dark:bg-neutral-800' : ''}`}
                                                >
                                                    {model.name}
                                                </button>
                                            )}
                                        </MenuItem>
                                    ))}
                                </div>
                            )}
                            </MenuItems>
                        </Transition>
                    </Menu>
                </div>
                <div className="flex gap-2 pr-1"></div>
            </div>
        </div>
    );
};

export default HeaderDesktop;
