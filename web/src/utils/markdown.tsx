import { encode as HTMLEncode } from 'he'
import markdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css' // We can use github-dark for all code blocks
import { v4 as uuidv4 } from 'uuid'

const markdown = markdownIt({
  html: true,
  breaks: true, // convert \n into <br> automatically where applicable
  linkify: true,
  typographer: true,
  highlight: function (code, lang) {
    const uuid = uuidv4()
    const theme = "github-dark" // force dark theme for code blocks to make them stand out nicely

    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          `<div class="not-prose w-full hljs ${theme} rounded-lg overflow-hidden my-2 border border-gray-700 bg-[#0d1117] font-mono text-[13px] leading-[1.65] text-slate-200 shadow-sm relative group">
            <div class="flex items-center sticky top-0 bg-[#161b22] border-b border-gray-700/60 px-4 py-2 text-xs font-sans justify-between z-10">
              <span class="text-gray-400 font-medium">${lang}</span>
              <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(code)}')).then(function(){ const b=this; const t=b.querySelector('span'); t.innerText='已复制'; setTimeout(()=>t.innerText='复制', 2000) }.bind(this))" class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                <span>复制</span>
              </button>
            </div>
            <pre class="m-0 p-4 overflow-x-auto"><code class="hljs ${lang}" style="background:transparent;padding:0;">` +
          hljs.highlight(code, { language: lang, ignoreIllegals: true }).value +
          "</code></pre></div>"
        )
      } catch (err) {
        console.error(err)
      }
    }

    return (
      `<div class="not-prose w-full hljs ${theme} rounded-lg overflow-hidden my-2 border border-gray-700 bg-[#0d1117] font-mono text-[13px] leading-[1.65] text-slate-200 shadow-sm relative group">
        <div class="flex items-center sticky top-0 bg-[#161b22] border-b border-gray-700/60 px-4 py-2 text-xs font-sans justify-end z-10">
          <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(code)}')).then(function(){ const b=this; const t=b.querySelector('span'); t.innerText='已复制'; setTimeout(()=>t.innerText='复制', 2000) }.bind(this))" class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100">
            <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            <span>复制</span>
          </button>
        </div>
        <pre class="m-0 p-4"><code class="hljs" style="background:transparent;padding:0;">` +
      HTMLEncode(code) +
      "</code></pre></div>"
    )
  },
})

// Custom links
markdown.renderer.rules.link_open = (tokens: any, idx: any) => {
  const token = tokens[idx]
  const href = token.attrs.find((attr: any) => attr[0] === 'href')
  if (href) {
    return `<a href="${href[1]}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 underline-offset-2 transition-colors">`
  }
  return '<a>'
}

export function renderMarkdown(text = ""): string {
  return markdown.render(text)
}
