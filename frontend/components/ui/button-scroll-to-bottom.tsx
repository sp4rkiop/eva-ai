'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/button'
import { IconArrowDown, IconArrowElbow, IconShare, IconSpinner, IconTrash } from '@/components/ui/icons'

interface ButtonScrollToBottomProps extends ButtonProps {
  isAtBottom: boolean
  scrollToBottom: () => void
}

export function ButtonScrollToBottom({
  className,
  isAtBottom,
  scrollToBottom,
  ...props
}: ButtonScrollToBottomProps) {
  return (
    <div className='flex justify-center'>
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'transition-opacity duration-300 shadow-lg hover:scale-105',
        isAtBottom ? 'opacity-0 cursor-default' : 'opacity-100',
        className
      )}
      onClick={() => scrollToBottom()}
      {...props}
    >
      <IconArrowDown />
      <span className="sr-only">Scroll to bottom</span>
    </Button>
    </div>
  )
}