import { useEffect, useState } from "react";
import { MILESTONES } from "../data";
import { Phone, Mail, Instagram, Linkedin, Facebook, ArrowUpRight, House, Building2, Trophy, Globe2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_URL as API, resolveMediaUrl, SITE_URL } from "../config";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildAboutPageSchema } from "../utils/seo";


function toWhatsApp(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

const DEFAULT_HOMEPAGE_SETTINGS = {
  launch_title: "Why Triad Realty?",
  launch_description:
    "Renowned for curated UAE launches, sharp market intelligence, and client-first advisory, Triad Realty blends developer access with disciplined investment guidance.",
  launch_video_url: "",
  stat1_value: "200,000+",
  stat1_label: "Homes delivered*",
  stat2_value: "154,000+",
  stat2_label: "In planning and progress*",
  stat3_value: "100+",
  stat3_label: "Awards received",
  stat4_value: "11",
  stat4_label: "Countries",
  founders_image_url: "https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg",
  team_comes_first: false,
};

const extractYouTubeId = (url = "") => {
  const match = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|v\/|watch\?v=|watch\?.+&v=))([^&?/]+)/
  );
  return match?.[1] || "";
};

const makeAutoplayAndMute = (html) => {
  if (!html) return html;
  const srcRegex = /src="([^"]+)"/;
  const match = html.match(srcRegex);
  if (match && match[1]) {
    let url = match[1];
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      if (url.includes("?")) {
        if (!url.includes("autoplay=")) url += "&autoplay=1";
        if (!url.includes("mute=")) url += "&mute=1";
      } else {
        url += "?autoplay=1&mute=1";
      }
      html = html.replace(srcRegex, `src="${url}"`);
    }
  }
  if (!html.includes("allow=")) {
    html = html.replace("<iframe", '<iframe allow="autoplay"');
  } else if (!html.includes("autoplay")) {
    html = html.replace(/allow="([^"]+)"/, 'allow="$1; autoplay"');
  }
  return html;
};


export default function About() {
  const [founders, setFounders] = useState([]);
  const [team, setTeam] = useState([]);
  const [homepageSettings, setHomepageSettings] = useState(DEFAULT_HOMEPAGE_SETTINGS);

  useEffect(() => {
    Promise.allSettled([
      axios.get(`${API}/team`),
      axios.get(`${API}/settings/homepage`),
    ]).then(([teamRes, settingsRes]) => {
      if (teamRes.status === "fulfilled") {
        const allTeam = teamRes.value.data.results || [];
        setFounders(
          allTeam
            .filter((t) => t && t.isFounder && t.tier !== "none")
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        );
        setTeam(
          allTeam
            .filter((t) => t && !t.isFounder && t.tier !== "none" && t.showOnAbout !== false)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        );
      }
      if (settingsRes.status === "fulfilled" && settingsRes.value.data) {
        setHomepageSettings({ ...DEFAULT_HOMEPAGE_SETTINGS, ...settingsRes.value.data });
      }
    }).catch(() => { });
  }, []);

  const youtubeId = extractYouTubeId(homepageSettings.launch_video_url);
  const launchStats = [
    { value: homepageSettings.stat1_value, label: homepageSettings.stat1_label, icon: House },
    { value: homepageSettings.stat2_value, label: homepageSettings.stat2_label, icon: Building2 },
    { value: homepageSettings.stat3_value, label: homepageSettings.stat3_label, icon: Trophy },
    { value: homepageSettings.stat4_value, label: homepageSettings.stat4_label, icon: Globe2 },
  ];

  const renderFounders = () => (
    <section className="section-pad bg-[var(--ink)] text-white relative" data-testid="about-founders" key="founders">
      <div className="grain absolute inset-0" />
      <div className="container-x relative">
        <div className="overline text-[var(--gold)]">The Founders</div>
        <h2 className="font-display text-4xl md:text-6xl mt-3 leading-none">Three. Triad.</h2>

        {/* Three Founders Group Photo — full colour with text overlay */}
        <div className="w-full aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] overflow-hidden relative shadow-lg mt-12 img-zoom border border-white/10">
          <img
            src={resolveMediaUrl(homepageSettings.founders_image_url)}
            alt="Three Founders of Triad Realty"
            width={1200}
            height={514}
            loading="lazy"
            style={{ objectFit: "cover", objectPosition: "50% 20%" }}
            className="w-full h-full object-cover transition-all duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-5 sm:p-8 md:p-12">
            <h2 className="font-display text-2xl sm:text-4xl md:text-5xl text-white">Three founders. One conviction.</h2>
          </div>
        </div>

        {/* Founder Cards — directly below the photo, Home-page dark style */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          {founders.map((f) => (
            <div key={f.id || f.name} className="group" data-testid={`founder-${(f.name || "").toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="aspect-[3/4] img-zoom bg-[var(--surface-dark,#141414)] relative">
                {f.photo ? (
                  <img 
                    src={resolveMediaUrl(f.photo)} 
                    alt={`Triad Realty Founder ${f.name}`} 
                    width={300}
                    height={400}
                    loading="lazy"
                    style={{ objectFit: "cover", objectPosition: "50% 30%" }} 
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/5 text-white">
                    <span className="font-display text-6xl text-[var(--gold)]">
                      {(f.name || "").split(" ").map((part) => part[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <Link to={`/team/${f.id}`} className="btn-gold !px-6 !py-3">View More</Link>
                </div>
              </div>
              <h3 className="font-display text-2xl mt-5">
                <Link to={`/team/${f.id}`} className="hover:text-[var(--gold)] transition-colors">{f.name}</Link>
              </h3>
              <p className="overline opacity-60 mt-1">{f.role || "Founder"}</p>
              <div className="flex gap-2.5 mt-4 relative z-10">
                {f.phone && (
                  <a
                    href={toWhatsApp(f.phone)}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Phone size={13} />
                  </a>
                )}
                {f.email && (
                  <a
                    href={`mailto:${f.email}`}
                    title="Email"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Mail size={13} />
                  </a>
                )}
                {f.instagram && (
                  <a
                    href={f.instagram}
                    target="_blank"
                    rel="noreferrer"
                    title="Instagram"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Instagram size={13} />
                  </a>
                )}
                {f.linkedin && (
                  <a
                    href={f.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    title="LinkedIn"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Linkedin size={13} />
                  </a>
                )}
                {f.facebook && (
                  <a
                    href={f.facebook}
                    target="_blank"
                    rel="noreferrer"
                    title="Facebook"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Facebook size={13} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const renderTeam = () => (
    <section className="section-pad bg-[var(--ink)] text-white relative" data-testid="about-team" key="team">
      <div className="grain absolute inset-0" />
      <div className="container-x relative">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-14">
          <div>
            <div className="overline text-[var(--gold)]">The Team</div>
            <h2 className="font-display text-4xl md:text-6xl mt-3 leading-none">Senior consultants. Specialised desks.</h2>
          </div>
          <Link to="/team" className="btn-gold whitespace-nowrap self-start md:self-auto">Meet the Team <ArrowUpRight size={14} /></Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {team.map((t) => (
            <div key={t.id || t.name} className="group" data-testid={`about-team-${(t.name || "").toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="aspect-[3/4] img-zoom bg-[var(--surface-dark,#141414)] relative">
                {t.photo ? (
                  <img 
                    src={resolveMediaUrl(t.photo)} 
                    alt={`Triad Realty Team Member ${t.name}`} 
                    width={300}
                    height={400}
                    loading="lazy"
                    style={{ objectFit: "cover", objectPosition: "50% 30%" }} 
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/5 text-white">
                    <span className="font-display text-6xl text-[var(--gold)]">
                      {(t.name || "").split(" ").map((part) => part[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <Link to={`/team/${t.id}`} className="btn-gold !px-6 !py-3">View More</Link>
                </div>
              </div>
              <h3 className="font-display text-2xl mt-5">{t.name}</h3>
              <p className="overline opacity-60 mt-1">{t.role || "Property Consultant"}</p>
              <div className="flex gap-2.5 mt-4 relative z-10">
                {t.phone && (
                  <a
                    href={toWhatsApp(t.phone)}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Phone size={13} />
                  </a>
                )}
                {t.email && (
                  <a
                    href={`mailto:${t.email}`}
                    title="Email"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Mail size={13} />
                  </a>
                )}
                {t.instagram && (
                  <a
                    href={t.instagram}
                    target="_blank"
                    rel="noreferrer"
                    title="Instagram"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Instagram size={13} />
                  </a>
                )}
                {t.linkedin && (
                  <a
                    href={t.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    title="LinkedIn"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Linkedin size={13} />
                  </a>
                )}
                {t.facebook && (
                  <a
                    href={t.facebook}
                    target="_blank"
                    rel="noreferrer"
                    title="Facebook"
                    className="w-8 h-8 flex items-center justify-center border border-white/20 hover:border-[var(--gold)] hover:text-[var(--gold)] text-white transition-colors"
                  >
                    <Facebook size={13} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-white/20 pt-10 flex flex-wrap items-center justify-between gap-4">
          <p className="font-display text-2xl">Want to work alongside this team?</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/careers" className="btn-gold">View Open Positions <ArrowUpRight size={14} /></Link>
            <Link to="/team" className="btn-ghost-light">View All Members <ArrowUpRight size={14} /></Link>
          </div>
        </div>
      </div>
    </section>
  );

  const canonicalUrl = `${SITE_URL}/about`;
  // Full AboutPage + Corporation schema with founders from the live team data
  const aboutSchema = buildAboutPageSchema(founders, canonicalUrl);

  return (
    <>
      <Helmet>
        <title>About Us | Triad Realty Dubai</title>
        <meta name="description" content="Discover Triad Realty, a premier Dubai-based property consultancy founded on sharp market intelligence, discretion, and data-led portfolio planning." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="About Us | Triad Realty Dubai" />
        <meta property="og:description" content="Learn about our team, conviction, and premium real estate advisory services in the UAE." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <script type="application/ld+json">{JSON.stringify(aboutSchema)}</script>
      </Helmet>


      <section className="relative h-[45vh] min-h-[350px] w-full overflow-hidden bg-neutral-950 flex items-end pb-12 border-b border-white/10" data-testid="about-hero">
        <img
          src="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444297/background_fualmf.png"
          alt="Triad Realty Banner"
          width={1920}
          height={600}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover opacity-45"
        />
        {/* Gradient overlay for contrast and premium feel */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/60 z-[2]" />
        
        <div className="container-x relative px-5 lg:px-12 z-[3] w-full">
          <div className="max-w-4xl">
            <Breadcrumbs items={[{ label: "About", url: "/about" }]} />
            <div className="overline text-[var(--gold)] tracking-[0.25em] text-xs">About Triad</div>
            <h1 className="font-display text-4xl md:text-5xl mt-3 tracking-tight leading-tight text-white">
              Property, practiced as a <em className="text-[var(--gold)]">craft.</em>
            </h1>
            <p className="text-sm md:text-base mt-4 text-white/70 max-w-2xl leading-relaxed">
              We're a Dubai-based consultancy that treats real estate the way a great gallery treats an artist's catalogue — with research, restraint, and the long view.
            </p>
          </div>
        </div>
      </section>

      <section className="section-pad bg-[var(--bg-alt)]" data-testid="about-who">
        <div className="container-x grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <div className="overline text-[var(--gold-deep)]">Who We Are</div>
            <h2 className="font-display text-4xl md:text-5xl mt-5 leading-tight">
              Three founders, one principle: the client first.
            </h2>
          </div>
          <div className="lg:col-span-7 text-lg leading-relaxed space-y-6 text-[var(--ink-2)]">
            <p>
              Triad Realty was founded in 2025 by three property consultants who had spent years inside the largest brokerages in the UAE — and quietly believed clients deserved something better. Less hard-selling. More analysis. More patience.
            </p>
            <p>
              We're a young firm with deep operator experience. Our curated portfolio is small by design: a handful of trusted developers, a research desk that authors its own market notes, and a tight team of senior consultants who know every floor plan in our active list.
            </p>
            <p>
              We are licensed by the Dubai Land Department, RERA registered, and proud to be one of the most referred consultancies in the UAE.
            </p>
          </div>
        </div>
      </section>



      {/* ABOUT TRIAD REALTY */}
      <section className="section-pad bg-white latest-launch-updates" data-testid="about-launch-updates">
        <div className="container-x">
          <div className="text-center max-w-5xl mx-auto mb-12" data-reveal>
            <div className="overline text-[var(--gold-deep)]">ABOUT TRIAD REALTY</div>
            <h2 className="font-display text-4xl md:text-6xl mt-5 leading-none">{homepageSettings.launch_title}</h2>
            <p className="text-lg leading-relaxed text-[var(--ink-2)] mt-6">
              {homepageSettings.launch_description}
            </p>
          </div>

          <div className="max-w-4xl mx-auto" data-reveal>
            <div className="aspect-video bg-[var(--ink)] relative overflow-hidden shadow-2xl shadow-black/10">
              {youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1`}
                  title="Latest launch update video"
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--ink)]">
                  <div className="w-20 h-20 border border-[var(--gold)] text-[var(--gold)] flex items-center justify-center">
                    <Play size={30} fill="currentColor" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad bg-white" data-testid="about-journey">
        <div className="container-x">
          <div className="overline text-[var(--gold-deep)]">Our Journey</div>
          <h2 className="font-display text-4xl md:text-6xl mt-3 leading-none">A short timeline.</h2>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--line)]" data-reveal>
            {MILESTONES.map((m) => (
              <div key={m.year} className="bg-white p-10">
                <div className="font-display text-6xl text-[var(--gold-deep)] leading-none">{m.year}</div>
                <p className="text-base mt-6 max-w-xs leading-relaxed">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {renderFounders()}
      {renderTeam()}
    </>
  );
}
