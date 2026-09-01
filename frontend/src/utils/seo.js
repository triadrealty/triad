/**
 * seo.js — Centralised Schema.org JSON-LD builder utilities for Triad Realty.
 *
 * Usage: import { buildOrgSchema, buildBreadcrumbSchema, ... } from "../utils/seo";
 * Each function returns a plain object ready for JSON.stringify in a <script type="application/ld+json">.
 */

import { SITE_URL } from "../config";

// ── Organisation constants ──────────────────────────────────────────────────
const ORG_NAME = "Triad Realty";
const ORG_URL = SITE_URL;
const ORG_LOGO = "https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444277/logo_ciuljv.png";
const ORG_IMAGE = "https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg";
const ORG_PHONE = "+971545193393";
const ORG_EMAIL = "info@triadrealty.ae";
const ORG_ADDRESS = {
  "@type": "PostalAddress",
  streetAddress: "Marina Plaza, Office 1402",
  addressLocality: "Dubai Marina",
  addressRegion: "Dubai",
  postalCode: "00000",
  addressCountry: "AE",
};
const ORG_GEO = {
  "@type": "GeoCoordinates",
  latitude: 25.0819,
  longitude: 55.1367,
};
const ORG_SOCIAL = [
  "https://www.instagram.com/triadrealty.ae",
  "https://www.linkedin.com/company/triadrealty-ae/",
  "https://www.facebook.com/triadrealty.ae",
];
const ORG_OPENING_HOURS = ["Mo-Sa 09:00-18:00"];

// ── 1. RealEstateAgent / LocalBusiness (Organisation) ──────────────────────
export function buildOrgSchema() {
  return {
    "@context": "https://schema.org",
    "@type": ["RealEstateAgent", "LocalBusiness"],
    "@id": `${ORG_URL}/#organization`,
    name: ORG_NAME,
    url: ORG_URL,
    logo: {
      "@type": "ImageObject",
      url: ORG_LOGO,
      width: 400,
      height: 100,
    },
    image: ORG_IMAGE,
    description:
      "Discreet, data-led property consultancy across Dubai and the Northern Emirates — off-plan investments, resale acquisitions, and luxury portfolio management.",
    telephone: ORG_PHONE,
    email: ORG_EMAIL,
    address: ORG_ADDRESS,
    geo: ORG_GEO,
    openingHours: ORG_OPENING_HOURS,
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        opens: "09:00",
        closes: "18:00",
      },
    ],
    priceRange: "AED 500,000 – AED 50,000,000",
    currenciesAccepted: "AED",
    areaServed: [
      { "@type": "City", name: "Dubai" },
      { "@type": "City", name: "Abu Dhabi" },
      { "@type": "City", name: "Sharjah" },
    ],
    hasMap: "https://maps.google.com/?q=Marina+Plaza+Dubai+Marina",
    sameAs: ORG_SOCIAL,
  };
}

// ── 2. WebSite with SearchAction ──────────────────────────────────────────
export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${ORG_URL}/#website`,
    name: ORG_NAME,
    url: ORG_URL,
    description: "UAE luxury real estate — off-plan launches, resale acquisitions, and portfolio management in Dubai.",
    publisher: { "@id": `${ORG_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${ORG_URL}/projects?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

// ── 3. BreadcrumbList ─────────────────────────────────────────────────────
/**
 * @param {Array<{name: string, url: string}>} items
 * First item is always treated as position 1; include Home explicitly if needed.
 */
export function buildBreadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: ORG_URL },
      ...items.map((item, idx) => ({
        "@type": "ListItem",
        position: idx + 2,
        name: item.name,
        item: item.url.startsWith("http") ? item.url : `${ORG_URL}${item.url}`,
      })),
    ],
  };
}

// ── 4. RealEstateListing / Product (for project pages) ───────────────────
/**
 * @param {Object} p — project view model from ProjectDetail
 */
export function buildRealEstateListingSchema(p, canonicalUrl) {
  if (!p) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#listing`,
    name: p.name,
    description: p.description || p.tagline || "",
    url: canonicalUrl,
    image: p.gallery
      ? [p.hero, ...p.gallery].filter(Boolean).map((url) => ({
          "@type": "ImageObject",
          url,
          width: 1200,
          height: 800,
        }))
      : p.hero
      ? [{ "@type": "ImageObject", url: p.hero, width: 1200, height: 800 }]
      : undefined,
    brand: {
      "@type": "Brand",
      name: p.developer || ORG_NAME,
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "AED",
      price: p.price_from || 0,
      priceValidUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      availability: "https://schema.org/InStock",
      seller: {
        "@type": "RealEstateAgent",
        name: ORG_NAME,
        url: ORG_URL,
      },
    },
    additionalProperty: [
      p.emirate && {
        "@type": "PropertyValue",
        name: "Emirate",
        value: p.emirate,
      },
      p.location && {
        "@type": "PropertyValue",
        name: "Location",
        value: p.location,
      },
      p.handover && {
        "@type": "PropertyValue",
        name: "Handover",
        value: p.handover,
      },
      p.sqft_from && {
        "@type": "PropertyValue",
        name: "Starting Size",
        value: `${p.sqft_from} sqft`,
      },
      p.configuration?.length && {
        "@type": "PropertyValue",
        name: "Configuration",
        value: p.configuration.join(", "),
      },
    ].filter(Boolean),
  };

  return schema;
}

// ── 5. BlogPosting / Article ──────────────────────────────────────────────
/**
 * @param {Object} b — blog object from BlogDetail
 */
export function buildArticleSchema(b, canonicalUrl) {
  if (!b) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${canonicalUrl}#article`,
    headline: b.title,
    name: b.title,
    description: b.excerpt || "",
    image: b.cover
      ? {
          "@type": "ImageObject",
          url: b.cover,
          width: 1200,
          height: 675,
        }
      : undefined,
    url: canonicalUrl,
    datePublished: b.date || b.created_at || new Date().toISOString(),
    dateModified: b.updated_at || b.date || new Date().toISOString(),
    author: {
      "@type": "Person",
      name: b.author || "Triad Consultant",
      url: ORG_URL,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${ORG_URL}/#organization`,
      name: ORG_NAME,
      logo: {
        "@type": "ImageObject",
        url: ORG_LOGO,
        width: 400,
        height: 100,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    keywords: b.category ? [b.category, "Dubai Real Estate", "UAE Property"] : ["Dubai Real Estate", "UAE Property"],
    articleSection: b.category || "Real Estate",
    wordCount: b.content ? b.content.split(/\s+/).length : undefined,
    timeRequired: b.read_minutes ? `PT${b.read_minutes}M` : undefined,
    inLanguage: "en-AE",
  };
}

// ── 6. Person (for team member pages) ─────────────────────────────────────
/**
 * @param {Object} m — team member object
 */
export function buildPersonSchema(m, canonicalUrl) {
  if (!m) return null;
  const sameAs = [
    m.instagram,
    m.linkedin,
    m.facebook,
  ].filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${canonicalUrl}#person`,
    name: m.name,
    url: canonicalUrl,
    image: m.photo
      ? { "@type": "ImageObject", url: m.photo, width: 600, height: 800 }
      : undefined,
    jobTitle: m.role || "Property Consultant",
    description: m.bio || "",
    email: m.email || undefined,
    telephone: m.phone || undefined,
    worksFor: {
      "@type": "RealEstateAgent",
      "@id": `${ORG_URL}/#organization`,
      name: ORG_NAME,
      url: ORG_URL,
    },
    knowsLanguage: m.speaks
      ? m.speaks.split(/[,،]/).map((l) => l.trim()).filter(Boolean)
      : undefined,
    hasOccupation: {
      "@type": "Occupation",
      name: m.role || "Property Investment Consultant",
      occupationalCategory: "Real Estate",
    },
    sameAs: sameAs.length ? sameAs : undefined,
  };
}

// ── 7. CollectionPage with Person references (team list) ──────────────────
/**
 * @param {Array} members — team member array
 */
export function buildTeamListSchema(members, canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonicalUrl}#teamlist`,
    name: "Triad Realty Advisory Panel & Consultants",
    url: canonicalUrl,
    description: "Meet our team of co-founders, senior portfolio managers, and property investment consultants.",
    publisher: { "@id": `${ORG_URL}/#organization` },
    hasPart: members.map((m) => ({
      "@type": "Person",
      name: m.name,
      jobTitle: m.role || "Property Consultant",
      url: `${ORG_URL}/team/${m.id}`,
      image: m.photo || undefined,
    })),
  };
}

// ── 8. JobPosting (for careers page) ─────────────────────────────────────
/**
 * @param {Object} job — job listing object
 */
export function buildJobPostingSchema(job) {
  if (!job) return null;
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.summary || job.description || "",
    datePosted: job.created_at || new Date().toISOString().split("T")[0],
    validThrough: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    employmentType: job.type?.toUpperCase().replace(/[- ]/g, "_") || "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: ORG_NAME,
      sameAs: ORG_URL,
      logo: ORG_LOGO,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        ...ORG_ADDRESS,
        addressLocality: job.location || "Dubai Marina",
      },
    },
    baseSalary: job.split
      ? {
          "@type": "MonetaryAmount",
          currency: "AED",
          value: { "@type": "QuantitativeValue", value: job.split, unitText: "COMMISSION" },
        }
      : undefined,
  };
}

// ── 9. AggregateRating + Review array (for reviews page) ─────────────────
/**
 * @param {Array} reviews  — review objects from API
 * @param {Object} settings — page settings with average_rating
 */
export function buildAggregateRatingSchema(reviews, settings) {
  const avg = settings?.average_rating || 4.9;
  const count = reviews.length || 1;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${ORG_URL}/#organization`,
    name: ORG_NAME,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: avg.toString(),
      bestRating: "5",
      worstRating: "1",
      ratingCount: count,
      reviewCount: count,
    },
    review: reviews.slice(0, 10).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.name || "Anonymous" },
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(r.rating || 5),
        bestRating: "5",
        worstRating: "1",
      },
      reviewBody: r.description || r.quote || "",
      datePublished: r.created_at || r.date || new Date().toISOString().split("T")[0],
    })),
  };
}

// ── 10. ImageGallery (for gallery page) ───────────────────────────────────
/**
 * @param {Array} items — gallery items from API
 */
export function buildImageGallerySchema(items, canonicalUrl) {
  const photos = items.filter((i) => i.type === "photo" || !i.type);
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    "@id": `${canonicalUrl}#gallery`,
    name: "Triad Realty — Media Gallery & Site Handovers",
    url: canonicalUrl,
    description: "Visual documentation of property site visits, construction milestones, and handover events across Dubai and the UAE.",
    publisher: { "@id": `${ORG_URL}/#organization` },
    hasPart: photos.slice(0, 20).map((item) => ({
      "@type": "ImageObject",
      url: item.url || item.photo || "",
      name: item.caption || item.title || "Triad Realty Property Photo",
      description: item.caption || "Triad Realty property site visit or handover",
    })),
  };
}

// ── 11. FAQPage (for Analysis / Dubai Report) ──────────────────────────
export function buildFAQSchema(faqs) {
  if (!faqs || !faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

// ── 12. WebApplication (for Analysis tool) ────────────────────────────────
export function buildWebAppSchema(canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Triad Realty Market Analysis Tool",
    url: canonicalUrl,
    description: "Interactive UAE real estate market analysis tool — compare project pricing, ROI, and transaction volumes across Dubai developments.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "AED",
      availability: "https://schema.org/OnlineOnly",
    },
    publisher: { "@id": `${ORG_URL}/#organization` },
  };
}

// ── 13. AboutPage + Corporation (for About page) ─────────────────────────
export function buildAboutPageSchema(founders, canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${canonicalUrl}#aboutpage`,
    name: "About Triad Realty",
    url: canonicalUrl,
    description:
      "Learn about Triad Realty — a UAE-based real estate consultancy founded by three co-founders with expertise in off-plan investments and luxury portfolio management.",
    mainEntity: {
      "@type": "Corporation",
      "@id": `${ORG_URL}/#organization`,
      name: ORG_NAME,
      url: ORG_URL,
      logo: ORG_LOGO,
      foundingDate: "2024",
      foundingLocation: {
        "@type": "Place",
        address: ORG_ADDRESS,
      },
      founders: founders?.map((f) => ({
        "@type": "Person",
        name: f.name,
        jobTitle: f.role || "Co-Founder",
        url: f.id ? `${ORG_URL}/team/${f.id}` : ORG_URL,
        image: f.photo || undefined,
      })) || [],
      employee: {
        "@type": "QuantitativeValue",
        minValue: 5,
        maxValue: 50,
      },
      areaServed: ["Dubai", "Abu Dhabi", "Sharjah", "UAE"],
      sameAs: ORG_SOCIAL,
    },
  };
}

// ── 14. ContactPage + LocalBusiness (for Contact page) ───────────────────
export function buildContactPageSchema(canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "@id": `${canonicalUrl}#contactpage`,
    name: "Contact Triad Realty",
    url: canonicalUrl,
    description: "Book a consultation with a Triad Realty property advisor in Dubai. Available Monday to Saturday, 9AM to 6PM GST.",
    mainEntity: {
      "@type": ["RealEstateAgent", "LocalBusiness"],
      "@id": `${ORG_URL}/#organization`,
      name: ORG_NAME,
      url: ORG_URL,
      telephone: ORG_PHONE,
      email: ORG_EMAIL,
      address: ORG_ADDRESS,
      geo: ORG_GEO,
      hasMap: "https://maps.google.com/?q=Marina+Plaza+Dubai+Marina",
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          opens: "09:00",
          closes: "18:00",
        },
      ],
      contactPoint: [
        {
          "@type": "ContactPoint",
          telephone: ORG_PHONE,
          contactType: "customer service",
          areaServed: "AE",
          availableLanguage: ["English", "Arabic", "Hindi", "Malayalam"],
        },
        {
          "@type": "ContactPoint",
          email: ORG_EMAIL,
          contactType: "sales",
          areaServed: "AE",
        },
      ],
    },
  };
}
