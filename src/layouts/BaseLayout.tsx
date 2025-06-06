import React, {useState, useEffect} from 'react';

export default function BaseLayout({children}: {children: React.ReactNode}) {
  const [isAIVisible, setIsAIVisible] = useState(false);

  const handleToggleAI = () => {
    setIsAIVisible((prev) => !prev);
  };

  const handleAskAI = () => {
    setIsAIVisible(true);
    // Focus on AI input when opened via Ask AI button
    setTimeout(() => {
      const input = document.querySelector(
        'input[placeholder*="Ask AI"]',
      ) as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 100);
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl + \ for Show/Hide
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        handleToggleAI();
      }
      // Command/Ctrl + Enter for Ask AI (when AI is not visible)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isAIVisible) {
        e.preventDefault();
        handleAskAI();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAIVisible]);

  return (
    <>
      {/* CustomTitleBar is now in a separate window */}
      {/* TranscriptDisplay is now in a separate window */}
      <main className="h-screen p-6 pt-16 pb-20">{children}</main>
    </>
  );
}
