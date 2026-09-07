import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';

export const TermsView: React.FC = () => {
  const { setActiveView } = useApp();
  const { t } = useTranslation();

  useEffect(() => {
    // Scroll en haut lors du chargement du document
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleBackToApp = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
    setActiveView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-3xl mx-auto py-6 sm:py-10 px-3 sm:px-4 text-zinc-700 dark:text-zinc-300 space-y-12 animate-fade-in font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-zinc-700">
      
      {/* 1. Bouton "← Retour" discret en haut à gauche */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/5 pb-5">
        <button
          type="button"
          onClick={handleBackToApp}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer select-none group font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>{t.terms.backBtn}</span>
        </button>

        <span className="text-[11px] text-zinc-500 font-mono">
          {t.terms.lastUpdatedLabel} : {t.terms.lastUpdated}
        </span>
      </div>

      {/* 2. En-tête éditorial dynamique */}
      <header className="space-y-4">
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-950 dark:text-white tracking-tight leading-snug">
          {t.terms.title}
        </h1>

        <div className="flex flex-wrap items-center gap-x-4 text-xs text-zinc-500 font-mono">
          <span>{t.terms.effectiveDateLabel} : {t.terms.effectiveDate}</span>
          <span>•</span>
          <span>{t.terms.lastUpdatedLabel} : {t.terms.lastUpdated}</span>
        </div>

        <div className="pt-2 space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {t.terms.intro.map((paragraph, idx) => (
            <p key={idx} className={idx === 1 ? 'text-zinc-900 dark:text-zinc-100 font-medium' : ''}>
              {paragraph.includes('https://elicine.app') ? (
                <>
                  {paragraph.split('https://elicine.app')[0]}
                  <a 
                    href="https://elicine.app" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white font-medium"
                  >
                    https://elicine.app
                  </a>
                  {paragraph.split('https://elicine.app')[1]}
                </>
              ) : (
                paragraph
              )}
            </p>
          ))}
        </div>
      </header>

      {/* 3. Document éditorial continu dynamique (10 Articles) */}
      <main className="space-y-10 divide-y divide-zinc-200 dark:divide-white/5">
        {t.terms.articles.map((article) => (
          <article key={article.id} id={article.id} className="pt-10 first:pt-0 space-y-4">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
              {article.title}
            </h2>

            <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {article.blocks.map((block, bIdx) => {
                if (block.type === 'paragraph' && block.text) {
                  return <p key={bIdx}>{block.text}</p>;
                }

                if (block.type === 'bullet_list' && block.items) {
                  return (
                    <ul key={bIdx} className="space-y-2 list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                      {block.items.map((item, iIdx) => (
                        <li key={iIdx}>
                          {item.label && (
                            <strong className="text-zinc-900 dark:text-zinc-100">
                              {item.label} :{' '}
                            </strong>
                          )}
                          {item.link ? (
                            <a 
                              href={item.link} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white"
                            >
                              {item.text}
                            </a>
                          ) : item.email ? (
                            <a 
                              href={`mailto:${item.email}`} 
                              className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white"
                            >
                              {item.text}
                            </a>
                          ) : (
                            item.text
                          )}
                        </li>
                      ))}
                    </ul>
                  );
                }

                if (block.type === 'ordered_list' && block.orderedItems) {
                  return (
                    <ol key={bIdx} className="space-y-1.5 list-decimal pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                      {block.orderedItems.map((oItem, oIdx) => (
                        <li key={oIdx}>{oItem}</li>
                      ))}
                    </ol>
                  );
                }

                if (block.type === 'callout') {
                  return (
                    <div key={bIdx} className="p-4 rounded-xl bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/5 text-zinc-800 dark:text-zinc-300 text-xs sm:text-sm leading-relaxed space-y-1">
                      {block.calloutText && (
                        <p className="font-medium text-zinc-950 dark:text-white">
                          {block.calloutText}
                        </p>
                      )}
                      {block.calloutSubtext && (
                        <p>{block.calloutSubtext}</p>
                      )}
                    </div>
                  );
                }

                if (block.type === 'subsection') {
                  return (
                    <div key={bIdx} className="space-y-2 pt-2">
                      {block.title && (
                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {block.title}
                        </h3>
                      )}
                      {block.text && <p>{block.text}</p>}
                      {block.items && (
                        <ul className="space-y-2 list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                          {block.items.map((subItem, sIdx) => (
                            <li key={sIdx}>
                              {subItem.label && (
                                <strong className="text-zinc-900 dark:text-zinc-100">
                                  {subItem.label} :{' '}
                                </strong>
                              )}
                              {subItem.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      {block.orderedItems && (
                        <ol className="space-y-1.5 list-decimal pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                          {block.orderedItems.map((oItem, oIdx) => (
                            <li key={oIdx}>{oItem}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </article>
        ))}
      </main>

      {/* 4. Pied de document : retour à l'application */}
      <div className="pt-8 border-t border-zinc-200 dark:border-white/5 flex items-center justify-between text-xs text-zinc-500">
        <button
          type="button"
          onClick={handleBackToApp}
          className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer select-none group font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>{t.terms.backToApp}</span>
        </button>

        <span>{t.terms.copyright}</span>
      </div>

    </div>
  );
};

export default TermsView;
