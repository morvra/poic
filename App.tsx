import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardType, ViewMode, PoicStats } from './types';
import { generateId, getRelativeDateLabel, formatDate, formatTimestampByPattern, cleanupDeletedCards } from './utils';
import { uploadToDropbox, downloadFromDropbox, isAuthenticated, logout, initiateAuth, handleAuthCallback, uploadDeltaToDropbox, downloadDeltaFromDropbox, downloadMetadataFromDropbox, uploadFullDataToDropbox } from './utils/dropbox';
import type { SyncMetadata } from './types';
import { idbStorage, migrateFromLocalStorage } from './utils/indexedDB';
import { CardItem } from './components/CardItem';
import { Editor } from './components/Editor';
import { SettingsModal } from './components/SettingsModal'; 
import { 
  Library, 
  Layers, 
  CheckSquare, 
  Search, 
  Plus, 
  Filter,
  Menu,
  X,
  Shuffle,
  Home,
  Copy,
  CheckSquare as SelectIcon,
  Trash2,
  Square,
  AlertTriangle,
  Tag,
  Cloud,
  RefreshCw,
  Settings,
  CheckCheck,
  Pin,
  ArrowRightFromLine
} from 'lucide-react';

// Enhanced initial data with 10 varied cards
const INITIAL_CARDS: Card[] = [
  {
    id: '10',
    type: CardType.Record,
    title: '朝の振り返り',
    body: '雨が窓を優しく叩いている。\n\n08:30 コーディングには最適な天気だ。\n\n今日はスタッキングアニメーションの実装に集中しよう。',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stacks: ['Journal']
  },
  {
    id: '20',
    type: CardType.Reference,
    title: 'ショートカットキー',
    body: 'カード一覧\nn: 新規作成\ns: 同期\nd: すべてのカードに切り替え\ng: GTDタスクに切り替え\nカードをctrl+クリック: 右側に展開\n\nカード編集中\nctrl+enter, esc: モーダルを閉じる\nalt+t: タイムスタンプ挿入',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stacks: []
  },
];

export default function App() {
  // --- State ---
  const [cards, setCards] = useState<Card[]>(INITIAL_CARDS);
  const [isLoading, setIsLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState<ViewMode>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStack, setActiveStack] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<CardType | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(() => {
      const saved = localStorage.getItem('poic-sidebar-state');
      return saved !== null ? JSON.parse(saved) : true;
  });
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');

  // Editor State
  const [activeModalCardId, setActiveModalCardId] = useState<string | null>(null);
  const [activeSideCardId, setActiveSideCardId] = useState<string | null>(null);
  
  const [phantomCards, setPhantomCards] = useState<Map<string, Partial<Card>>>(new Map());

  const [dropboxToken, setDropboxToken] = useState<string | null>(localStorage.getItem('dropbox_access_token'));
  const [isDropboxConnected, setIsDropboxConnected] = useState(isAuthenticated());
  const [isSyncing, setIsSyncing] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [dateFormat, setDateFormat] = useState<string>(() => {
    return localStorage.getItem('poic-date-format') || 'YYYY/MM/DD ddd HH:mm';
  });

  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata>({
    lastSyncTime: 0,
    localChanges: []
  });
  const [isInitialSync, setIsInitialSync] = useState(true);

  // --- Memos ---
  const getCardData = (id: string | null): Card | undefined => {
      if (!id) return undefined;
      if (phantomCards.has(id)) return phantomCards.get(id) as Card;
      const card = cards.find(c => c.id === id);
      return card?.isDeleted ? undefined : card;
  };

  const activeModalCard = useMemo(() => getCardData(activeModalCardId), [activeModalCardId, cards, phantomCards]);
  const activeSideCard = useMemo(() => getCardData(activeSideCardId), [activeSideCardId, cards, phantomCards]);

  const activeFocusCard = activeModalCard || activeSideCard;
  
  // Backlinks for Modal
  const modalBacklinks = useMemo(() => {
      if (!activeModalCard || !activeModalCard.title) return [];
      const escapedTitle = activeModalCard.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\[\\[${escapedTitle}\\]\\]`, 'i');
      return cards.filter(c => !c.isDeleted && c.id !== activeModalCard.id && regex.test(c.body));
  }, [activeModalCard, cards]);

  // Backlinks for Side Panel
  const sideBacklinks = useMemo(() => {
      if (!activeSideCard || !activeSideCard.title) return [];
      const escapedTitle = activeSideCard.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\[\\[${escapedTitle}\\]\\]`, 'i');
      return cards.filter(c => !c.isDeleted && c.id !== activeSideCard.id && regex.test(c.body));
  }, [activeSideCard, cards]);

  const allStacks = useMemo(() => {
    const stackMap = new Map<string, number>();
    cards.forEach(c => {
        if (!c.isDeleted) {
            c.stacks?.forEach(s => {
                stackMap.set(s, (stackMap.get(s) || 0) + 1);
            });
        }
    });
    return Array.from(stackMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count }));
  }, [cards]);
  
  const allTitles = useMemo(() => {
      return Array.from(new Set(cards.filter(c => !c.isDeleted).map(c => c.title)));
  }, [cards]);
  
  const commonStacks = useMemo(() => {
      const stacks = new Set<string>();
      cards.forEach(c => {
          if (!c.isDeleted && selectedCardIds.has(c.id)) {
              c.stacks?.forEach(s => stacks.add(s));
          }
      });
      return Array.from(stacks).sort();
  }, [cards, selectedCardIds]);

  const stats: PoicStats = useMemo(() => ({
    total: cards.filter(c => !c.isDeleted).length,
    record: cards.filter(c => !c.isDeleted && c.type === CardType.Record).length,
    discovery: cards.filter(c => !c.isDeleted && c.type === CardType.Discovery).length,
    gtdActive: cards.filter(c => !c.isDeleted && c.type === CardType.GTD && !c.completed).length,
    gtdTotal: cards.filter(c => !c.isDeleted && c.type === CardType.GTD).length,
    reference: cards.filter(c => !c.isDeleted && c.type === CardType.Reference).length,
  }), [cards]);

  const filteredCards = useMemo(() => {
    let result = cards.filter(c => !c.isDeleted);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.title.toLowerCase().includes(q) || 
        c.body.toLowerCase().includes(q) ||
        c.stacks?.some(s => s.toLowerCase().includes(q))
      );
    }
    if (viewMode === 'Stack' && activeStack) {
      result = result.filter(c => c.stacks?.includes(activeStack));
    } else if (viewMode === 'GTD') {
      result = result.filter(c => c.type === CardType.GTD);
    } else if (viewMode === 'Type' && activeType) {
        result = result.filter(c => c.type === activeType);
    }
    
    if (viewMode === 'GTD') {
      result = [...result].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate - b.dueDate;
      });
    } else {
        result = [...result].sort((a, b) => b.createdAt - a.createdAt);
    }
    return result;
  }, [cards, viewMode, activeStack, activeType, searchQuery]);

  const { pinnedCards, unpinnedCards } = useMemo(() => {
      const pinned: Card[] = [];
      const unpinned: Card[] = [];

      filteredCards.forEach(card => {
          if (card.isPinned) {
              pinned.push(card);
          } else {
              unpinned.push(card);
          }
      });

      pinned.sort((a, b) => {
          const timeA = typeof a.isPinned === 'number' ? a.isPinned : 0;
          const timeB = typeof b.isPinned === 'number' ? b.isPinned : 0;
          return timeA - timeB;
      });

      return { pinnedCards: pinned, unpinnedCards: unpinned };
  }, [filteredCards]);

  const gtdGroups = useMemo(() => {
    if (viewMode !== 'GTD') return null;
    const groups: Record<string, Card[]> = {
      '期限切れ': [],
      '今日': [],
      '明日以降': [],
      '期限なし': [],
      '完了': []
    };
    unpinnedCards.forEach(card => {
      if (card.completed) {
        groups['完了'].push(card);
        return;
      }
      if (!card.dueDate) {
        groups['期限なし'].push(card);
        return;
      }
      const label = getRelativeDateLabel(card.dueDate);
      if (label === 'Overdue') groups['期限切れ'].push(card);
      else if (label === 'Today') groups['今日'].push(card);
      else if (label === 'Tomorrow') groups['明日以降'].push(card);
      else groups['明日以降'].push(card);
    });
    return groups;
  }, [unpinnedCards, viewMode]);

  // --- Effects ---
useEffect(() => {
const initializeData = async () => {
    try {
    // LocalStorageからの自動マイグレーション
    const migrationKey = 'poic-migration-completed';
    const migrationDone = await idbStorage.getItem(migrationKey);
    
    if (!migrationDone) {
        console.log('Migrating from localStorage...');
        await migrateFromLocalStorage([
        'poic-cards',
        'poic-sidebar-state', 
        'poic-date-format',
        'dropbox_access_token',
        'dropbox_refresh_token',
        'dropbox_expires_at'
        ]);
        await idbStorage.setItem(migrationKey, 'true');
    }

    // IndexedDBからデータ読み込み
    const saved = await idbStorage.getItem('poic-cards');
    if (saved) {
        setCards(JSON.parse(saved));
    }

    // その他の設定値も読み込み
    const sidebarState = await idbStorage.getItem('poic-sidebar-state');
    if (sidebarState !== null) {
        setIsDesktopSidebarOpen(JSON.parse(sidebarState));
    }

    const savedFormat = await idbStorage.getItem('poic-date-format');
    if (savedFormat) {
        setDateFormat(savedFormat);
    }

    const dropboxToken = await idbStorage.getItem('dropbox_access_token');
    if (dropboxToken) {
        setDropboxToken(dropboxToken);
    }

    } catch (error) {
    console.error('Failed to initialize data:', error);
    } finally {
    setIsLoading(false);
    }
};

initializeData();
}, []);

  useEffect(() => { setIsDropboxConnected(!!dropboxToken); }, [dropboxToken]);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const code = params.get('code'); if (code) { setIsSyncing(true); handleAuthCallback(code).then((token) => { setDropboxToken(token); window.history.replaceState(null, '', window.location.pathname); return syncDownload(token); }).catch(err => { console.error('Auth failed', err); alert('Dropbox認証に失敗しました。'); }).finally(() => setIsSyncing(false)); } else if (isAuthenticated()) { syncDownload(); } }, []);
  useEffect(() => {
    if (isLoading) return; // 初期化中はスキップ
    idbStorage.setItem('poic-cards', JSON.stringify(cards)).catch(err => {
      console.error('Failed to save cards:', err);
    });
  }, [cards, isLoading]);
  useEffect(() => { 
    if (!dropboxToken || isLoading) return;
  
    const timeoutId = setTimeout(async () => {
      try {
        // クリーンアップ
        const cleanedCards = cleanupDeletedCards(cards, 30);
        if (cleanedCards.length !== cards.length) {
          setCards(cleanedCards);
          return; // 次のサイクルでアップロード
        }

        // 初回は全データ同期
        if (isInitialSync) {
          await uploadFullDataToDropbox(cleanedCards);
          setIsInitialSync(false);
          setSyncMetadata({
            lastSyncTime: Date.now(),
            localChanges: []
          });
          return;
        }

        // 差分同期：変更されたカードのみ
        if (syncMetadata.localChanges.length > 0) {
          const changedCards = cleanedCards.filter(c => 
            syncMetadata.localChanges.includes(c.id)
          );
        
          const newMetadata: SyncMetadata = {
            lastSyncTime: Date.now(),
            localChanges: []
          };
        
          await uploadDeltaToDropbox(changedCards, newMetadata);
          setSyncMetadata(newMetadata);
        }
      } catch (error) {
        console.error('Sync error:', error);
      }
    }, 10000); 

    return () => clearTimeout(timeoutId); 
  }, [cards, dropboxToken, isLoading, isInitialSync, syncMetadata]);
  useEffect(() => { 
    const handleKeyDown = (e: KeyboardEvent) => { 
      // エディターやサイドバーが開いている時、入力フィールドにフォーカスがある時はスキップ
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return; 
      if (activeModalCardId || activeSideCardId) return;

      // n: 新規カード作成
      if (e.key === 'n') { 
        e.preventDefault();
        openNewCardEditor();
      }

      // s: Dropbox同期
      if (e.key === 's' && isDropboxConnected) {
        e.preventDefault();
        handleManualSync();
      }

      // d: すべてのカード画面
      if (e.key === 'd') {
        e.preventDefault();
        handleHome();
      }

      // g: GTDタスク画面
      if (e.key === 'g') {
        e.preventDefault();
        handleViewChange('GTD');
      }
    }; 
    window.addEventListener('keydown', handleKeyDown); 
    return () => window.removeEventListener('keydown', handleKeyDown); 
  }, [activeModalCardId, activeSideCardId, isDropboxConnected]);

  const handleDateFormatChange = (format: string) => {
    setDateFormat(format);
    idbStorage.setItem('poic-date-format', format);
  };
  const toggleSidebar = () => {
    if (window.innerWidth >= 768) {
      const newState = !isDesktopSidebarOpen;
      setIsDesktopSidebarOpen(newState);
      idbStorage.setItem('poic-sidebar-state', JSON.stringify(newState));
    } else {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };
  
  // --- Dropbox Helpers ---
  const syncDownload = async (token?: string) => { 
    setIsSyncing(true); 
    try {
      // 初回はフル同期
      if (isInitialSync) {
        const remoteCards = await downloadFromDropbox();
        if (remoteCards && Array.isArray(remoteCards)) {
          setCards(remoteCards);
        }
        setIsInitialSync(false);
        setSyncMetadata({
          lastSyncTime: Date.now(),
          localChanges: []
        });
        return;
      }

      // 差分同期
      const [deltaData, remoteMetadata] = await Promise.all([
        downloadDeltaFromDropbox(),
        downloadMetadataFromDropbox()
      ]);

      if (deltaData && deltaData.changes.length > 0) {
        setCards(prevCards => {
          const mergedMap = new Map<string, Card>();
        
          // 既存カードをマップに
          prevCards.forEach(c => mergedMap.set(c.id, c));
        
          // 変更分をマージ（updatedAtが新しい方を優先）
          deltaData.changes.forEach(rc => {
            const local = mergedMap.get(rc.id);
            if (!local || rc.updatedAt > local.updatedAt) {
              mergedMap.set(rc.id, rc);
            }
          });
        
          return Array.from(mergedMap.values());
        });

        if (remoteMetadata) {
          setSyncMetadata(remoteMetadata);
        }
      }
    } catch (error) { 
      console.error('Dropbox Sync Error:', error); 
      if (error instanceof Error && (error.message.includes('Unauthorized') || error.message.includes('401'))) { 
        handleDisconnectDropbox(); 
      } 
    } finally { 
      setIsSyncing(false); 
    } 
  };
  const syncUpload = async (token: string, data: Card[]) => { if (!isDropboxConnected) return; setIsSyncing(true); try { await uploadToDropbox(data); } catch (error) { console.error('Dropbox Upload Error:', error); if (error instanceof Error && (error.message.includes('Token refresh failed') || error.message.includes('Unauthorized'))) { handleDisconnectDropbox(); } } finally { setIsSyncing(false); } };
  const handleManualSync = () => { syncDownload(); };
  const handleConnectDropbox = () => { initiateAuth(); };
  const handleDisconnectDropbox = () => { logout(); setIsDropboxConnected(false); setDropboxToken(null); };

  // --- Actions ---
  const openEditCardEditor = (card: Card, e?: React.MouseEvent) => {
    if (isSelectionMode) {
        handleSelectCard(card.id);
        return;
    }
    
    const isMultiOpen = e?.metaKey || e?.ctrlKey;

    if (isMultiOpen) {
        setActiveSideCardId(card.id);
        // Don't close modal if open? No, typically focus shifts.
        // User preference: "Ctrl+Click opens right. Normal click opens focused mode on left."
        // Let's assume we want to focus on the new right card, so maybe close left modal?
        // Or keep it open? Let's keep it open if the user is just referencing.
        // Actually, let's stick to: Ctrl+click = side panel update. Normal click = modal update.
        // If modal is open, normal click replaces modal content.
    } else {
        setActiveModalCardId(card.id);
    }
  };

  const openNewCardEditor = () => {
      const tempId = `new-${Date.now()}`;
      const newPhantom: Partial<Card> = { id: tempId, type: CardType.Record, title: '', body: '', createdAt: Date.now(), updatedAt: Date.now(), stacks: [], isDeleted: false, isPinned: false };
      setPhantomCards(prev => new Map(prev).set(tempId, newPhantom));
      setActiveModalCardId(tempId);
  };

  const handleLinkClick = (term: string, e?: React.MouseEvent) => {
    if (term.startsWith('#')) {
        setSearchQuery(term); setViewMode('All'); setActiveStack(null); setIsSidebarOpen(false); setActiveModalCardId(null); return;
    }

    const targetCard = cards.find(c => !c.isDeleted && c.title.toLowerCase() === term.toLowerCase());
    let targetId = targetCard?.id;
    
    if (!targetId) {
        targetId = `phantom-${Date.now()}`;
        setPhantomCards(prev => new Map(prev).set(targetId!, {
            id: targetId, title: term, type: CardType.Record, body: '', createdAt: Date.now(), updatedAt: Date.now(), stacks: [], isDeleted: false, isPinned: false
        }));
    }

    const isMultiOpen = e?.metaKey || e?.ctrlKey;
    
    if (isMultiOpen) {
        setActiveSideCardId(targetId);
    } else {
        if (activeModalCardId) {
            setActiveModalCardId(targetId);
        } else if (activeSideCardId) {
            setActiveSideCardId(targetId);
        } else {
            setActiveModalCardId(targetId);
        }
    }
  };

  const handleMoveToSide = (id: string) => {
      setActiveSideCardId(id);
      setActiveModalCardId(null);
  };

  const handleCloseModal = () => {
      if (activeModalCardId && phantomCards.has(activeModalCardId)) {
          setPhantomCards(prev => { const n = new Map(prev); n.delete(activeModalCardId); return n; });
      }
      setActiveModalCardId(null);
  };

  const handleCloseSide = () => {
      if (activeSideCardId && phantomCards.has(activeSideCardId)) {
          setPhantomCards(prev => { const n = new Map(prev); n.delete(activeSideCardId); return n; });
      }
      setActiveSideCardId(null);
  };

  const handleSaveCard = (cardData: Partial<Card>, shouldClose = true) => {
    const currentId = cardData.id; 
    if (!currentId) return;

    if (phantomCards.has(currentId)) {
        const existingIndex = cards.findIndex(c => c.id === currentId);
        let finalId = currentId;

        if (existingIndex === -1) {
             const newId = generateId();
             finalId = newId;
             const newCard: Card = {
                id: newId,
                type: cardData.type || CardType.Record,
                title: cardData.title || '無題',
                body: cardData.body || '',
                createdAt: cardData.createdAt || Date.now(),
                updatedAt: Date.now(),
                dueDate: cardData.dueDate,
                completed: false,
                stacks: cardData.stacks || [],
                isDeleted: false,
                isPinned: cardData.isPinned || false
             };
             setCards([newCard, ...cards]);

             if (activeModalCardId === currentId) setActiveModalCardId(newId);
             if (activeSideCardId === currentId) setActiveSideCardId(newId);
             
             setPhantomCards(prev => { const n = new Map(prev); n.delete(currentId); return n; });
        }
    } else {
        const oldCard = cards.find(c => c.id === currentId);
        const titleChanged = oldCard && cardData.title && oldCard.title !== cardData.title;

        if (titleChanged && oldCard) {
            const escapedOldTitle = oldCard.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const oldTitleRegex = new RegExp(`\\[\\[${escapedOldTitle}\\]\\]`, 'g');
            const newLink = `[[${cardData.title}]]`;

            setCards(cards.map(c => {
                if (c.id === currentId) {
                     return { ...c, ...cardData, updatedAt: Date.now() } as Card;
                }
                if (c.body.match(oldTitleRegex)) {
                    return {
                        ...c,
                        body: c.body.replace(oldTitleRegex, newLink),
                        updatedAt: Date.now() // 内容が変わったので更新日時も更新
                    };
                }
                return c;
            }));
        } else {
            setCards(cards.map(c => c.id === currentId ? { ...c, ...cardData, updatedAt: Date.now() } as Card : c));
        }
    }
    setSyncMetadata(prev => ({
      ...prev,
      localChanges: [...new Set([...prev.localChanges, currentId])]
    }));
  };

  const handleDeleteCard = (id: string) => {
    setCards(cards.map(c => c.id === id ? { ...c, isDeleted: true, deletedAt: Date.now(), updatedAt: Date.now() } : c));
    setSyncMetadata(prev => ({
      ...prev,
      localChanges: [...new Set([...prev.localChanges, id])]
    }));
    if (activeModalCardId === id) handleCloseModal();
    if (activeSideCardId === id) handleCloseSide();
  };

  const handleToggleSelection = () => { setIsSelectionMode(!isSelectionMode); setSelectedCardIds(new Set()); setShowBatchDeleteConfirm(false); setShowBatchTagModal(false); };
  const handleSelectCard = (id: string) => { const newSelection = new Set(selectedCardIds); if (newSelection.has(id)) newSelection.delete(id); else newSelection.add(id); setSelectedCardIds(newSelection); };
  const handleClickDeleteSelected = () => { if (selectedCardIds.size === 0) return; setShowBatchDeleteConfirm(true); };
  const confirmBatchDelete = () => { setCards(cards.map(c => selectedCardIds.has(c.id) ? { ...c, isDeleted: true, deletedAt: Date.now(), updatedAt: Date.now() } : c)); setSelectedCardIds(new Set()); setIsSelectionMode(false); setShowBatchDeleteConfirm(false); };
  const handleBatchAddTag = () => { if (!batchTagInput.trim()) return; const tagToAdd = batchTagInput.trim(); setCards(cards.map(c => { if (selectedCardIds.has(c.id)) { const currentStacks = c.stacks || []; if (!currentStacks.includes(tagToAdd)) { return { ...c, stacks: [...currentStacks, tagToAdd], updatedAt: Date.now() }; } } return c; })); setBatchTagInput(''); };
  const handleBatchRemoveTag = (tag: string) => { setCards(cards.map(c => { if (selectedCardIds.has(c.id)) { const currentStacks = c.stacks || []; if (currentStacks.includes(tag)) { return { ...c, stacks: currentStacks.filter(s => s !== tag), updatedAt: Date.now() }; } } return c; })); };
  const toggleGTDComplete = (id: string) => { setCards(cards.map(c => c.id === id ? { ...c, completed: !c.completed, updatedAt: Date.now() } : c)); };
  const togglePin = (id: string) => { setCards(cards.map(c => { if (c.id === id) { const newPinnedState = c.isPinned ? false : Date.now(); return { ...c, isPinned: newPinnedState, updatedAt: Date.now() }; } return c; })); };
  const handleRandomCard = () => { if (filteredCards.length === 0) return; const randomIndex = Math.floor(Math.random() * filteredCards.length); const card = filteredCards[randomIndex]; const el = document.getElementById(`card-${card.id}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.transition = 'transform 0.2s, box-shadow 0.2s'; el.style.transform = 'scale(1.02)'; el.style.boxShadow = '0 0 0 4px rgba(6, 182, 212, 0.5)'; setTimeout(() => { el.style.transform = ''; el.style.boxShadow = ''; }, 1000); } };
  const handleHome = () => { setSearchQuery(''); setViewMode('All'); setActiveStack(null); setActiveType(null); };
  const handleExportOPML = () => { 
      let exportCards = filteredCards; if (isSelectionMode && selectedCardIds.size > 0) { exportCards = cards.filter(c => !c.isDeleted && selectedCardIds.has(c.id)); }
      if (exportCards.length === 0) { alert('出力するカードがありません。'); return; }
      const grouped: Record<string, Card[]> = {}; exportCards.forEach(card => { const stacks = card.stacks && card.stacks.length > 0 ? card.stacks : ['Unstacked']; stacks.forEach(s => { if (!grouped[s]) grouped[s] = []; grouped[s].push(card); }); });
      let opmlBody = ''; const escapeXml = (unsafe: string) => { return unsafe.replace(/[<>&'"]/g, (c) => { switch (c) { case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;'; case '\'': return '&apos;'; case '"': return '&quot;'; default: return c; } }); };
      Object.entries(grouped).forEach(([stackName, stackCards]) => { opmlBody += `<outline text="${escapeXml(stackName)}">\n`; stackCards.forEach(card => { const dateStr = formatTimestampByPattern(new Date(card.createdAt), dateFormat); opmlBody += `  <outline text="${escapeXml(card.title)}" _note="${escapeXml(dateStr)}">\n`; const lines = card.body.split('\n'); lines.forEach(line => { if (line.trim()) { opmlBody += `    <outline text="${escapeXml(line)}" />\n`; } }); opmlBody += `  </outline>\n`; }); opmlBody += `</outline>\n`; });
      const opml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head>\n    <title>d-PoIC Export</title>\n</head>\n<body>\n${opmlBody}</body>\n</opml>`;
      navigator.clipboard.writeText(opml).then(() => { alert(isSelectionMode ? `${exportCards.length}枚のカードをOPMLとしてコピーしました！` : 'OPMLをコピーしました！'); }).catch(err => { console.error('Copy failed', err); alert('コピーに失敗しました'); });
  };
  const handleSelectAll = () => { const allIds = filteredCards.map(c => c.id); const allSelected = allIds.every(id => selectedCardIds.has(id)); if (allSelected) { const newSelection = new Set(selectedCardIds); allIds.forEach(id => newSelection.delete(id)); setSelectedCardIds(newSelection); } else { const newSelection = new Set(selectedCardIds); allIds.forEach(id => newSelection.add(id)); setSelectedCardIds(newSelection); } };

  const sidePanelOpen = !!activeSideCardId;
  const handleViewChange = (mode: ViewMode, value: string | null = null) => { setViewMode(mode); if (mode === 'Stack') { setActiveStack(value); setActiveType(null); } else if (mode === 'Type') { setActiveType(value as CardType); setActiveStack(null); } else { setActiveStack(null); setActiveType(null); } if (window.innerWidth < 768) setIsSidebarOpen(false); };
  
  const gridClasses = (isDesktopSidebarOpen && !sidePanelOpen) 
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    : sidePanelOpen
      ? "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4" 
      : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stone-800 mx-auto mb-4"></div>
          <p className="text-stone-600 font-medium">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex font-sans text-ink bg-stone-200 overflow-hidden">
      
      {isSidebarOpen && <div className="fixed inset-0 bg-black/20 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} dateFormat={dateFormat} onDateFormatChange={handleDateFormatChange} />
      {showBatchTagModal && (<div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-[1px]"><div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full border border-stone-200 animate-in zoom-in-95 duration-200"><h3 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2"><Tag size={20} />タグの管理</h3><div className="mb-4"><label className="text-xs font-bold text-stone-400 uppercase block mb-1">タグを追加</label><div className="flex gap-2"><input type="text" className="flex-1 border border-stone-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="タグ名を入力" value={batchTagInput} onChange={(e) => setBatchTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleBatchAddTag()} /><button onClick={handleBatchAddTag} className="bg-stone-800 text-white px-3 py-1.5 rounded text-sm hover:bg-stone-900 transition-colors">追加</button></div></div><div className="mb-6"><label className="text-xs font-bold text-stone-400 uppercase block mb-2">現在のタグ (クリックして削除)</label><div className="flex flex-wrap gap-2">{commonStacks.map(stack => (<button key={stack} onClick={() => handleBatchRemoveTag(stack)} className="bg-stone-100 text-stone-600 px-2 py-1 rounded text-sm hover:bg-red-100 hover:text-red-600 hover:line-through transition-colors">#{stack}</button>))} {commonStacks.length === 0 && <span className="text-sm text-stone-400 italic">タグなし</span>}</div></div><div className="flex justify-end"><button onClick={() => setShowBatchTagModal(false)} className="px-4 py-2 rounded-md bg-stone-100 text-stone-600 hover:bg-stone-200 font-medium transition-colors">閉じる</button></div></div></div>)}
      {showBatchDeleteConfirm && (<div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-[1px]"><div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full border border-stone-200 animate-in zoom-in-95 duration-200"><div className="flex flex-col items-center text-center gap-3 mb-6"><div className="bg-red-100 p-3 rounded-full text-red-600"><AlertTriangle size={32} /></div><h3 className="text-lg font-bold text-stone-800">カードを削除しますか？</h3><p className="text-sm text-stone-500">{selectedCardIds.size}枚のカードを削除します。この操作は元に戻せません。</p></div><div className="flex gap-3"><button onClick={() => setShowBatchDeleteConfirm(false)} className="flex-1 px-4 py-2 rounded-md bg-stone-100 text-stone-600 hover:bg-stone-200 font-medium transition-colors">キャンセル</button><button onClick={confirmBatchDelete} className="flex-1 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 font-bold transition-colors shadow-sm">削除する</button></div></div></div>)}

      <aside className={`fixed top-0 bottom-0 left-0 w-60 bg-paper-dark border-r border-stone-300 flex flex-col z-50 shadow-2xl md:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 ${isDesktopSidebarOpen ? 'md:w-60' : 'md:w-0 md:border-r-0 md:overflow-hidden'} ${activeModalCard ? 'blur-sm pointer-events-none select-none' : ''}`}>
        <div className="w-60 flex flex-col h-full">
            <div className="p-6 border-b border-stone-200/50 flex justify-between items-center"><div><h1 className="font-serif font-bold text-2xl tracking-tighter text-stone-800">d-PoIC</h1><p className="text-xs text-stone-400 mt-1 uppercase tracking-widest">Pile of Index Cards</p></div><button className="md:hidden text-stone-500" onClick={() => setIsSidebarOpen(false)}><X size={20} /></button></div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="space-y-1"><button onClick={() => handleViewChange('All')} className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 text-sm font-medium transition-colors ${viewMode === 'All' ? 'bg-white shadow-sm text-stone-900 border border-stone-100' : 'text-stone-500 hover:text-stone-900'}`}><Library size={18} /> すべてのカード<span className="ml-auto text-xs text-stone-400">{stats.total}</span></button><button onClick={() => handleViewChange('GTD')} className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 text-sm font-medium transition-colors ${viewMode === 'GTD' ? 'bg-white shadow-sm text-green-700 border border-green-100' : 'text-stone-500 hover:text-green-700'}`}><CheckSquare size={18} /> GTD タスク<span className="ml-auto text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{stats.gtdActive}</span></button></div>
                <div className="pt-4 border-t border-stone-200/50"><div className="grid grid-cols-2 gap-2 px-2"><button onClick={() => handleViewChange('Type', CardType.Record)} className={`p-2 rounded text-center border transition-all ${activeType === CardType.Record ? 'bg-blue-100 border-blue-300 shadow-inner' : 'bg-blue-50 border-blue-100 hover:bg-blue-100'}`}><div className="text-xl font-bold text-blue-600">{stats.record}</div><div className="text-[10px] uppercase text-blue-400">RECORD</div></button><button onClick={() => handleViewChange('Type', CardType.Discovery)} className={`p-2 rounded text-center border transition-all ${activeType === CardType.Discovery ? 'bg-red-100 border-red-300 shadow-inner' : 'bg-red-50 border-red-100 hover:bg-red-100'}`}><div className="text-xl font-bold text-red-600">{stats.discovery}</div><div className="text-[10px] uppercase text-red-400">DISCOVERY</div></button><button onClick={() => handleViewChange('Type', CardType.GTD)} className={`p-2 rounded text-center border transition-all ${activeType === CardType.GTD ? 'bg-green-100 border-green-300 shadow-inner' : 'bg-green-50 border-green-100 hover:bg-green-100'}`}><div className="text-xl font-bold text-green-600">{stats.gtdTotal}</div><div className="text-[10px] uppercase text-green-400">GTD</div></button><button onClick={() => handleViewChange('Type', CardType.Reference)} className={`p-2 rounded text-center border transition-all ${activeType === CardType.Reference ? 'bg-yellow-100 border-yellow-300 shadow-inner' : 'bg-yellow-50 border-yellow-100 hover:bg-yellow-100'}`}><div className="text-xl font-bold text-yellow-600">{stats.reference}</div><div className="text-[10px] uppercase text-yellow-400">REF</div></button></div></div>
                <div className="pt-2 border-t border-stone-200/50"><h3 className="px-3 text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-2 mt-4"><Tag size={12} /> タグ</h3><div className="space-y-1">{allStacks.map(stack => (<button key={stack.name} onClick={() => handleViewChange('Stack', stack.name)} className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex justify-between items-center ${activeStack === stack.name ? 'bg-stone-200 text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-800'}`}><span className="truncate">{stack.name}</span><span className="text-xs bg-stone-200/50 px-1.5 py-0.5 rounded-full text-stone-400">{stack.count}</span></button>))}{allStacks.length === 0 && <p className="px-3 text-xs text-stone-300 italic">No tags yet</p>}</div></div>
                <div className="pt-2 border-t border-stone-200/50"><h3 className="px-3 text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-2 mt-4"><Cloud size={12} /> Sync</h3>{isDropboxConnected ? (<div className="px-3 space-y-2"><button onClick={handleDisconnectDropbox} className="w-full bg-blue-100 text-blue-700 text-xs py-2 rounded-md font-bold hover:bg-blue-200 transition-colors flex items-center justify-center gap-2"><Cloud size={14} />{isSyncing ? '同期中...' : 'Dropbox 接続済み'}</button><button onClick={handleManualSync} disabled={isSyncing} className="w-full bg-stone-200 text-stone-600 text-xs py-2 rounded-md font-bold hover:bg-stone-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"><RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />今すぐ同期</button></div>) : (<div className="px-3"><button onClick={handleConnectDropbox} className="w-full bg-stone-200 text-stone-600 text-xs py-2 rounded-md font-bold hover:bg-stone-300 transition-colors flex items-center justify-center gap-2"><Cloud size={14} />Dropbox に接続</button></div>)}</div>
                <div className="pt-4 border-t border-stone-200/50"><button onClick={() => setIsSettingsOpen(true)} className="w-full text-left px-3 py-2 rounded-md flex items-center gap-3 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"><Settings size={18} />設定</button></div>
            </nav>
        </div>
      </aside>

      <div className="flex-1 flex overflow-hidden relative">
          <main className={`flex-1 overflow-y-auto bg-stone-200 transition-all duration-200 border-r border-stone-300/50 relative`}>
            <div className={activeModalCard ? 'blur-sm pointer-events-none select-none' : ''}>
                <header className="sticky top-0 bg-stone-200/95 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between shadow-sm z-30 mb-4 border-b border-stone-300/30">
                    <div className="flex items-center gap-3 flex-1">
                        <button onClick={toggleSidebar} className="text-stone-600 hover:bg-stone-300 p-2 rounded-md transition-colors"><Menu size={20} /></button>
                        <button onClick={handleHome} title="すべて表示" className="text-stone-500 hover:text-stone-800 hover:bg-stone-300/50 p-2 rounded-full transition-colors"><Home size={20} /></button>
                        <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} /><input type="text" placeholder="検索..." className="w-full pl-9 pr-4 py-2 bg-white border border-stone-300/50 rounded-full text-sm focus:ring-2 focus:ring-stone-400 focus:border-stone-400 transition-all outline-none shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />{searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs">クリア</button>}</div>
                        {viewMode === 'GTD' && <div className="hidden sm:flex items-center gap-2 text-xs text-stone-500 bg-white px-3 py-1.5 rounded-full border border-stone-200 shadow-sm"><Filter size={12} /><span>並び順: 期限</span></div>}
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                        <button onClick={handleRandomCard} title="ランダムにカードを表示" className="text-stone-500 hover:text-stone-800 hover:bg-stone-300/50 p-2 rounded-full transition-colors"><Shuffle size={20} /></button>
                        <button onClick={handleToggleSelection} title={isSelectionMode ? "選択モードを終了" : "複数選択"} className={`p-2 rounded-full transition-colors ${isSelectionMode ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-300/50'}`}><SelectIcon size={20} /></button>
                        {isSelectionMode && (<button onClick={handleSelectAll} title="表示中のカードをすべて選択" className={`p-2 rounded-full transition-colors ${filteredCards.length > 0 && filteredCards.every(c => selectedCardIds.has(c.id)) ? 'bg-blue-100 text-blue-600' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-300/50'}`}><CheckCheck size={20} /></button>)}
                        {isSelectionMode && selectedCardIds.size > 0 && (<><button onClick={() => setShowBatchTagModal(true)} title="タグの管理" className="bg-stone-800 hover:bg-stone-900 text-white p-2 rounded-full shadow-lg transition-colors flex items-center gap-2"><Tag size={20} /></button><button onClick={handleClickDeleteSelected} title={`${selectedCardIds.size}枚のカードを削除`} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full shadow-lg transition-colors flex items-center gap-2"><Trash2 size={20} /><span className="text-xs font-bold hidden sm:inline">{selectedCardIds.size}</span></button></>)}
                    </div>
                </header>

                <div className="px-2 sm:px-6 w-full max-w-[1920px] mx-auto pb-20">
                    <div className="mb-4 flex items-center justify-between pl-2 border-l-4 border-stone-400">
                        <h2 className="text-xl font-serif font-bold text-stone-700 ml-3">{viewMode === 'All' && (searchQuery ? `検索: "${searchQuery}"` : 'Dock (全カード)')}{viewMode === 'Stack' && `タグ: ${activeStack}`}{viewMode === 'Type' && `分類: ${activeType}`}{viewMode === 'GTD' && 'アクション'}</h2>
                        <div className="flex items-center gap-2"><button onClick={handleExportOPML} title="OPMLをコピー" className="flex items-center gap-1 text-xs font-mono text-stone-500 hover:text-stone-800 bg-stone-300/30 hover:bg-stone-300/60 px-2 py-1 rounded transition-colors"><Copy size={12} /><span className="hidden sm:inline">OPML</span></button><span className="text-xs font-mono text-stone-500 bg-stone-300/50 px-2 py-1 rounded">{filteredCards.length} cards</span></div>
                    </div>

                    <div className={viewMode === 'GTD' ? '' : gridClasses}>
                        {pinnedCards.length > 0 && (<><div className="col-span-full flex items-center gap-2 mb-2"><Pin size={16} className="text-stone-400" /><span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Pinned</span><div className="h-px flex-1 bg-stone-300/50"></div></div>{pinnedCards.map(card => (<CardItem key={card.id} domId={`card-${card.id}`} card={card} dateFormat={dateFormat} onClick={openEditCardEditor} onLinkClick={handleLinkClick} onToggleComplete={toggleGTDComplete} onStackClick={(s) => handleViewChange('Stack', s)} onTogglePin={togglePin} isSelectionMode={isSelectionMode} isSelected={selectedCardIds.has(card.id)} onSelect={handleSelectCard} />))}<div className="col-span-full h-4"></div></>)}

                        {viewMode === 'GTD' && gtdGroups ? (
                            <div className="col-span-full space-y-6">{(Object.entries(gtdGroups) as [string, Card[]][]).map(([groupName, groupCards]) => (groupCards.length > 0 && (<div key={groupName}><h3 className={`text-xs font-bold uppercase tracking-wider mb-2 pl-2 border-l-2 ${groupName === '期限切れ' ? 'border-red-500 text-red-500' : groupName === '今日' ? 'border-green-500 text-green-600' : 'border-stone-400 text-stone-500'}`}>{groupName}</h3><div className={gridClasses + " items-start"}> {groupCards.map((card) => (<CardItem key={card.id} domId={`card-${card.id}`} card={card} dateFormat={dateFormat} onClick={openEditCardEditor} onLinkClick={handleLinkClick} onToggleComplete={toggleGTDComplete} onStackClick={(s) => handleViewChange('Stack', s)} onTogglePin={togglePin} isSelectionMode={isSelectionMode} isSelected={selectedCardIds.has(card.id)} onSelect={handleSelectCard} />))}</div></div>)))}</div>
                        ) : (
                            <>
                                {unpinnedCards.map((card, index) => {
                                    const prevCard = unpinnedCards[index - 1];
                                    const currentMonth = new Date(card.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit' });
                                    const prevMonth = prevCard ? new Date(prevCard.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit' }) : null;
                                    const showDivider = index > 0 && currentMonth !== prevMonth;
                                    return (<React.Fragment key={card.id}>{showDivider && (<div className="col-span-full flex items-center gap-2 my-4 px-2 opacity-60"><div className="h-px flex-1 bg-stone-300"></div><span className="text-xs font-mono font-bold text-stone-500">{currentMonth}</span><div className="h-px flex-1 bg-stone-300"></div></div>)}<CardItem domId={`card-${card.id}`} card={card} dateFormat={dateFormat} onClick={openEditCardEditor} onLinkClick={handleLinkClick} onToggleComplete={toggleGTDComplete} onStackClick={(s) => handleViewChange('Stack', s)} onTogglePin={togglePin} isSelectionMode={isSelectionMode} isSelected={selectedCardIds.has(card.id)} onSelect={handleSelectCard} /></React.Fragment>);
                                })}
                                {unpinnedCards.length === 0 && (<div className="col-span-full text-center py-20 opacity-50"><Library size={48} className="mx-auto mb-4 text-stone-400" /><p className="text-stone-500 font-serif italic">カードが見つかりません。</p></div>)}
                            </>
                        )}
                    </div>
                </div>
                {!isSelectionMode && (<button onClick={openNewCardEditor} className="fixed bottom-6 right-6 z-40 bg-stone-800 hover:bg-stone-900 text-white p-4 rounded-full shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center"><Plus size={24} /></button>)}
            </div>
            
            {activeModalCard && (
                <div 
                    className={`fixed inset-y-0 left-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-stone-900/20 backdrop-blur-[1px] animate-in fade-in duration-200 ${sidePanelOpen ? 'right-0 md:right-[500px] min-w-[auto]' : 'right-0'}`} 
                    onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }}
                >
                    <div className="w-full max-w-2xl h-auto max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl rounded-lg bg-paper pointer-events-auto">
                        <Editor 
                            initialCard={activeModalCard}
                            allTitles={allTitles}
                            availableStacks={allStacks.map(s => s.name)}
                            dateFormat={dateFormat}
                            onSave={(data, close) => {
                                handleSaveCard(data);
                                if (close) handleCloseModal();
                            }}
                            onCancel={handleCloseModal}
                            onDelete={() => handleDeleteCard(activeModalCard.id)}
                            onNavigate={(term, e) => handleLinkClick(term, e)} 
                            backlinks={modalBacklinks} 
                            onMoveToSide={() => handleMoveToSide(activeModalCard.id)}
                        />
                    </div>
                </div>
            )}
          </main>

          {activeSideCard && (
            <aside className="w-full md:w-[500px] md:flex-none border-l border-stone-300 bg-paper shadow-xl z-40 overflow-hidden transition-all duration-200 ease-in-out relative h-full">
                 <div className="h-full">
                    <Editor 
                        initialCard={activeSideCard}
                        allTitles={allTitles}
                        availableStacks={allStacks.map(s => s.name)}
                        dateFormat={dateFormat}
                        onSave={(data, close) => {
                            handleSaveCard(data);
                            if (close) handleCloseSide(); // サイドパネルだけ閉じる
                        }}
                        onCancel={handleCloseSide}
                        onDelete={() => handleDeleteCard(activeSideCard.id)}
                        onNavigate={(term, e) => handleLinkClick(term, e)} 
                        backlinks={sideBacklinks}
                    />
                </div>
            </aside>
          )}
      </div>
    </div>
  );
}