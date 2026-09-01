import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Phone, Mail, Instagram, Linkedin, Facebook, ArrowLeft, Youtube } from "lucide-react";
import axios from "axios";
import { API_URL as API, resolveMediaUrl, SITE_URL } from "../config";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildPersonSchema, buildBreadcrumbSchema } from "../utils/seo";


function toWhatsApp(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

function extractYtId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/
  );
  return match ? match[1] : null;
}

export default function TeamMember() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`${API}/team/${id}`)
      .then((r) => {
        setMember(r.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="overline text-[var(--muted)] animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="font-display text-4xl">Team member not found.</h1>
        <Link to="/team" className="btn-ghost">
          Back to Team
        </Link>
      </div>
    );
  }

  const ytId1 = extractYtId(member.videoUrl);
  const ytId2 = extractYtId(member.videoUrl2);
  const hasVideos = member.videoUrl || member.videoUrl2;

  const canonicalUrl = `${SITE_URL}/team/${id}`;

  // Full Person schema with worksFor, knowsLanguage, hasOccupation, and social sameAs
  const personSchema = buildPersonSchema(
    { ...member, photo: resolveMediaUrl(member.photo) },
    canonicalUrl
  );
  const breadcrumbsSchema = buildBreadcrumbSchema([
    { name: "Team", url: `${SITE_URL}/team` },
    { name: member.name, url: canonicalUrl },
  ]);


  return (
    <>
      {member && (
        <Helmet>
          <title>{`${member.name} | Real Estate Consultant Triad Realty`}</title>
          <meta name="description" content={`Contact ${member.name}, ${member.role || "Property Consultant"} at Triad Realty Dubai. Speaks: ${member.speaks}. Specializations: ${member.specializations?.join(", ") || ""}.`} />
          <link rel="canonical" href={canonicalUrl} />
          <meta property="og:title" content={`${member.name} | Real Estate Consultant Triad Realty`} />
          <meta property="og:description" content={`Contact ${member.name}, ${member.role || "Property Consultant"} at Triad Realty.`} />
          <meta property="og:type" content="profile" />
          <meta property="og:url" content={canonicalUrl} />
          <meta property="og:image" content={resolveMediaUrl(member.photo)} />
          <meta name="twitter:card" content="summary_large_image" />
          {personSchema && <script type="application/ld+json">{JSON.stringify(personSchema)}</script>}
          {breadcrumbsSchema && <script type="application/ld+json">{JSON.stringify(breadcrumbsSchema)}</script>}
        </Helmet>
      )}

      {/* ── PROFILE HERO ── */}
      <section className="pt-32 pb-20 bg-[var(--bg-alt)]">
        <div className="container-x px-5 lg:px-12">
          <Breadcrumbs items={[{ label: "Team", url: "/team" }, { label: member.name, url: `/team/${member.id}` }]} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-start">
            {/* Photo */}
            <div className="lg:col-span-4">
              <div className="w-full aspect-[3/4] bg-[var(--line)] img-zoom">
                {member.photo ? (
                  <img
                    src={resolveMediaUrl(member.photo)}
                    alt={`Real Estate Advisor ${member.name}`}
                    width={300}
                    height={400}
                    loading="eager"
                    style={{ objectFit: "cover", objectPosition: "50% 30%" }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[var(--ink)] text-white">
                    <span className="font-display text-7xl text-[var(--gold)]">
                      {member.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-2.5">
                {member.phone && (
                  <a
                    href={toWhatsApp(member.phone)}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                    className="w-10 h-10 flex items-center justify-center border border-[var(--line)] hover:border-[var(--gold)] hover:text-[var(--gold-deep)] text-[var(--ink)] transition-colors"
                  >
                    <Phone size={16} />
                  </a>
                )}
                {member.email && (
                  <a
                    href={`mailto:${member.email}`}
                    title="Email"
                    className="w-10 h-10 flex items-center justify-center border border-[var(--line)] hover:border-[var(--gold)] hover:text-[var(--gold-deep)] text-[var(--ink)] transition-colors"
                  >
                    <Mail size={16} />
                  </a>
                )}
                {member.instagram && (
                  <a
                    href={member.instagram}
                    target="_blank"
                    rel="noreferrer"
                    title="Instagram"
                    className="w-10 h-10 flex items-center justify-center border border-[var(--line)] hover:border-[var(--gold)] hover:text-[var(--gold-deep)] text-[var(--ink)] transition-colors"
                  >
                    <Instagram size={16} />
                  </a>
                )}
                {member.linkedin && (
                  <a
                    href={member.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    title="LinkedIn"
                    className="w-10 h-10 flex items-center justify-center border border-[var(--line)] hover:border-[var(--gold)] hover:text-[var(--gold-deep)] text-[var(--ink)] transition-colors"
                  >
                    <Linkedin size={16} />
                  </a>
                )}
                {member.facebook && (
                  <a
                    href={member.facebook}
                    target="_blank"
                    rel="noreferrer"
                    title="Facebook"
                    className="w-10 h-10 flex items-center justify-center border border-[var(--line)] hover:border-[var(--gold)] hover:text-[var(--gold-deep)] text-[var(--ink)] transition-colors"
                  >
                    <Facebook size={16} />
                  </a>
                )}
              </div>
            </div>

            {/* Bio & Details */}
            <div className="lg:col-span-8">
              <div className="overline text-[var(--gold-deep)]">{member.role || "Property Consultant"}</div>
              <h1 className="font-display text-5xl md:text-7xl mt-4 leading-none">{member.name}</h1>

              {(member.experience || member.speaks) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10 pt-8 border-t border-[var(--line)]">
                  {member.experience && (
                    <div className="bg-white border border-[var(--line)] p-6">
                      <div className="overline text-[var(--gold-deep)] mb-2">Experience</div>
                      <p className="text-[var(--ink-2)] leading-relaxed">{member.experience}</p>
                    </div>
                  )}
                  {member.speaks && (
                    <div className="bg-white border border-[var(--line)] p-6">
                      <div className="overline text-[var(--gold-deep)] mb-2">Speaks</div>
                      <p className="text-[var(--ink-2)] leading-relaxed">{member.speaks}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-10 text-lg leading-relaxed text-[var(--ink-2)]">
                {member.bio ? (
                  <p className="whitespace-pre-line">{member.bio}</p>
                ) : (
                  <p className="text-[var(--muted)] italic">No biography provided.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURED VIDEOS ── */}
      {hasVideos && (
        <section className="section-pad bg-white">
          <div className="container-x px-5 lg:px-12">
            <div className="flex items-center gap-3 mb-10">
              <Youtube size={20} className="text-[var(--gold-deep)]" />
              <div className="overline text-[var(--gold-deep)]">Featured Videos</div>
            </div>

            <div className={`grid gap-8 ${member.videoUrl && member.videoUrl2 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
              {member.videoUrl && (
                <div className="space-y-3">
                  {member.videoUrl2 && (
                    <div className="overline text-[var(--muted)]">Video 1</div>
                  )}
                  <div className="w-full aspect-video bg-[var(--ink)] relative">
                    {ytId1 ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId1}`}
                        title={`${member.name} — video 1`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full"
                      />
                    ) : (
                      <video
                        src={resolveMediaUrl(member.videoUrl)}
                        controls
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                  </div>
                </div>
              )}
              {member.videoUrl2 && (
                <div className="space-y-3">
                  {member.videoUrl && (
                    <div className="overline text-[var(--muted)]">Video 2</div>
                  )}
                  <div className="w-full aspect-video bg-[var(--ink)] relative">
                    {ytId2 ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId2}`}
                        title={`${member.name} — video 2`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full"
                      />
                    ) : (
                      <video
                        src={resolveMediaUrl(member.videoUrl2)}
                        controls
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
