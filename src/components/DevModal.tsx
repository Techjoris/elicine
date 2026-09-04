import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  Terminal, 
  Save, 
  Trash2, 
  ShieldCheck, 
  Sparkles, 
  Eye, 
  EyeOff, 
  CreditCard, 
  Globe 
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export interface DevModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DevModal: React.FC<DevModalProps> = ({ isOpen, onClose }) => {
  const { apiSettings, updateApiSettings, showToast } = useApp();

  const [tmdbKey, setTmdbKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [qwenKey, setQwenKey] = useState('');
  const [preferredAi, setPreferredAi] = useState<'qwen' | 'groq' | 'openai' | 'anthropic' | 'xai'>('qwen');

  const [notchPk, setNotchPk] = useState('');
  const [notchSk, setNotchSk] = useState('');
  const [notchHash, setNotchHash] = useState('');
  const [apiMode, setApiMode] = useState<'production' | 'test'>('production');

  const [nordvpnUrl, setNordvpnUrl] = useState('');
  const [surfsharkUrl, setSurfsharkUrl] = useState('');

  const [showKeys, setShowKeys] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  // Charger les clés existantes
  useEffect(() => {
    if (isOpen) {
      setTmdbKey(
        localStorage.getItem('tmdb_api_key') || 
        localStorage.getItem('elicine_tmdb_key') || 
        apiSettings.tmdbApiKey || 
        ''
      );
      setGroqKey(
        localStorage.getItem('groq_api_key') || 
        localStorage.getItem('elicine_groq_key') || 
        apiSettings.groqApiKey || 
        ''
      );
      setQwenKey(
        localStorage.getItem('qwen_api_key') || 
        localStorage.getItem('cinéia_qwen_api_key') || 
        apiSettings.qwenApiKey || 
        ''
      );
      setPreferredAi(
        (localStorage.getItem('cinéia_preferred_ai_provider') as any) || 
        apiSettings.preferredAiProvider || 
        'qwen'
      );

      setNotchPk(
        localStorage.getItem('notch_public_key') || 
        localStorage.getItem('cinéia_notch_pk') || 
        apiSettings.notchPayPublicKey || 
        ''
      );
      setNotchSk(
        localStorage.getItem('cinéia_notch_sk') || 
        apiSettings.notchPaySecretKey || 
        ''
      );
      setNotchHash(
        localStorage.getItem('cinéia_notch_hash') || 
        apiSettings.notchPayHashKey || 
        ''
      );
      const savedMode = (localStorage.getItem('notch_mode') || localStorage.getItem('cinéia_api_mode') || apiSettings.apiMode || 'production');
      setApiMode(savedMode === 'sandbox' || savedMode === 'test' ? 'test' : 'production');

      setNordvpnUrl(
        localStorage.getItem('elicine_nordvpn_url') || 
        'https://nordvpn.com'
      );
      setSurfsharkUrl(
        localStorage.getItem('elicine_surfshark_url') || 
        'https://surfshark.com'
      );
    }
  }, [isOpen, apiSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    // 1. Sauvegarde TMDB
    const cleanTmdb = tmdbKey.trim();
    if (cleanTmdb) {
      localStorage.setItem('tmdb_api_key', cleanTmdb);
      localStorage.setItem('elicine_tmdb_key', cleanTmdb);
      localStorage.setItem('cinora_tmdb_key', cleanTmdb);
      localStorage.setItem('cinéia_tmdb_key', cleanTmdb);
      localStorage.setItem('cineia_tmdb_key', cleanTmdb);
    } else {
      localStorage.removeItem('tmdb_api_key');
      localStorage.removeItem('elicine_tmdb_key');
      localStorage.removeItem('cinéia_tmdb_key');
    }

    // 2. Sauvegarde Groq
    const cleanGroq = groqKey.trim();
    if (cleanGroq) {
      localStorage.setItem('groq_api_key', cleanGroq);
      localStorage.setItem('elicine_groq_key', cleanGroq);
      localStorage.setItem('elicine_groq_api_key', cleanGroq);
      localStorage.setItem('cinora_groq_api_key', cleanGroq);
      localStorage.setItem('cinéia_groq_key', cleanGroq);
    } else {
      localStorage.removeItem('groq_api_key');
      localStorage.removeItem('elicine_groq_key');
      localStorage.removeItem('cinéia_groq_key');
    }

    // 3. Sauvegarde Qwen
    const cleanQwen = qwenKey.trim();
    if (cleanQwen) {
      localStorage.setItem('qwen_api_key', cleanQwen);
      localStorage.setItem('cinéia_qwen_api_key', cleanQwen);
      localStorage.setItem('elicine_qwen_key', cleanQwen);
    } else {
      localStorage.removeItem('qwen_api_key');
      localStorage.removeItem('cinéia_qwen_api_key');
    }

    localStorage.setItem('cinéia_preferred_ai_provider', preferredAi);

    // 4. Sauvegarde NotchPay
    const cleanNotchPk = notchPk.trim();
    const cleanNotchSk = notchSk.trim();
    const cleanNotchHash = notchHash.trim();

    if (cleanNotchPk) {
      localStorage.setItem('notch_public_key', cleanNotchPk);
      localStorage.setItem('cinéia_notch_pk', cleanNotchPk);
    } else {
      localStorage.removeItem('notch_public_key');
      localStorage.removeItem('cinéia_notch_pk');
    }

    if (cleanNotchSk) {
      localStorage.setItem('cinéia_notch_sk', cleanNotchSk);
    } else {
      localStorage.removeItem('cinéia_notch_sk');
    }

    if (cleanNotchHash) {
      localStorage.setItem('cinéia_notch_hash', cleanNotchHash);
    } else {
      localStorage.removeItem('cinéia_notch_hash');
    }

    localStorage.setItem('notch_mode', apiMode);
    localStorage.setItem('cinéia_api_mode', apiMode);

    // 5. Sauvegarde Liens Affiliation VPN
    if (nordvpnUrl.trim()) {
      localStorage.setItem('elicine_nordvpn_url', nordvpnUrl.trim());
    }
    if (surfsharkUrl.trim()) {
      localStorage.setItem('elicine_surfshark_url', surfsharkUrl.trim());
    }

    // Mise à jour de l'état global AppContext
    updateApiSettings({
      ...apiSettings,
      tmdbApiKey: cleanTmdb,
      groqApiKey: cleanGroq,
      qwenApiKey: cleanQwen,
      preferredAiProvider: preferredAi,
      notchPayPublicKey: cleanNotchPk,
      notchPaySecretKey: cleanNotchSk,
      notchPayHashKey: cleanNotchHash,
      apiMode
    });

    setSavedToast(true);
    showToast('✓ Clés API développeur enregistrées avec succès !');

    setTimeout(() => {
      setSavedToast(false);
      onClose();
      window.location.reload();
    }, 600);
  };

  const handleResetDefaults = () => {
    if (confirm('Voulez-vous réinitialiser toutes les clés API locales ?')) {
      localStorage.removeItem('tmdb_api_key');
      localStorage.removeItem('elicine_tmdb_key');
      localStorage.removeItem('groq_api_key');
      localStorage.removeItem('elicine_groq_key');
      localStorage.removeItem('qwen_api_key');
      localStorage.removeItem('notch_public_key');
      localStorage.removeItem('cinéia_notch_pk');
      localStorage.removeItem('cinéia_notch_sk');
      localStorage.removeItem('cinéia_notch_hash');
      localStorage.removeItem('elicine_nordvpn_url');
      localStorage.removeItem('elicine_surfshark_url');
      showToast('Clés API réinitialisées.');
      setTimeout(() => window.location.reload(), 400);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl rounded-3xl bg-[#090d16] border border-amber-500/30 shadow-2xl p-6 sm:p-7 text-slate-200 flex flex-col gap-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Console Développeur
                </h2>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  ADMINISTRATION & CLÉS API
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Environnement sécurisé de configuration des clés API et affiliations.
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Visibility Toggle */}
        <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Champs sensibles masqués par défaut</span>
          </div>
          <button
            type="button"
            onClick={() => setShowKeys(!showKeys)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            {showKeys ? <EyeOff className="w-3.5 h-3.5 text-sky-400" /> : <Eye className="w-3.5 h-3.5 text-sky-400" />}
            <span>{showKeys ? 'Masquer' : 'Afficher'}</span>
          </button>
        </div>

        {/* SECTION 1: Moteurs IA & Recherche */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            1. Moteurs IA & Données Films
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Clé TMDB */}
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-[11px] font-semibold text-slate-400">
                Clé API TMDB (v3 auth)
              </label>
              <input
                type={showKeys ? 'text' : 'password'}
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                placeholder="Ex: a1b2c3d4e5f6g7h8..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Clé Groq */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Clé API Groq Cloud (gsk_...)
              </label>
              <input
                type={showKeys ? 'text' : 'password'}
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Clé Qwen */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Clé API Qwen / DashScope (sk-...)
              </label>
              <input
                type={showKeys ? 'text' : 'password'}
                value={qwenKey}
                onChange={(e) => setQwenKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Moteur prioritaire */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[11px] text-slate-400 font-medium">Moteur IA prioritaire :</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreferredAi('qwen')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  preferredAi === 'qwen' 
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300' 
                    : 'bg-slate-900 border border-slate-800 text-slate-400'
                }`}
              >
                Qwen AI
              </button>
              <button
                type="button"
                onClick={() => setPreferredAi('groq')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  preferredAi === 'groq' 
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300' 
                    : 'bg-slate-900 border border-slate-800 text-slate-400'
                }`}
              >
                Groq Cloud (Llama)
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 2: Paiement NotchPay */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              2. Passerelle de Paiement NotchPay
            </h3>

            {/* Mode Sandbox / Prod */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setApiMode('production')}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                  apiMode === 'production' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-500'
                }`}
              >
                Production
              </button>
              <button
                type="button"
                onClick={() => setApiMode('test')}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                  apiMode === 'test' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500'
                }`}
              >
                Sandbox
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-[11px] font-semibold text-slate-400">
                Clé Publique NotchPay (pk....)
              </label>
              <input
                type={showKeys ? 'text' : 'password'}
                value={notchPk}
                onChange={(e) => setNotchPk(e.target.value)}
                placeholder="pk.live.... ou pk.test...."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Clé Secrète NotchPay (sk....)
              </label>
              <input
                type={showKeys ? 'text' : 'password'}
                value={notchSk}
                onChange={(e) => setNotchSk(e.target.value)}
                placeholder="sk.live.... ou sk.test...."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Clé Signature / Hash
              </label>
              <input
                type={showKeys ? 'text' : 'password'}
                value={notchHash}
                onChange={(e) => setNotchHash(e.target.value)}
                placeholder="hsk...."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: Liens d'Affiliation VPN */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            3. Liens d'Affiliation VPN
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Lien Partenaire NordVPN
              </label>
              <input
                type="text"
                value={nordvpnUrl}
                onChange={(e) => setNordvpnUrl(e.target.value)}
                placeholder="https://nordvpn.com/..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Lien Partenaire Surfshark
              </label>
              <input
                type="text"
                value={surfsharkUrl}
                onChange={(e) => setSurfsharkUrl(e.target.value)}
                placeholder="https://surfshark.com/..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purger les clés</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-900 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savedToast ? 'Enregistré ! ✓' : 'Sauvegarder les clés'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevModal;
