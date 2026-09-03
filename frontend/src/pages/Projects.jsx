import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Search, ArrowUpRight, Flame, ChevronLeft, ChevronRight, Wallet, Calendar } from "lucide-react";
import { API_URL as API, resolveMediaUrl, SITE_URL } from "../config";
import { buildFilterOptions, filterProperties, normalizeProperties } from "../utils/propertyFilters";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { useAuth } from "../context/AuthContext";
import BrochureModal from "../components/BrochureModal";

const PAGE_SIZE = 6;
const GATE_PAGE = 5;           // pages 5+ require a lead
const GATE_KEY  = "triad_lead_unlocked"; // sessionStorage key

export default function Projects() {
  const { user } = useAuth();
  const [all, setAll] = useState([]);
  const [filters, setFilters] = useState({
    query: "",
    location: "All",
    market: "All",
    beds: "All",
    priceMax: 20_000_000,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState({
    locations: ["All"],
    markets: ["All"],
    beds: ["All"],
    maxPrice: 20_000_000,
  });

  // Slider states
  const [hotIndex, setHotIndex] = useState(0);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // ── Lead gate ───────────────────────────────────────────────────────────────
  const navigate = useNavigate();
  const [gateUnlocked, setGateUnlocked] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(GATE_KEY) === "1"
  );
  const [gateOpen, setGateOpen]         = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { type: "page"|"map"|"compare", payload? }

  const requireGate = (action) => {
    if (gateUnlocked || user) {
      runAction(action);
    } else {
      setPendingAction(action);
      setGateOpen(true);
    }
  };

  const runAction = (action) => {
    if (!action) return;
    if (action.type === "page")    setPage(action.payload);
    if (action.type === "map")     window.open(MAP_URL, "_blank", "noopener,noreferrer");
    if (action.type === "compare") navigate("/analysis");
  };

  const onGateSuccess = () => {
    sessionStorage.setItem(GATE_KEY, "1");
    setGateUnlocked(true);
    setGateOpen(false);
    if (pendingAction) { runAction(pendingAction); setPendingAction(null); }
  };

  const onGateClose = () => {
    setGateOpen(false);
    setPendingAction(null);
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const MAP_URL =
    "https://triad-realty-ae.map.estate/en/map/uae-dubai/projects?selection=building_unit__price&top=all&collection=all_projects&buildingUnitAvailableForBooking&soldOut=false&cenLat=25.115655&cenLng=55.215378&zoom=11";

  const handleMapClick     = (e) => { e.preventDefault(); requireGate({ type: "map" }); };
  const handleCompareClick = (e) => { e.preventDefault(); requireGate({ type: "compare" }); };
  const handlePageChange   = (n) => {
    if (n >= GATE_PAGE && !gateUnlocked && !user) {
      requireGate({ type: "page", payload: n });
    } else {
      setPage(n);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    const applyItems = (rawItems) => {
      // Sort newest-first (highest id first)
      const sorted = [...rawItems].sort((a, b) => {
        const idA = Number(a.id) || 0;
        const idB = Number(b.id) || 0;
        return idB - idA;
      });
      const normalized = normalizeProperties(sorted);
      const options = buildFilterOptions(normalized);
      setAll(normalized);
      setFilterOptions(options);
      setFilters((prev) => ({ ...prev, priceMax: options.maxPrice }));
    };

    axios
      .get(`${API}/projects`)
      .then((response) => {
        if (!isMounted) return;
        const results = response.data?.results || [];
        if (results.length > 0) {
          applyItems(results);
        } else {
          setAll([]);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setAll([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => filterProperties(all, filters), [all, filters]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hot = all.filter((p) => p.isFeatured);

  // Autoplay effect for hot launches slider
  useEffect(() => {
    if (hot.length <= 1) return;
    const timer = setInterval(() => {
      setHotIndex((prev) => (prev + 1) % hot.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [hot.length]);

  useEffect(() => {
    setHotIndex(0);
  }, [hot.length]);

  const handlePrev = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setHotIndex((prev) => (prev - 1 + hot.length) % hot.length);
  };

  const handleNext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setHotIndex((prev) => (prev + 1) % hot.length);
  };

  const formatPriceInMillions = (rawPrice) => {
    if (!rawPrice) return "TBA";
    if (rawPrice >= 1_000_000) {
      return `AED ${(rawPrice / 1_000_000).toFixed(2)}M`;
    }
    return `AED ${(rawPrice / 1_000).toFixed(0)}K`;
  };

  const formatPaymentPlan = (project) => {
    if (Array.isArray(project.payment_plan) && project.payment_plan.length >= 3) {
      const booking = project.payment_plan.find(m => m.milestone === "Booking")?.percent || 0;
      const construction = project.payment_plan.find(m => m.milestone === "Construction")?.percent || 0;
      const handover = project.payment_plan.find(m => m.milestone === "Handover")?.percent || 0;
      if (booking > 0 || construction > 0 || handover > 0) {
        return `${booking + construction}/${handover}`;
      }
    }
    return "80/20";
  };

  const canonicalUrl = `${SITE_URL}/projects`;
  const projectsSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Luxury UAE Off-Plan & Resale Projects | Triad Realty",
    "url": canonicalUrl,
    "description": "Explore the most anticipated off-plan developments and luxury resale projects in Dubai, Abu Dhabi, and the Northern Emirates."
  };

  return (
    <>
      <Helmet>
        <title>Luxury UAE Off-Plan & Resale Projects | Triad Realty</title>
        <meta name="description" content="Explore premier off-plan real estate launches and premium resale properties in Dubai, Abu Dhabi, and Sharjah. Comprehensive developer listings." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="Luxury UAE Off-Plan & Resale Projects | Triad Realty" />
        <meta property="og:description" content="Explore premier off-plan real estate launches and premium resale properties in Dubai, Abu Dhabi, and Sharjah." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <script type="application/ld+json">{JSON.stringify(projectsSchema)}</script>
      </Helmet>

      <h1 className="sr-only">Triad Realty Luxury UAE Off-Plan and Resale Listings</h1>

      {/* Slider / Carousel Hero */}
      <section 
        className="relative h-[65vh] md:h-[75vh] w-full overflow-hidden bg-neutral-950 pt-20" 
        data-testid="projects-hero"
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 animate-pulse">
            Loading Hot Launches...
          </div>
        ) : hot.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/50">
            No hot launches available.
          </div>
        ) : (
          <div className="relative w-full h-full" data-testid="projects-hot">
            {hot.map((p, idx) => {
              const isActive = idx === hotIndex;
              return (
                <div
                  key={p.id}
                  className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                    isActive ? "opacity-100 scale-100 z-10" : "opacity-0 scale-95 pointer-events-none z-0"
                  }`}
                >
                  {/* Background Image */}
                  <img
                    src={resolveMediaUrl(p.image)}
                    alt={`Curated Launch: ${p.title} by ${p.developer}`}
                    width={1920}
                    height={800}
                    loading="eager"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/60" />
                  
                  {/* Content Overlay */}
                  <div className="absolute inset-0 flex flex-col justify-end pb-12 md:pb-16 px-5 lg:px-12 text-white">
                    <div className="container mx-auto max-w-7xl">
                      {/* Breadcrumbs */}
                      <Breadcrumbs items={[{ label: "Projects", url: "/projects" }]} />
                      
                      {/* Title */}
                      <h2 className="font-display text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 max-w-3xl leading-[1.1]">
                        {p.title}
                      </h2>
                      
                      {/* Quick Specs */}
                      <div className="flex flex-wrap gap-6 items-center mb-8 text-white">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
                            <Wallet size={18} className="text-[var(--gold)]" />
                          </div>
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-white/50">Starting Price</div>
                            <div className="font-display text-sm md:text-base font-semibold">{formatPriceInMillions(p.rawPrice)}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
                            <Calendar size={18} className="text-[var(--gold)]" />
                          </div>
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-white/50">Payment Plan</div>
                            <div className="font-display text-sm md:text-base font-semibold">{formatPaymentPlan(p)} Payment Plan</div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Buttons */}
                      <div className="flex flex-wrap gap-4">
                        <Link
                          to={`/projects/${p.id}`}
                          className="px-6 py-3 font-semibold bg-white text-[var(--ink)] hover:bg-[var(--gold)] hover:text-white transition-colors text-center text-sm tracking-wider uppercase border border-white"
                        >
                          View Details
                        </Link>
                        <Link
                          to={`/contact?project=${p.id}&asset=callback`}
                          className="px-6 py-3 font-semibold border border-white/30 text-white hover:bg-white/10 transition-all text-center text-sm tracking-wider uppercase cursor-pointer"
                        >
                          Get a Call Back
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Navigation Arrows */}
            {hot.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-black/30 hover:bg-black/60 text-white rounded-full transition-all cursor-pointer z-20 border border-white/15 hover:border-white/30"
                  aria-label="Previous slide"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-black/30 hover:bg-black/60 text-white rounded-full transition-all cursor-pointer z-20 border border-white/15 hover:border-white/30"
                  aria-label="Next slide"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            {/* Dots */}
            {hot.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
                {hot.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setHotIndex(idx)}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      idx === hotIndex ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Main Catalog - Off plan properties for sale */}
      <section className="py-12 bg-white" data-testid="projects-filters">
        <div className="container mx-auto max-w-7xl px-5 lg:px-12">
          
          <div className="mb-8">
            <h2 className="font-display text-3xl font-semibold text-[var(--ink)]">Off plan properties for sale</h2>
          </div>

          {/* Filters Block */}
          <div className="bg-[var(--bg-alt)] p-5 md:p-8 border border-[var(--line)] mb-10">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
              <div className="md:col-span-4">
                <label className="overline text-[var(--muted)] text-[10px] tracking-wider uppercase font-medium">Search</label>
                <div className="flex items-center gap-3 border-b border-[var(--line)] mt-2 pb-1">
                  <Search size={16} className="text-[var(--muted)]" />
                  <input
                    className="input-line !border-0 bg-transparent focus:ring-0 focus:outline-none w-full"
                    placeholder="Name, location, keyword..."
                    value={filters.query}
                    onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
                    data-testid="filter-search"
                  />
                </div>
              </div>
              <Select
                label="Location / Area"
                value={filters.location}
                options={filterOptions.locations}
                onChange={(value) => setFilters((prev) => ({ ...prev, location: value }))}
                testId="filter-location"
              />
              <Select
                label="Market"
                value={filters.market}
                options={filterOptions.markets}
                onChange={(value) => setFilters((prev) => ({ ...prev, market: value }))}
                testId="filter-market"
              />
              <Select
                label="Beds"
                value={filters.beds}
                options={filterOptions.beds}
                onChange={(value) => setFilters((prev) => ({ ...prev, beds: value }))}
                testId="filter-beds"
              />
              <div className="md:col-span-2">
                <label className="overline text-[var(--muted)] text-[10px] tracking-wider uppercase font-medium">
                  Max Price · AED {(filters.priceMax / 1_000_000).toFixed(1)}M
                </label>
                <input
                  type="range"
                  min={100000}
                  max={Math.max(filterOptions.maxPrice, 2_000_000)}
                  step={100000}
                  value={filters.priceMax}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, priceMax: Number(e.target.value) }))
                  }
                  className="w-full mt-3 accent-[var(--gold-deep)]"
                  data-testid="filter-price"
                />
              </div>
              <div className="md:col-start-9 md:col-span-4 flex gap-3 mt-4 md:mt-0">
                <button
                  onClick={handleMapClick}
                  className="btn-gold flex-1 justify-center text-center !py-3 text-sm font-medium tracking-wider uppercase"
                  title="Open interactive map"
                >
                  Map
                </button>
                <button
                  onClick={handleCompareClick}
                  className="btn-ghost flex-1 justify-center text-center !py-3 text-sm font-medium tracking-wider uppercase"
                  title="Compare projects"
                >
                  Compare
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <div className="font-display text-xl text-[var(--ink)]">
              <span className="tabular font-semibold">{filtered.length}</span> Projects Found
            </div>
            <div className="overline text-[var(--muted)] text-xs">
              Page {page} of {totalPages}
            </div>
          </div>

          {all.length === 0 ? (
            <div className="bg-[var(--bg-alt)] p-16 text-center border border-[var(--line)]">
              <p className="font-display text-2xl">No projects loaded yet.</p>
              <p className="text-sm text-[var(--muted)] mt-2">
                Ask your administrator to sync project data from the API.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--line)]">
              {pageItems.map((p) => (
                <Link
                  to={`/projects/${p.id}`}
                  key={p.id}
                  className="bg-white block group transition-all duration-300 hover:shadow-md"
                  data-testid={`project-card-${p.id}`}
                >
                  <div className="aspect-[4/3] img-zoom relative overflow-hidden">
                    <img 
                      src={resolveMediaUrl(p.image)} 
                      alt={`${p.title} project by ${p.developer} in ${p.location}`} 
                      width={400}
                      height={300}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                    />
                    {p.isFeatured && (
                      <div className="absolute top-4 left-4 bg-[var(--ink)] text-[var(--gold)] overline px-3 py-1 text-[10px] tracking-wider uppercase font-semibold z-10">
                        Featured
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <div className="overline text-[var(--muted)] text-[10px] tracking-wider uppercase">{p.developer}</div>
                    <h3 className="font-display text-xl mt-2 font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--gold-deep)]">{p.title}</h3>
                    <div className="text-xs text-[var(--muted)] mt-1">{p.location}</div>
                    <div className="flex justify-between items-end mt-6 pt-4 border-t border-[var(--line)]">
                      <div>
                        <div className="overline text-[9px] opacity-60 uppercase tracking-wider">From</div>
                        <div className="font-display text-lg text-[var(--gold-deep)] mt-1 font-semibold">
                          {p.startingPrice}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="overline text-[9px] opacity-60 uppercase tracking-wider">Handover</div>
                        <div className="font-display text-lg mt-1 font-semibold text-[var(--ink)]">{p.completionDate}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {filtered.length === 0 && (
                <div className="bg-white p-16 text-center col-span-3">
                  <p className="font-display text-2xl">No projects match your filters.</p>
                  <p className="text-sm text-[var(--muted)] mt-2">
                    Try adjusting your search or contact our consultants for off-market listings.
                  </p>
                </div>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-10 h-10 flex items-center justify-center border border-[var(--line)] hover:border-[var(--gold)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--ink)] cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handlePageChange(n)}
                  className={`w-10 h-10 flex items-center justify-center border text-sm font-medium transition-colors cursor-pointer ${
                    n === page
                      ? "border-[var(--gold)] bg-[var(--ink)] text-white"
                      : "border-[var(--line)] hover:border-[var(--gold)] text-[var(--ink)]"
                  }`}
                  aria-label={`Page ${n}`}
                  aria-current={n === page ? "page" : undefined}
                  title={""}
                >
                  {n}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-10 h-10 flex items-center justify-center border border-[var(--line)] hover:border-[var(--gold)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--ink)] cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Brochure Modal for Callbacks */}
      <BrochureModal
        open={callbackOpen}
        onClose={() => setCallbackOpen(false)}
        projectId={selectedProjectId}
        asset="callback"
      />

      {/* Lead Gate — unlocks Map, Compare, and pages 5+ */}
      <BrochureModal
        open={gateOpen}
        onClose={onGateClose}
        onSuccess={onGateSuccess}
        projectId={null}
        asset="callback"
        isGate
      />

    </>
  );
}

function Select({ label, value, options, onChange, testId }) {
  return (
    <div className="md:col-span-2">
      <label className="overline text-[var(--muted)]">{label}</label>
      <select
        className="input-line mt-2 cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

