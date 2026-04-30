'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidBlock } from '@/components/MermaidBlock';

/**
 * GitHub-flavored markdown viewer with Mermaid diagram support.
 *
 * react-markdown's `code` component fires for both fenced blocks and inline
 * `<code>`. We detect the `language-mermaid` class and route those to a
 * client-side Mermaid renderer; everything else falls back to a styled
 * <pre><code> block.
 */
export function DocViewer({ source }: { source: string }) {
  return (
    <article className="text-sm text-gray-800 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p:  (p) => <p className="my-3">{p.children}</p>,
          code(props) {
            const { className, children, ...rest } = props;
            const text = String(children).replace(/\n$/, '');
            if (className === 'language-mermaid') {
              return <MermaidBlock source={text} />;
            }
            // Inline code (no className) vs fenced block (className like 'language-ts')
            const isBlock = !!className;
            if (!isBlock) {
              return (
                <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.875em] font-mono text-pink-700">
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-4 p-3 rounded-lg bg-slate-900 text-slate-100 text-xs overflow-x-auto">
                <code className={className} {...rest}>{text}</code>
              </pre>
            );
          },
          table(props) {
            return (
              <div className="my-4 overflow-x-auto">
                <table className="border-collapse border border-gray-200 text-sm w-full">
                  {props.children}
                </table>
              </div>
            );
          },
          th(props) {
            return <th className="border border-gray-200 px-3 py-1.5 bg-gray-50 text-left font-semibold">{props.children}</th>;
          },
          td(props) {
            return <td className="border border-gray-200 px-3 py-1.5 align-top">{props.children}</td>;
          },
          a(props) {
            return <a {...props} className="text-indigo-600 hover:text-indigo-800 underline" />;
          },
          h1: (p) => <h1 className="text-3xl font-bold mt-8 mb-4 border-b border-gray-200 pb-2">{p.children}</h1>,
          h2: (p) => <h2 className="text-2xl font-semibold mt-7 mb-3 border-b border-gray-100 pb-1.5">{p.children}</h2>,
          h3: (p) => <h3 className="text-xl font-semibold mt-5 mb-2">{p.children}</h3>,
          h4: (p) => <h4 className="text-base font-semibold mt-4 mb-1.5 text-gray-700">{p.children}</h4>,
          ul: (p) => <ul className="list-disc pl-6 my-2 space-y-1">{p.children}</ul>,
          ol: (p) => <ol className="list-decimal pl-6 my-2 space-y-1">{p.children}</ol>,
          blockquote: (p) => <blockquote className="my-3 px-4 py-2 border-l-4 border-indigo-200 bg-indigo-50/40 italic text-gray-700">{p.children}</blockquote>,
          hr: () => <hr className="my-8 border-gray-200" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}
