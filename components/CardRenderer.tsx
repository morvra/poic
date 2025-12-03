import React from 'react';

interface CardRendererProps {
  content: string;
  onLinkClick: (term: string) => void;
  className?: string;
}

export const CardRenderer: React.FC<CardRendererProps> = ({ content, onLinkClick, className = '' }) => {
  // Simple parser for [[WikiLinks]], #hashtags, and URLs
  const renderContent = () => {
    // Regex splits: WikiLink, Hashtag, or URL (http/https)
    const parts = content.split(/(\[\[.*?\]\]|#[^\s#]+|https?:\/\/[^\s]+)/g);

    return parts.map((part, index) => {
      // Wiki Link
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const term = part.slice(2, -2);
        return (
          <span
            key={index}
            onClick={(e) => { e.stopPropagation(); onLinkClick(term); }}
            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium rounded-sm inline-flex items-center"
          >
            <span className="text-blue-300 select-none">[[</span>
            {term}
            <span className="text-blue-300 select-none">]]</span>
          </span>
        );
      }
      // Hashtag
      if (part.startsWith('#')) {
        return (
          <span
            key={index}
            onClick={(e) => { e.stopPropagation(); onLinkClick(part); }}
            className="text-stone-500 hover:text-stone-800 cursor-pointer font-medium italic"
          >
            {part}
          </span>
        );
      }
      // URL
      if (part.match(/^https?:\/\//)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 hover:underline break-all"
          >
            {part}
          </a>
        );
      }
      // Normal text
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className={`whitespace-pre-wrap font-sans text-[17px] leading-relaxed text-ink/90 ${className}`}>
      {renderContent()}
    </div>
  );
};