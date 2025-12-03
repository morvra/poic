export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
};

export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatTimeShort = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getRelativeDateLabel = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const cardDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (cardDate.getTime() === today.getTime()) return 'Today';
  if (cardDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (cardDate.getTime() < today.getTime()) return 'Overdue';
  return 'Upcoming';
};

const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Customizable timestamp formatting with Day of Week
export const formatTimestampByPattern = (date: Date, pattern: string): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const day = DAYS_EN[date.getDay()];

  switch (pattern) {
    case 'YYYY/MM/DD HH:mm':
      return `${yyyy}/${mm}/${dd} ${day} ${hh}:${min}`;
    case 'YYYY-MM-DD HH:mm':
      return `${yyyy}-${mm}-${dd} ${day} ${hh}:${min}`;
    case 'MM/DD/YYYY HH:mm':
      return `${mm}/${dd}/${yyyy} ${day} ${hh}:${min}`;
    case 'DD/MM/YYYY HH:mm':
      return `${dd}/${mm}/${yyyy} ${day} ${hh}:${min}`;
    case 'YYYY/MM/DD':
      return `${yyyy}/${mm}/${dd} ${day}`;
    case 'HH:mm':
      return `${hh}:${min}`; // Time only
    default:
      return `${yyyy}/${mm}/${dd} ${day} ${hh}:${min}`;
  }
};

// Helper for GTD Due Date (YYYY/MM/DD Sun)
export const formatDateWithDay = (timestamp: number): string => {
    const date = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const day = DAYS_EN[date.getDay()];
    return `${yyyy}/${mm}/${dd} ${day}`;
};
