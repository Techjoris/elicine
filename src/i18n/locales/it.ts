import { TermsTranslations, ConsentModalTranslations } from '../termsTypes';

export const consentModalIt: ConsentModalTranslations = {
  title: "Termini & Privacy",
  description: "Per usufruire della scoperta cinematografica intelligente e dei nostri consigli personalizzati, accetta i nostri termini di servizio e l'informativa sulla privacy.",
  readTermsLink: "Consulta l'informativa completa sui Termini e la Privacy",
  checkbox: "Ho letto e accetto i Termini di Servizio e l'Informativa sulla Privacy.",
  button: "Accetta e continua"
};

export const termsIt: TermsTranslations = {
  backBtn: "Indietro",
  backToApp: "Torna all'applicazione",
  title: "Termini di Servizio e Informativa sulla Privacy",
  effectiveDateLabel: "Data di entrata in vigore",
  effectiveDate: "7 settembre 2026",
  lastUpdatedLabel: "Ultimo aggiornamento",
  lastUpdated: "7 settembre 2026",
  intro: [
    "I presenti Termini di Servizio e Informativa sulla Privacy regolano l'accesso e l'uso della piattaforma digitale e applicazione web progressiva (PWA) Éliciné all'indirizzo https://elicine.app e su tutti i relativi sottodomini.",
    "L'accesso al Servizio e la creazione di un account implicano l'accettazione espressa e senza riserve di tutte le disposizioni contenute in questo documento."
  ],
  copyright: "Éliciné © 2026",
  articles: [
    {
      id: "article-1",
      title: "ARTICOLO 1: IDENTIFICAZIONE DEL TITOLARE E HOSTING",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { label: "Denominazione del servizio", text: "Éliciné" },
            { label: "Sito ufficiale", text: "https://elicine.app", link: "https://elicine.app" },
            { label: "Contatto supporto e reclami", text: "contact@elicine.app", email: "contact@elicine.app" },
            { label: "Responsabile della protezione dei dati (DPO / Privacy)", text: "support@elicine.app", email: "support@elicine.app" },
            { label: "Infrastruttura di rete", text: "Server cloud distribuiti ad alta disponibilità con crittografia SSL/TLS end-to-end." },
            { label: "Database e sessioni", text: "Gestito tramite Supabase (server conformi a standard ISO 27001 e SOC 2 Type II)." },
            { label: "Fornitore di metadati cinematografici", text: "Metadati e locandine forniti tramite le API di The Movie Database (TMDB)." }
          ]
        }
      ]
    },
    {
      id: "article-2",
      title: "ARTICOLO 2: DESCRIZIONE GENERALE DEL SERVIZIO",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné mette a disposizione dei cinefili un ambiente interattivo dedicato a:"
        },
        {
          type: "bullet_list",
          items: [
            { text: "Ricerca semantica di film e serie televisive." },
            { text: "Generazione di raccomandazioni personalizzate tramite intelligenza artificiale." },
            { text: "Gestione di liste personali e cronologia di consultazione." },
            { text: "Verifica della disponibilità streaming legale regionale." },
            { text: "Sottoscrizione di piani digitali premium «Pass Pro»." }
          ]
        },
        {
          type: "paragraph",
          text: "Il Servizio non può garantire l'esattezza assoluta né l'esaustività dei cataloghi di terze parti."
        }
      ]
    },
    {
      id: "article-tmdb",
      title: "ARTICOLO: FONTI DEI DATI CINEMATOGRAFICI E NOTA TMDB",
      blocks: [
        {
          type: "paragraph",
          text: "Le informazioni relative ai film, crediti tecnici, sinossi e locandine presenti su Éliciné provengono dal database The Movie Database (TMDB)."
        },
        {
          type: "callout",
          calloutText: "Avviso legale: Questo prodotto utilizza le API di TMDB ma non è approvato o certificato da TMDB (This product uses the TMDB API but is not endorsed or certified by TMDB).",
          calloutSubtext: "Éliciné è un'iniziativa indipendente priva di affiliazione diretta o partnership commerciale ufficiale con TMDB."
        }
      ]
    },
    {
      id: "article-3",
      title: "ARTICOLO 3: REGISTRAZIONE, AUTENTICAZIONE E SICUREZZA DELL'ACCOUNT",
      blocks: [
        {
          type: "subsection",
          title: "3.1. Autenticazione Google OAuth",
          text: "Per garantire la massima sicurezza, Éliciné adotta esclusivamente il protocollo Google OAuth 2.0.",
          items: [
            { label: "Nessuna memorizzazione di password", text: "Éliciné non richiede né conserva mai la password del tuo account Google." },
            { label: "Dati autorizzati", text: "Google trasmette esclusivamente UID, nome, indirizzo email e foto del profilo pubblico." }
          ]
        },
        {
          type: "subsection",
          title: "3.2. Responsabilità dell'utente",
          text: "L'utente è responsabile della sicurezza del proprio dispositivo e della propria sessione attiva."
        }
      ]
    },
    {
      id: "article-4",
      title: "ARTICOLO 4: POLITICA SULLA PRIVACY E GESTIONE DEI DATI",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné rispetta il principio di minimizzazione dei dati: vengono raccolti unicamente i dati necessari al funzionamento del servizio."
        },
        {
          type: "subsection",
          title: "4.1. Categorie di dati trattati",
          items: [
            { label: "Dati profilo", text: "Identificativo Supabase, indirizzo email e nome visualizzato." },
            { label: "Dati di sessione", text: "Film salvati, preferenze di lingua e stato Pass Pro." },
            { label: "Dati di connessione", text: "Indirizzo IP tecnico e geolocalizzazione approssimativa per cataloghi streaming." }
          ]
        },
        {
          type: "subsection",
          title: "4.2. Finalità del trattamento",
          text: "I dati sono utilizzati esclusivamente per la gestione delle sessioni, la personalizzazione dei suggerimenti e la prevenzione di abusi informatici."
        },
        {
          type: "subsection",
          title: "4.3. Nessuna vendita di dati",
          text: "Éliciné non cede, non vende e non condivide alcun dato personale con intermediari di dati o reti pubblicitarie."
        },
        {
          type: "subsection",
          title: "4.4. Periodo di conservazione",
          text: "I dati vengono conservati per la durata di attività dell'account ed eliminati irreversibilmente dopo 24 mesi di inattività o su richiesta dell'utente."
        }
      ]
    },
    {
      id: "article-5",
      title: "ARTICOLO 5: ABBONAMENTO «PASS PRO» E PAGAMENTI",
      blocks: [
        {
          type: "subsection",
          title: "5.1. Oggetto dell'offerta",
          text: "L'opzione Pass Pro (prezzo base: 1,99 $ USD) sblocca i seguenti vantaggi esclusivi: (1) quote illimitate di query IA, (2) filtri avanzati per perfezionare i risultati post-ricerca in base agli abbonamenti alle piattaforme o ai voti migliori, e (3) attivazione di avvisi personalizzati per film e serie."
        },
        {
          type: "subsection",
          title: "5.2. Sicurezza dei pagamenti",
          text: "I pagamenti sono elaborati da gestori certificati (PayPal, Notch Pay). Éliciné non archivia né accede a numeri di carte di credito."
        }
      ]
    },
    {
      id: "article-6",
      title: "ARTICOLO 6: PROPRIETÀ INTELLETTUALE",
      blocks: [
        {
          type: "subsection",
          title: "1. Marchio e software",
          text: "Il marchio Éliciné, il codice e l'interfaccia sono di proprietà esclusiva del titolare e protetti dalle norme sul diritto d'autore."
        },
        {
          type: "subsection",
          title: "2. Contenuti cinematografici",
          text: "I titoli, le immagini e le locandine appartengono ai rispettivi proprietari e sono mostrati a soli scopi informativi e culturali."
        }
      ]
    },
    {
      id: "article-7",
      title: "ARTICOLO 7: LIMITAZIONE DI RESPONSABILITÀ",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { text: "Il Servizio è accessibile 24 ore su 24, salvo interruzioni di manutenzione o problemi di rete indipendenti dalla nostra volontà." },
            { text: "I consigli dell'IA sono forniti a solo scopo di intrattenimento." }
          ]
        }
      ]
    },
    {
      id: "article-8",
      title: "ARTICOLO 8: ESERCIZIO DEI DIRITTI E CANCELLAZIONE DELL'ACCOUNT",
      blocks: [
        {
          type: "paragraph",
          text: "Gli utenti hanno diritto di accedere, rettificare o cancellare i propri dati personali inviando un'email a support@elicine.app o contact@elicine.app specificando l'indirizzo Google collegato. La richiesta viene evasa entro 72 ore lavorative."
        }
      ]
    },
    {
      id: "article-9",
      title: "ARTICOLO 9: MODIFICHE AI TERMINI",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné si riserva il diritto di aggiornare i presenti Termini. La versione valida è consultabile all'indirizzo https://elicine.app/terms."
        }
      ]
    }
  ]
};
