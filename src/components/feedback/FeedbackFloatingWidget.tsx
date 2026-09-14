import React, { useState } from 'react';
import { Clapperboard, Sparkles, MessageSquareHeart, HelpCircle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface FeedbackFloatingWidgetProps {
  onOpenFeedback: (category?: any) => void;
}

export const FeedbackFloatingWidget: React.FC<FeedbackFloatingWidgetProps> = ({ onOpenFeedback }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDismissedTemporarily, setIsDismissedTemporarily] = useState(false);

  if (isDismissedTemporarily) return null;

  return (
    <div 
      className="fixed bottom-6 left-6 z-40 flex items-center group select-none"
      aria-label="Widget Signalement & Suggestions Éliciné"
    >
      <div className="relative flex items-center">
        {/* Main Floating Trigger Button */}
        <button
          type="button"
          onClick={() => onOpenFeedback()}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="flex items-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-full bg-[#121214]/90 hover:bg-[#1c1c20] text-white border border-white/15 hover:border-white/30 shadow-xl shadow-black/80 backdrop-blur-xl transition-all duration-300 transform active:scale-95 group-hover:scale-105 cursor-pointer"
          title="Signaler un film manquant, un bug ou proposer une idée"
        >
          {/* Animated Clapper Icon */}
          <div className="relative flex items-center justify-center">
            <Clapperboard className="w-4 h-4 text-[#e50914] group-hover:rotate-6 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
          </div>

          {/* Label text that expands neatly */}
          <span className="text-xs font-bold text-zinc-200 group-hover:text-white tracking-wide">
            Suggestions &amp; Retours
          </span>

          <span className="hidden sm:inline-block text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-zinc-400 border border-white/5">
            24h
          </span>
        </button>
      </div>
    </div>
  );
};
