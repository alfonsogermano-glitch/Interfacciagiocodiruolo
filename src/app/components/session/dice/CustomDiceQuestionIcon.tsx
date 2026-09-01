export function CustomDiceQuestionIcon({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" data-custom-dice-question-icon className={`${className} relative inline-flex items-center justify-center`}>
    <svg viewBox="0 0 48 48" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M24 3 41 13v22L24 45 7 35V13L24 3Z"/><path d="m7 13 17 10 17-10M24 23v22" opacity=".55"/>
    </svg><span className="absolute text-lg font-black leading-none">?</span>
  </span>;
}
