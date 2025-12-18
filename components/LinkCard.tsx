import React from 'react';
import { Card, CardType } from '../types';

interface LinkCardProps {
  card: Card;
  highlightTerm?: string;
  links?: string[];
  onClick: (cardTitle: string, e?: React.MouseEvent) => void;
}

const TYPE_COLORS = {
  [CardType.Record]: 'border-l-blue-500 bg-blue-50/30',
  [CardType.Discovery]: 'border-l-red-500 bg-red-50/30',
  [CardType.GTD]: 'border-l-green-500 bg-green-50/30',
  [CardType.Reference]: 'border-l-yellow-500 bg-yellow-50/30',
};

export const LinkCard: React.FC<LinkCardProps> = ({ 
  card, 
  highlightTerm,
  links = [],
  onClick 
}) => {
  // カード本文から該当箇所を抽出（前後の文脈を含む）
  const getContextSnippet = () => {
    if (!highlightTerm) return card.body.slice(0, 120);
    
    const escapedTerm = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(.{0,50}\\[\\[${escapedTerm}\\]\\].{0,50})`, 'i');
    const match = card.body.match(regex);
    
    return match ? match[1] : card.body.slice(0, 120);
  };

  const snippet = getContextSnippet();

  return (
    <div 
      className={`border-l-4 ${TYPE_COLORS[card.type]} rounded-r-md p-3 cursor-pointer hover:bg-stone-50 transition-colors h-full flex flex-col`}
      onClick={(e) => onClick(card.title, e)}
    >
      {/* タイトル */}
      <h4 className="font-bold text-sm text-stone-800 mb-2 line-clamp-1">
        {card.title}
      </h4>

      {/* 本文スニペット */}
      <p className="text-xs text-stone-600 line-clamp-3 leading-relaxed flex-1 mb-2">
        {snippet}
      </p>

      {/* 2-hop links */}
      {links.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-stone-200/50">
          <span className="text-[10px] text-stone-400">→</span>
          {links.slice(0, 4).map((link, idx) => (
            <span 
              key={idx}
              className="text-[10px] bg-stone-200/50 px-1.5 py-0.5 rounded text-stone-600 hover:bg-stone-300/50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onClick(link, e);
              }}
            >
              {link}
            </span>
          ))}
          {links.length > 4 && (
            <span className="text-[10px] text-stone-400">+{links.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
};