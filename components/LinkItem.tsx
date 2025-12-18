import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface LinkItemProps {
  title: string;
  relatedLinks: string[]; // 関連するカードタイトルの配列
  onNavigate: (title: string, e?: React.MouseEvent) => void;
  currentCardTitle?: string; // 現在開いているカードのタイトル（除外用）
}

export const LinkItem: React.FC<LinkItemProps> = ({
  title,
  relatedLinks,
  onNavigate,
  currentCardTitle
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 現在のカードと自分自身を除外
  const filteredLinks = relatedLinks.filter(
    link => link !== title && link !== currentCardTitle
  );

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="border-b border-stone-100 last:border-b-0">
      <div className="flex items-center gap-2 py-2 px-3 hover:bg-stone-50 transition-colors group">
        {/* 展開アイコン + 関連件数 */}
        <button
          onClick={handleToggleExpand}
          className="flex items-center gap-1 text-stone-400 hover:text-stone-600 transition-colors shrink-0"
        >
          {isExpanded ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
          <span className="text-xs text-stone-400">
            ({filteredLinks.length})
          </span>
        </button>

        {/* カードタイトル */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(title, e);
          }}
          className="flex-1 text-left text-sm font-medium text-stone-700 hover:text-blue-600 transition-colors truncate"
        >
          {title}
        </button>
      </div>

      {/* 展開時の関連リンク */}
      {isExpanded && filteredLinks.length > 0 && (
        <div className="px-3 pb-3 pl-10">
          <div className="flex flex-wrap gap-2">
            {filteredLinks.map((link, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(link, e);
                }}
                className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-800 px-2 py-1 rounded transition-colors"
              >
                {link}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};