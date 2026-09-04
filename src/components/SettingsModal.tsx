import React, { useState } from 'react';
import { useTranslation } from '../context/LanguageContext';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STREAMING_SERVICES = [
  { id: 'netflix', name: 'Netflix', icon: '🔴' },
  { id: 'prime', name: 'Prime Video', icon: '🔵' },
  { id: 'disney', name: 'Disney+', icon: '✨' },
  { id: 'canal', name: 'Canal+', icon: '⚫' },
  { id: 'apple', name: 'Apple TV+', icon: '🍏' },
  { id: 'max', name: 'Max (HBO)', icon: '🟣' }
];

const REGIONS = [
  { code: 'auto', label: 'Automatique (Détection IP)' },
  { code: 'CM', label: '🇨🇲 Cameroun' },
  { code: 'FR', label: '🇫🇷 France' },
  { code: 'US', label: '🇺🇸 États-Unis' },
  { code: 'CA', label: '🇨🇦 Canada' },
  { code: 'GB', label: '🇬🇧 Royaume-Uni' }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  // États des préférences utilisateur (sans clés API développeur)
  const [userSubs, setUserSubs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('elicine_user_subs') || '["netflix", "prime"]');
    } catch {
      return ['netflix', 'prime'];
    }
  });

  const [regionOverride, setRegionOverride] = useState<string>(() => {
    return localStorage.getItem('elicine_region_override') || 'auto';
  });

  const [aiTone, setAiTone] = useState<string>(() => {
    return localStorage.getItem('elicine_ai_curation') || 'balanced';
  });

  const [hideAdult, setHideAdult] = useState<boolean>(() => {
    return localStorage.getItem('elicine_safe_search') === 'true';
  });

  const [savedToast, setSavedToast] = useState(false);

  const toggleSub = (id: string) => {
    setUserSubs(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    localStorage.setItem('elicine_user_subs', JSON.stringify(userSubs));
    localStorage.setItem('elicine_region_override', regionOverride);
    localStorage.setItem('elicine_ai_curation', aiTone);
    localStorage.setItem('elicine_safe_search', hideAdult.toString());

    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
      window.location.reload(); // Applique les nouveaux filtres
    }, 600);
  };

  const handleClearHistory = () => {
    if (confirm("Voulez-vous réinitialiser votre historique de recherche ?")) {
      localStorage.removeItem('elicine_search_history');
      localStorage.removeItem('cinora_search_history');
      localStorage.removeItem('cineia_search_history');
      alert("Historique réinitialisé.");
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl p-6 text-slate-200 flex flex-col gap-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚙️</span>
            <h2 className="text-lg font-bold text-white tracking-wide">Paramètres de visionnage</h2>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 1. Mes Abonnements SVOD */}
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Mes abonnements de streaming
          </label>
          <p className="text-[11px] text-slate-400">
            Cochez vos plateformes pour identifier les films immédiatement accessibles :
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {STREAMING_SERVICES.map(sub => {
              const active = userSubs.includes(sub.id);
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => toggleSub(sub.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    active 
                      ? 'bg-sky-500/10 border-sky-500/50 text-white shadow-sm' 
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span>{sub.icon}</span>
                  <span>{sub.name}</span>
                  {active && <span className="ml-auto text-sky-400 font-bold">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Région / Catalogue Streaming */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Catalogue de streaming de référence
          </label>
          <select
            value={regionOverride}
            onChange={(e) => setRegionOverride(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
          >
            {REGIONS.map(reg => (
              <option key={reg.code} value={reg.code} className="bg-slate-950 text-white">
                {reg.label}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Sensibilité de l'Algorithme IA */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Curation & Profil Cinéphile de l'IA
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'popular', label: 'Grand Public', desc: 'Succès & Classiques' },
              { id: 'balanced', label: 'Équilibré', desc: 'Mix Idéal' },
              { id: 'auteur', label: 'Pointu / Indé', desc: 'Pépites rares' }
            ].map(tone => (
              <button
                key={tone.id}
                type="button"
                onClick={() => setAiTone(tone.id)}
                className={`flex flex-col p-2 rounded-xl border text-left transition-all cursor-pointer ${
                  aiTone === tone.id 
                    ? 'bg-sky-500/10 border-sky-500/60 text-white' 
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-[11px] font-bold text-white">{tone.label}</span>
                <span className="text-[9px] text-slate-400 mt-0.5">{tone.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Données et Historique */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <div>
            <p className="text-xs font-semibold text-slate-300">Historique local</p>
            <p className="text-[10px] text-slate-500">Efface les recherches et préférences en cache</p>
          </div>
          <button
            type="button"
            onClick={handleClearHistory}
            className="px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[11px] font-medium transition-colors cursor-pointer"
          >
            Réinitialiser
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-900 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-lg shadow-sky-500/20 cursor-pointer"
          >
            {savedToast ? 'Enregistré ! ✓' : 'Appliquer les réglages'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
