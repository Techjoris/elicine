import React, { useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Film, 
  Crown, 
  Mail, 
  ArrowLeft, 
  CheckCircle2, 
  ExternalLink, 
  FileText, 
  EyeOff, 
  Sparkles,
  HelpCircle,
  Database,
  Smartphone
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ElicineLogo } from '../ElicineLogo';

export const TermsView: React.FC = () => {
  const { setActiveView } = useApp();

  useEffect(() => {
    // Si une ancre est présente dans l'URL (#privacy, #pro, #contact...), scroller vers celle-ci
    if (typeof window !== 'undefined' && window.location.hash) {
      const id = window.location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleBackHome = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
    setActiveView('home');
  };

  const scrollToSection = (id: string) => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', `/terms#${id}`);
    }
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      
      {/* Navigation retour & En-tête */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBackHome}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-950 dark:hover:text-white text-xs font-bold transition-all shadow-sm cursor-pointer select-none group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Retour à l'accueil</span>
        </button>

        <span className="text-[11px] text-slate-500 dark:text-zinc-500 font-medium">
          Dernière mise à jour : 7 septembre 2026
        </span>
      </div>

      {/* Hero Banner Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-blue-50/30 dark:from-zinc-900 dark:via-zinc-900 dark:to-blue-950/20 border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex items-center gap-2.5 text-blue-600 dark:text-cyan-400 text-xs font-black uppercase tracking-wider">
          <FileText className="w-4 h-4" />
          <span>Mentions Légales &amp; Transparence</span>
        </div>

        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Conditions d'Utilisation &amp; Politique de Confidentialité
        </h1>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed max-w-2xl">
          Chez <strong>Éliciné</strong>, nous accordons une importance primordiale à la clarté de notre service, 
          à la protection de votre vie privée et à la sécurité de vos données. Cette page décrit l'ensemble de nos engagements.
        </p>

        {/* Sommaire rapide / Boutons d'ancrage */}
        <div className="flex flex-wrap gap-2 pt-2">
          {[
            { id: 'service', label: '1. Service Proposé' },
            { id: 'privacy', label: '2. Données & OAuth Google' },
            { id: 'pro', label: '3. Pass Pro & Paiements' },
            { id: 'intellectual-property', label: '4. Propriété & APIs' },
            { id: 'contact', label: '5. Contact' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => scrollToSection(tab.id)}
              className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1 : Service Proposé */}
      <section id="service" className="scroll-mt-20 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              1. Service Proposé par Éliciné
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Guide cinéphile intelligent et moteur de recherche sémantique
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
          <p>
            <strong>Éliciné</strong> est une application web et PWA mobile dédiée à la découverte cinématographique. 
            Elle offre :
          </p>
          <ul className="space-y-2 pl-4 list-disc marker:text-blue-500">
            <li>
              <strong>Un moteur de recherche en langage naturel assisté par IA</strong> : interprétation d'émotions, d'ambiances ou de souvenirs flous pour recommander les œuvres les plus pertinentes.
            </li>
            <li>
              <strong>L'indexation des disponibilités de streaming légal</strong> : indication en temps réel des plateformes SVOD (Netflix, Prime Video, Disney+, Canal+, etc.) et boutiques VOD dans votre zone géographique.
            </li>
            <li>
              <strong>Des outils personnalisés</strong> : constitution d'une liste de films ("Ma Liste"), gestion d'alertes de sortie et synchronisation de compte.
            </li>
          </ul>

          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1 mt-3">
            <p className="font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span>Rôle exclusif d'intermédiaire et guide d'orientation</span>
            </p>
            <p className="text-xs leading-relaxed">
              Éliciné n'est pas un service d'hébergement ni de diffusion vidéo. 
              <strong> Aucun fichier vidéo protégé n'est stocké ni diffusé sur nos serveurs.</strong> 
              Les boutons de lecture redirigent l'utilisateur directement et exclusivement vers les plateformes légales détentrices des droits (avec ouverture dans un nouvel onglet ou dans les applications officielles).
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2 : Protection des Données & OAuth Google */}
      <section id="privacy" className="scroll-mt-20 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              2. Protection des Données Personnelles &amp; Confidentialité
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Architecture sans mot de passe, authentification Google OAuth via Supabase
            </p>
          </div>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
          
          {/* Card: Aucun mot de passe stocké */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-300 flex items-start gap-3">
            <EyeOff className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm">
                Authentification Google OAuth sécurisée — Zéro mot de passe stocké
              </p>
              <p className="text-xs leading-relaxed">
                Lorsque vous utilisez la connexion <strong>"Continuer avec Google"</strong>, l'authentification est déléguée aux serveurs sécurisés de Google via notre infrastructure <strong>Supabase</strong>. 
                Éliciné ne reçoit, ne stocke et n'aura jamais accès à votre mot de passe Google.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-500" />
              <span>Données collectées et finalités :</span>
            </h3>
            <ul className="space-y-2 pl-4 list-disc marker:text-emerald-500">
              <li>
                <strong>Profil utilisateur Google</strong> : votre adresse email, votre nom complet d'affichage et l'URL de votre photo de profil publique. Ces données servent uniquement à personnaliser votre interface et vous identifier.
              </li>
              <li>
                <strong>Ma Liste (Watchlist) &amp; Alertes</strong> : les identifiants de films que vous choisissez d'enregistrer pour vous permettre de les retrouver sur tous vos appareils.
              </li>
              <li>
                <strong>Préférences locales (PWA)</strong> : votre langue d'interface préférée (FR / EN / ES), votre thème (clair / sombre) et votre pays de streaming détecté sont stockés localement sur votre terminal (`localStorage`) pour un affichage instantané hors-ligne.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-500" />
              <span>Absence totale de vente de données :</span>
            </h3>
            <p>
              Éliciné s'interdit formellement de vendre, louer ou commercialiser vos données personnelles à des tiers ou des régies publicitaires. Vos données ne sont utilisées que pour le fonctionnement strict du service.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-500" />
              <span>Vos droits (RGPD) :</span>
            </h3>
            <p>
              Conformément à la réglementation européenne sur la protection des données (RGPD), vous disposez à tout moment d'un droit d'accès, de rectification et de suppression totale de votre compte et de vos données. 
              Pour exercer ce droit, il vous suffit de nous contacter à <strong>contact@elicine.app</strong>. Votre compte et l'ensemble des éléments associés seront définitivement supprimés sous 48 heures.
            </p>
          </div>

        </div>
      </section>

      {/* SECTION 3 : Abonnement Pass Pro & Paiements */}
      <section id="pro" className="scroll-mt-20 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              3. Abonnement Pass Pro &amp; Modalités Financières
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Conditions de souscription, tarification et sécurité des paiements
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
          <p>
            Le <strong>Pass Pro Éliciné</strong> est une formule optionnelle payante permettant de bénéficier d'une expérience enrichie : requêtes d'intelligence artificielle étendues, accès prioritaire aux analyses critiques et alertes instantanées.
          </p>

          <ul className="space-y-2 pl-4 list-disc marker:text-amber-500">
            <li>
              <strong>Périodes &amp; Tarifs</strong> : Disponible en formule mensuelle ou annuelle (avec 30% d'économie). Les tarifs sont affichés en toute transparence dans la devise sélectionnée (EUR, USD, XAF ou XOF).
            </li>
            <li>
              <strong>Sécurité des transactions</strong> : 
              Tous les paiements sont exécutés via des processeurs tiers certifiés PCI-DSS (PayPal pour les cartes bancaires et comptes PayPal, Notch Pay pour les règlements Mobile Money en Afrique). 
              <strong> Éliciné n'a jamais accès à vos numéros de carte bancaire ni à vos informations bancaires confidentielles.</strong>
            </li>
            <li>
              <strong>Sans engagement</strong> : Vous pouvez résilier votre abonnement à tout moment en 1 clic. L'accès aux fonctionnalités Pro reste actif jusqu'au terme de la période préalablement réglée.
            </li>
          </ul>
        </div>
      </section>

      {/* SECTION 4 : Propriété Intellectuelle & Sources */}
      <section id="intellectual-property" className="scroll-mt-20 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              4. Propriété Intellectuelle &amp; APIs Partenaires
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Attribution des contenus et respect du droit des marques
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
          <p>
            Les données cinématographiques, affiches, synopsis et informations de casting sont fournies par l'API de <strong>The Movie Database (TMDB)</strong>. Ce produit utilise l'API TMDB mais n'est ni sponsorisé ni certifié par TMDB.
          </p>
          <p>
            Les marques, logos et visuels de plateformes tierces (Netflix, Disney+, Prime Video, Canal+, Google, etc.) appartiennent exclusivement à leurs propriétaires respectifs et ne sont cités qu'à des fins strictement informatives d'identification des catalogues légaux.
          </p>
        </div>
      </section>

      {/* SECTION 5 : Contact & Support */}
      <section id="contact" className="scroll-mt-20 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              5. Contact &amp; Assistance
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Une question ou une demande relative à vos données ?
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
          <p>
            Pour toute demande d'assistance, suggestion de partenariat, question sur vos données personnelles ou signalement :
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <a 
              href="mailto:contact@elicine.app" 
              className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-blue-500 transition-all flex items-center gap-3 group"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white text-xs group-hover:text-blue-500 transition-colors">
                  Contact Général
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                  contact@elicine.app
                </p>
              </div>
            </a>

            <a 
              href="mailto:techjoris@gmail.com" 
              className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-blue-500 transition-all flex items-center gap-3 group"
            >
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center flex-shrink-0">
                <ExternalLink className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white text-xs group-hover:text-cyan-400 transition-colors">
                  Support Technique &amp; DPO
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                  techjoris@gmail.com
                </p>
              </div>
            </a>
          </div>

          <p className="text-xs text-slate-500 dark:text-zinc-500 pt-2">
            Notre équipe s'engage à vous répondre sous 24 à 48 heures ouvrées.
          </p>
        </div>
      </section>

    </div>
  );
};

export default TermsView;
