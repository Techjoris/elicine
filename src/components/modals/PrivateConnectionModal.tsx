import React, { useEffect } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import { getVpnAffiliateUrl, VPN_PARTNERS } from '../../config/affiliates';

interface PrivateConnectionModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Discreet secondary information about private connections while travelling.
 * The solution name is only revealed here, never in the film sheet.
 */
export const PrivateConnectionModal: React.FC<PrivateConnectionModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#121317] shadow-2xl p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="private-connection-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </span>
            <div>
              <h2 id="private-connection-title" className="text-sm font-bold text-slate-900 dark:text-white">
                {t.privateConnectionTitle}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                {t.privateConnectionText}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            aria-label={t.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
            {VPN_PARTNERS.nordvpn.name}
          </p>
          <a
            href={getVpnAffiliateUrl('nordvpn')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-zinc-100 hover:border-slate-400 dark:hover:border-white/25 transition-colors"
          >
            {t.privateConnectionCta}
          </a>
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-slate-400 dark:text-zinc-500">
          {t.affiliateDisclosure}
        </p>
      </div>
    </div>
  );
};

export default PrivateConnectionModal;
