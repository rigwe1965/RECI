'use client'

import { forwardRef } from 'react'
import { PasswordInput as SharedPasswordInput } from '@reci/ui'

type Props = React.InputHTMLAttributes<HTMLInputElement>

const PasswordInput = forwardRef<HTMLInputElement, Props>(
  ({ className = '', ...props }, ref) => (
    <SharedPasswordInput
      {...props}
      ref={ref}
      className={`w-full border border-[#E5E7EB] dark:border-gray-600 rounded-lg px-3 py-2.5 pr-10 text-sm bg-white dark:bg-gray-800 text-text dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-hidden focus:ring-2 focus:ring-[#407E3C] focus:border-transparent transition-colors ${className}`}
    />
  )
)
PasswordInput.displayName = 'PasswordInput'

export default PasswordInput
