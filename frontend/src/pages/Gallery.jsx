import { useState, useEffect } from "react";
import axios from "axios";
import { API_URL as API, resolveMediaUrl, SITE_URL } from "../config";
import { GALLERY } from "../data";
import { X, Play } from "lucide-react";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildImageGallerySchema } from "../utils/seo";


export default function Gallery() {
  const [open, setOpen] = useState(null); // { type, url } or null
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`${API}/experience`)
      .then((res) => {
        const results = res.data?.results || [];
        if (results.length > 0) {
          setItems(results);
        } else {
          setItems(GALLERY.map((src, i) => ({ id: `static-${i}`, type: "photo", url: src })));
        }
      })
      .catch(() => {
        setItems(GALLERY.map((src, i) => ({ id: `static-${i}`, type: "photo", url: src })));
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

  const getEmbedElement = (url) => {
    if (!url) return null;
    const videoId = getYouTubeId(url);
    if (videoId) {
      return (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title="Video Experience"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      );
    }

    if (url.includes("<iframe")) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white/70 text-sm">
          Unsupported video embed
        </div>
      );
    }

    // Direct video upload fallback
    return (
      <video
        src={resolveMediaUrl(url)}
        autoPlay
        controls
        className="absolute inset-0 w-full h-full object-contain"
      />
    );
  };

  const canonicalUrl = `${SITE_URL}/gallery`;
  const gallerySchema = buildImageGallerySchema(items, canonicalUrl);

  return (
    <>
      <Helmet>
        <title>Media Gallery &amp; Site Handovers | Triad Realty</title>
        <meta name="description" content="Explore our visual media journal documenting site visits, construction updates, premium handovers, and active launches across Dubai." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="Media Gallery &amp; Site Handovers | Triad Realty" />
        <meta property="og:description" content="Explore our visual media journal documenting site visits and handovers in Dubai." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        {!loading && <script type="application/ld+json">{JSON.stringify(gallerySchema)}</script>}
      </Helmet>

      <section className="pt-40 pb-12 section-pad bg-white" data-testid="gallery-hero">
        <div className="container-x px-5 lg:px-12">
          <Breadcrumbs items={[{ label: "Gallery", url: "/gallery" }]} />
          <div className="overline text-[var(--gold-deep)]">Triad Experience</div>
          <h1 className="font-display text-5xl md:text-7xl mt-6 leading-[0.95]">
            The buildings, <em className="text-[var(--gold-deep)]">the moments.</em>
          </h1>
          <p className="text-lg mt-6 max-w-2xl text-[var(--ink-2)]">
            A visual journal — site visits, handovers, launches, and the corners of the UAE we've grown to love.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-12 pb-24" data-testid="gallery-grid">
        <div className="container-x">
          {loading ? (
            <div className="text-center py-20 text-[var(--muted)] border border-[var(--line)] bg-[var(--bg-alt)]">
              Loading media journal...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 py-6">
              {items.map((item, i) => {
                const rotations = [
                  "rotate-[-1.5deg]",
                  "rotate-[1.5deg]",
                  "rotate-[-1deg]",
                  "rotate-[2deg]",
                  "rotate-[-2deg]",
                  "rotate-[1deg]",
                ];
                const rotationClass = rotations[i % rotations.length];

                return (
                  <div
                    key={item.id}
                    onClick={() => setOpen(item)}
                    className={`cursor-pointer bg-white p-3 pb-6 shadow-lg border border-neutral-100 hover:shadow-xl hover:scale-[1.03] transition-all duration-300 transform ${rotationClass} hover:rotate-0 group`}
                    data-testid={`gallery-item-${i}`}
                  >
                    <div className="w-full aspect-square overflow-hidden bg-neutral-900 relative">
                      {item.type === "photo" ? (
                        <img
                          src={resolveMediaUrl(item.url)}
                          alt={`Triad Realty UAE Real Estate Project Media ${i + 1}`}
                          width={300}
                          height={300}
                          loading="lazy"
                          className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                        />
                      ) : (
                        <div className="w-full h-full relative">
                          {getVideoThumbnail(item.url) ? (
                            <img
                              src={getVideoThumbnail(item.url)}
                              alt={`Triad Realty UAE Real Estate Project Video Thumbnail ${i + 1}`}
                              width={300}
                              height={300}
                              loading="lazy"
                              className="w-full h-full object-cover opacity-60 grayscale group-hover:opacity-85 group-hover:grayscale-0 transition-all duration-700"
                            />
                          ) : (
                            <video
                              src={resolveMediaUrl(item.url)}
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-85 transition-opacity"
                              preload="metadata"
                              muted
                              playsInline
                            />
                          )}
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                            <div className="w-12 h-12 rounded-full border-2 border-[var(--gold)] flex items-center justify-center text-[var(--gold)] transform group-hover:scale-110 transition-transform bg-black/40">
                              <Play size={18} fill="currentColor" className="ml-0.5" />
                            </div>
                            <span className="overline text-[var(--gold)] text-[9px] tracking-widest mt-3 drop-shadow-md">
                              Watch Video
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 text-center font-display text-xs text-[var(--muted)] tracking-wider uppercase">
                      {item.type === "video" ? "Video Highlight" : "Moment"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
        >
          <button
            onClick={() => setOpen(null)}
            className="absolute top-6 right-6 text-white hover:text-[var(--gold)] transition-colors"
          >
            <X size={24} />
          </button>
          {open.type === "photo" ? (
            <img src={resolveMediaUrl(open.url)} alt="" className="max-h-[90vh] max-w-[95vw] object-contain" />
          ) : (
            <div
              className="w-full max-w-4xl aspect-video relative bg-black border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {getEmbedElement(open.url)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
