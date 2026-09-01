import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL as API, resolveMediaUrl, SITE_URL } from "../config";
import { Film, Star, Quote, X, Play } from "lucide-react";
import { REVIEWS } from "../data";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildAggregateRatingSchema } from "../utils/seo";


export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null);

  const [submitForm, setSubmitForm] = useState({
    name: "",
    role: "",
    country: "",
    rating: 5,
    description: "",
    youtubeCode: "",
    avatar: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(false);
    setSubmitting(true);
    try {
      await axios.post(`${API}/reviews`, submitForm);
      setSubmitSuccess(true);
      setSubmitForm({
        name: "",
        role: "",
        country: "",
        rating: 5,
        description: "",
        youtubeCode: "",
        avatar: "",
      });
      const res = await axios.get(`${API}/reviews`);
      setReviews(res.data?.results || []);
    } catch (err) {
      setSubmitError(err.response?.data?.detail || "Failed to submit review. Please try again.");
    }
    setSubmitting(false);
  };

  const [settings, setSettings] = useState({
    hero_title: "Real stories, real trust.",
    hero_description: "Listen to video reviews and experiences shared by international and local buyers who acquired properties through Triad.",
    testimonials_title: "Trusted advice, clear outcomes.",
    average_rating: 4.9,
  });

  useEffect(() => {
    axios
      .get(`${API}/reviews`)
      .then((res) => {
        setReviews(res.data?.results || []);
      })
      .catch((err) => {
        console.error("Error loading reviews:", err);
      });

    axios
      .get(`${API}/settings/reviews`)
      .then((res) => {
        if (res.data) setSettings(res.data);
      })
      .catch((err) => {
        console.error("Error loading reviews settings:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const getVideoThumbnail = (url) => {
    if (!url) return null;
    const videoId = getYouTubeId(url);
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
    return null;
  };

  const getYouTubeId = (value) => {
    if (!value || typeof value !== "string") return null;
    const iframeSrc = value.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
    const candidate = iframeSrc || value;
    try {
      const url = new URL(candidate.startsWith("//") ? `https:${candidate}` : candidate);
      const host = url.hostname.replace(/^www\./, "");
      if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
      if (host === "youtube.com" || host === "youtube-nocookie.com") {
        if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || null;
        return url.searchParams.get("v");
      }
    } catch {
      const match = candidate.match(/(?:youtu\.be\/|embed\/|watch\?v=|[?&]v=)([A-Za-z0-9_-]{11})/);
      return match?.[1] || null;
    }
    return null;
  };

  const getEmbedElement = (youtubeCode) => {
    if (!youtubeCode) return null;

    const videoId = getYouTubeId(youtubeCode);
    if (videoId) {
      return (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title="YouTube Video Review"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      );
    }

    if (youtubeCode.includes("<iframe")) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white/70 text-sm">
          Unsupported video embed
        </div>
      );
    }

    // Direct video upload fallback
    return (
      <video
        src={resolveMediaUrl(youtubeCode)}
        autoPlay
        controls
        className="absolute inset-0 w-full h-full object-contain"
      />
    );
  };

  const videoReviews = reviews.filter((r) => r.youtubeCode && r.youtubeCode.trim() !== "");
  const textReviews = reviews.filter((r) => !r.youtubeCode || r.youtubeCode.trim() === "");

  const canonicalUrl = `${SITE_URL}/reviews`;
  const ratingSchema = buildAggregateRatingSchema(reviews, settings);

  return (
    <>
      <Helmet>
        <title>Client Testimonials & Video Reviews | Triad Realty</title>
        <meta name="description" content="Read reviews and watch video testimonials from global investors and clients who built their UAE portfolios with Triad Realty." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="Client Testimonials & Video Reviews | Triad Realty" />
        <meta property="og:description" content="Watch video testimonials from clients who built portfolios with Triad Realty." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        {!loading && <script type="application/ld+json">{JSON.stringify(ratingSchema)}</script>}
      </Helmet>

      <section className="pt-40 pb-12 section-pad bg-white" data-testid="reviews-hero">
        <div className="container-x px-5 lg:px-12">
          <Breadcrumbs items={[{ label: "Reviews", url: "/reviews" }]} />
          <div className="overline text-[var(--gold-deep)]">Client Testimonials</div>
          <h1 className="font-display text-5xl md:text-7xl mt-6 leading-[0.95]">
            {settings.hero_title}
          </h1>
          <p className="text-lg mt-6 max-w-2xl text-[var(--ink-2)]">
            {settings.hero_description}
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-12 pb-24 bg-white" data-testid="reviews-grid">
        <div className="container-x">
          {loading ? (
            <div className="text-center py-20 text-[var(--muted)] border border-[var(--line)] bg-[var(--bg-alt)]">
              Loading video reviews...
            </div>
          ) : videoReviews.length === 0 ? (
            <div className="text-center py-20 border border-[var(--line)] bg-[var(--bg-alt)]">
              <Film className="mx-auto text-[var(--gold)] mb-4" size={32} />
              <p className="font-display text-2xl text-[var(--ink)]">No video reviews posted yet.</p>
              <p className="text-sm text-[var(--muted)] mt-2">
                Our team will add video testimonials soon. Check back shortly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {videoReviews.map((rev) => {
                const hasVideo = !!rev.youtubeCode;
                const ytThumb = getVideoThumbnail(rev.youtubeCode);
                const isDirectVideo = hasVideo && !rev.youtubeCode.includes("<iframe") && !ytThumb;

                return (
                  <div
                    key={rev.id}
                    className="bg-white border border-[var(--line)] rounded flex flex-col group overflow-hidden hover:shadow-lg transition-all duration-300"
                    data-testid={`review-card-${rev.id}`}
                  >
                    {/* Video Block */}
                    {hasVideo && (
                      <div 
                        className="relative aspect-video w-full overflow-hidden bg-black border-b border-[var(--line)] cursor-pointer"
                        onClick={() => setActiveVideo(rev.youtubeCode)}
                      >
                        {ytThumb ? (
                          <img
                            src={ytThumb}
                            alt=""
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300"
                          />
                        ) : isDirectVideo ? (
                          <video
                            src={resolveMediaUrl(rev.youtubeCode)}
                            className="w-full h-full object-cover opacity-70"
                            preload="metadata"
                            muted
                            playsInline
                          />
                        ) : (
                          <div className="w-full h-full bg-[var(--ink-2)]" />
                        )}
                        {/* Play Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/35 group-hover:bg-black/25 transition-colors">
                          <div className="w-14 h-14 rounded-full border-2 border-[var(--gold)] flex items-center justify-center text-[var(--gold)] transform group-hover:scale-110 transition-transform bg-black/40 shadow-lg">
                            <Play size={20} fill="currentColor" className="ml-1" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Card Content */}
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        {/* Profile Info */}
                        <div className="flex items-center gap-4 mb-4">
                          {rev.avatar ? (
                            <img
                              src={resolveMediaUrl(rev.avatar)}
                              alt={rev.name}
                              className="w-12 h-12 rounded-full object-cover border border-[var(--gold)]/20 shadow-sm flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[var(--gold)]/10 text-[var(--gold-deep)] flex items-center justify-center font-display text-lg font-semibold border border-[var(--gold)]/20 flex-shrink-0">
                              {(rev.name || "V").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-semibold text-base text-[var(--ink)] leading-snug truncate">
                              {rev.name || "Verified Client"}
                            </h3>
                            <p className="text-xs text-[var(--muted)] truncate mt-0.5">
                              {rev.role || "Client"} {rev.country ? `· ${rev.country}` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Stars */}
                        <div className="flex gap-1 mb-4">
                          {Array.from({ length: rev.rating || 5 }).map((_, i) => (
                            <Star key={i} size={14} className="text-[var(--gold)] fill-[var(--gold)]" />
                          ))}
                        </div>

                        {/* Quote Text */}
                        <div className="relative">
                          <Quote className="text-[var(--gold)]/15 absolute -top-3 -left-3" size={32} />
                          <p className="text-[var(--ink-2)] text-[15px] leading-relaxed italic relative pl-4">
                            "{rev.description}"
                          </p>
                        </div>
                      </div>

                      {/* Verified Badge */}
                      <div className="mt-6 pt-4 border-t border-[var(--line)] flex justify-between items-center text-xs text-[var(--muted)]">
                        <span className="overline tracking-wider text-[var(--gold-deep)] font-medium">Verified Review</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CLIENT TESTIMONIALS (REDESIGNED) */}
      <section className="section-pad bg-[var(--ink)] text-white relative overflow-hidden" data-testid="client-testimonials-section">
        <div className="grain absolute inset-0 opacity-20 pointer-events-none" />
        <div className="container-x relative px-5 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            
            {/* Left Rating Summary Column */}
            <div className="lg:col-span-4 lg:sticky lg:top-32" data-reveal>
              <span className="text-xs uppercase tracking-[0.25em] text-[var(--gold)] font-medium">Client Testimonials</span>
              <h2 className="font-display text-4xl md:text-5xl mt-4 leading-tight">
                {settings.testimonials_title}
              </h2>
              
              <div className="mt-10 p-8 bg-white/5 border border-white/10 backdrop-blur-sm rounded-sm flex flex-col items-center text-center">
                <div className="font-display text-7xl md:text-8xl text-[var(--gold)] font-light leading-none">{settings.average_rating}</div>
                <div className="flex gap-1.5 mt-4 mb-2">
                  {Array.from({ length: Math.min(5, Math.max(1, Math.round(settings.average_rating))) }).map((_, i) => (
                    <Star key={i} size={20} className="text-[var(--gold)] fill-[var(--gold)]" />
                  ))}
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-1">Average Client Rating</div>
              </div>
            </div>

            {/* Right Testimonial Cards Column */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6" data-reveal>
              {(textReviews.length > 0 ? textReviews : REVIEWS).slice(0, 4).map((r) => {
                const quoteText = r.quote || r.description || r.text;
                const clientName = r.name || r.author || "Verified Client";
                return (
                  <div 
                    key={r.id || r.name} 
                    className="bg-white/5 border border-white/10 p-8 hover:border-[var(--gold)]/40 hover:bg-white/10 hover:-translate-y-1 transition-all duration-500 relative flex flex-col justify-between group rounded-sm"
                    data-testid={`review-${clientName.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div>
                      <Quote className="text-[var(--gold)] opacity-40 group-hover:opacity-100 transition-opacity duration-300 mb-6" size={24} />
                      <p className="font-display text-xl leading-relaxed text-white/95 font-light italic">
                        "{quoteText}"
                      </p>
                    </div>
                    <div className="mt-8 pt-6 border-t border-white/10">
                      <div className="font-medium text-white text-base tracking-wide">{clientName}</div>
                      <div className="text-xs text-[var(--gold)]/80 mt-1 tracking-wider uppercase font-medium">
                        {r.role || "Client"} {r.country ? `· ${r.country}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </section>

      {/* WRITE A REVIEW FORM */}
      <section className="section-pad bg-white border-t border-[var(--line)]" data-testid="write-review-section">
        <div className="container-x px-5 lg:px-12 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs uppercase tracking-[0.25em] text-[var(--gold-deep)] font-medium">Share Your Experience</span>
            <h2 className="font-display text-4xl md:text-5xl mt-4 leading-tight">
              Submit Your Review
            </h2>
            <p className="text-sm mt-3 text-[var(--muted)]">
              Your feedback helps us continuously refine our real estate advisory services.
            </p>
          </div>

          <form onSubmit={handleSubmitReview} className="bg-[var(--bg-alt)] border border-[var(--line)] p-8 md:p-12 space-y-6">
            {submitSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded text-sm font-medium animate-fade-in">
                ✓ Thank you! Your review has been submitted successfully.
              </div>
            )}

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded text-sm font-medium animate-fade-in">
                ⚠️ {submitError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2 font-medium">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  className="w-full border-b border-[var(--line)] bg-transparent py-2.5 text-sm focus:outline-none focus:border-[var(--gold-deep)] transition-colors"
                  value={submitForm.name}
                  onChange={(e) => setSubmitForm({ ...submitForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2 font-medium">Role / Occupation</label>
                <input
                  type="text"
                  placeholder="e.g. Off-Plan Buyer, Investor"
                  className="w-full border-b border-[var(--line)] bg-transparent py-2.5 text-sm focus:outline-none focus:border-[var(--gold-deep)] transition-colors"
                  value={submitForm.role}
                  onChange={(e) => setSubmitForm({ ...submitForm, role: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2 font-medium">Country</label>
                <input
                  type="text"
                  placeholder="e.g. United Kingdom"
                  className="w-full border-b border-[var(--line)] bg-transparent py-2.5 text-sm focus:outline-none focus:border-[var(--gold-deep)] transition-colors"
                  value={submitForm.country}
                  onChange={(e) => setSubmitForm({ ...submitForm, country: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2 font-medium">Rating</label>
                <select
                  className="w-full border-b border-[var(--line)] bg-transparent py-2.5 text-sm focus:outline-none focus:border-[var(--gold-deep)] transition-colors bg-white cursor-pointer"
                  value={submitForm.rating}
                  onChange={(e) => setSubmitForm({ ...submitForm, rating: Number(e.target.value) })}
                >
                  <option value={5}>5 Stars ★★★★★</option>
                  <option value={4}>4 Stars ★★★★☆</option>
                  <option value={3}>3 Stars ★★★☆☆</option>
                  <option value={2}>2 Stars ★★☆☆☆</option>
                  <option value={1}>1 Star ★☆☆☆☆</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2 font-medium">Profile Image URL (Optional)</label>
                <input
                  type="text"
                  placeholder="Link to your avatar photo"
                  className="w-full border-b border-[var(--line)] bg-transparent py-2.5 text-sm focus:outline-none focus:border-[var(--gold-deep)] transition-colors"
                  value={submitForm.avatar}
                  onChange={(e) => setSubmitForm({ ...submitForm, avatar: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2 font-medium">YouTube Video link / Embed (Optional)</label>
                <input
                  type="text"
                  placeholder="YouTube video review link"
                  className="w-full border-b border-[var(--line)] bg-transparent py-2.5 text-sm focus:outline-none focus:border-[var(--gold-deep)] transition-colors"
                  value={submitForm.youtubeCode}
                  onChange={(e) => setSubmitForm({ ...submitForm, youtubeCode: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2 font-medium">Review Text</label>
              <textarea
                required
                rows={4}
                placeholder="Share your experience working with Triad Realty..."
                className="w-full border border-[var(--line)] bg-transparent p-4 text-sm focus:outline-none focus:border-[var(--gold-deep)] transition-colors"
                value={submitForm.description}
                onChange={(e) => setSubmitForm({ ...submitForm, description: e.target.value })}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-gold w-full py-4 text-center cursor-pointer transition-transform hover:scale-[1.01]"
            >
              {submitting ? "Submitting..." : "Submit Review"}
            </button>
          </form>
        </div>
      </section>

      {/* Video Modal Player */}
      {activeVideo && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setActiveVideo(null)}
        >
          <button
            onClick={() => setActiveVideo(null)}
            className="absolute top-6 right-6 text-white hover:text-[var(--gold)] transition-colors"
            title="Close Modal"
          >
            <X size={24} />
          </button>
          <div
            className="w-full max-w-4xl aspect-video relative bg-black border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {getEmbedElement(activeVideo)}
          </div>
        </div>
      )}
    </>
  );
}
