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
}

export type ViewMode = 'All' | 'GTD' | 'Stack' | 'Type';

export interface PoicStats {
  total: number;
  record: number;
  discovery: number;
  gtdActive: number; // 未完了のみ (メニュー用)
  gtdTotal: number;  // 完了含むすべて (4タグカウント用)
  reference: number;
}
