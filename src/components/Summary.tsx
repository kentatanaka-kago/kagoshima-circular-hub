import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const COMPONENTS: Components = {
  p: (props) => <p className="my-1.5" {...props} />,
  ul: (props) => <ul className="list-disc pl-5 my-1.5 space-y-0.5" {...props} />,
  ol: (props) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  a: (props) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-700 dark:text-blue-400 hover:underline"
    />
  ),
  h1: (props) => <h3 className="text-base font-semibold mt-3 mb-1" {...props} />,
  h2: (props) => <h3 className="text-base font-semibold mt-3 mb-1" {...props} />,
  h3: (props) => <h4 className="font-semibold mt-2 mb-1" {...props} />,
  h4: (props) => <h4 className="font-semibold mt-2 mb-1" {...props} />,
  table: (props) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs border-collapse" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-zinc-100 dark:bg-zinc-800" {...props} />,
  th: (props) => (
    <th
      className="border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-left font-medium align-top"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 align-top"
      {...props}
    />
  ),
  code: (props) => (
    <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-[0.9em]" {...props} />
  ),
  hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-700" />,
  blockquote: (props) => (
    <blockquote className="my-2 border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 text-zinc-600 dark:text-zinc-400" {...props} />
  ),
};

export function Summary({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
