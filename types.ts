export enum CardType {
  Record = 'Record',     // Blue: Daily logs, facts
  Discovery = 'Discovery', // Red: Ideas, insights
  GTD = 'GTD',           // Green: Tasks, todos
  Reference = 'Reference' // Yellow: Quotes, books, links
}

export interface Card {
  id: string;
  type: CardType;
  title: string;
  body: string;
  createdAt: number; // Timestamp
  updatedAt: number;
  dueDate?: number; // Only for GTD
  completed?: boolean; // Only for GTD
  stacks: string[]; // "Task Forces" or Themes
  isDeleted?: boolean;
  deletedAt?: number;
  isPinned?: number | boolean; // Timestamp of when it was pinned
  outgoingLinks?: string[];
}

export type ViewMode = 'All' | 'GTD' | 'Stack' | 'Type';

export interface PoicStats {
  total: number;
  record: number;
  discovery: number;
  gtdActive: number;
  gtdTotal: number;
  reference: number;
}

export interface SyncMetadata {
  lastSyncTime: number;
  localChanges: string[]; // 変更されたカードのIDリスト
}