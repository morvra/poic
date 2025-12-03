import React from 'react';
import { X, Settings } from 'lucide-react';
import { formatTimestampByPattern } from '../utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateFormat: string;
  onDateFormatChange: (format: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  dateFormat, 
  onDateFormatChange 
}) => {
  if (!isOpen) return null;

  const patterns = [
    'YYYY/MM/DD HH:mm',
    'YYYY-MM-DD HH:mm',
    'MM/DD/YYYY HH:mm',
    'DD/MM/YYYY HH:mm',
    'YYYY/MM/DD',
    'HH:mm'
  ];

  const now = new Date();

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-[1px]">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full border border-stone-200 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <Settings size={20} />
            設定
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X size={20} />
          </button>
        </div>

        <div className="mb-6">
          <label className="text-xs font-bold text-stone-400 uppercase block mb-3">タイムスタンプ形式 (Alt + T)</label>
          <div className="space-y-2">
            {patterns.map((pattern) => (
              <label 
                key={pattern}
                className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                  dateFormat === pattern 
                    ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' 
                    : 'bg-white border-stone-200 hover:bg-stone-50'
                }`}
              >
                <input
                  type="radio"
                  name="dateFormat"
                  value={pattern}
                  checked={dateFormat === pattern}
                  onChange={() => onDateFormatChange(pattern)}
                  className="text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-stone-700">{pattern}</span>
                  <span className="text-xs text-stone-400">例: {formatTimestampByPattern(now, pattern)}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-stone-800 text-white hover:bg-stone-900 font-medium transition-colors"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
};