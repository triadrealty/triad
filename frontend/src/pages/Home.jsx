import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Phone, Mail, Star, Quote, Instagram, Linkedin, Facebook } from "lucide-react";
import axios from "axios";
import { Helmet } from "react-helmet-async";

function toWhatsApp(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}
import { reallyApi } from "../services/api/realEstateApi";
import PartnerDevelopers from "../components/PartnerDevelopers";
import ConsultationModal from "../components/ConsultationModal";
import {
  MILESTONES,
  REVIEWS,
  WHY_TRIAD,
  COMPANY,
} from "../data";

import { API_URL as API, resolveMediaUrl, SITE_URL } from "../config";
import {
  buildOrgSchema,
  buildWebSiteSchema,
  buildAggregateRatingSchema,
} from "../utils/seo";


// Phone (portrait) video — used when viewport width < 768 px
const VIDEO_PHONE = "https://res.cloudinary.com/dhxttgpfj/video/upload/v1784666175/0707_1_1_yegyek.mp4";
// Desktop / wider-screen video — used when viewport width >= 768 px
const VIDEO_DESKTOP = "https://res.cloudinary.com/dhxttgpfj/video/upload/v1784666034/0707_1_1_wczzvk.mp4";

/** Returns the correct video URL for the current viewport width. */
const getVideoSrc = () =>
  window.innerWidth < 768 ? VIDEO_PHONE : VIDEO_DESKTOP;

const DEFAULT_HOMEPAGE_SETTINGS = {
  launch_title: "Why Triad Realty?",
  launch_description:
    "Renowned for curated UAE launches, sharp market intelligence, and client-first advisory, Triad Realty blends developer access with disciplined investment guidance.",
  launch_video_url: "",
  stat1_value: "50,000+",
  stat1_label: "Homes delivered*",
  stat2_value: "54,000+",
  stat2_label: "In planning and progress*",
  stat3_value: "100+",
  stat3_label: "Awards received",
  stat4_value: "9",
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

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [team, setTeam] = useState([]);
  const [homepageSettings, setHomepageSettings] = useState(DEFAULT_HOMEPAGE_SETTINGS);
  const [showBooking, setShowBooking] = useState(false);

  // --- Responsive video source ---
  const videoRef = useRef(null);
  const currentSrcRef = useRef("");

  const applyVideoSrc = useCallback(() => {
    const next = getVideoSrc();
    if (next === currentSrcRef.current) return; // no change needed
    currentSrcRef.current = next;
    const el = videoRef.current;
    if (!el) return;
    el.src = next;
    el.load();   // reload so the new source starts
    el.play().catch(() => {}); // autoplay after src swap
  }, []);

  useEffect(() => {
    // Set initial source
    applyVideoSrc();

    // Watch for resize events (debounced at ~150 ms)
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(applyVideoSrc, 150);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, [applyVideoSrc]);

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      reallyApi.getProperties({ perPage: 3 }),
      axios.get(`${API}/team`),
      axios.get(`${API}/settings/homepage`),
    ]).then(([projectRes, teamRes, settingsRes]) => {
      if (!isMounted) return;
      if (projectRes.status === "fulfilled") setProjects(projectRes.value.properties || []);
      if (teamRes.status === "fulfilled") setTeam(teamRes.value.data.results || []);
      if (settingsRes.status === "fulfilled") {
        setHomepageSettings({ ...DEFAULT_HOMEPAGE_SETTINGS, ...(settingsRes.value.data || {}) });
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const renderTeamSection = () => (
    <section className="section-pad bg-[var(--ink)] text-white relative" data-testid="home-team" key="home-team">
      <div className="grain absolute inset-0" />
      <div className="container-x relative">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-14">
          <div>
            <div className="overline text-[var(--gold)]">Our Team</div>
            <h2 className="font-display text-4xl md:text-6xl mt-3 leading-none">The consultants behind every deal.</h2>
          </div>
        </div>

        {/* Founders Group Photo — full colour with text overlay */}
        <div className="w-full aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] overflow-hidden relative shadow-lg mb-12 img-zoom border border-white/10">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {team
            .filter((t) => t && t.name && t.tier !== "none" && t.showOnHome !== false)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map((t) => (
              <div key={t.id || t.name} className="group" data-testid={`team-${t.name.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className="aspect-[3/4] img-zoom bg-[var(--surface-dark,#141414)] relative">
                  {t.photo ? (
                    <img
                      src={resolveMediaUrl(t.photo)}
                      alt={`Triad Realty Consultant ${t.name}`}
                      width={300}
                      height={400}
                      loading="lazy"
                      style={{ objectFit: "cover", objectPosition: "50% 30%" }}
                      className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/5 text-white">
                      <span className="font-display text-6xl text-[var(--gold)]">
                        {t.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
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
        <div className="mt-14 border-t border-white/20 pt-10 flex justify-between items-center">
          <h3 className="font-display text-3xl">Meet the full team</h3>
          <Link to="/team" className="btn-ghost-light">View All Members <ArrowRight size={14} /></Link>
        </div>
      </div>
    </section>
  );

  const canonicalUrl = SITE_URL;
  const orgSchema = buildOrgSchema();
  const websiteSchema = buildWebSiteSchema();
  // AggregateRating wired from the homepageSettings fallback
  const ratingSchema = buildAggregateRatingSchema([], {
    average_rating: 4.9,
  });


  return (
    <>
      <Helmet>
        <title>Triad Realty | Dubai Real Estate &amp; Off-Plan Properties</title>
        <meta name="description" content="Triad Realty — Dubai's expert property consultancy for off-plan investments, luxury resale acquisitions, and portfolio management across the UAE." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="Triad Realty | Dubai Real Estate &amp; Off-Plan Properties" />
        <meta property="og:description" content="Expert advisory for off-plan investments, luxury resale acquisitions, and portfolio management across Dubai and the UAE." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Triad Realty | Dubai Real Estate &amp; Off-Plan Properties" />
        <meta name="twitter:description" content="Expert advisory for off-plan investments, luxury resale acquisitions, and portfolio management across Dubai and the UAE." />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <script type="application/ld+json">{JSON.stringify(orgSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(websiteSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(ratingSchema)}</script>
      </Helmet>

      {/* HERO — responsive video (phone vs desktop auto-detected) */}
      <section className="relative h-screen w-full overflow-hidden bg-[var(--ink)]" data-testid="home-hero">
        <div className="absolute inset-0">
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-auto max-h-full object-contain md:min-w-full md:min-h-full md:object-cover pointer-events-none"
            data-testid="hero-video"
            /* src is set imperatively via videoRef so no prop needed here */
          />
          {/* subtle dark overlay */}
          <div className="absolute inset-0 z-[2] bg-black/20" />
          {/* mobile-only: covers the in-video Triad award logo in portrait crop */}
          <div className="absolute top-0 inset-x-0 z-[3] xl:hidden" style={{ height: '80px', background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 50%, rgba(0,0,0,0) 100%)' }} />
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/70 text-[10px] uppercase tracking-[0.4em] flex flex-col items-center gap-3 z-10">
          <span>Scroll</span>
          <div className="w-px h-10 bg-white/40 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-4 bg-[var(--gold)] scroll-cue" />
          </div>
        </div>
      </section>

      {/* HERO COPY — moved out of the video */}
      <section className="section-pad bg-[var(--ink)] text-white relative overflow-hidden" data-testid="home-intro">
        <div className="container-x relative grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-8">
            <div className="overline text-[var(--gold)]">Triad Realty · Since 2025</div>
            <h1 className="font-display text-5xl md:text-7xl lg:text-[88px] leading-[0.95] mt-6" data-reveal>
              The address you<br />will be known for.
            </h1>
          </div>
          <div className="lg:col-span-4">
            <p className="text-white/80 leading-relaxed">
              Discreet, data-led property consultancy across Dubai and the Northern Emirates — for off-plan investments, resale acquisitions, and portfolios built to last.
            </p>
            <div className="flex flex-wrap gap-4 mt-8">
              <Link to="/projects" className="btn-ghost-light" data-testid="hero-cta-projects">
                Explore Projects <ArrowRight size={14} />
              </Link>
              <Link
                to="/contact?type=consultation"
                className="text-white text-[12px] uppercase tracking-[0.22em] flex items-center gap-2 px-2 py-3 border-b border-[var(--gold)] bg-transparent cursor-pointer"
              >
                Schedule consultation <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="section-pad bg-white" data-testid="home-about">
        <div className="container-x grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5" data-reveal>
            <div className="overline text-[var(--gold-deep)]">Who We Are</div>
            <h2 className="font-display text-4xl md:text-6xl leading-[1.02] mt-5">
              Three consultants. <em className="text-[var(--gold-deep)]">One conviction.</em>
            </h2>
          </div>
          <div className="lg:col-span-7 lg:pt-10" data-reveal>
            <p className="text-lg leading-relaxed text-[var(--ink-2)]">
              Triad Realty was founded in Dubai by three property consultants who believed UAE real estate deserved a quieter, sharper, more thoughtful kind of advisory. Today we work with investors from twenty-two countries — quietly, deliberately, and entirely on the side of the client.
            </p>
            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6">
              {WHY_TRIAD.map((w) => (
                <div key={w.v} className="border-l border-[var(--gold)] pl-4">
                  <div className="font-display text-3xl md:text-4xl">{w.k}</div>
                  <div className="overline opacity-60 mt-1">{w.v}</div>
                </div>
              ))}
            </div>

            <div className="mt-12">
              <div className="overline mb-6 text-[var(--muted)]">Our Milestones</div>
              <div className="space-y-4">
                {MILESTONES.map((m) => (
                  <div key={m.year} className="flex items-baseline gap-6 border-b border-[var(--line)] pb-3">
                    <div className="font-display text-2xl text-[var(--gold-deep)] w-20 tabular">{m.year}</div>
                    <div className="text-sm flex-1">{m.label}</div>
                  </div>
                ))}
              </div>
              <Link to="/about" className="btn-ghost mt-8" data-testid="about-view-more">View more <ArrowRight size={14} /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* LAUNCHES */}
      <section className="section-pad bg-[var(--bg-alt)] relative" data-testid="home-launches">
        <div className="container-x">
          <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
            <div>
              <div className="overline text-[var(--gold-deep)]">Latest Launches</div>
              <h2 className="font-display text-4xl md:text-6xl mt-3 leading-none">
                The towers we're watching.
              </h2>
            </div>
            <Link to="/projects" className="btn-ghost" data-testid="launches-view-all">All Projects <ArrowRight size={14} /></Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {projects.slice(0, 3).map((p, idx) => (
              <Link
                to={`/projects/${p.id}`}
                key={p.id}
                className="group block bg-white"
                data-testid={`launch-card-${p.id}`}
              >
                <div className="img-zoom aspect-[4/5] relative" data-reveal="zoom">
                  <img
                    src={p.image}
                    alt={`${p.title} project by ${p.developer} in ${p.location}`}
                    width={400}
                    height={500}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {p.isFeatured && (
                    <div className="absolute top-4 left-4 bg-[var(--ink)] text-[var(--gold)] overline px-3 py-1">
                      Hot Launch
                    </div>
                  )}
                </div>
                <div className="p-6 border-l border-r border-b border-[var(--line)]">
                  <div className="overline text-[var(--muted)]">{p.developer}</div>
                  <h3 className="font-display text-2xl mt-2 leading-tight">{p.title}</h3>
                  <p className="text-sm text-[var(--muted)] mt-1">{p.location}</p>
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <div className="overline opacity-60">Starting from</div>
                      <div className="font-display text-2xl mt-1">{p.startingPrice}</div>
                    </div>
                    <ArrowUpRight className="group-hover:text-[var(--gold-deep)] transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>


      {homepageSettings.team_comes_first ? (
        <>
          {renderTeamSection()}
          <PartnerDevelopers />
        </>
      ) : (
        <>
          <PartnerDevelopers />
          {renderTeamSection()}
        </>
      )}

      {/* CTA */}
      <section className="section-pad bg-white" data-testid="home-cta">
        <div className="container-x grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <div className="overline text-[var(--gold-deep)]">Begin</div>
            <h2 className="font-display text-4xl md:text-6xl mt-3 leading-none">
              The portfolio you imagined is one conversation away.
            </h2>
          </div>
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Link
              to="/contact?type=consultation"
              className="btn-gold cursor-pointer"
              data-testid="cta-book"
            >
              Book a Consultation <ArrowRight size={14} />
            </Link>
            <a href={COMPANY.whatsapp} target="_blank" rel="noreferrer" className="btn-ghost">WhatsApp Us <ArrowUpRight size={14} /></a>
          </div>
        </div>
      </section>
    </>
  );
}
