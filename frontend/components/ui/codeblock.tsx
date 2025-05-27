// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Markdown/CodeBlock.tsx

'use client'

import { FC, memo, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { coldarkDark, funky, vs, vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'

import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard'
import { IconCheck, IconClose, IconCopy, IconDownload, IconMenu } from '@/components/ui/icons'
import { Button } from './button'

interface Props {
  language: string
  value: string
}

interface languageMap {
  [key: string]: string | undefined
}

export const programmingLanguages: languageMap = {
  javascript: '.js',
  python: '.py',
  java: '.java',
  c: '.c',
  cpp: '.cpp',
  'c++': '.cpp',
  'c#': '.cs',
  ruby: '.rb',
  php: '.php',
  swift: '.swift',
  'objective-c': '.m',
  kotlin: '.kt',
  typescript: '.ts',
  go: '.go',
  perl: '.pl',
  rust: '.rs',
  scala: '.scala',
  haskell: '.hs',
  lua: '.lua',
  shell: '.sh',
  sql: '.sql',
  html: '.html',
  css: '.css'
  // add more file extensions here, make sure the key is same as language prop in CodeBlock.tsx component
}

export const generateRandomString = (length: number, lowercase = false) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXY3456789' // excluding similar looking characters like Z, 2, I, 1, O, 0
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return lowercase ? result.toLowerCase() : result
}

const CodeBlock: FC<Props> = memo(({ language, value }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 })
  const [showLineNumbers, setShowLineNumbers] = useState(false)
  const downloadAsFile = () => {
    if (typeof window === 'undefined') {
      return
    }
    const fileExtension = language ? `.${language}` : '.file'
    const suggestedFileName = `file-${generateRandomString(
      4,
      true
    )}${fileExtension}`
    const fileName = window.prompt('Enter file name', suggestedFileName)

    if (!fileName) {
      // User pressed cancel on prompt.
      return
    }

    const blob = new Blob([value], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = fileName
    link.href = url
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const onCopy = () => {
    if (isCopied) return
    copyToClipboard(value)
  }
  const toggleLineNumbers = () => {
    setShowLineNumbers(!showLineNumbers)
  }

  return (
    <div className="relative w-full font-sans codeblock bg-zinc-950">
      <div className="flex items-center justify-between w-full px-6 pr-4 bg-zinc-800 text-zinc-100">
        <span className="text-xs lowercase">{language}</span>
        <div className="flex items-center space-x-1 sticky">
          <Button
            variant="ghost"
            className="hover:bg-zinc-800 focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0 px-3 py-1.5"
            onClick={toggleLineNumbers}
          >
            <div className="flex items-center space-x-1.5">
              {showLineNumbers ? <IconClose /> : <IconMenu />}
              <span className="hidden md:block text-xs">{showLineNumbers ? 'Hide Lines' : 'Show Lines'}</span>
            </div>
            <span className="sr-only">Toggle line numbers</span>
          </Button>
          <Button
            variant="ghost"
            className="hover:bg-zinc-800 focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0 px-3 py-1.5"
            onClick={downloadAsFile}
          >
            <div className="flex items-center space-x-1.5">
              <IconDownload />
              <span className="hidden md:block text-xs">Download</span>
            </div>
            <span className="sr-only">Download</span>
          </Button>
          <Button
            variant="ghost"
            className="text-xs hover:bg-zinc-800 focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0 px-3 py-1.5"
            onClick={onCopy}
          >
            <div className="flex items-center space-x-1.5">
              {isCopied ? <IconCheck /> : <IconCopy />}
              <span className="hidden md:block text-xs">{isCopied ? 'Copied' : 'Copy'}</span>
            </div>
            <span className="sr-only">Copy code</span>
          </Button>
        </div>
      </div>
      <SyntaxHighlighter
        showLineNumbers={showLineNumbers}
        language={language}
        style={funky}
        PreTag="div"
        // wrapLongLines
        customStyle={{
          margin: 0,
          width: '100%',
          background: 'black',
          padding: '1.5rem 1rem',
        }}
        codeTagProps={{
          style: {
            fontFamily: '"Cascadia Mono", Consolas, Menlo, monospace',
            fontSize: '0.865rem',
          }
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  )
})
CodeBlock.displayName = 'CodeBlock'

export { CodeBlock }