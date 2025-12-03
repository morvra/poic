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
