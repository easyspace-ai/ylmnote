import { useState, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="anything-markdown font-normal text-[14px] w-full overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const lang = match ? match[1] : ''
            const codeString = String(children).replace(/\n$/, '')

            if (!inline) {
              return (
                <div className="not-prose w-full rounded-lg overflow-hidden my-3 border border-gray-700 bg-[#0d1117] font-mono text-[13px] leading-[1.65] text-slate-200 shadow-sm relative group">
                  <div className="flex items-center sticky top-0 bg-[#161b22] border-b border-gray-700/60 px-4 py-2 text-xs font-sans justify-between z-10">
                    <span className="text-gray-400 font-medium">{lang || 'text'}</span>
                    <button
                      onClick={(e) => {
                        navigator.clipboard.writeText(codeString);
                        const t = e.currentTarget.querySelector('span');
                        if(t) {
                          t.innerText = '已复制';
                          setTimeout(() => t.innerText = '复制', 2000);
                        }
                      }}
                      className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                      <span>复制</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <SyntaxHighlighter
                      {...(props as any)}
                      style={vscDarkPlus}
                      language={lang}
                      PreTag="div"
                      customStyle={{
                        margin: 0,
                        background: 'transparent',
                        padding: '1rem',
                        minWidth: '100%',
                      }}
                    >
                      {codeString}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )
            }
            return (
              <code 
                {...props}
              >
                {children}
              </code>
            )
          },
          a({ node, children, href, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 underline-offset-2 transition-colors" {...props}>
                {children}
              </a>
            )
          },
          p({ children, ...props }) {
            return <p {...props}>{children}</p>
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
