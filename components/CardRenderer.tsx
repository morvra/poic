import React from 'react';

interface CardRendererProps {
  content: string;
  onLinkClick: (term: string, e?: React.MouseEvent) => void; // Update signature
  className?: string;
}

export const CardRenderer: React.FC<CardRendererProps> = ({ content, onLinkClick, className = '' }) => {
  // Simple parser for [[WikiLinks]] and URLs
  const renderContent = () => {
    // WikiLinks, Markdown Links [text](url), URLs に対応
    const parts = content.split(/(\[\[.*?\]\]|\[.*?\]\(https?:\/\/[^\)]+\)|https?:\/\/[^\s]+)/g);

    return parts.map((part, index) => {
    // Wiki Link
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const term = part.slice(2, -2);
      return (
        <span
          key={index}
          onClick={(e) => { 
              e.stopPropagation(); 
              onLinkClick(term, e); 
          }}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium rounded-sm inline-flex items-center"
        >
          <span className="text-blue-300 select-none">[[</span>
          {term}
          <span className="text-blue-300 select-none">]]</span>
        </span>
      );
    }
    
    // Markdown Link [text](url)
    const mdLinkMatch = part.match(/^\[(.*?)\]\((https?:\/\/[^\)]+)\)$/);
    if (mdLinkMatch) {
      const [, text, url] = mdLinkMatch;
      return (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-600 hover:underline font-medium"
        >
          {text}
        </a>
      );
    }
    
    // Plain URL
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
  }

  return (
    <div className={`whitespace-pre-wrap font-sans text-[17px] leading-relaxed text-ink/90 ${className}`}>
      {renderContent()}
    </div>
  );
};