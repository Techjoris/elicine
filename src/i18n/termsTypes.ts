export interface TermsArticleBlock {
  type: 'paragraph' | 'bullet_list' | 'ordered_list' | 'callout' | 'subsection';
  text?: string;
  title?: string;
  items?: { label?: string; text: string; link?: string; email?: string }[];
  orderedItems?: string[];
  calloutText?: string;
  calloutSubtext?: string;
}

export interface TermsArticle {
  id: string;
  title: string;
  blocks: TermsArticleBlock[];
}

export interface TermsTranslations {
  backBtn: string;
  backToApp: string;
  title: string;
  effectiveDateLabel: string;
  effectiveDate: string;
  lastUpdatedLabel: string;
  lastUpdated: string;
  intro: string[];
  articles: TermsArticle[];
  copyright: string;
}

export interface ConsentModalTranslations {
  title: string;
  description: string;
  readTermsLink: string;
  checkbox: string;
  button: string;
}
