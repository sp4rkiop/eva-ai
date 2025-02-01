import { BlockMath, InlineMath } from 'react-katex';

export const InlineMathComponent = ({ math }: { math: string }) => (
  <InlineMath
    math={math}
    renderError={(error) => (
      <span className="text-red-500">Math Error: {error.name}</span>
    )}
  />
);

export const BlockMathComponent = ({ math }: { math: string }) => (
  <div className="my-4">
    <BlockMath
      math={math}
      renderError={(error) => (
        <div className="text-red-500">Math Error: {error.name}</div>
      )}
    />
  </div>
);