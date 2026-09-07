import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const TermsView: React.FC = () => {
  const { setActiveView } = useApp();

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
          <span>Retour</span>
        </button>

        <span className="text-[11px] text-zinc-500 font-mono">
          Dernière mise à jour : 7 septembre 2026
        </span>
      </div>

      {/* 2. En-tête éditorial */}
      <header className="space-y-4">
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-950 dark:text-white tracking-tight leading-snug">
          Conditions Générales d'Utilisation et Politique de Confidentialité
        </h1>

        <div className="flex flex-wrap items-center gap-x-4 text-xs text-zinc-500 font-mono">
          <span>Date d'entrée en vigueur : 7 septembre 2026</span>
          <span>•</span>
          <span>Dernière mise à jour : 7 septembre 2026</span>
        </div>

        <div className="pt-2 space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <p>
            Les présentes Conditions Générales d'Utilisation et de Confidentialité (ci-après les « CGU ») encadrent juridiquement l'accès et l'utilisation de la plateforme numérique et application web progressive (PWA) Éliciné (ci-après le « Service »), accessible à l'adresse officielle <a href="https://elicine.app" target="_blank" rel="noopener noreferrer" className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white font-medium">https://elicine.app</a> ainsi que sur tous ses sous-domaines associés.
          </p>
          <p className="text-zinc-900 dark:text-zinc-100 font-medium">
            L'accès au Service, la navigation sur l'application et la création d'un compte utilisateur impliquent l'acceptation expresse, préalable et sans réserve de l'ensemble des stipulations contenues dans le présent document.
          </p>
        </div>
      </header>

      {/* 3. Document éditorial continu (Articles) */}
      <main className="space-y-10 divide-y divide-zinc-200 dark:divide-white/5">
        
        {/* ARTICLE 1 */}
        <article className="pt-10 first:pt-0 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 1 : IDENTIFICATION DE L'ÉDITEUR ET HÉBERGEMENT
          </h2>
          <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Dénomination du service :</strong> Éliciné
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Site officiel :</strong> <a href="https://elicine.app" target="_blank" rel="noopener noreferrer" className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white">https://elicine.app</a>
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Contact support &amp; réclamations :</strong> <a href="mailto:contact@elicine.app" className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white">contact@elicine.app</a>
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Délégué à la protection des données (DPO / Privacy) :</strong> <a href="mailto:support@elicine.app" className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white">support@elicine.app</a>
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Hébergement et infrastructures réseau :</strong> Serveurs cloud distribués haute disponibilité et protocoles de chiffrement SSL/TLS de bout en bout.
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Base de données et gestion de sessions :</strong> Infrastructure gérée par Supabase (serveurs certifiés ISO 27001 et SOC 2 Type II).
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Fournisseur de métadonnées cinématographiques :</strong> Métadonnées, résumés, crédits artistiques et affiches mis à disposition via l'API The Movie Database (TMDB).
            </li>
          </ul>
        </article>

        {/* ARTICLE 2 */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 2 : DESCRIPTION GÉNÉRALE DU SERVICE
          </h2>
          <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <p>
              Éliciné met à la disposition des passionnés et spectateurs de cinéma un environnement interactif dédié :
            </p>
            <ul className="space-y-2 list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
              <li>À la recherche sémantique et multicritère d'œuvres cinématographiques et audiovisuelles.</li>
              <li>À la génération de recommandations sur-mesure pilotées par intelligence artificielle.</li>
              <li>À la constitution d'espaces personnels (listes d'envies, favoris, historique de consultation).</li>
              <li>À la consultation d'informations contextuelles de disponibilité légale selon les zones géographiques.</li>
              <li>À la souscription d'offres numériques premium intitulées « Pass Pro ».</li>
            </ul>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm pt-1">
              Le Service s'efforce d'assurer la cohérence et la mise à jour constante des informations diffusées, mais ne peut garantir l'exactitude absolue des catalogues de plateformes tierces ni l'exhaustivité totale des métadonnées issues de sources externes.
            </p>
          </div>
        </article>

        {/* ARTICLE : SOURCES DES DONNÉES CINÉMATOGRAPHIQUES ET MENTION TMDB */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE : SOURCES DES DONNÉES CINÉMATOGRAPHIQUES ET MENTION TMDB
          </h2>
          <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <p>
              Les informations relatives aux films, fiches techniques, résumés, crédits d'équipe, notes et affiches diffusés sur Éliciné proviennent de la base de données The Movie Database (TMDB).
            </p>
            <div className="p-4 rounded-xl bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/5 text-zinc-800 dark:text-zinc-300 text-xs sm:text-sm leading-relaxed space-y-1">
              <p>
                <strong className="text-zinc-950 dark:text-white">Avertissement légal :</strong> Le présent produit utilise l'API TMDB mais n'est en aucun cas certifié, approuvé ou validé par TMDB (<em>This product uses the TMDB API but is not endorsed or certified by TMDB</em>).
              </p>
              <p>
                Éliciné est une initiative indépendante qui n'entretient aucun lien d'affiliation directe ou de partenariat officiel avec TMDB.
              </p>
            </div>
          </div>
        </article>

        {/* ARTICLE 3 */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 3 : INSCRIPTION, AUTHENTIFICATION ET SÉCURITÉ DU COMPTE
          </h2>
          <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                3.1. Modalités d'authentification tierce (Google OAuth)
              </h3>
              <p>
                Afin de garantir un haut niveau de sécurité opérationnelle et d'éviter les risques inhérents au stockage de mots de passe non chiffrés, Éliciné recourt exclusivement au protocole d'authentification standard Google OAuth 2.0.
              </p>
              <ul className="space-y-2 list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Absence de stockage des identifiants :</strong> Éliciné ne demande, ne consulte, ne traite et n'enregistre à aucun moment votre mot de passe de compte Google.
                </li>
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Transmission de données autorisées :</strong> En sélectionnant « Continuer avec Google », l'utilisateur autorise Google à transmettre à notre gestionnaire d'identité les éléments minimaux nécessaires : identifiant unique de compte (Google UID), nom complet, adresse email validée et photographie de profil publique.
                </li>
              </ul>
            </div>

            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                3.2. Responsabilité de l'utilisateur
              </h3>
              <p>
                Chaque utilisateur est responsable de la confidentialité de l'accès à son terminal physique (ordinateur, smartphone, tablette) et de la sécurisation de sa session. Toute action exécutée depuis un compte connecté est présumée émaner du titulaire du compte.
              </p>
            </div>
          </div>
        </article>

        {/* ARTICLE 4 */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 4 : POLITIQUE DE CONFIDENTIALITÉ ET GESTION DES DONNÉES PERSONNELLES
          </h2>
          <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <p className="text-zinc-900 dark:text-zinc-100 font-medium">
              Éliciné applique une politique de stricte minimisation des données : seules les données techniquement et fonctionnellement indispensables sont collectées.
            </p>

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                4.1. Catégories de données traitées
              </h3>
              <ul className="space-y-2 list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Données de profil utilisateur :</strong> Identifiant technique unique Supabase, adresse de messagerie électronique, nom d'affichage et image de profil transmise par le fournisseur d'accès.
                </li>
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Données de session et préférences :</strong> Listes de films sauvegardés, préférences de consultation, statut de souscription au Pass Pro et historique d'interactions avec l'assistant IA.
                </li>
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Données de connexion et localisation technique :</strong> Adresse IP technique (traitée temporairement pour la sécurité des réseaux), chaîne d'agent utilisateur (User-Agent), langue déclarée du navigateur et zone géographique approximative (pays/fuseau). Cette localisation sert exclusivement à configurer la langue par défaut de l'interface et à afficher les filtres pertinents relatifs aux sorties cinéma et catalogues de streaming régionaux.
                </li>
              </ul>
            </div>

            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                4.2. Finalités précises des traitements
              </h3>
              <p>Les données recueillies font l'objet d'un traitement automatisé ayant pour buts :</p>
              <ol className="space-y-1.5 list-decimal pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                <li>L'ouverture, le maintien sécurisé et la synchronisation de la session utilisateur sur PWA et navigateurs web.</li>
                <li>L'attribution et le déblocage instantané des fonctionnalités attachées au statut Pass Pro.</li>
                <li>La personnalisation algorithmique des suggestions cinématographiques.</li>
                <li>La prévention des abus, des accès non autorisés et des tentatives de fraude technique.</li>
              </ol>
            </div>

            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                4.3. Absence totale de commercialisation des données
              </h3>
              <p>
                Éliciné applique une politique ferme d'interdiction de vente de données : aucune information personnelle, adresse email, historique de recherche ou profil d'utilisation n'est cédé, loué, vendu ou partagé avec des courtiers en données (data brokers), des annonceurs publicitaires ou des régies commerciales tierces.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                4.4. Durée de conservation
              </h3>
              <p>
                Les données associées au compte utilisateur sont conservées pendant toute la durée d'activité du compte. En cas d'inactivité prolongée excédant vingt-quatre (24) mois consécutifs ou sur demande expresse de l'utilisateur, l'ensemble des données personnelles fait l'objet d'une purge définitive et irréversible de nos serveurs de production.
              </p>
            </div>
          </div>
        </article>

        {/* ARTICLE 5 */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 5 : OFFRE « PASS PRO », CONDITIONS TARIFAIRES ET PAIEMENTS
          </h2>
          <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                5.1. Nature et périmètre de l'offre
              </h3>
              <p>
                L'utilisateur a la faculté de souscrire à l'option payante Pass Pro (tarif de référence : 1,99 $ USD ou contre-valeur en monnaie locale lors du règlement). Cette option permet de lever les limites d'interrogations de l'intelligence artificielle, d'activer des filtres de recherche avancés et d'accéder aux fonctionnalités prioritaires.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                5.2. Sécurité des transactions financières
              </h3>
              <p>
                Les règlements financiers s'opèrent via des prestataires de services de paiement agréés (cartes bancaires internationales et passerelles de paiement mobile régionales).
              </p>
              <ul className="space-y-2 list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Éliciné ne stocke, ne voit et n'archive aucun numéro de carte de paiement, cryptogramme visuel ou code secret bancaire.</strong>
                </li>
                <li>
                  Les plateformes de paiement transmettent uniquement un jeton de validation technique (webhook token) certifiant le succès de la transaction pour permettre l'activation des droits Pro sur le compte de l'utilisateur.
                </li>
              </ul>
            </div>
          </div>
        </article>

        {/* ARTICLE 6 */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 6 : PROPRIÉTÉ INTELLECTUELLE ET LICENCE D'UTILISATION
          </h2>
          <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                1. Marque et logiciel Éliciné
              </h3>
              <p>
                L'appellation Éliciné, le nom de domaine <a href="https://elicine.app" target="_blank" rel="noopener noreferrer" className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white font-medium">https://elicine.app</a>, l'architecture logicielle, le design visuel, l'expérience utilisateur et les algorithmes développés en interne sont la propriété exclusive de l'éditeur et protégés par le droit d'auteur et les lois sur la propriété intellectuelle.
              </p>
            </div>

            <div className="space-y-1.5 pt-2">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                2. Contenus cinématographiques
              </h3>
              <p>
                Les titres d'œuvres, affiches officielles, photographies de plateau, extraits de synopsis et éléments promotionnels de films appartiennent intégralement à leurs producteurs, réalisateurs, distributeurs et ayants droit respectifs. Éliciné ne revendique aucun droit de propriété sur ces éléments tiers affichés à des fins d'indexation, d'information et de critique culturelle.
              </p>
            </div>
          </div>
        </article>

        {/* ARTICLE 7 */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 7 : EXCLUSION DE GARANTIE ET LIMITATION DE RESPONSABILITÉ
          </h2>
          <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
            <li>
              Le Service est accessible 24h/24 et 7j/7 sous réserve des éventuelles pannes techniques, périodes de maintenance logicielle ou défaillances imputables aux réseaux de télécommunications mondiaux.
            </li>
            <li>
              Les suggestions produites par les modèles d'intelligence artificielle le sont à titre consultatif et de divertissement. L'éditeur ne saurait être tenu pour responsable d'éventuelles inexactitudes dans les fiches techniques de films ou d'inadéquations de recommandations par rapport aux attentes de l'utilisateur.
            </li>
          </ul>
        </article>

        {/* ARTICLE 8 */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 8 : EXERCICE DES DROITS ET SUPPRESSION DU COMPTE
          </h2>
          <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <p>
              Tout utilisateur dispose du droit d'accéder à ses données, de solliciter leur rectification, de s'opposer à leur traitement pour motifs légitimes et d'obtenir l'effacement complet de son compte.
            </p>
            <p>
              Pour exercer ces droits ou demander la suppression définitive immédiate de votre compte et de toutes les données associées de notre base Supabase, adressez simplement une notification écrite :
            </p>
            <ul className="space-y-1.5 list-disc pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
              <li>
                <strong className="text-zinc-900 dark:text-zinc-100">Par email à :</strong> <a href="mailto:support@elicine.app" className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white font-medium">support@elicine.app</a> ou <a href="mailto:contact@elicine.app" className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white font-medium">contact@elicine.app</a>
              </li>
              <li>
                En précisant l'adresse email associée à votre compte Google de connexion.
              </li>
            </ul>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm pt-1">
              La demande est traitée dans un délai maximal de 72 heures ouvrées suivant sa réception.
            </p>
          </div>
        </article>

        {/* ARTICLE 9 */}
        <article className="pt-10 space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white tracking-tight">
            ARTICLE 9 : JURIDICTION ET MODIFICATIONS DES CONDITIONS
          </h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Éliciné se réserve la possibilité d'adapter et de mettre à jour les présentes CGU pour refléter les évolutions fonctionnelles, techniques ou légales du Service. La version en vigueur est celle consultable en permanence à l'adresse : <a href="https://elicine.app/terms" target="_blank" rel="noopener noreferrer" className="text-zinc-900 dark:text-zinc-100 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white font-medium">https://elicine.app/terms</a>.
          </p>
        </article>

      </main>

      {/* 4. Pied de document : retour à l'application */}
      <div className="pt-8 border-t border-zinc-200 dark:border-white/5 flex items-center justify-between text-xs text-zinc-500">
        <button
          type="button"
          onClick={handleBackToApp}
          className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer select-none group font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Retour à l'application</span>
        </button>

        <span>Éliciné © 2026</span>
      </div>

    </div>
  );
};

export default TermsView;
