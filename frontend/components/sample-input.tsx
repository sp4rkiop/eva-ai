import React from 'react';

interface ButtonProps {
    title: string;
    description: string;
    onClick: (text: string) => void;
  }

const SampleButton: React.FC<ButtonProps> = ({ title, description, onClick }) => {
  return (
    <span style={{ opacity: 1, transform: 'none' }}>
      <button
        className="btn relative btn-neutral group w-full whitespace-nowrap rounded-xl px-4 py-3 text-left text-token-text-primary md:whitespace-normal"
        onClick={() => onClick(title +" "+ description)}
      >
        <div className="flex w-full gap-2 items-center justify-center">
          <div className="flex w-full items-center justify-between">
            <div className="flex flex-col overflow-hidden">
              <div className="truncate">{title}</div>
              <div className="truncate font-normal opacity-50">{description}</div>
            </div>
            <div className="absolute bottom-0 right-0 top-0 flex items-center rounded-xl bg-gradient-to-l from-token-main-surface-secondary pl-6 pr-4 text-token-text-secondary opacity-0 group-hover:opacity-100">
              <span className="" data-state="closed">
                <div className="rounded-lg bg-token-main-surface-primary p-1 shadow-xxs dark:shadow-none">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="icon-sm text-token-text-primary">
                    <path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
              </span>
            </div>
          </div>
        </div>
      </button>
    </span>
  );
};

interface SampleInputProps {
  onClick: (text: string) => void;
}

const SampleInput: React.FC<SampleInputProps> = ({ onClick }) => {
  const buttons = [
    { title: 'Create a content calendar', description: 'for an Instagram account' },
    { title: 'Recommend a dish', description: 'to impress a date who\'s a picky eater' },
    { title: 'Design a database schema', description: 'for an online merch store' },
    { title: 'Brainstorm edge cases', description: 'for a function with birthdate as input, horoscope as output' },
  ];

  return (
    <div className="h-full flex ml-1 md:w-full md:m-auto md:mb-4 gap-0 md:gap-2 justify-center">
      <div className="grow">
        <div className="absolute bottom-full left-0 mb-4 flex w-full grow gap-2 px-1 pb-1 sm:px-2 sm:pb-0 md:static md:mb-0 md:max-w-none">
          <div className="grid w-full grid-flow-row grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-2">
            <div className="flex flex-col gap-2 max-md:hidden">
              {buttons.slice(0, 2).map((button, index) => (
                <SampleButton key={index} title={button.title} description={button.description} onClick={onClick} />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {buttons.slice(2).map((button, index) => (
                <SampleButton key={index} title={button.title} description={button.description} onClick={onClick} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SampleInput;