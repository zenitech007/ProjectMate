
import React from 'react';
import { History, ArrowRight, BookOpenText } from 'lucide-react';
import { TopicHistoryItem } from '../../types';

interface TopicHistoryProps {
  history: TopicHistoryItem[];
  onSelect: (item: TopicHistoryItem) => void;
}

const TopicHistory: React.FC<TopicHistoryProps> = ({ history, onSelect }) => {
  if (history.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {history.map((item) => (
          <button 
            key={item.id}
            onClick={() => onSelect(item)}
            className="w-full bg-white border border-slate-100 rounded-2xl p-4 text-left shadow-sm hover:border-green-200 hover:shadow-md transition-all group flex items-start justify-between"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-[9px] font-black text-green-700 uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded-full">
                  {item.department}
                </span>
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
              
              <div className="space-y-1.5">
                {item.topics.slice(0, 1).map((t, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <BookOpenText className="h-3 w-3 text-slate-300 shrink-0" />
                    <p className="text-xs text-slate-500 font-bold truncate group-hover:text-green-700 transition-colors">{t.title}</p>
                  </div>
                ))}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-200 group-hover:text-green-700 group-hover:translate-x-1 transition-all ml-4 mt-1" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default TopicHistory;
