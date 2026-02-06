import { useEffect } from 'react';
import { useLocation } from 'wouter';

// Idiomas soportados
const SUPPORTED_LANGUAGES = ['es', 'en', 'pt', 'fr', 'de'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

interface SEOHeadProps {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
  keywords?: string;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
}

export function SEOHead({
  title,
  description,
  canonical,
  image = '/images/og-image.jpg',
  type = 'website',
  noindex = false,
  keywords,
  publishedTime,
  modifiedTime,
  author = 'Cancagua Spa & Retreat Center'
}: SEOHeadProps) {
  const [location] = useLocation();
  const fullTitle = title.includes('Cancagua') ? title : `${title} | Cancagua Spa`;
  const baseUrl = 'https://cancagua.cl';
  
  // Detectar idioma actual de la URL
  const getCurrentLanguage = (): SupportedLanguage => {
    const match = location.match(/^\/([a-z]{2})(\/|$)/);
    if (match && SUPPORTED_LANGUAGES.includes(match[1] as SupportedLanguage)) {
      return match[1] as SupportedLanguage;
    }
    return 'es';
  };
  
  // Obtener path sin prefijo de idioma
  const getPathWithoutLanguage = (): string => {
    const match = location.match(/^\/[a-z]{2}(\/.*)?$/);
    if (match && SUPPORTED_LANGUAGES.includes(location.substring(1, 3) as SupportedLanguage)) {
      return match[1] || '/';
    }
    return location;
  };
  
  const currentLang = getCurrentLanguage();
  const cleanPath = getPathWithoutLanguage();
  
  // Generar URL para cada idioma
  const getUrlForLanguage = (lang: SupportedLanguage): string => {
    if (lang === 'es') {
      return `${baseUrl}${cleanPath}`;
    }
    return `${baseUrl}/${lang}${cleanPath === '/' ? '' : cleanPath}`;
  };
  
  const fullCanonical = canonical ? `${baseUrl}${canonical}` : getUrlForLanguage(currentLang);
  const fullImage = image.startsWith('http') ? image : `${baseUrl}${image}`;

  useEffect(() => {
    // Update document title
    document.title = fullTitle;

    // Helper to update or create meta tag
    const updateMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    // Helper to update or create link tag
    const updateLink = (rel: string, href: string) => {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
    };

    // Basic SEO
    updateMeta('description', description);
    updateMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow');
    if (keywords) updateMeta('keywords', keywords);
    updateMeta('author', author);

    // Canonical
    updateLink('canonical', fullCanonical);
    
    // Hreflang tags para SEO multiidioma
    const updateHreflang = (lang: string, href: string) => {
      const selector = `link[rel="alternate"][hreflang="${lang}"]`;
      let link = document.querySelector(selector) as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'alternate';
        link.hreflang = lang;
        document.head.appendChild(link);
      }
      link.href = href;
    };
    
    // Agregar hreflang para cada idioma
    SUPPORTED_LANGUAGES.forEach(lang => {
      const langCode = lang === 'es' ? 'es-CL' : lang;
      updateHreflang(langCode, getUrlForLanguage(lang));
    });
    
    // x-default para usuarios sin preferencia
    updateHreflang('x-default', getUrlForLanguage('es'));
    
    // og:locale
    const localeMap: Record<SupportedLanguage, string> = {
      es: 'es_CL',
      en: 'en_US',
      pt: 'pt_BR',
      fr: 'fr_FR',
      de: 'de_DE',
    };
    updateMeta('og:locale', localeMap[currentLang], true);

    // Open Graph
    updateMeta('og:title', fullTitle, true);
    updateMeta('og:description', description, true);
    updateMeta('og:url', fullCanonical, true);
    updateMeta('og:image', fullImage, true);
    updateMeta('og:type', type, true);

    // Twitter Card
    updateMeta('twitter:title', fullTitle);
    updateMeta('twitter:description', description);
    updateMeta('twitter:image', fullImage);

    // Article specific
    if (type === 'article') {
      if (publishedTime) updateMeta('article:published_time', publishedTime, true);
      if (modifiedTime) updateMeta('article:modified_time', modifiedTime, true);
      updateMeta('article:author', author, true);
    }

  }, [fullTitle, description, fullCanonical, fullImage, type, noindex, keywords, publishedTime, modifiedTime, author]);

  return null;
}

export default SEOHead;
