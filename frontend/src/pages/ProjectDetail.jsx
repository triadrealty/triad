import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Download, MapPin, Phone, Mail, ArrowLeft, ChevronRight } from "lucide-react";
import { API_URL as API, resolveMediaUrl, SITE_URL } from "../config";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildRealEstateListingSchema, buildBreadcrumbSchema } from "../utils/seo";


function toProjectViewModel(item) {
  if (!item) return null;
  const heroPath = item.hero || item.cover || "/placeholder.svg";
  // Only use a real gallery — never fall back to the hero image
  const rawGallery = Array.isArray(item.gallery) && item.gallery.length ? item.gallery : null;
  return {
    id: item.id,
    hero: resolveMediaUrl(heroPath),
    name: item.name || "Project",
    developer: item.developer || "",
    emirate: item.emirate || "UAE",
    tagline: item.tagline || item.description?.slice(0, 100) || "",
    price_from: Number(item.price_from || 0),
    sqft_from: Number(item.sqft_from || 0),
    handover: item.handover || "",
    configuration: Array.isArray(item.configuration) ? item.configuration : [],
    description: item.description || "",
    location: item.location || "",
    // null = not provided — no fallback
    gallery:      rawGallery ? rawGallery.map((url) => resolveMediaUrl(url)) : null,
    floor_plan:   item.floor_plan   ? resolveMediaUrl(item.floor_plan)   : null,
    floor_plans:  Array.isArray(item.floor_plans) ? item.floor_plans.map(fp => ({ ...fp, file: resolveMediaUrl(fp.file) })) : null,
    amenities:    Array.isArray(item.amenities) && item.amenities.length  ? item.amenities   : null,
    map_image:    item.map_image    ? resolveMediaUrl(item.map_image)     : null,
    payment_plan: Array.isArray(item.payment_plan) && item.payment_plan.length ? item.payment_plan : null,
    type:         item.type || "",
    transactions: Array.isArray(item.transactions) && item.transactions.length ? item.transactions : null,
    brochure_url: item.brochure_url ? resolveMediaUrl(item.brochure_url) : null,
  };
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [others, setOthers] = useState([]);
  const [tab, setTab] = useState("Details");
  const [mapFullscreen, setMapFullscreen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      axios.get(`${API}/projects/${id}`),
      axios.get(`${API}/projects`, { params: { per_page: 100 } }),
    ]).then(([projectRes, othersRes]) => {
      if (!isMounted) return;

      if (projectRes.status === "fulfilled") {
        setP(toProjectViewModel(projectRes.value.data));
      } else {
        setP({ error: true });
      }

      if (othersRes.status === "fulfilled") {
        const results = othersRes.value.data?.results || [];
        setOthers(results.filter((x) => String(x.id) !== String(id)).map(toProjectViewModel));
      }
    });

    return () => { isMounted = false; };
  }, [id]);

  // Only show tabs that have real content
  const activeSections = useMemo(() => {
    if (!p || p.error) return ["Details"];
    const sections = ["Details"];
    if (p.gallery  && p.gallery.length   > 0) sections.push("Gallery");
    if (p.floor_plan || (p.floor_plans && p.floor_plans.length > 0)) sections.push("Floor Plan");
    if (p.amenities && p.amenities.length > 0) sections.push("Amenities");
    if (p.location || p.map_image)             sections.push("Location");
    if (p.payment_plan && p.payment_plan.length > 0) sections.push("Payment Plan");
    if (others.length > 0)                     sections.push("Comparison");
    if (p.transactions && p.transactions.length > 0) sections.push("Transactions");
    return sections;
  }, [p, others]);

  // Reset to Details if current tab becomes unavailable
  useEffect(() => {
    if (!activeSections.includes(tab)) setTab("Details");
  }, [activeSections, tab]);

  if (!p) {
    return (
      <div className="pt-40 section-pad container-x">
        <h1 className="font-display text-4xl">Loading...</h1>
        <Link to="/projects" className="link-gold mt-6 inline-block">Back to projects</Link>
      </div>
    );
  }

  if (p.error) {
    return (
      <div className="pt-40 section-pad container-x">
        <h1 className="font-display text-4xl">Project Not Found</h1>
        <p className="mt-4 text-[var(--muted)]">Please check back later or contact support.</p>
        <Link to="/projects" className="link-gold mt-6 inline-block">Back to projects</Link>
      </div>
    );
  }

  const canonicalUrl = `${SITE_URL}/projects/${id}`;

  // Full RealEstateListing schema with offers, images, geo, and configuration
  const projectSchema = buildRealEstateListingSchema(p, canonicalUrl);

  const breadcrumbsSchema = buildBreadcrumbSchema([
    { name: "Projects", url: `${SITE_URL}/projects` },
    { name: p.name, url: canonicalUrl },
  ]);


  return (
    <>
      {p && (
        <Helmet>
          <title>{`${p.name} by ${p.developer} | Triad Realty`}</title>
          <meta name="description" content={`Discover ${p.name} in ${p.location}, ${p.emirate}. Configuration: ${p.configuration.join(", ")}. Handover: ${p.handover}. View starting price & map details.`} />
          <link rel="canonical" href={canonicalUrl} />
          <meta property="og:title" content={`${p.name} by ${p.developer} | Triad Realty`} />
          <meta property="og:description" content={`Discover ${p.name} in ${p.location}, ${p.emirate}. Handover: ${p.handover}.`} />
          <meta property="og:type" content="product" />
          <meta property="og:url" content={canonicalUrl} />
          <meta property="og:image" content={p.hero} />
          <meta name="twitter:card" content="summary_large_image" />
          {projectSchema && <script type="application/ld+json">{JSON.stringify(projectSchema)}</script>}
          {breadcrumbsSchema && <script type="application/ld+json">{JSON.stringify(breadcrumbsSchema)}</script>}
        </Helmet>
      )}

      {/* ── Hero ── */}
      <section className="relative h-[80vh] overflow-hidden" data-testid="pdetail-hero">
        <img 
          src={p.hero} 
          alt={`${p.name} Project Hero Banner`} 
          width={1920}
          height={800}
          loading="eager"
          className="w-full h-full object-cover kenburns" 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-black/70" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="container-x px-5 lg:px-12 pb-20">
            <Breadcrumbs items={[{ label: "Projects", url: "/projects" }, { label: p.name, url: `/projects/${p.id}` }]} />
            <div className="overline text-[var(--gold)] mt-8">
              {p.developer}{p.developer && p.emirate ? " · " : ""}{p.emirate}
            </div>
            <h1 className="font-display text-white text-5xl md:text-7xl mt-4 leading-[0.95]">{p.name}</h1>
            {p.tagline && <p className="text-white/85 mt-4 max-w-xl">{p.tagline}</p>}
            <div className="flex gap-4 mt-8 flex-wrap">
              {p.brochure_url ? (
                <a href={p.brochure_url} target="_blank" rel="noopener noreferrer" className="btn-ghost-light" data-testid="pdetail-cta-brochure">
                  <Download size={14} />Download Brochure
                </a>
              ) : (
                <Link to={`/contact?project=${p.id}&asset=brochure`} className="btn-ghost-light" data-testid="pdetail-cta-brochure">
                  <Download size={14} />Download Brochure
                </Link>
              )}
              <Link to={`/contact?project=${p.id}&asset=factsheet`} className="text-white text-xs uppercase tracking-[0.22em] border-b border-[var(--gold)] pb-2">
                Factsheet
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="bg-[var(--ink)] text-white" data-testid="pdetail-stats">
        <div className="container-x px-5 lg:px-12 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
          {p.price_from > 0 && <Stat label="Starting From" value={`AED ${(p.price_from / 1_000_000).toFixed(2)}M`} />}
          {p.sqft_from  > 0 && <Stat label="Sqft From"     value={p.sqft_from.toLocaleString()} />}
          {p.handover        && <Stat label="Handover"      value={p.handover} />}
          {p.configuration.length > 0 && <Stat label="Configurations" value={p.configuration.join(" · ")} />}
        </div>
      </section>

      {/* ── Tab navigation (only available sections) ── */}
      <section className="sticky top-[68px] z-30 bg-white border-b border-[var(--line)]" data-testid="pdetail-tabs">
        <div className="container-x px-5 lg:px-12 flex gap-1 overflow-x-auto">
          {activeSections.map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`whitespace-nowrap text-[11px] uppercase tracking-[0.22em] px-4 py-5 border-b-2 transition-colors ${
                tab === s
                  ? "border-[var(--gold)] text-[var(--ink)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
              data-testid={`tab-${s.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* ── Content ── */}
      <section
        className="section-pad bg-white"
        data-testid={`pdetail-section-${tab.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="container-x">

          {/* Details */}
          {tab === "Details" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-7">
                <div className="overline text-[var(--gold-deep)]">The Project</div>
                <h2 className="font-display text-4xl md:text-5xl mt-3 leading-tight">{p.name}</h2>
                {p.description && (
                  <p className="text-lg mt-6 leading-relaxed text-[var(--ink-2)]">{p.description}</p>
                )}
                {(p.location || p.developer || p.handover || p.configuration.length > 0) && (
                  <p className="text-base mt-4 leading-relaxed text-[var(--ink-2)]">
                    {p.location  && <><span>Located in </span><strong>{p.location}</strong><span>{p.developer || p.handover ? ", " : "."}</span></>}
                    {p.developer && <><span>developed by </span><strong>{p.developer}</strong><span>{p.handover ? ", " : "."}</span></>}
                    {p.handover  && <><span>with a planned handover in </span><strong>{p.handover}</strong><span>.</span></>}
                    {p.configuration.length > 0 && <><span> Available in {p.configuration.join(", ")}.</span></>}
                  </p>
                )}
              </div>
              <aside className="lg:col-span-5 bg-[var(--bg-alt)] p-8">
                <div className="overline text-[var(--gold-deep)]">Speak with a Consultant</div>
                <h3 className="font-display text-3xl mt-3">Personalized walkthrough.</h3>
                <p className="text-sm text-[var(--muted)] mt-3">
                  Floor plans, payment options, and pre-launch pricing — direct from the desk handling this project.
                </p>
                <div className="mt-6 space-y-3">
                  <a href="tel:+971545193393" className="flex items-center gap-3 text-sm link-gold">
                    <Phone size={14} className="text-[var(--gold-deep)]" />+971 54 519 3393
                  </a>
                  <a href="mailto:hello@triadrealty.ae" className="flex items-center gap-3 text-sm link-gold">
                    <Mail size={14} className="text-[var(--gold-deep)]" />hello@triadrealty.ae
                  </a>
                </div>
                {p.brochure_url ? (
                  <a href={p.brochure_url} target="_blank" rel="noopener noreferrer" className="btn-gold w-full justify-center mt-6">
                    Download Brochure
                  </a>
                ) : (
                  <Link to={`/contact?project=${p.id}&asset=brochure`} className="btn-gold w-full justify-center mt-6">
                    Request Brochure
                  </Link>
                )}
              </aside>
            </div>
          )}

          {/* Gallery — only rendered when real gallery exists */}
          {tab === "Gallery" && p.gallery && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {p.gallery.map((g, i) => (
                <div
                  key={i}
                  className={`img-zoom ${i === 0 ? "md:row-span-2 aspect-[4/5]" : "aspect-[4/3]"}`}
                  data-testid={`gallery-img-${i}`}
                >
                  <img 
                    src={g} 
                    alt={`${p.name} Gallery Image ${i + 1}`} 
                    width={i === 0 ? 600 : 400}
                    height={i === 0 ? 750 : 300}
                    loading="lazy"
                    className="w-full h-full object-cover" 
                  />
                </div>
              ))}
            </div>
          )}

          {/* Floor Plan — rendered when real floor_plan or floor_plans list exists */}
          {tab === "Floor Plan" && (p.floor_plan || (p.floor_plans && p.floor_plans.length > 0)) && (
            <div>
              <div className="overline text-[var(--gold-deep)]">Floor Plans</div>
              <h2 className="font-display text-4xl mt-3">Spatial blueprints.</h2>
              
              {p.floor_plan && (
                <div className="mt-10 border border-[var(--line)] p-6 bg-[var(--bg-alt)] max-w-3xl">
                  {p.floor_plan.toLowerCase().endsWith(".pdf") ? (
                    <div className="py-12 text-center">
                      <p className="text-lg font-medium text-[var(--ink)]">Floor Plan Document (PDF)</p>
                      <a href={p.floor_plan} target="_blank" rel="noopener noreferrer" className="btn-gold mt-4 inline-flex items-center gap-2">
                        <Download size={14} /> View PDF Blueprint
                      </a>
                    </div>
                  ) : (
                    <img 
                      src={p.floor_plan} 
                      alt={`${p.name} Detailed Floor Plan Blueprint`} 
                      width={800}
                      height={600}
                      loading="lazy"
                      className="w-full max-h-[600px] object-contain mx-auto" 
                    />
                  )}
                  <div className="mt-6 flex justify-between items-center flex-wrap gap-4">
                    <div className="text-sm text-[var(--muted)]">Detailed plans by configuration available on request.</div>
                    <Link to={`/contact?project=${p.id}&asset=floor-plan`} className="btn-gold">Request Full Plans</Link>
                  </div>
                </div>
              )}

              {p.floor_plans && p.floor_plans.length > 0 && (
                <div className="mt-10 max-w-3xl space-y-6">
                  <h3 className="font-display text-2xl text-[var(--ink)]">Downloadable Floor Plans</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {p.floor_plans.map((fp) => (
                      <div key={fp.id} className="border border-[var(--line)] p-5 bg-[var(--bg-alt)] flex justify-between items-center gap-4 flex-wrap">
                        <div>
                          <div className="font-semibold text-base text-[var(--ink)]">{fp.name}</div>
                          {fp.description && <div className="text-xs text-[var(--muted)] mt-1">{fp.description}</div>}
                        </div>
                        <a href={fp.file} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex items-center gap-1">
                          <Download size={12} /> Download PDF
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Amenities — only rendered when real amenities exist */}
          {tab === "Amenities" && p.amenities && (
            <div>
              <div className="overline text-[var(--gold-deep)]">Amenities</div>
              <h2 className="font-display text-4xl mt-3">Designed around the residents.</h2>
              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--line)]">
                {p.amenities.map((a) => (
                  <div
                    key={a}
                    className="bg-white p-6 flex items-center gap-3"
                    data-testid={`amenity-${a.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <ChevronRight size={14} className="text-[var(--gold-deep)]" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location — only rendered when location text or map image exists */}
          {tab === "Location" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {p.map_image && (
                <div className="lg:col-span-7">
                  <div
                    className="aspect-[4/3] img-zoom cursor-zoom-in relative group overflow-hidden shadow-md"
                    onClick={() => setMapFullscreen(true)}
                    data-testid="map-container"
                  >
                    <img 
                      src={p.map_image} 
                      alt={`Location Map of ${p.name} in ${p.location}`} 
                      width={800}
                      height={600}
                      loading="lazy"
                      className="w-full h-full object-cover" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <span className="text-white text-xs uppercase tracking-[0.2em] bg-black/60 px-4 py-2 border border-white/20">
                        View Fullscreen
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className={p.map_image ? "lg:col-span-5" : "lg:col-span-12"}>
                <div className="overline text-[var(--gold-deep)]">Location</div>
                <h2 className="font-display text-4xl mt-3">{p.location || p.emirate}</h2>
                {p.emirate && (
                  <p className="mt-4 text-[var(--ink-2)] leading-relaxed">
                    Strategic positioning in one of {p.emirate}'s most sought-after corridors — minutes from key business districts, beaches, and lifestyle anchors.
                  </p>
                )}
                {p.location && (
                  <div className="mt-6 space-y-3 text-sm">
                    <div className="flex items-center gap-3">
                      <MapPin size={14} className="text-[var(--gold-deep)]" />
                      <span>{p.location}{p.emirate ? `, ${p.emirate}, UAE` : ""}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Plan — only rendered when real payment plan exists */}
          {tab === "Payment Plan" && p.payment_plan && (
            <div>
              <div className="overline text-[var(--gold-deep)]">Payment Plan</div>
              <h2 className="font-display text-4xl mt-3">Structured for the buyer.</h2>
              <div className="mt-10 max-w-3xl">
                {p.payment_plan.map((pl, i) => (
                  <div key={i} className="border-t border-[var(--line)] py-5 flex justify-between items-center" data-testid={`payment-${i}`}>
                    <div>
                      <div className="overline text-[var(--muted)]">Stage {i + 1}</div>
                      <div className="font-display text-2xl mt-1">{pl.milestone}</div>
                    </div>
                    <div className="font-display text-4xl text-[var(--gold-deep)] tabular">{pl.percent}%</div>
                  </div>
                ))}
              </div>
              <Link to={`/contact?project=${p.id}&asset=payment-plan`} className="btn-ghost mt-8">Request Detailed Plan</Link>
            </div>
          )}

          {/* Comparison — shown when there are other projects to compare */}
          {tab === "Comparison" && (
            <div>
              <div className="overline text-[var(--gold-deep)]">Comparison</div>
              <h2 className="font-display text-4xl mt-3">{p.name} versus the market.</h2>
              <div className="mt-10 overflow-x-auto border border-[var(--line)]">
                <table className="w-full text-sm tabular" data-testid="comparison-table">
                  <thead className="bg-[var(--bg-alt)]">
                    <tr>
                      <th className="text-left p-4 overline text-[var(--muted)]">Project</th>
                      <th className="text-left p-4 overline text-[var(--muted)]">Location</th>
                      <th className="text-left p-4 overline text-[var(--muted)]">Type</th>
                      <th className="text-left p-4 overline text-[var(--muted)]">From (AED)</th>
                      <th className="text-left p-4 overline text-[var(--muted)]">Sqft From</th>
                      <th className="text-left p-4 overline text-[var(--muted)]">Handover</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-[var(--gold)]/10">
                      <td className="p-4 font-display text-lg">{p.name}</td>
                      <td className="p-4">{p.location || "—"}</td>
                      <td className="p-4">{p.type    || "—"}</td>
                      <td className="p-4">{p.price_from > 0 ? p.price_from.toLocaleString() : "—"}</td>
                      <td className="p-4">{p.sqft_from  > 0 ? p.sqft_from.toLocaleString()  : "—"}</td>
                      <td className="p-4">{p.handover   || "—"}</td>
                    </tr>
                    {others.slice(0, 4).map((o) => (
                      <tr key={o.id} className="border-t border-[var(--line)]">
                        <td className="p-4">
                          <Link to={`/projects/${o.id}`} className="link-gold">{o.name}</Link>
                        </td>
                        <td className="p-4">{o.location || "—"}</td>
                        <td className="p-4">{o.type     || "—"}</td>
                        <td className="p-4">{o.price_from > 0 ? `AED ${Number(o.price_from).toLocaleString()}` : "—"}</td>
                        <td className="p-4">{o.sqft_from  > 0 ? Number(o.sqft_from).toLocaleString()            : "—"}</td>
                        <td className="p-4">{o.handover   || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link to={`/contact?project=${p.id}&asset=comparison`} className="btn-ghost mt-8">Download Full Comparison</Link>
            </div>
          )}

          {/* Transactions — only rendered when real transactions exist */}
          {tab === "Transactions" && p.transactions && (
            <div>
              <div className="overline text-[var(--gold-deep)]">Transaction History</div>
              <h2 className="font-display text-4xl mt-3">Recent recorded sales.</h2>
              <div className="mt-10 max-w-3xl">
                {p.transactions.map((tx, i) => (
                  <div key={i} className="flex justify-between border-t border-[var(--line)] py-5">
                    <div>
                      <div className="overline text-[var(--muted)]">{tx.date}</div>
                      <div className="font-display text-xl mt-1">{tx.unit}</div>
                    </div>
                    <div className="font-display text-2xl tabular">AED {Number(tx.price || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <Link to={`/contact?project=${p.id}&asset=market-analysis`} className="btn-ghost mt-8">Get Market Report</Link>
            </div>
          )}

        </div>
      </section>

      {/* Fullscreen Map Modal */}
      {mapFullscreen && p.map_image && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setMapFullscreen(false)}
        >
          <button
            className="absolute top-6 right-6 text-white hover:text-[var(--gold)] transition-colors p-2 bg-black/40 rounded-full"
            onClick={() => setMapFullscreen(false)}
            data-testid="close-map-fullscreen"
          >
            <span className="sr-only">Close</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={p.map_image}
            alt={`Project Location Map of ${p.name}`}
            width={1200}
            height={900}
            loading="lazy"
            className="max-w-full max-h-[90vh] object-contain shadow-2xl rounded border border-white/10"
            onClick={(e) => e.stopPropagation()}
            data-testid="map-fullscreen-image"
          />
        </div>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-[var(--ink)] p-6">
      <div className="overline opacity-60">{label}</div>
      <div className="font-display text-2xl md:text-3xl mt-2 text-[var(--gold)]">{value}</div>
    </div>
  );
}
