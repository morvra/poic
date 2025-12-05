import React from 'react';
import { Card, CardType } from '../types';
import { formatTimestampByPattern, formatDateWithDay } from '../utils';
import { CardRenderer } from './CardRenderer';
import { Clock, CheckCircle, Circle, FileText, Lightbulb, CheckSquare, BookOpen, Square, Trash2, Pin } from 'lucide-react';

interface CardItemProps {
  card: Card;
  dateFormat: string; 
  onClick: (card: Card, e: React.MouseEvent) => void; 
  onLinkClick: (term: string) => void;
  onToggleComplete?: (id: string) => void;
  onStackClick?: (stack: string) => void;
  onTogglePin?: (id: string) => void;
  style?: React.CSSProperties;
  domId?: string; 
  
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

const TYPE_COLORS_BG = {
  [CardType.Record]: 'bg-blue-100 text-blue-800',
  [CardType.Discovery]: 'bg-red-100 text-red-800',
  [CardType.GTD]: 'bg-green-100 text-green-800',
  [CardType.Reference]: 'bg-yellow-100 text-yellow-800',
};

const TYPE_BORDER_COLOR = {
    [CardType.Record]: 'border-t-blue-500',
    [CardType.Discovery]: 'border-t-red-500',
    [CardType.GTD]: 'border-t-green-500',
    [CardType.Reference]: 'border-t-yellow-500',
}

const SHORT_TYPE_NAMES = {
  [CardType.Record]: 'REC',
  [CardType.Discovery]: 'DIS',
  [CardType.GTD]: 'GTD',
  [CardType.Reference]: 'REF',
};

const TypeIcon = ({ type, className }: { type: CardType, className?: string }) => {
    switch (type) {
        case CardType.Record: return <FileText size={16} className={className} />;
        case CardType.Discovery: return <Lightbulb size={16} className={className} />;
        case CardType.GTD: return <CheckSquare size={16} className={className} />;
        case CardType.Reference: return <BookOpen size={16} className={className} />;
    }
};

export const CardItem: React.FC<CardItemProps> = ({ 
  card, dateFormat, onClick, onLinkClick, onToggleComplete, onStackClick, onTogglePin, style, domId,
  isSelectionMode, isSelected, onSelect
}) => {
  const isGTD = card.type === CardType.GTD;
  const typeBadgeClass = TYPE_COLORS_BG[card.type];
  const borderClass = TYPE_BORDER_COLOR[card.type];

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectionMode && onSelect) {
      e.preventDefault();
      onSelect(card.id);
    } else {
      onClick(card, e);
    }
  };

  return (
    <div
      id={domId}
      onClick={handleClick}
      className={`
        group relative w-full h-full md:min-h-[12rem] bg-paper rounded-sm border border-t-[4px] ${borderClass}
        shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer
        mb-1 overflow-hidden
        ${isSelected ? 'border-stone-400 bg-stone-50 ring-2 ring-stone-400' : 'border-stone-200'}
      `}
      style={style}
    >
      <div className="p-2 flex flex-col h-full">
        {/* Header: Title and Type */}
        <div className="flex items-center justify-between mb-2 py-1.5 gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
                {isSelectionMode && (
                  <div className="text-stone-400 mr-1 shrink-0">
                    {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
                  </div>
                )}

                <div className={`flex items-center gap-1 shrink-0 ${typeBadgeClass} px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide`}>
                    <TypeIcon type={card.type} />
                    <span className="hidden sm:inline">{SHORT_TYPE_NAMES[card.type]}</span>
                </div>
                
                {onTogglePin && !isSelectionMode && card.isPinned && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onTogglePin(card.id); }}
                        className="shrink-0 text-yellow-500 hover:text-stone-400 transition-colors"
                        title="ピン留めを解除"
                    >
                        <Pin size={16} fill="currentColor" />
                    </button>
                )}

                <h3 className={`font-bold text-ink text-[16px] leading-tight truncate group-hover:text-stone-700 transition-colors ${card.completed ? 'text-stone-400' : ''}`}>
                  {card.title}
                </h3>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
                {isGTD && onToggleComplete && !isSelectionMode && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleComplete(card.id); }}
                    className={`text-stone-400 hover:text-green-600 transition-colors`}
                >
                    {card.completed ? <CheckCircle size={18} className="text-green-600" /> : <Circle size={18} />}
                </button>
                )}
            </div>
        </div>

        {/* Metadata Row */}
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-stone-400 font-mono mb-2 leading-none">
             <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTimestampByPattern(new Date(card.createdAt), dateFormat)}
             </span>
             {isGTD && card.dueDate && (
                <span className={`flex items-center gap-1 ${card.dueDate < Date.now() && !card.completed ? 'text-red-500 font-bold' : ''}`}>
                  Due: {formatDateWithDay(card.dueDate)}
                </span>
             )}
             {card.stacks && card.stacks.length > 0 && (
                <div className="flex gap-1 ml-auto">
                    {card.stacks.map(stack => (
                        <button 
                        key={stack} 
                        onClick={(e) => { e.stopPropagation(); if(onStackClick && !isSelectionMode) onStackClick(stack); }}
                        className="bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded hover:bg-stone-200 cursor-pointer transition-colors hover:text-stone-700 truncate max-w-[120px]"
                        >
                        #{stack}
                        </button>
                    ))}
                </div>
             )}
        </div>

        {/* Body Preview */}
        <div className="relative">
             <div className="max-h-[6.5rem] overflow-hidden line-clamp-4 font-sans text-sm text-ink/90 leading-relaxed">
                <CardRenderer content={card.body} onLinkClick={onLinkClick} />
             </div>
        </div>
      </div>
    </div>
  );
};