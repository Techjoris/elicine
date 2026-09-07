import { TermsTranslations, ConsentModalTranslations } from '../termsTypes';

export const consentModalDe: ConsentModalTranslations = {
  title: "Nutzungsbedingungen & Datenschutz",
  description: "Um die intelligente Filmentdeckung und personalisierte Empfehlungen zu nutzen, akzeptieren Sie bitte unsere Nutzungsbedingungen und Datenschutzrichtlinie.",
  readTermsLink: "Vollständige AGB und Datenschutzerklärung lesen",
  checkbox: "Ich habe die Allgemeinen Geschäftsbedingungen und die Datenschutzerklärung gelesen und akzeptiert.",
  button: "Akzeptieren und fortfahren"
};

export const termsDe: TermsTranslations = {
  backBtn: "Zurück",
  backToApp: "Zurück zur Anwendung",
  title: "Allgemeine Geschäftsbedingungen und Datenschutzerklärung",
  effectiveDateLabel: "Inkrafttretensdatum",
  effectiveDate: "7. September 2026",
  lastUpdatedLabel: "Zuletzt aktualisiert",
  lastUpdated: "7. September 2026",
  intro: [
    "Diese Allgemeinen Geschäftsbedingungen und Datenschutzrichtlinien regeln den rechtlichen Zugang und die Nutzung der digitalen Plattform und Progressive Web App (PWA) Éliciné unter https://elicine.app.",
    "Der Zugriff auf den Dienst und die Registrierung setzen die ausdrückliche und uneingeschränkte Annahme aller in diesem Dokument enthaltenen Bestimmungen voraus."
  ],
  copyright: "Éliciné © 2026",
  articles: [
    {
      id: "article-1",
      title: "ARTIKEL 1: IDENTIFIKATION DES BETREIBERS UND HOSTING",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { label: "Dienstbezeichnung", text: "Éliciné" },
            { label: "Offizielle Website", text: "https://elicine.app", link: "https://elicine.app" },
            { label: "Kundensupport & Anfragen", text: "contact@elicine.app", email: "contact@elicine.app" },
            { label: "Datenschutzbeauftragter (DPO / Privacy)", text: "support@elicine.app", email: "support@elicine.app" },
            { label: "Hosting und Infrastruktur", text: "Hochverfügbare verteilte Cloud-Server mit SSL/TLS-Ende-zu-Ende-Verschlüsselung." },
            { label: "Datenbank & Sessions", text: "Verwaltet durch Supabase (ISO 27001 und SOC 2 Type II zertifizierte Server)." },
            { label: "Filmdaten-Provider", text: "Metadaten, Inhaltsangaben und Poster bereitgestellt über die API von The Movie Database (TMDB)." }
          ]
        }
      ]
    },
    {
      id: "article-2",
      title: "ARTIKEL 2: ALLGEMEINE BESCHREIBUNG DES DIENSTES",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné stellt Filmbegeisterten eine interaktive Umgebung zur Verfügung für:"
        },
        {
          type: "bullet_list",
          items: [
            { text: "Semantische Suche nach Filmen und Serien." },
            { text: "KI-gestützte personalisierte Empfehlungen." },
            { text: "Verwaltung persönlicher Merklisten und Favoriten." },
            { text: "Regionale Verfügbarkeitsprüfung legaler Streaming-Dienste." },
            { text: "Abschluss des Premium-Abonnements «Pass Pro»." }
          ]
        },
        {
          type: "paragraph",
          text: "Der Dienst bemüht sich um ständige Aktualisierung, übernimmt jedoch keine Gewähr für die lückenlose Richtigkeit externer Drittkataloge."
        }
      ]
    },
    {
      id: "article-tmdb",
      title: "ARTIKEL: FILMDATENQUELLEN UND TMDB-HINWEIS",
      blocks: [
        {
          type: "paragraph",
          text: "Die auf Éliciné bereitgestellten Filminformationen, Besetzungslisten und Filmplakate stammen aus der Datenbank von The Movie Database (TMDB)."
        },
        {
          type: "callout",
          calloutText: "Rechtlicher Hinweis: Dieses Produkt nutzt die TMDB-API, wird jedoch von TMDB weder unterstützt noch zertifiziert (This product uses the TMDB API but is not endorsed or certified by TMDB).",
          calloutSubtext: "Éliciné ist eine unabhängige Initiative ohne direkte Verbindung oder offizielle Partnerschaft mit TMDB."
        }
      ]
    },
    {
      id: "article-3",
      title: "ARTIKEL 3: ANMELDUNG, AUTHENTIFIZIERUNG UND KONTOSICHERHEIT",
      blocks: [
        {
          type: "subsection",
          title: "3.1. Google OAuth-Authentifizierung",
          text: "Zur Gewährleistung maximaler Sicherheit nutzt Éliciné ausschließlich das Standardprotokoll Google OAuth 2.0.",
          items: [
            { label: "Keine Speicherung von Passwörtern", text: "Éliciné speichert oder verarbeitet zu keinem Zeitpunkt Ihr Google-Passwort." },
            { label: "Autorisierte Datenübertragung", text: "Über «Weiter mit Google» werden lediglich die Google-UID, Ihr Name, E-Mail-Adresse und öffentliches Profilbild übertragen." }
          ]
        },
        {
          type: "subsection",
          title: "3.2. Verantwortung des Nutzers",
          text: "Nutzer sind für den vertraulichen Zugriff auf ihre Endgeräte und Sitzungen selbst verantwortlich."
        }
      ]
    },
    {
      id: "article-4",
      title: "ARTIKEL 4: DATENSCHUTZ UND PERSONENBEZOGENE DATEN",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné verfolgt den Grundsatz der Datenminimierung: Es werden ausschließlich technisch und funktional erforderliche Daten erhoben."
        },
        {
          type: "subsection",
          title: "4.1. Verarbeitete Datenkategorien",
          items: [
            { label: "Nutzerprofildaten", text: "E-Mail-Adresse, Anzeigename und Profilbild von Google." },
            { label: "Sitzungsdaten", text: "Gespeicherte Filme, Spracheinstellungen und Pass Pro-Status." },
            { label: "Technische Verbindungsdaten", text: "IP-Adresse zur Netzwerksicherheit und grobe geografische Region für Streaming-Kataloge." }
          ]
        },
        {
          type: "subsection",
          title: "4.2. Zweck der Verarbeitung",
          text: "Die Daten dienen ausschließlich der sicheren Sitzungsverwaltung, KI-Personalisierung und Betrugsprävention."
        },
        {
          type: "subsection",
          title: "4.3. Kein Datenverkauf",
          text: "Éliciné verkauft, vermietet oder teilt zu keinem Zeitpunkt personenbezogene Daten mit Datenhändlern oder Werbenetzwerken."
        },
        {
          type: "subsection",
          title: "4.4. Speicherdauer",
          text: "Nach 24 Monaten Inaktivität oder auf Antrag des Nutzers werden alle Daten dauerhaft gelöscht."
        }
      ]
    },
    {
      id: "article-5",
      title: "ARTIKEL 5: «PASS PRO»-ANGEBOT UND ZAHLUNGSMODALITÄTEN",
      blocks: [
        {
          type: "subsection",
          title: "5.1. Leistungsumfang",
          text: "Nutzer können das kostenpflichtige Pass Pro-Abonnement (Referenzpreis: 1,99 $ USD) für unbegrenzte KI-Anfragen und erweiterte Filter erwerben."
        },
        {
          type: "subsection",
          title: "5.2. Zahlungssicherheit",
          text: "Zahlungen erfolgen über zertifizierte Zahlungsdienstleister (PayPal, Notch Pay). Éliciné speichert keinerlei Bank- oder Kreditkartendaten."
        }
      ]
    },
    {
      id: "article-6",
      title: "ARTIKEL 6: GEISTIGES EIGENTUM UND LIZENZEN",
      blocks: [
        {
          type: "subsection",
          title: "1. Marke und Software",
          text: "Die Marke Éliciné, Softwarearchitektur und Algorithmen sind urheberrechtlich geschützt."
        },
        {
          type: "subsection",
          title: "2. Filminhalte",
          text: "Filmtitel, Poster und Bildmaterial gehören den jeweiligen Rechteinhabern und werden ausschließlich zu Informationszwecken dargestellt."
        }
      ]
    },
    {
      id: "article-7",
      title: "ARTIKEL 7: HAFTUNGSAUSSCHLUSS",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { text: "Der Dienst steht grundsätzlich 24/7 zur Verfügung, vorbehaltlich technischer Wartungsarbeiten." },
            { text: "KI-Empfehlungen sind unverbindliche Vorschläge zur Unterhaltung." }
          ]
        }
      ]
    },
    {
      id: "article-8",
      title: "ARTIKEL 8: NUTZERRECHTE UND KONTOLÖSCHUNG",
      blocks: [
        {
          type: "paragraph",
          text: "Sie haben das Recht auf Auskunft, Berichtigung und vollständige Löschung Ihres Kontos. Senden Sie eine Anfrage an support@elicine.app oder contact@elicine.app unter Angabe Ihrer Google-E-Mail. Die Löschung erfolgt binnen 72 Arbeitsstunden."
        }
      ]
    },
    {
      id: "article-9",
      title: "ARTIKEL 9: ÄNDERUNGEN DER BEDINGUNGEN",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné behält sich das Recht vor, diese Bedingungen bei Bedarf anzupassen. Die jeweils aktuelle Fassung ist stets unter https://elicine.app/terms einsehbar."
        }
      ]
    }
  ]
};
