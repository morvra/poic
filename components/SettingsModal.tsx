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
          
          <input
            type="text"
            value={dateFormat}
            onChange={(e) => onDateFormatChange(e.target.value)}
            className="w-full border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono placeholder-stone-300"
            placeholder="YYYY/MM/DD ddd HH:mm"
          />

          <div className="mt-3 bg-stone-50 p-2 rounded border border-stone-100">
            <p className="text-xs text-stone-500 mb-1">プレビュー:</p>
            <p className="text-sm font-mono font-bold text-stone-800">
              {formatTimestampByPattern(now, dateFormat)}
            </p>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-bold text-stone-400 uppercase mb-2">使用可能なパターン</p>
            <ul className="text-xs text-stone-500 space-y-1 font-mono">
              <li><span className="font-bold text-stone-700">YYYY</span> : 年 (2024)</li>
              <li><span className="font-bold text-stone-700">MM</span> &nbsp; : 月 (01-12)</li>
              <li><span className="font-bold text-stone-700">DD</span> &nbsp; : 日 (01-31)</li>
              <li><span className="font-bold text-stone-700">ddd</span> : 曜日 (Sun-Sat)</li>
              <li><span className="font-bold text-stone-700">HH</span> &nbsp; : 時 (00-23)</li>
              <li><span className="font-bold text-stone-700">mm</span> &nbsp; : 分 (00-59)</li>
            </ul>
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