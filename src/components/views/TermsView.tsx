import React, { useEffect } from 'react';
import { 
  ArrowLeft, 
  ShieldCheck, 
  Lock, 
  Film, 
  Crown, 
  Mail, 
  FileText, 
  Sparkles,
  Database,
  Server,
  AlertTriangle,
  Scale
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ElicineLogo } from '../ElicineLogo';

export const TermsView: React.FC = () => {
  const { setActiveView } = useApp();

  useEffect(() => {
    // Si une ancre est présente dans l'URL (#article-1, #article-2...), scroller vers celle-ci
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

  const handleBackToApp = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
    setActiveView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-16 text-slate-200">
      
      {/* 1. Bouton "Retour à l'application" & Date */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={handleBackToApp}
          className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#0e1422] hover:bg-[#161f33] border border-white/10 hover:border-cyan-500/40 text-slate-200 hover:text-white text-xs font-bold transition-all shadow-md cursor-pointer select-none group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-cyan-400" />
          <span>Retour à l'application</span>
        </button>

        <div className="text-[11px] text-slate-400 font-medium">
          Dernière mise à jour : 7 septembre 2026
        </div>
      </div>

      {/* 2. En-tête Principal */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#0d1322] via-[#090d16] to-[#0d1627] border border-white/10 shadow-2xl space-y-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center justify-between flex-wrap gap-3">
          <ElicineLogo variant="full" size="md" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-cyan-400 text-xs font-bold">
            <FileText className="w-3.5 h-3.5" />
            <span>Document Contractuel Officiel</span>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
            CONDITIONS GÉNÉRALES D'UTILISATION ET POLITIQUE DE CONFIDENTIALITÉ
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1">
            <span>Date d'entrée en vigueur : <strong>7 septembre 2026</strong></span>
            <span>•</span>
            <span>Dernière mise à jour : <strong>7 septembre 2026</strong></span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#080c14] border border-white/5 text-xs sm:text-sm text-slate-300 leading-relaxed space-y-3">
          <p>
            Les présentes Conditions Générales d'Utilisation et de Confidentialité (ci-après les « CGU ») encadrent juridiquement l'accès et l'utilisation de la plateforme numérique et application web progressive (PWA) Éliciné (ci-après le « Service »), accessible à l'adresse officielle <a href="https://elicine.app" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">https://elicine.app</a> ainsi que sur tous ses sous-domaines associés.
          </p>
          <p className="font-semibold text-white">
            L'accès au Service, la navigation sur l'application et la création d'un compte utilisateur impliquent l'acceptation expresse, préalable et sans réserve de l'ensemble des stipulations contenues dans le présent document.
          </p>
        </div>

        {/* Sommaire des Articles pour navigation rapide */}
        <div className="space-y-2 pt-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Navigation directe par article :
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'article-1', label: 'Art. 1 : Éditeur & Hébergement' },
              { id: 'article-2', label: 'Art. 2 : Description du Service' },
              { id: 'article-3', label: 'Art. 3 : Compte & Google OAuth' },
              { id: 'article-4', label: 'Art. 4 : Données & Confidentialité' },
              { id: 'article-5', label: 'Art. 5 : Pass Pro & Paiements' },
              { id: 'article-6', label: 'Art. 6 : Propriété Intellectuelle' },
              { id: 'article-7', label: 'Art. 7 : Responsabilité' },
              { id: 'article-8', label: 'Art. 8 : Suppression de Compte' },
              { id: 'article-9', label: 'Art. 9 : Juridiction' },
            ].map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => scrollToSection(art.id)}
                className="px-2.5 py-1 rounded-lg bg-[#0e1422] hover:bg-slate-800 border border-white/5 hover:border-cyan-500/30 text-slate-300 hover:text-white text-[11px] font-medium transition-colors cursor-pointer"
              >
                {art.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ARTICLE 1 */}
      <section id="article-1" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 1 : IDENTIFICATION DE L'ÉDITEUR ET HÉBERGEMENT
          </h2>
        </div>

        <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed pl-1">
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Dénomination du service :</strong> Éliciné</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Site officiel :</strong> <a href="https://elicine.app" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">https://elicine.app</a></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Contact support &amp; réclamations :</strong> <a href="mailto:contact@elicine.app" className="text-cyan-400 hover:underline">contact@elicine.app</a></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Délégué à la protection des données (DPO / Privacy) :</strong> <a href="mailto:support@elicine.app" className="text-cyan-400 hover:underline">support@elicine.app</a></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Hébergement et infrastructures réseau :</strong> Serveurs cloud distribués haute disponibilité et protocoles de chiffrement SSL/TLS de bout en bout.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Base de données et gestion de sessions :</strong> Infrastructure gérée par Supabase (serveurs certifiés ISO 27001 et SOC 2 Type II).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Fournisseur de métadonnées cinématographiques :</strong> Métadonnées, résumés, crédits artistiques et affiches mis à disposition via l'API The Movie Database (TMDB).</span>
          </li>
        </ul>
      </section>

      {/* ARTICLE 2 */}
      <section id="article-2" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Film className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 2 : DESCRIPTION GÉNÉRALE DU SERVICE
          </h2>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p>
            Éliciné met à la disposition des passionnés et spectateurs de cinéma un environnement interactif dédié :
          </p>
          <ul className="space-y-2 pl-4 list-disc marker:text-cyan-400">
            <li>À la recherche sémantique et multicritère d'œuvres cinématographiques et audiovisuelles.</li>
            <li>À la génération de recommandations sur-mesure pilotées par intelligence artificielle.</li>
            <li>À la constitution d'espaces personnels (listes d'envies, favoris, historique de consultation).</li>
            <li>À la consultation d'informations contextuelles de disponibilité légale selon les zones géographiques.</li>
            <li>À la souscription d'offres numériques premium intitulées « Pass Pro ».</li>
          </ul>
          <p className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 text-slate-400 text-xs">
            Le Service s'efforce d'assurer la cohérence et la mise à jour constante des informations diffusées, mais ne peut garantir l'exactitude absolue des catalogues de plateformes tierces ni l'exhaustivité totale des métadonnées issues de sources externes.
          </p>
        </div>
      </section>

      {/* ARTICLE 3 */}
      <section id="article-3" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 3 : INSCRIPTION, AUTHENTIFICATION ET SÉCURITÉ DU COMPTE
          </h2>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <div className="space-y-2">
            <h3 className="font-bold text-white text-sm">
              3.1. Modalités d'authentification tierce (Google OAuth)
            </h3>
            <p>
              Afin de garantir un haut niveau de sécurité opérationnelle et d'éviter les risques inhérents au stockage de mots de passe non chiffrés, Éliciné recourt exclusivement au protocole d'authentification standard Google OAuth 2.0.
            </p>
            <ul className="space-y-2 pl-4 list-disc marker:text-emerald-400">
              <li>
                <strong>Absence de stockage des identifiants :</strong> Éliciné ne demande, ne consulte, ne traite et n'enregistre à aucun moment votre mot de passe de compte Google.
              </li>
              <li>
                <strong>Transmission de données autorisées :</strong> En sélectionnant « Continuer avec Google », l'utilisateur autorise Google à transmettre à notre gestionnaire d'identité les éléments minimaux nécessaires : identifiant unique de compte (Google UID), nom complet, adresse email validée et photographie de profil publique.
              </li>
            </ul>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h3 className="font-bold text-white text-sm">
              3.2. Responsabilité de l'utilisateur
            </h3>
            <p>
              Chaque utilisateur est responsable de la confidentialité de l'accès à son terminal physique (ordinateur, smartphone, tablette) et de la sécurisation de sa session. Toute action exécutée depuis un compte connecté est présumée émaner du titulaire du compte.
            </p>
          </div>
        </div>
      </section>

      {/* ARTICLE 4 */}
      <section id="article-4" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 4 : POLITIQUE DE CONFIDENTIALITÉ ET GESTION DES DONNÉES PERSONNELLES
          </h2>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p className="font-semibold text-white">
            Éliciné applique une politique de stricte minimisation des données : seules les données techniquement et fonctionnellement indispensables sont collectées.
          </p>

          <div className="space-y-2">
            <h3 className="font-bold text-white text-sm">
              4.1. Catégories de données traitées
            </h3>
            <ul className="space-y-2 pl-4 list-disc marker:text-cyan-400">
              <li>
                <strong>Données de profil utilisateur :</strong> Identifiant technique unique Supabase, adresse de messagerie électronique, nom d'affichage et image de profil transmise par le fournisseur d'accès.
              </li>
              <li>
                <strong>Données de session et préférences :</strong> Listes de films sauvegardés, préférences de consultation, statut de souscription au Pass Pro et historique d'interactions avec l'assistant IA.
              </li>
              <li>
                <strong>Données de connexion et localisation technique :</strong> Adresse IP technique (traitée temporairement pour la sécurité des réseaux), chaîne d'agent utilisateur (User-Agent), langue déclarée du navigateur et zone géographique approximative (pays/fuseau). Cette localisation sert exclusivement à configurer la langue par défaut de l'interface et à afficher les filtres pertinents relatifs aux sorties cinéma et catalogues de streaming régionaux.
              </li>
            </ul>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h3 className="font-bold text-white text-sm">
              4.2. Finalités précises des traitements
            </h3>
            <p>Les données recueillies font l'objet d'un traitement automatisé ayant pour buts :</p>
            <ol className="space-y-1.5 pl-4 list-decimal marker:text-cyan-400">
              <li>L'ouverture, le maintien sécurisé et la synchronisation de la session utilisateur sur PWA et navigateurs web.</li>
              <li>L'attribution et le déblocage instantané des fonctionnalités attachées au statut Pass Pro.</li>
              <li>La personnalisation algorithmique des suggestions cinématographiques.</li>
              <li>La prévention des abus, des accès non autorisés et des tentatives de fraude technique.</li>
            </ol>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h3 className="font-bold text-white text-sm">
              4.3. Absence totale de commercialisation des données
            </h3>
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              Éliciné applique une politique ferme d'interdiction de vente de données : aucune information personnelle, adresse email, historique de recherche ou profil d'utilisation n'est cédé, loué, vendu ou partagé avec des courtiers en données (data brokers), des annonceurs publicitaires ou des régies commerciales tierces.
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h3 className="font-bold text-white text-sm">
              4.4. Durée de conservation
            </h3>
            <p>
              Les données associées au compte utilisateur sont conservées pendant toute la durée d'activité du compte. En cas d'inactivité prolongée excédant vingt-quatre (24) mois consécutifs ou sur demande expresse de l'utilisateur, l'ensemble des données personnelles fait l'objet d'une purge définitive et irréversible de nos serveurs de production.
            </p>
          </div>
        </div>
      </section>

      {/* ARTICLE 5 */}
      <section id="article-5" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 5 : OFFRE « PASS PRO », CONDITIONS TARIFAIRES ET PAIEMENTS
          </h2>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <div className="space-y-2">
            <h3 className="font-bold text-white text-sm">
              5.1. Nature et périmètre de l'offre
            </h3>
            <p>
              L'utilisateur a la faculté de souscrire à l'option payante Pass Pro (tarif de référence : 1,99 $ USD ou contre-valeur en monnaie locale lors du règlement). Cette option permet de lever les limites d'interrogations de l'intelligence artificielle, d'activer des filtres de recherche avancés et d'accéder aux fonctionnalités prioritaires.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h3 className="font-bold text-white text-sm">
              5.2. Sécurité des transactions financières
            </h3>
            <p>
              Les règlements financiers s'opèrent via des prestataires de services de paiement agréés (cartes bancaires internationales et passerelles de paiement mobile régionales).
            </p>
            <ul className="space-y-2 pl-4 list-disc marker:text-amber-400">
              <li>
                <strong>Éliciné ne stocke, ne voit et n'archive aucun numéro de carte de paiement, cryptogramme visuel ou code secret bancaire.</strong>
              </li>
              <li>
                Les plateformes de paiement transmettent uniquement un jeton de validation technique (webhook token) certifiant le succès de la transaction pour permettre l'activation des droits Pro sur le compte de l'utilisateur.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ARTICLE 6 */}
      <section id="article-6" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 6 : PROPRIÉTÉ INTELLECTUELLE ET LICENCE D'UTILISATION
          </h2>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <div className="space-y-1.5">
            <h3 className="font-bold text-white text-sm">
              1. Marque et logiciel Éliciné :
            </h3>
            <p>
              L'appellation Éliciné, le nom de domaine <a href="https://elicine.app" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">https://elicine.app</a>, l'architecture logicielle, le design visuel, l'expérience utilisateur et les algorithmes développés en interne sont la propriété exclusive de l'éditeur et protégés par le droit d'auteur et les lois sur la propriété intellectuelle.
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-white/5">
            <h3 className="font-bold text-white text-sm">
              2. Contenus cinématographiques :
            </h3>
            <p>
              Les titres d'œuvres, affiches officielles, photographies de plateau, extraits de synopsis et éléments promotionnels de films appartiennent intégralement à leurs producteurs, réalisateurs, distributeurs et ayants droit respectifs. Éliciné ne revendique aucun droit de propriété sur ces éléments tiers affichés à des fins d'indexation, d'information et de critique culturelle.
            </p>
          </div>
        </div>
      </section>

      {/* ARTICLE 7 */}
      <section id="article-7" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 7 : EXCLUSION DE GARANTIE ET LIMITATION DE RESPONSABILITÉ
          </h2>
        </div>

        <ul className="space-y-2 text-xs sm:text-sm text-slate-300 leading-relaxed pl-4 list-disc marker:text-rose-400">
          <li>
            Le Service est accessible 24h/24 et 7j/7 sous réserve des éventuelles pannes techniques, périodes de maintenance logicielle ou défaillances imputables aux réseaux de télécommunications mondiaux.
          </li>
          <li>
            Les suggestions produites par les modèles d'intelligence artificielle le sont à titre consultatif et de divertissement. L'éditeur ne saurait être tenu pour responsable d'éventuelles inexactitudes dans les fiches techniques de films ou d'inadéquations de recommandations par rapport aux attentes de l'utilisateur.
          </li>
        </ul>
      </section>

      {/* ARTICLE 8 */}
      <section id="article-8" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 8 : EXERCICE DES DROITS ET SUPPRESSION DU COMPTE
          </h2>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p>
            Tout utilisateur dispose du droit d'accéder à ses données, de solliciter leur rectification, de s'opposer à leur traitement pour motifs légitimes et d'obtenir l'effacement complet de son compte.
          </p>
          <p>
            Pour exercer ces droits ou demander la suppression définitive immédiate de votre compte et de toutes les données associées de notre base Supabase, adressez simplement une notification écrite :
          </p>
          
          <div className="p-4 rounded-2xl bg-slate-900 border border-white/5 space-y-2">
            <p className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span><strong>Par email à :</strong> <a href="mailto:support@elicine.app" className="text-cyan-400 hover:underline">support@elicine.app</a> ou <a href="mailto:contact@elicine.app" className="text-cyan-400 hover:underline">contact@elicine.app</a></span>
            </p>
            <p className="flex items-center gap-2 text-slate-400">
              <span className="text-cyan-400 font-bold">•</span>
              <span>En précisant l'adresse email associée à votre compte Google de connexion.</span>
            </p>
            <p className="text-xs text-emerald-400 font-semibold pt-1">
              ✓ La demande est traitée dans un délai maximal de 72 heures ouvrées suivant sa réception.
            </p>
          </div>
        </div>
      </section>

      {/* ARTICLE 9 */}
      <section id="article-9" className="scroll-mt-20 p-6 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ARTICLE 9 : JURIDICTION ET MODIFICATIONS DES CONDITIONS
          </h2>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p>
            Éliciné se réserve la possibilité d'adapter et de mettre à jour les présentes CGU pour refléter les évolutions fonctionnelles, techniques ou légales du Service. La version en vigueur est celle consultable en permanence à l'adresse : <a href="https://elicine.app/terms" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">https://elicine.app/terms</a>.
          </p>
        </div>
      </section>

      {/* Bouton de retour en bas de page également */}
      <div className="pt-4 flex justify-center">
        <button
          type="button"
          onClick={handleBackToApp}
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400 hover:from-blue-500 hover:to-teal-300 text-slate-950 text-xs font-black transition-all shadow-lg shadow-cyan-500/20 cursor-pointer select-none"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour à l'application</span>
        </button>
      </div>

    </div>
  );
};

export default TermsView;
