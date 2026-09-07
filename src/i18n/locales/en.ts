import { TermsTranslations, ConsentModalTranslations } from '../termsTypes';

export const consentModalEn: ConsentModalTranslations = {
  title: "Terms & Privacy",
  description: "To enjoy intelligent movie discovery and our personalized recommendations, please accept our terms of service and data protection policy.",
  readTermsLink: "View the full Terms of Service and Privacy Policy",
  checkbox: "I have read and accept the Terms of Service and Privacy Policy.",
  button: "Accept and continue"
};

export const termsEn: TermsTranslations = {
  backBtn: "Back",
  backToApp: "Back to application",
  title: "Terms of Service and Privacy Policy",
  effectiveDateLabel: "Effective Date",
  effectiveDate: "September 7, 2026",
  lastUpdatedLabel: "Last Updated",
  lastUpdated: "September 7, 2026",
  intro: [
    "These Terms of Service and Privacy Policy (hereinafter the \"Terms\") legally govern access to and use of the Éliciné digital platform and progressive web application (PWA) (hereinafter the \"Service\"), accessible at the official address https://elicine.app as well as on all its associated subdomains.",
    "Access to the Service, navigation on the application, and creation of a user account imply express, prior, and unreserved acceptance of all provisions contained in this document."
  ],
  copyright: "Éliciné © 2026",
  articles: [
    {
      id: "article-1",
      title: "ARTICLE 1: IDENTIFICATION OF THE PUBLISHER AND HOSTING",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { label: "Service Name", text: "Éliciné" },
            { label: "Official Website", text: "https://elicine.app", link: "https://elicine.app" },
            { label: "Support & Inquiries Contact", text: "contact@elicine.app", email: "contact@elicine.app" },
            { label: "Data Protection Officer (DPO / Privacy)", text: "support@elicine.app", email: "support@elicine.app" },
            { label: "Hosting & Network Infrastructure", text: "High-availability distributed cloud servers and end-to-end SSL/TLS encryption protocols." },
            { label: "Database & Session Management", text: "Infrastructure managed by Supabase (ISO 27001 and SOC 2 Type II certified servers)." },
            { label: "Cinematographic Metadata Provider", text: "Metadata, synopses, artistic credits, and posters provided via The Movie Database (TMDB) API." }
          ]
        }
      ]
    },
    {
      id: "article-2",
      title: "ARTICLE 2: GENERAL DESCRIPTION OF THE SERVICE",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné provides cinema enthusiasts and viewers with an interactive platform dedicated to:"
        },
        {
          type: "bullet_list",
          items: [
            { text: "Semantic and multi-criteria discovery of cinematographic and audiovisual works." },
            { text: "Generation of tailored recommendations powered by artificial intelligence." },
            { text: "Personal workspace management (watchlists, favorites, viewing history)." },
            { text: "Contextual information regarding legal streaming availability by geographic territory." },
            { text: "Subscription to premium digital packages titled \"Pass Pro\"." }
          ]
        },
        {
          type: "paragraph",
          text: "The Service strives to maintain consistency and continuous updates of displayed information, but cannot guarantee absolute accuracy of third-party platform catalogs nor full completeness of external metadata."
        }
      ]
    },
    {
      id: "article-tmdb",
      title: "ARTICLE: CINEMATOGRAPHIC DATA SOURCES AND TMDB NOTICE",
      blocks: [
        {
          type: "paragraph",
          text: "Information regarding movies, technical specifications, synopses, crew credits, ratings, and posters displayed on Éliciné is sourced from The Movie Database (TMDB)."
        },
        {
          type: "callout",
          calloutText: "Legal Disclaimer: This product uses the TMDB API but is not endorsed or certified by TMDB.",
          calloutSubtext: "Éliciné is an independent initiative that holds no direct affiliation or official partnership with TMDB."
        }
      ]
    },
    {
      id: "article-3",
      title: "ARTICLE 3: REGISTRATION, AUTHENTICATION, AND ACCOUNT SECURITY",
      blocks: [
        {
          type: "subsection",
          title: "3.1. Third-Party Authentication (Google OAuth)",
          text: "To guarantee operational security and eliminate risks associated with storing plaintext or unencrypted passwords, Éliciné exclusively utilizes the standard Google OAuth 2.0 authentication protocol.",
          items: [
            { label: "Zero Credential Storage", text: "Éliciné never asks for, views, processes, or stores your Google account password at any time." },
            { label: "Authorized Data Transmission", text: "By selecting \"Continue with Google\", the user authorizes Google to transmit minimal required identifiers to our identity manager: unique account identifier (Google UID), full name, verified email address, and public profile picture." }
          ]
        },
        {
          type: "subsection",
          title: "3.2. User Responsibility",
          text: "Each user is responsible for maintaining the confidentiality of access to their physical terminal (computer, smartphone, tablet) and securing their active session. Any activity executed from a logged-in account is presumed to originate from the registered account holder."
        }
      ]
    },
    {
      id: "article-4",
      title: "ARTICLE 4: PRIVACY POLICY AND PERSONAL DATA MANAGEMENT",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné strictly adheres to a data minimization policy: only technically and functionally indispensable data is collected."
        },
        {
          type: "subsection",
          title: "4.1. Categories of Processed Data",
          items: [
            { label: "User Profile Data", text: "Unique Supabase technical identifier, email address, display name, and profile photo URL transmitted by the identity provider." },
            { label: "Session Data & Preferences", text: "Saved film watchlists, viewing preferences, Pass Pro subscription status, and AI assistant interaction logs." },
            { label: "Connection & Technical Location Data", text: "Technical IP address (temporarily processed for network security), User-Agent header, declared browser language, and approximate geographic region (country/timezone). This location strictly configures the default interface language and relevant local theatrical/streaming catalog filters." }
          ]
        },
        {
          type: "subsection",
          title: "4.2. Specific Purposes of Processing",
          text: "Collected data undergoes automated processing for the following purposes:",
          orderedItems: [
            "Opening, maintaining, and synchronizing secure user sessions across PWAs and web browsers.",
            "Instant entitlement and activation of features tied to Pass Pro membership status.",
            "Algorithmic personalization of cinematic suggestions.",
            "Prevention of abuse, unauthorized access, and technical security breaches."
          ]
        },
        {
          type: "subsection",
          title: "4.3. Strict Prohibition of Data Commercialization",
          text: "Éliciné upholds a strict zero-sale policy: no personal information, email address, search query history, or usage profile is ever sold, rented, leased, or shared with data brokers, advertisers, or third-party marketing networks."
        },
        {
          type: "subsection",
          title: "4.4. Retention Period",
          text: "User account data is retained for the duration of account activity. In the event of prolonged inactivity exceeding twenty-four (24) consecutive months or upon express user request, all personal data is permanently and irreversibly purged from our production databases."
        }
      ]
    },
    {
      id: "article-5",
      title: "ARTICLE 5: \"PASS PRO\" OFFER, PRICING, AND PAYMENTS",
      blocks: [
        {
          type: "subsection",
          title: "5.1. Nature and Scope of Offer",
          text: "Users may subscribe to the optional Pass Pro plan (benchmark price: $1.99 USD or equivalent in local currency at checkout). This upgrade removes artificial intelligence query limitations, unlocks advanced search filters, and grants priority access to new features."
        },
        {
          type: "subsection",
          title: "5.2. Security of Financial Transactions",
          text: "All payment transactions are handled through authorized payment service providers (international credit/debit cards and regional mobile money gateways).",
          items: [
            { label: "No Financial Storage", text: "Éliciné does not store, see, or archive any payment card numbers, CVVs, or bank credentials." },
            { label: "Encrypted Validation", text: "Payment processors solely return a technical webhook validation token confirming transaction success to activate Pro privileges on the user's account." }
          ]
        }
      ]
    },
    {
      id: "article-6",
      title: "ARTICLE 6: INTELLECTUAL PROPERTY AND USAGE LICENSE",
      blocks: [
        {
          type: "subsection",
          title: "1. Éliciné Trademark and Software",
          text: "The Éliciné name, the https://elicine.app domain name, software architecture, visual interface design, user experience, and internally developed algorithms are the exclusive property of the publisher and protected by international intellectual property laws."
        },
        {
          type: "subsection",
          title: "2. Cinematographic Content",
          text: "Film titles, official posters, set photos, synopsis excerpts, and promotional artwork belong entirely to their respective producers, directors, distributors, and copyright holders. Éliciné claims no ownership over third-party materials displayed strictly for indexing, informational, and cultural critique purposes."
        }
      ]
    },
    {
      id: "article-7",
      title: "ARTICLE 7: DISCLAIMER OF WARRANTIES AND LIMITATION OF LIABILITY",
      blocks: [
        {
          type: "bullet_list",
          items: [
            { text: "The Service is accessible 24/7 subject to occasional technical downtime, routine maintenance intervals, or network disruptions attributable to global telecommunications providers." },
            { text: "Recommendations produced by artificial intelligence models are provided strictly for informational and entertainment purposes. The publisher shall not be held liable for any minor metadata inaccuracies in film records or recommendations not matching user subjective expectations." }
          ]
        }
      ]
    },
    {
      id: "article-8",
      title: "ARTICLE 8: EXERCISE OF RIGHTS AND ACCOUNT DELETION",
      blocks: [
        {
          type: "paragraph",
          text: "Every user possesses the right to access their data, request rectification, object to processing on legitimate grounds, and obtain complete erasure of their account."
        },
        {
          type: "paragraph",
          text: "To exercise these rights or request immediate permanent deletion of your account and all associated records from our Supabase database, submit a written request:"
        },
        {
          type: "bullet_list",
          items: [
            { label: "By email to", text: "support@elicine.app or contact@elicine.app", email: "support@elicine.app" },
            { label: "Required detail", text: "Specifying the email address associated with your Google sign-in account." }
          ]
        },
        {
          type: "paragraph",
          text: "Requests are processed within a maximum of 72 business hours following receipt."
        }
      ]
    },
    {
      id: "article-9",
      title: "ARTICLE 9: JURISDICTION AND AMENDMENTS TO TERMS",
      blocks: [
        {
          type: "paragraph",
          text: "Éliciné reserves the right to modify and update these Terms to reflect technical, functional, or legal developments. The currently enforceable version is continuously accessible at: https://elicine.app/terms."
        }
      ]
    }
  ]
};
