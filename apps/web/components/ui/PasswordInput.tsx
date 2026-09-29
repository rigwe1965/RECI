'use client'

import { forwardRef } from 'react'
import { PasswordInput as SharedPasswordInput } from '@reci/ui'

type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement>

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = '', ...props }, ref) => (
    <SharedPasswordInput {...props} ref={ref} className={`input w-full pr-10 ${className}`} />
  )
)
PasswordInput.displayName = 'PasswordInput'

export default PasswordInput
