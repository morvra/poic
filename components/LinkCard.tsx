import React, { useState } from 'react';
import { Card, CardType } from '../types';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface LinkCardProps {
  card: Card;
  highlightTerm?: string;
  relatedLinks?: string[]; // 関連するカードタイトルの配列
  onClick: (cardTitle: string, e?: React.MouseEvent) => void;
  currentCardTitle?: string; // 現在開いているカードのタイトル（除外用）
}

const TYPE_COLORS = {
  [CardType.Record]: 'border-t-blue-500 bg-blue-50/30',
  [CardType.Discovery]: 'border-t-red-500 bg-red-50/30',
  [CardType.GTD]: 'border-t-green-500 bg-green-50/30',
  [CardType.Reference]: 'border-t-yellow-500 bg-yellow-50/30',
};

export const LinkCard: React.FC<LinkCardProps> = ({ 
  card, 
  highlightTerm,
  relatedLinks = [],
  onClick,
  currentCardTitle
}) => {
  const [isRelatedExpanded, setIsRelatedExpanded] = useState(false);

  // カード本文から該当箇所を抽出（前後の文脈を含む）
  const getContextSnippet = () => {
    if (!highlightTerm) return card.body.slice(0, 120);
    
    const escapedTerm = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(.{0,50}\\[\\[${escapedTerm}\\]\\].{0,50})`, 'i');
    const match = card.body.match(regex);
    
    return match ? match[1] : card.body.slice(0, 120);
  };

  const snippet = getContextSnippet();

  // 現在のカードとカード自身を除外
  const filteredRelatedLinks = relatedLinks.filter(
    link => link !== card.title && link !== currentCardTitle
  );

  return (
    <div 
      className={`border-t-4 ${TYPE_COLORS[card.type]} p-3 cursor-pointer hover:bg-stone-50 transition-colors h-full flex flex-col`}
      onClick={(e) => {
        // 関連セクションのクリックは伝播させない
        if ((e.target as HTMLElement).closest('.related-section')) {
          return;
        }
        onClick(card.title, e);
      }}
    >
      {/* タイトル */}
      <h4 className="font-bold text-sm text-stone-800 mb-2 line-clamp-1">
        {card.title}
      </h4>

      {/* 本文スニペット */}
      <p className="text-xs text-stone-600 line-clamp-3 leading-relaxed flex-1 mb-2">
        {snippet}
      </p>

      {/* 関連リンクセクション（折りたたみ可） */}
      {filteredRelatedLinks.length > 0 && (
        <div className="related-section pt-2 border-t border-stone-200/50 mt-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsRelatedExpanded(!isRelatedExpanded);
            }}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors w-full"
          >
            {isRelatedExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span>関連 ({filteredRelatedLinks.length}件)</span>
          </button>

          {isRelatedExpanded && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filteredRelatedLinks.map((link, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick(link, e);
                  }}
                  className="text-[12px] bg-stone-200/50 hover:bg-stone-300/50 px-1.5 py-0.5 rounded text-stone-600 hover:text-stone-800 transition-colors"
                >
                  {link}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};