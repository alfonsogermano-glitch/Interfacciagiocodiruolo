import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function HorrorInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded border-2 border-[#4a0e0e] bg-[#2a0e0e] px-3 py-2 text-[#e8d4b8] placeholder-[#6b5544] outline-none focus:border-[#8a5a34] ${className}`}
    />
  );
}

export function HorrorTextarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-none rounded border-2 border-[#4a0e0e] bg-[#2a0e0e] px-3 py-2 text-[#e8d4b8] placeholder-[#6b5544] outline-none focus:border-[#8a5a34] ${className}`}
    />
  );
}