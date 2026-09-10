import { TermsTranslations, ConsentModalTranslations } from '../termsTypes';

export const consentModalFr: ConsentModalTranslations = {
  title: "Conditions & Confidentialité",
  description: "Pour profiter de la découverte cinématographique intelligente et de nos recommandations personnalisées, veuillez accepter nos conditions d'utilisation et notre politique de protection des données.",
  readTermsLink: "Consulter l'intégralité des CGU et de la Politique de Confidentialité",
  checkbox: "J'ai lu et j'accepte les Conditions Générales d'Utilisation et la Politique de Confidentialité.",
  button: "Accepter et continuer"
};

export const termsFr: TermsTranslations = {
  backBtn: "Retour",
  backToApp: "Retour à l'application",
  title: "Conditions Générales d'Utilisation et Politique de Confidentialité",
  effectiveDateLabel: "Date d'entrée en vigueur",
  effectiveDate: "7 septembre 2026",
  lastUpdatedLabel: "Dernière mise à jour",
  lastUpdated: "7 septembre 2026",
  intro: [
    "Les présentes Conditions Générales d'Utilisation et de Confidentialité (ci-après les « CGU ») encadrent juridiquement l'accès et l'utilisation de la plateforme numérique et application web progressive (PWA) Éliciné (ci-après le « Service »), accessible à l'adresse officielle https://elicine.app ainsi que sur tous ses sous-domaines associés.",
    "L'accès au Service, la navigation sur l'application et la création d'un compte utilisateur impliquent l'acceptation expresse, préalable et sans réserve de l'ensemble des stipulations contenues dans le présent document."
  ],
  copyright: "Éliciné © 2026",
  articles: [
    {
      id: "article-1",
      title: "ARTICLE 1 : IDENTIFICATION DE L'ÉDITEUR ET HÉBERGEMENT",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { label: "Dénomination du service", text: "Éliciné" },
            { label: "Site officiel", text: "https://elicine.app", link: "https://elicine.app" },
            { label: "Contact support & réclamations", text: "contact@elicine.app", email: "contact@elicine.app" },
            { label: "Délégué à la protection des données (DPO / Privacy)", text: "support@elicine.app", email: "support@elicine.app" },
            { label: "Hébergement et infrastructures réseau", text: "Serveurs cloud distribués haute disponibilité et protocoles de chiffrement SSL/TLS de bout en bout." },
            { label: "Base de données et gestion de sessions", text: "Infrastructure gérée par Supabase (serveurs certifiés ISO 27001 et SOC 2 Type II)." },
            { label: "Fournisseur de métadonnées cinématographiques", text: "Métadonnées, résumés, crédits artistiques et affiches mis à disposition via l'API The Movie Database (TMDB)." }
          ]
        }
      ]
    },
    {
      id: "article-2",
      title: "ARTICLE 2 : DESCRIPTION GÉNÉRALE DU SERVICE",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné met à la disposition des passionnés et spectateurs de cinéma un environnement interactif dédié :"
        },
        {
          type: "bullet_list",
          items: [
            { text: "À la recherche sémantique et multicritère d'œuvres cinématographiques et audiovisuelles." },
            { text: "À la génération de recommandations sur-mesure pilotées par intelligence artificielle." },
            { text: "À la constitution d'espaces personnels (listes d'envies, favoris, historique de consultation)." },
            { text: "À la consultation d'informations contextuelles de disponibilité légale selon les zones géographiques." },
            { text: "À la souscription d'offres numériques premium intitulées « Pass Pro »." }
          ]
        },
        {
          type: "paragraph",
          text: "Le Service s'efforce d'assurer la cohérence et la mise à jour constante des informations diffusées, mais ne peut garantir l'exactitude absolue des catalogues de plateformes tierces ni l'exhaustivité totale des métadonnées issues de sources externes."
        }
      ]
    },
    {
      id: "article-tmdb",
      title: "ARTICLE : SOURCES DES DONNÉES CINÉMATOGRAPHIQUES ET MENTION TMDB",
      blocks: [
        {
          type: "paragraph",
          text: "Les informations relatives aux films, fiches techniques, résumés, crédits d'équipe, notes et affiches diffusés sur Éliciné proviennent de la base de données The Movie Database (TMDB)."
        },
        {
          type: "callout",
          calloutText: "Avertissement légal : Le présent produit utilise l'API TMDB mais n'est en aucun cas certifié, approuvé ou validé par TMDB (This product uses the TMDB API but is not endorsed or certified by TMDB).",
          calloutSubtext: "Éliciné est une initiative indépendante qui n'entretient aucun lien d'affiliation directe ou de partenariat officiel avec TMDB."
        }
      ]
    },
    {
      id: "article-3",
      title: "ARTICLE 3 : INSCRIPTION, AUTHENTIFICATION ET SÉCURITÉ DU COMPTE",
      blocks: [
        {
          type: "subsection",
          title: "3.1. Modalités d'authentification tierce (Google OAuth)",
          text: "Afin de garantir un haut niveau de sécurité opérationnelle et d'éviter les risques inhérents au stockage de mots de passe non chiffrés, Éliciné recourt exclusivement au protocole d'authentification standard Google OAuth 2.0.",
          items: [
            { label: "Absence de stockage des identifiants", text: "Éliciné ne demande, ne consulte, ne traite et n'enregistre à aucun moment votre mot de passe de compte Google." },
            { label: "Transmission de données autorisées", text: "En sélectionnant « Continuer avec Google », l'utilisateur autorise Google à transmettre à notre gestionnaire d'identité les éléments minimaux nécessaires : identifiant unique de compte (Google UID), nom complet, adresse email validée et photographie de profil publique." }
          ]
        },
        {
          type: "subsection",
          title: "3.2. Responsabilité de l'utilisateur",
          text: "Chaque utilisateur est responsable de la confidentialité de l'accès à son terminal physique (ordinateur, smartphone, tablette) et de la sécurisation de sa session. Toute action exécutée depuis un compte connecté est présumée émaner du titulaire du compte."
        }
      ]
    },
    {
      id: "article-4",
      title: "ARTICLE 4 : POLITIQUE DE CONFIDENTIALITÉ ET GESTION DES DONNÉES PERSONNELLES",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné applique une politique de stricte minimisation des données : seules les données techniquement et fonctionnellement indispensables sont collectées."
        },
        {
          type: "subsection",
          title: "4.1. Catégories de données traitées",
          items: [
            { label: "Données de profil utilisateur", text: "Identifiant technique unique Supabase, adresse de messagerie électronique, nom d'affichage et image de profil transmise par le fournisseur d'accès." },
            { label: "Données de session et préférences", text: "Listes de films sauvegardés, préférences de consultation, statut de souscription au Pass Pro et historique d'interactions avec l'assistant IA." },
            { label: "Données de connexion et localisation technique", text: "Adresse IP technique (traitée temporairement pour la sécurité des réseaux), chaîne d'agent utilisateur (User-Agent), langue déclarée du navigateur et zone géographique approximative (pays/fuseau). Cette localisation sert exclusivement à configurer la langue par défaut de l'interface et à afficher les filtres pertinents relatifs aux sorties cinéma et catalogues de streaming régionaux." }
          ]
        },
        {
          type: "subsection",
          title: "4.2. Finalités précises des traitements",
          text: "Les données recueillies font l'objet d'un traitement automatisé ayant pour buts :",
          orderedItems: [
            "L'ouverture, le maintien sécurisé et la synchronisation de la session utilisateur sur PWA et navigateurs web.",
            "L'attribution et le déblocage instantané des fonctionnalités attachées au statut Pass Pro.",
            "La personnalisation algorithmique des suggestions cinématographiques.",
            "La prévention des abus, des accès non autorisés et des tentatives de fraude technique."
          ]
        },
        {
          type: "subsection",
          title: "4.3. Absence totale de commercialisation des données",
          text: "Éliciné applique une politique ferme d'interdiction de vente de données : aucune information personnelle, adresse email, historique de recherche ou profil d'utilisation n'est cédé, loué, vendu ou partagé avec des courtiers en données (data brokers), des annonceurs publicitaires ou des régies commerciales tierces."
        },
        {
          type: "subsection",
          title: "4.4. Durée de conservation",
          text: "Les données associées au compte utilisateur sont conservées pendant toute la durée d'activité du compte. En cas d'inactivité prolongée excédant vingt-quatre (24) mois consécutifs ou sur demande expresse de l'utilisateur, l'ensemble des données personnelles fait l'objet d'une purge définitive et irréversible de nos serveurs de production."
        }
      ]
    },
    {
      id: "article-5",
      title: "ARTICLE 5 : OFFRE « PASS PRO », CONDITIONS TARIFAIRES ET PAIEMENTS",
      blocks: [
        {
          type: "subsection",
          title: "5.1. Nature et périmètre de l'offre",
          text: "L'utilisateur a la faculté de souscrire à l'option payante Pass Pro (tarif de référence : 1,99 $ USD ou contre-valeur en monnaie locale lors du règlement). Cette formule débloque les avantages exclusifs suivants : (1) des quotas illimités de requêtes IA, (2) des filtres avancés permettant d'affiner les résultats post-recherche selon ses abonnements de plateformes ou les meilleures notes, et (3) l'activation des alertes personnalisées de disponibilité pour les films et séries."
        },
        {
          type: "subsection",
          title: "5.2. Sécurité des transactions financières",
          text: "Les règlements financiers s'opèrent via des prestataires de services de paiement agréés (cartes bancaires internationales et passerelles de paiement mobile régionales).",
          items: [
            { label: "Éliciné ne stocke, ne voit et n'archive aucun numéro de carte de paiement", text: "cryptogramme visuel ou code secret bancaire." },
            { label: "Transmission sécurisée", text: "Les plateformes de paiement transmettent uniquement un jeton de validation technique (webhook token) certifiant le succès de la transaction pour permettre l'activation des droits Pro sur le compte de l'utilisateur." }
          ]
        }
      ]
    },
    {
      id: "article-6",
      title: "ARTICLE 6 : PROPRIÉTÉ INTELLECTUELLE ET LICENCE D'UTILISATION",
      blocks: [
        {
          type: "subsection",
          title: "1. Marque et logiciel Éliciné",
          text: "L'appellation Éliciné, le nom de domaine https://elicine.app, l'architecture logicielle, le design visuel, l'expérience utilisateur et les algorithmes développés en interne sont la propriété exclusive de l'éditeur et protégés par le droit d'auteur et les lois sur la propriété intellectuelle."
        },
        {
          type: "subsection",
          title: "2. Contenus cinématographiques",
          text: "Les titres d'œuvres, affiches officielles, photographies de plateau, extraits de synopsis et éléments promotionnels de films appartiennent intégralement à leurs producteurs, réalisateurs, distributeurs et ayants droit respectifs. Éliciné ne revendique aucun droit de propriété sur ces éléments tiers affichés à des fins d'indexation, d'information et de critique culturelle."
        }
      ]
    },
    {
      id: "article-7",
      title: "ARTICLE 7 : EXCLUSION DE GARANTIE ET LIMITATION DE RESPONSABILITÉ",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { text: "Le Service est accessible 24h/24 et 7j/7 sous réserve des éventuelles pannes techniques, périodes de maintenance logicielle ou défaillances imputables aux réseaux de télécommunications mondiaux." },
            { text: "Les suggestions produites par les modèles d'intelligence artificielle le sont à titre consultatif et de divertissement. L'éditeur ne saurait être tenu pour responsable d'éventuelles inexactitudes dans les fiches techniques de films ou d'inadéquations de recommandations par rapport aux attentes de l'utilisateur." }
          ]
        }
      ]
    },
    {
      id: "article-8",
      title: "ARTICLE 8 : EXERCICE DES DROITS ET SUPPRESSION DU COMPTE",
      blocks: [
        {
          type: "paragraph",
          text: "Tout utilisateur dispose du droit d'accéder à ses données, de solliciter leur rectification, de s'opposer à leur traitement pour motifs légitimes et d'obtenir l'effacement complet de son compte."
        },
        {
          type: "paragraph",
          text: "Pour exercer ces droits ou demander la suppression définitive immédiate de votre compte et de toutes les données associées de notre base Supabase, adressez simplement une notification écrite :"
        },
        {
          type: "bullet_list",
          items: [
            { label: "Par email à", text: "support@elicine.app ou contact@elicine.app", email: "support@elicine.app" },
            { label: "Précision requise", text: "En précisant l'adresse email associée à votre compte Google de connexion." }
          ]
        },
        {
          type: "paragraph",
          text: "La demande est traitée dans un délai maximal de 72 heures ouvrées suivant sa réception."
        }
      ]
    },
    {
      id: "article-9",
      title: "ARTICLE 9 : JURIDICTION ET MODIFICATIONS DES CONDITIONS",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné se réserve la possibilité d'adapter et de mettre à jour les présentes CGU pour refléter les évolutions fonctionnelles, techniques ou légales du Service. La version en vigueur est celle consultable en permanence à l'adresse : https://elicine.app/terms."
        }
      ]
    }
  ]
};
