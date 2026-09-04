import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  Trash2, 
  Save, 
  Info,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ApiSettings } from '../../types';

export const APIKeysModal: React.FC = () => {
  const { 
    isApiSettingsModalOpen, 
    setIsApiSettingsModalOpen, 
    apiSettings, 
    updateApiSettings, 
    clearApiSettings,
    showToast 
  } = useApp();

  const [formData, setFormData] = useState<ApiSettings>({
    ...apiSettings,
    qwenApiKey: apiSettings.qwenApiKey || '',
    preferredAiProvider: apiSettings.preferredAiProvider || 'groq'
  });

  // Sync state whenever modal opens or context changes
  useEffect(() => {
    if (isApiSettingsModalOpen) {
      setFormData({
        ...apiSettings,
        qwenApiKey: apiSettings.qwenApiKey || '',
        preferredAiProvider: apiSettings.preferredAiProvider || 'groq'
      });
    }
  }, [isApiSettingsModalOpen, apiSettings]);

  if (!isApiSettingsModalOpen) return null;

  const handleSave = () => {
    updateApiSettings(formData);
    setIsApiSettingsModalOpen(false);
    showToast('✓ Clés API enregistrées avec succès !');
  };

  const handleClear = () => {
    clearApiSettings();
    setFormData({
      tmdbApiKey: '',
      omdbApiKey: '',
      traktClientId: '',
      openaiApiKey: '',
      anthropicApiKey: '',
      xaiApiKey: '',
      groqApiKey: '',
      qwenApiKey: '',
      preferredAiProvider: 'qwen',
      notchPayPublicKey: '',
      notchPaySecretKey: '',
      notchPayHashKey: '',
      apiMode: 'production'
    });
  };

  const fieldsConfig: Array<{
    id: keyof ApiSettings;
    label: string;
    placeholder: string;
    type?: 'text' | 'password';
    helpKey: string;
  }> = [
    {
      id: 'qwenApiKey',
      label: 'Clé API Qwen / DashScope (Alibaba Cloud)',
      placeholder: 'sk-...',
      type: 'password',
      helpKey: 'cinéia_qwen_api_key'
    },
    {
      id: 'groqApiKey',
      label: 'Clé API Groq (Llama, gratuite)',
      placeholder: 'gsk_...',
      type: 'password',
      helpKey: 'cinéia_groq_key'
    },
    {
      id: 'tmdbApiKey',
      label: 'Clé API TMDB (source principale)',
      placeholder: 'Clé API TMDB v3',
      type: 'password',
      helpKey: 'cinéia_tmdb_key'
    },
    {
      id: 'omdbApiKey',
      label: 'Clé API OMDb (notes IMDb / Rotten Tomatoes)',
      placeholder: 'Clé OMDb (ex: 8a... / e9...)',
      type: 'password',
      helpKey: 'cinéia_omdb_key'
    },
    {
      id: 'traktClientId',
      label: 'Client ID Trakt.tv (tendances)',
      placeholder: 'client id',
      type: 'text',
      helpKey: 'cinéia_trakt_id'
    },
    {
      id: 'openaiApiKey',
      label: 'Clé API OpenAI (ChatGPT / GPT-4o)',
      placeholder: 'sk-...',
      type: 'password',
      helpKey: 'cinéia_openai_key'
    },
    {
      id: 'anthropicApiKey',
      label: 'Clé API Anthropic (Claude)',
      placeholder: 'sk-ant-...',
      type: 'password',
      helpKey: 'cinéia_anthropic_key'
    },
    {
      id: 'xaiApiKey',
      label: 'Clé API xAI (Grok)',
      placeholder: 'xai-...',
      type: 'password',
      helpKey: 'cinéia_xai_key'
    },
    {
      id: 'notchPayPublicKey',
      label: 'Notch Pay — Clé publique',
      placeholder: 'pk....',
      type: 'text',
      helpKey: 'cinéia_notch_pk'
    },
    {
      id: 'notchPaySecretKey',
      label: 'Notch Pay — Clé secrète',
      placeholder: 'sk....',
      type: 'password',
      helpKey: 'cinéia_notch_sk'
    },
    {
      id: 'notchPayHashKey',
      label: 'Notch Pay — Clé hash / signature',
      placeholder: 'hsk....',
      type: 'password',
      helpKey: 'cinéia_notch_hash'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#0f141f] border border-[#1e293b] shadow-2xl overflow-hidden text-slate-100 p-6 sm:p-8 space-y-6 max-h-[92vh] flex flex-col justify-between">
        
        {/* Close Button */}
        <button
          onClick={() => setIsApiSettingsModalOpen(false)}
          className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-sm">
              <Key className="w-5 h-5" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Configuration des Clés API Éliciné
            </h2>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Stockées dans votre navigateur (localStorage) pour alimenter le moteur Éliciné. Les modèles IA disponibles sont interrogés avec cascade automatique.
          </p>
        </div>

        {/* Preferred AI Engine Selector */}
        <div className="p-3.5 rounded-2xl bg-[#07090e] border border-[#1e293b] space-y-2 flex-shrink-0">
          <label className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Moteur de recherche IA prioritaire
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, preferredAiProvider: 'qwen' }))}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${
                (formData.preferredAiProvider || 'qwen') === 'qwen'
                  ? 'bg-sky-500/20 border-sky-400 text-white shadow-sm'
                  : 'bg-[#0f141f] border-[#1e293b] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Qwen AI (Alibaba Cloud)</span>
              {(formData.preferredAiProvider || 'qwen') === 'qwen' && <CheckCircle2 className="w-4 h-4 text-sky-400" />}
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, preferredAiProvider: 'groq' }))}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${
                formData.preferredAiProvider === 'groq'
                  ? 'bg-sky-500/20 border-sky-400 text-white shadow-sm'
                  : 'bg-[#0f141f] border-[#1e293b] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Groq AI (Llama 3.1)</span>
              {formData.preferredAiProvider === 'groq' && <CheckCircle2 className="w-4 h-4 text-sky-400" />}
            </button>
          </div>
        </div>

        {/* Scrollable Fields Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 my-2">
          {fieldsConfig.map((f) => {
            const val = (formData[f.id] as string) || '';
            return (
              <div key={f.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200">
                    {f.label}
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {f.helpKey}
                  </span>
                </div>

                <div className="relative">
                  <input
                    type={f.type || 'text'}
                    placeholder={f.placeholder}
                    value={val}
                    onChange={(e) => setFormData(prev => ({ ...prev, [f.id]: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#07090e] border border-[#1e293b] text-xs text-white placeholder-slate-600 font-mono outline-none focus:border-sky-500 transition-colors"
                  />
                  {val.trim().length > 0 && (
                    <div className="absolute right-3 top-2.5 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Informative Box at Bottom */}
        <div className="p-3.5 rounded-2xl bg-[#07090e] border border-[#1e293b] flex items-start gap-2.5 text-xs text-slate-400 flex-shrink-0">
          <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Qwen AI et Groq AI sont interrogés avec repli automatique vers les données TMDB pour garantir zéro écran noir.
          </p>
        </div>

        {/* Footer Buttons: "Effacer" on left, "Enregistrer" on right */}
        <div className="flex items-center justify-between gap-3 pt-2 flex-shrink-0">
          
          {/* Effacer Button */}
          <button
            type="button"
            onClick={handleClear}
            className="px-5 py-3 rounded-2xl bg-[#07090e] hover:bg-slate-900 border border-[#1e293b] text-slate-400 hover:text-red-400 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Effacer</span>
          </button>

          {/* Enregistrer Button (#0ea5e9) */}
          <button
            type="button"
            onClick={handleSave}
            className="px-8 py-3 rounded-2xl bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-bold text-xs sm:text-sm shadow-[0_0_25px_rgba(14,165,233,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 uppercase tracking-wide cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Enregistrer</span>
          </button>

        </div>

      </div>

    </div>
  );
};
