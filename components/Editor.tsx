import React, { useState, useEffect, useRef } from 'react';
import { Card, CardType } from '../types';
import { formatTimeShort, formatTimestampByPattern } from '../utils';
import { CardRenderer } from './CardRenderer';
import { Calendar, Save, X, Trash2, Clock, CheckCircle, Circle, Link as LinkIcon, AlertTriangle, FileText, Lightbulb, CheckSquare, BookOpen, Pin, ArrowRightFromLine } from 'lucide-react';

interface EditorProps {
  initialCard?: Card;
  allTitles: string[];
  availableStacks: string[];
  dateFormat: string;
  onSave: (card: Partial<Card>, shouldClose?: boolean) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  onNavigate: (term: string, e?: React.MouseEvent) => void;
  onMoveToSide?: () => void;
  backlinks?: Card[];
}

// ... (TypeIcon unchanged) ...
const TypeIcon = ({ type, className }: { type: CardType, className?: string }) => {
    switch (type) {
        case CardType.Record: return <FileText size={16} className={className} />;
        case CardType.Discovery: return <Lightbulb size={16} className={className} />;
        case CardType.GTD: return <CheckSquare size={16} className={className} />;
        case CardType.Reference: return <BookOpen size={16} className={className} />;
    }
};

export const Editor: React.FC<EditorProps> = ({ 
  initialCard, 
  allTitles, 
  availableStacks, 
  dateFormat, 
  onSave, 
  onCancel, 
  onDelete, 
  onNavigate, 
  onMoveToSide,
  backlinks = [] 
}) => {
  // ... (State definitions unchanged) ...
  const [type, setType] = useState<CardType>(initialCard?.type || CardType.Record);
  const [title, setTitle] = useState(initialCard?.title || '');
  const [body, setBody] = useState(initialCard?.body || '');
  const [dueDate, setDueDate] = useState<string>(
    initialCard?.dueDate ? new Date(initialCard.dueDate).toISOString().split('T')[0] : ''
  );
  const [createdAt, setCreatedAt] = useState<string>(
    initialCard?.createdAt 
        ? new Date(initialCard.createdAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) 
        : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  const [stacks, setStacks] = useState(initialCard?.stacks?.join(', ') || '');
  const [completed, setCompleted] = useState(initialCard?.completed || false);
  const [isPinned, setIsPinned] = useState<number | boolean>(initialCard?.isPinned || false);
  
  const [isEditingBody, setIsEditingBody] = useState(
    !initialCard || !initialCard.id || initialCard.id.startsWith('new-') || initialCard.id.startsWith('phantom-')
  );
  const [initialCursorOffset, setInitialCursorOffset] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const readViewRef = useRef<HTMLDivElement>(null);
  const stackInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMouseDownRef = useRef(false); 
  const savedScrollTop = useRef<number | null>(null);
  
  const prevCardIdRef = useRef<string | undefined>(initialCard?.id);

  const [wikiSuggestions, setWikiSuggestions] = useState<string[]>([]);
  const [showWikiSuggestions, setShowWikiSuggestions] = useState(false);
  const [wikiSuggestionPos, setWikiSuggestionPos] = useState({ top: 0, left: 0 });
  const [wikiSuggestionIndex, setWikiSuggestionIndex] = useState(0);
  
  const [stackSuggestions, setStackSuggestions] = useState<string[]>([]);
  const [showStackSuggestions, setShowStackSuggestions] = useState(false);
  const [stackSuggestionIndex, setStackSuggestionIndex] = useState(0);
  
  // ... (Effects unchanged) ...
  useEffect(() => {
    if (containerRef.current) {
        containerRef.current.scrollTop = 0;
    }
  }, [initialCard?.id]);

  useEffect(() => {
      const isNewCard = !initialCard || !initialCard.id || initialCard.id.startsWith('new-');
      const isPhantom = !!initialCard?.title; // タイトルがある場合はリンク作成(Phantom)とみなす

      if (isNewCard && !isPhantom && titleInputRef.current) {
          setTimeout(() => {
              titleInputRef.current?.focus();
          }, 50);
      }
  }, [initialCard]);

  // Adjust title height on change
  useEffect(() => {
      if (titleInputRef.current) {
          titleInputRef.current.style.height = 'auto';
          titleInputRef.current.style.height = `${titleInputRef.current.scrollHeight}px`;
      }
  }, [title]);

  useEffect(() => {
      if (isEditingBody && bodyRef.current) {
          bodyRef.current.style.height = 'auto';
          bodyRef.current.style.height = `${bodyRef.current.scrollHeight}px`;
          
          const isNewCard = initialCard?.id?.startsWith('new-');
          const isPhantom = (isNewCard || !initialCard?.id) && !!initialCard?.title;
          const isExplicitEdit = !!initialCard?.id && !isNewCard; // 既存カードの編集
          const isTabFocus = document.activeElement === readViewRef.current;
          if (isPhantom || isExplicitEdit || isTabFocus) {
              bodyRef.current.focus();
          }
      }
  }, [body, isEditingBody]);

  useEffect(() => {
      const currentId = initialCard?.id;
      const prevId = prevCardIdRef.current;

      if (initialCard) {
          setType(initialCard.type);
          setTitle(initialCard.title);
          setBody(initialCard.body);
          setDueDate(initialCard.dueDate ? new Date(initialCard.dueDate).toISOString().split('T')[0] : '');
          setCreatedAt(new Date(initialCard.createdAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
          setStacks(initialCard.stacks?.join(', ') || '');
          setCompleted(initialCard.completed || false);
          setIsPinned(initialCard.isPinned || false);
          setShowDeleteConfirm(false);
          
          if (!initialCard.id) {
              setIsEditingBody(true);
          } else if (prevId !== undefined && prevId !== currentId) {
              setIsEditingBody(false);
          }
      }
      
      prevCardIdRef.current = currentId;
  }, [initialCard?.id, initialCard]);

  useEffect(() => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
          handleAutoSave();
      }, 800); 

      return () => {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      };
  }, [title, body, type, dueDate, stacks, createdAt, completed, isPinned]);

  const handleAutoSave = () => {
    if (!title.trim() && !body.trim()) return; 
    let dueTimestamp: number | undefined = undefined;
    if (type === CardType.GTD && dueDate) {
      dueTimestamp = new Date(dueDate).getTime();
    }
    const stackList = stacks.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const createdTimestamp = new Date(createdAt).getTime();
    onSave({
      id: initialCard?.id,
      title,
      body,
      type,
      dueDate: dueTimestamp,
      stacks: stackList,
      createdAt: createdTimestamp,
      completed: type === CardType.GTD ? completed : false,
      isPinned
    }, false); 
  };

  const handleTogglePin = () => {
      const newState = isPinned ? false : Date.now();
      setIsPinned(newState);
  };

  useEffect(() => {
      if (isEditingBody && bodyRef.current) {
          bodyRef.current.style.height = 'auto';
          bodyRef.current.style.height = `${bodyRef.current.scrollHeight}px`;
          const isPhantom = !initialCard?.id && !!initialCard?.title;
          const isExplicitEdit = !!initialCard?.id; 
          const isTabFocus = document.activeElement === readViewRef.current;
          if (isPhantom || isExplicitEdit || isTabFocus) {
              bodyRef.current.focus();
          }
          if (initialCursorOffset !== null) {
              const len = bodyRef.current.value.length;
              const pos = Math.min(Math.max(0, initialCursorOffset), len);
              bodyRef.current.setSelectionRange(pos, pos);
              setInitialCursorOffset(null);
          }
          if (savedScrollTop.current !== null && containerRef.current) {
              containerRef.current.scrollTop = savedScrollTop.current;
              savedScrollTop.current = null;
          }
      }
  }, [isEditingBody]); 

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) {
          return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        
        // タイトルも本文も空の場合は保存せずに閉じるだけ
        if (!title.trim() && !body.trim()) {
            onCancel();
            return;
        }
        
        handleAutoSave(); // Trigger save with current state
        onSave({
            id: initialCard?.id,
            title,
            body,
            type,
            dueDate: type === CardType.GTD && dueDate ? new Date(dueDate).getTime() : undefined,
            stacks: stacks.split(',').map(s => s.trim()).filter(s => s.length > 0),
            createdAt: new Date(createdAt).getTime(),
            completed: type === CardType.GTD ? completed : false,
            isPinned
        }, true); // true = close editor
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        if (!isEditingBody) {
             setInitialCursorOffset(body.length);
             setIsEditingBody(true);
             setTimeout(() => insertTimestamp(), 50);
        } else {
             insertTimestamp();
        }
      }
      if (showWikiSuggestions) {
          if (e.key === 'ArrowDown') { e.preventDefault(); setWikiSuggestionIndex(prev => (prev + 1) % wikiSuggestions.length); } 
          else if (e.key === 'ArrowUp') { e.preventDefault(); setWikiSuggestionIndex(prev => (prev - 1 + wikiSuggestions.length) % wikiSuggestions.length); } 
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectWikiSuggestion(wikiSuggestions[wikiSuggestionIndex]); } 
          else if (e.key === 'Escape') { setShowWikiSuggestions(false); e.stopPropagation(); }
          return;
      }
      if (showStackSuggestions) {
          if (e.key === 'ArrowDown') { e.preventDefault(); setStackSuggestionIndex(prev => (prev + 1) % stackSuggestions.length); } 
          else if (e.key === 'ArrowUp') { e.preventDefault(); setStackSuggestionIndex(prev => (prev - 1 + stackSuggestions.length) % stackSuggestions.length); } 
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectStackSuggestion(stackSuggestions[stackSuggestionIndex]); } 
          else if (e.key === 'Escape') { setShowStackSuggestions(false); e.stopPropagation(); }
          return;
      }
      if (e.key === 'Escape' && !showDeleteConfirm) {
        onCancel();
      } else if (e.key === 'Escape' && showDeleteConfirm) {
          setShowDeleteConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [body, onCancel, showWikiSuggestions, showStackSuggestions, wikiSuggestions, wikiSuggestionIndex, stackSuggestions, stackSuggestionIndex, isEditingBody, showDeleteConfirm]);

  const insertTimestamp = () => {
    if (!bodyRef.current) return;
    const now = new Date();
    const timestampStr = ` ${formatTimestampByPattern(now, dateFormat)} `;
    const start = bodyRef.current.selectionStart;
    const end = bodyRef.current.selectionEnd;
    const newBody = body.substring(0, start) + timestampStr + body.substring(end);
    setBody(newBody);
    setTimeout(() => {
        if(bodyRef.current) {
            bodyRef.current.selectionStart = bodyRef.current.selectionEnd = start + timestampStr.length;
            bodyRef.current.focus();
        }
    }, 0);
  };

  const getCaretCoordinates = (element: HTMLTextAreaElement, position: number) => {
    const div = document.createElement('div');
    const style = getComputedStyle(element);
    Array.from(style).forEach((prop) => { div.style.setProperty(prop, style.getPropertyValue(prop)); });
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.width = `${element.clientWidth}px`;
    div.textContent = element.value.substring(0, position);
    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    const { offsetLeft: spanLeft, offsetTop: spanTop } = span;
    document.body.removeChild(div);
    return { top: spanTop - element.scrollTop, left: spanLeft - element.scrollLeft };
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setBody(val);
      const cursor = e.target.selectionStart;
      const textBeforeCursor = val.substring(0, cursor);
      const match = textBeforeCursor.match(/\[\[([^\]]*)$/);
      if (match) {
          const term = match[1];
          const matches = allTitles.filter(t => t.toLowerCase().includes(term.toLowerCase()) && t !== title).slice(0, 5);
          if (matches.length > 0) {
            setWikiSuggestions(matches);
            setShowWikiSuggestions(true);
            setWikiSuggestionIndex(0);
            const coords = getCaretCoordinates(e.target, cursor);
            setWikiSuggestionPos({ top: coords.top + 24, left: coords.left });
          } else {
            setShowWikiSuggestions(false);
          }
      } else {
          setShowWikiSuggestions(false);
      }
  };

  const selectWikiSuggestion = (suggestion: string) => {
      if (!bodyRef.current) return;
      const cursor = bodyRef.current.selectionStart;
      const textBeforeCursor = body.substring(0, cursor);
      const textAfterCursor = body.substring(cursor);
      const lastOpenBracket = textBeforeCursor.lastIndexOf('[[');
      if (lastOpenBracket !== -1) {
          const newBody = body.substring(0, lastOpenBracket) + `[[${suggestion}]]` + textAfterCursor;
          setBody(newBody);
          setShowWikiSuggestions(false);
          setTimeout(() => {
             if (bodyRef.current) {
                 const newCursor = lastOpenBracket + suggestion.length + 4;
                 bodyRef.current.focus();
                 bodyRef.current.setSelectionRange(newCursor, newCursor);
             }
          }, 0);
      }
  };

  const handleStackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setStacks(val);
      const parts = val.split(/,|、/); 
      const currentInput = parts[parts.length - 1].trim();
      if (currentInput.length > 0) {
          const matches = availableStacks.filter(s => s.toLowerCase().includes(currentInput.toLowerCase()) && !parts.slice(0, -1).map(p => p.trim()).includes(s)).slice(0, 5);
          if (matches.length > 0) {
              setStackSuggestions(matches);
              setShowStackSuggestions(true);
              setStackSuggestionIndex(0);
          } else {
              setShowStackSuggestions(false);
          }
      } else {
          setShowStackSuggestions(false);
      }
  };

  const selectStackSuggestion = (suggestion: string) => {
      const parts = stacks.split(',');
      parts.pop(); 
      parts.push(' ' + suggestion);
      setStacks(parts.join(',') + ', ');
      setShowStackSuggestions(false);
      stackInputRef.current?.focus();
  };

  const handleViewModeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 文字選択中の場合は編集モードに切り替えない
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
        return; // 選択中は何もしない
    }

    let offset = body.length;
    if (selection && selection.rangeCount > 0 && readViewRef.current) {
        const range = selection.getRangeAt(0);
        if (readViewRef.current.contains(range.startContainer)) {
             const preCaretRange = range.cloneRange();
             preCaretRange.selectNodeContents(readViewRef.current);
             preCaretRange.setEnd(range.startContainer, range.startOffset);
             offset = preCaretRange.toString().length;
        }
    }
    if (containerRef.current) {
        savedScrollTop.current = containerRef.current.scrollTop;
    }
    setInitialCursorOffset(offset); 
    setIsEditingBody(true);
    isMouseDownRef.current = false; 
  };

  const handleDeleteClick = () => {
      setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
      if (initialCard?.id && onDelete) {
          onDelete(initialCard.id);
      }
  };

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
  };

  return (
    <div className={`bg-paper w-full max-w-full h-auto max-h-full flex flex-col md:rounded-lg shadow-none overflow-hidden relative border-t-[8px] ${TYPE_BORDER_COLOR[type]}`}>
      
      {/* Delete Confirmation Overlay ... */}
      {showDeleteConfirm && (
          <div className="absolute inset-0 bg-stone-900/10 backdrop-blur-[1px] z-50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full border border-stone-200 animate-in zoom-in-95 duration-200">
                  <div className="flex flex-col items-center text-center gap-3 mb-6">
                      <div className="bg-red-100 p-3 rounded-full text-red-600">
                          <AlertTriangle size={32} />
                      </div>
                      <h3 className="text-lg font-bold text-stone-800">カードを削除しますか？</h3>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2 rounded-md bg-stone-100 text-stone-600 hover:bg-stone-200 font-medium transition-colors">キャンセル</button>
                      <button onClick={confirmDelete} className="flex-1 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 font-bold transition-colors shadow-sm">削除する</button>
                  </div>
              </div>
          </div>
      )}

      {/* Top Header Buttons */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
           {onMoveToSide && initialCard?.id && (
             <button
                onClick={onMoveToSide}
                className="hidden md:block text-stone-300 hover:text-stone-500 p-2 rounded-full hover:bg-stone-100 transition-colors"
                title="右側に移動して一覧に戻る"
             >
                <ArrowRightFromLine size={20} />
             </button>
           )}
           {initialCard?.id && (
             <button 
                onClick={handleDeleteClick}
                className="text-stone-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                title="削除"
             >
                <Trash2 size={20} />
             </button>
           )}
           <button
              onClick={handleTogglePin}
              className={`p-2 rounded-full transition-colors ${isPinned ? 'text-yellow-500' : 'text-stone-300 hover:text-stone-500'}`}
              title={isPinned ? "ピン留めを解除" : "ピン留め"}
           >
              <Pin size={20} fill={isPinned ? "currentColor" : "none"} />
           </button>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600 p-2 rounded-full hover:bg-stone-100 transition-colors">
              <X size={24} />
          </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 pb-20">
        {/* Type & Date Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
            <div className="flex gap-2">
                {(Object.values(CardType) as CardType[]).map((t) => (
                <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
                    type === t 
                        ? TYPE_COLORS_BG[t] + ' shadow-sm transform scale-105'
                        : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                    }`}
                    title={t}
                >
                    <TypeIcon type={t} />
                </button>
                ))}
            </div>

            <div className="flex items-center gap-2 text-stone-400 text-sm ml-auto sm:ml-0">
                <Clock size={14} />
                <input 
                    type="datetime-local"
                    value={createdAt}
                    onChange={(e) => setCreatedAt(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-stone-500 text-xs font-mono p-0"
                />
            </div>
        </div>

        {/* Title & Complete Toggle */}
        <div className="flex items-start gap-4 mb-4 min-w-0">
            <textarea
                ref={titleInputRef}
                placeholder="タイトルなし"
                className={`flex-1 min-w-0 max-w-full text-xl sm:text-2xl font-bold font-sans text-ink placeholder-stone-300 border-none focus:outline-none bg-transparent p-0 resize-none overflow-hidden ${completed ? 'text-stone-400' : ''}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                }}
                rows={1}
                autoFocus={!initialCard?.id && !initialCard?.title}
            />
            {type === CardType.GTD && (
                <button 
                    onClick={() => setCompleted(!completed)}
                    title={completed ? "完了を解除" : "完了にする"}
                    className={`shrink-0 transition-colors transform active:scale-95 ${completed ? 'text-green-600' : 'text-stone-300 hover:text-green-500'}`}
                >
                    {completed ? <CheckCircle size={32} /> : <Circle size={32} />}
                </button>
            )}
        </div>

        {/* Metadata Inputs */}
        <div className="flex flex-wrap gap-4 mb-4 relative">
            {type === CardType.GTD && (
                <div className="flex items-center gap-2 text-stone-600 text-sm bg-stone-100/50 px-3 py-1.5 rounded border border-stone-200">
                    <span className="text-xs font-bold uppercase">Due:</span>
                    <input 
                        type="date" 
                        className="bg-transparent focus:outline-none"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                    />
                </div>
            )}
            <div className="flex-1 min-w-[200px] relative">
                <input 
                    ref={stackInputRef}
                    type="text" 
                    placeholder="タグ (カンマ区切り)" 
                    className="w-full bg-transparent border-b border-stone-200 px-0 py-1.5 text-sm focus:outline-none focus:border-stone-400 transition-all text-stone-600 placeholder-stone-300"
                    value={stacks}
                    onChange={handleStackChange}
                    onBlur={() => setTimeout(() => setShowStackSuggestions(false), 200)}
                />
                {/* Stack Autocomplete Dropdown */}
                {showStackSuggestions && (
                    <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-lg rounded-md z-20 mt-1 max-h-40 overflow-y-auto">
                        {stackSuggestions.map((suggestion, idx) => (
                            <div 
                                key={suggestion}
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-stone-100 ${idx === stackSuggestionIndex ? 'bg-stone-100 font-medium' : ''}`}
                                onClick={() => selectStackSuggestion(suggestion)}
                                onMouseEnter={() => setStackSuggestionIndex(idx)}
                            >
                                #{suggestion}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Body Editor with Click-to-Edit */}
        <div className="relative min-h-[150px]">
            {isEditingBody ? (
                <>
                    <textarea
                        ref={bodyRef}
                        className="block w-full min-h-[150px] resize-none border-none focus:outline-none bg-transparent text-[17px] font-sans leading-relaxed text-ink/90 placeholder-stone-300 overflow-hidden"
                        placeholder="内容を入力... (Alt+T: タイムスタンプ, [[ : リンク)"
                        value={body}
                        onChange={handleBodyChange}
                        onBlur={() => {
                            setTimeout(() => {
                                if (!showWikiSuggestions) {
                                    setIsEditingBody(false);
                                }
                            }, 200);
                        }}
                    />
                     {/* WikiLink Autocomplete Dropdown */}
                    {showWikiSuggestions && (
                        <div 
                            className="absolute bg-white border border-stone-200 shadow-xl rounded-md z-30 max-h-60 overflow-y-auto min-w-[200px]"
                            style={{ top: wikiSuggestionPos.top, left: wikiSuggestionPos.left }}
                        >
                            {wikiSuggestions.map((suggestion, idx) => (
                                <div 
                                    key={suggestion}
                                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${idx === wikiSuggestionIndex ? 'bg-blue-50 text-blue-800' : 'text-stone-700'}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation(); // Stop blur from textarea
                                        selectWikiSuggestion(suggestion);
                                    }}
                                    onMouseEnter={() => setWikiSuggestionIndex(idx)}
                                >
                                    <span className="font-bold text-blue-300 mr-1">[[</span>
                                    {suggestion}
                                    <span className="font-bold text-blue-300 ml-1">]]</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div 
                    ref={readViewRef}
                    onClick={handleViewModeClick}
                    onMouseDown={() => { isMouseDownRef.current = true; }}
                    onMouseUp={() => { isMouseDownRef.current = false; }}
                    onFocus={() => { 
                        if (!isMouseDownRef.current) setIsEditingBody(true);
                    }} 
                    tabIndex={0} 
                    className="w-full min-h-[150px] cursor-text outline-none"
                >
                    <CardRenderer 
                        content={body || '内容なし'} 
                        onLinkClick={onNavigate} 
                        className={!body ? 'text-stone-300 italic' : ''}
                    />
                </div>
            )}
        </div>

        {/* Backlinks Section */}
        {backlinks.length > 0 && (
            <div className="mt-8 pt-6 border-t border-stone-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 flex items-center gap-2">
                    <LinkIcon size={14} /> Backlinks
                </h3>
                <div className="grid grid-cols-1 gap-2">
                    {backlinks.map(linkCard => (
                        <div 
                            key={linkCard.id}
                            onClick={() => onNavigate(linkCard.title)}
                            className="bg-stone-50 border border-stone-200 rounded p-3 cursor-pointer hover:bg-stone-100 transition-colors"
                        >
                            <div className="text-sm font-bold text-stone-700">{linkCard.title}</div>
                            <div className="text-xs text-stone-400 mt-1 line-clamp-1">{linkCard.body.replace(/\n/g, ' ')}</div>
                        </div>
                    ))}
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
