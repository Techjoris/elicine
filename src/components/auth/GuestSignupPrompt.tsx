import React from 'react';
import { X } from 'lucide-react';

interface GuestSignupPromptProps {
  onSignup: () => void;
  onLogin: () => void;
  onDismiss: () => void;
}

/** An in-flow invitation shown after the search results. */
export const GuestSignupPrompt: React.FC<GuestSignupPromptProps> = ({ onSignup, onLogin, onDismiss }) => (
  <aside
    id="guest-signup-prompt"
    aria-label="Inscription gratuite"
    className="relative z-10 mx-auto w-full max-w-xl min-w-0 rounded-2xl border border-[#e50914]/30 bg-white p-4 shadow-2xl dark:bg-[#181818] sm:p-5"
  >
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Fermer l'invitation à s'inscrire"
      className="absolute right-3 top-3 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <X className="h-4 w-4" />
    </button>
    <p className="pr-8 text-base font-extrabold leading-snug text-slate-900 dark:text-white sm:text-lg">
      Inscris-toi gratuitement pour profiter de 3 recherches par jour.
    </p>
    <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
      Tes résultats restent disponibles juste au-dessus.
    </p>
    <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={onSignup}
        className="w-full min-w-0 rounded-xl bg-[#e50914] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-red-600/20 hover:bg-[#b80710] sm:w-auto"
      >
        S’inscrire gratuitement
      </button>
      <button
        type="button"
        onClick={onLogin}
        className="w-full rounded-xl px-4 py-2 text-sm font-medium text-slate-600 underline-offset-2 hover:underline dark:text-zinc-300 sm:w-auto"
      >
        Se connecter
      </button>
    </div>
  </aside>
);
