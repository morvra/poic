import React from 'react';

interface CardRendererProps {
  content: string;
  onLinkClick: (term: string, e?: React.MouseEvent) => void; // Update signature
  className?: string;
  sizeClassName?: string;
  imageClassName?: string;
}

export const CardRenderer: React.FC<CardRendererProps> = ({ content, onLinkClick, className = '', sizeClassName = 'text-[17px] leading-relaxed', imageClassName = 'block max-w-full max-h-80 object-contain rounded my-1' }) => {
  // Simple parser for [[WikiLinks]] and URLs
  const renderContent = () => {
    // Markdown Images ![alt](url), WikiLinks, Markdown Links [text](url), URLs に対応
    const parts = content.split(/(!\[.*?\]\(https?:\/\/[^\)]+\)|\[\[.*?\]\]|\[.*?\]\(https?:\/\/[^\)]+\)|https?:\/\/[^\s]+)/g);

    return parts.map((part, index) => {
    // Markdown Image
    const mdImageMatch = part.match(/^!\[(.*?)\]\((https?:\/\/[^\)]+)\)$/);
    if (mdImageMatch) {
      const [, alt, url] = mdImageMatch;
      return (
        <img
          key={index}
          src={url}
          alt={alt}
          title={alt || url}
          loading="lazy"
          className={imageClassName}
        />
      );
    }

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
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium rounded-sm inline"
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
    <div className={`whitespace-pre-wrap font-sans text-ink/90 ${sizeClassName} ${className}`}>
      {renderContent()}
    </div>
  );
};