import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ParallaxShowcase from "../components/ParallaxShowcase";
import { Helmet } from "react-helmet-async";
import { SITE_URL } from "../config";


export default function ExperienceImmersive() {
  const canonicalUrl = `${SITE_URL}/experience-immersive`;
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Immersive UAE Real Estate Experience | Triad Realty",
    url: canonicalUrl,
    description: "Take an immersive, interactive virtual tour of premier off-plan and resale properties in Dubai. Premium property portfolio previews.",
    publisher: {
      "@type": "Organization",
      name: "Triad Realty",
      url: SITE_URL,
      logo: "https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444277/logo_ciuljv.png",
    },
  };

  return (
    <div className="bg-[var(--ink)] min-h-screen" data-testid="experience-immersive-page">
      <Helmet>
        <title>Immersive UAE Real Estate Experience | Triad Realty</title>
        <meta name="description" content="Take an immersive, interactive virtual tour of premier off-plan and resale properties in Dubai. Premium property portfolio previews." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="Immersive UAE Real Estate Experience | Triad Realty" />
        <meta property="og:description" content="Take an immersive virtual tour of premier properties in Dubai." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <script type="application/ld+json">{JSON.stringify(pageSchema)}</script>
      </Helmet>

      <div className="sticky top-0 z-40 border-b border-white/10 bg-[var(--ink)]/90 backdrop-blur-md">
        <div className="container-x flex items-center justify-between py-4 px-5 lg:px-12">
          <Link
            to="/"
            className="text-[11px] uppercase tracking-[0.22em] text-white/70 hover:text-[var(--gold)] flex items-center gap-2 transition-colors"
            data-testid="immersive-back-home"
          >
            <ArrowLeft size={14} /> Triad Realty
          </Link>
          <span className="overline text-[var(--gold)] hidden sm:inline">Immersive Experience</span>
          <Link to="/contact" className="btn-gold !py-3 !px-5" data-testid="immersive-contact">
            Consultation
          </Link>
        </div>
      </div>

      <ParallaxShowcase showIntro showOutro={false} />
    </div>
  );
}
