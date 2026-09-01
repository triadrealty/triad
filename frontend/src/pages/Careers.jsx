import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { API_URL as API, SITE_URL } from "../config";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildJobPostingSchema } from "../utils/seo";

const WHY = [
  { t: "Senior mentorship", d: "Direct partnership with founders and senior consultants from day one." },
  { t: "Curated inventory", d: "Trade in projects you'd want to live in — never volume for volume's sake." },
  { t: "Analytics-led", d: "An in-house research desk that arms every consultant with the latest data." },
  { t: "Earn meaningfully", d: "Uncapped commissions and a transparent split structure." },
];

export default function Careers() {
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", position: "", experience_years: "", cover_letter: "", portfolio_url: "" });
  const [status, setStatus] = useState("idle");

  useEffect(() => { axios.get(`${API}/careers`).then((r) => setPositions(r.data.results || [])); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setStatus("submitting");
    try {
      await axios.post(`${API}/applications`, {
        ...form,
        experience_years: form.experience_years ? Number(form.experience_years) : null,
      });
      setStatus("success");
      setForm({ name: "", email: "", phone: "", position: "", experience_years: "", cover_letter: "", portfolio_url: "" });
    } catch {
      setStatus("error");
    }
  };

  const canonicalUrl = `${SITE_URL}/careers`;
  // Generate a JobPosting schema per open position from the live API
  const jobPostingSchemas = positions.map((pos) => buildJobPostingSchema(pos)).filter(Boolean);
  // Fallback WebPage schema when no positions are loaded yet
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Careers & Partner Opportunities | Triad Realty",
    url: canonicalUrl,
    description: "Join our team of luxury real estate consultants in Dubai. Explore open roles and career opportunities at Triad Realty.",
  };

  return (
    <>
      <Helmet>
        <title>Careers &amp; Opportunities | Triad Realty Dubai</title>
        <meta name="description" content="Build your real estate career in Dubai with Triad Realty. Explore senior agent and portfolio advisor opportunities in our analytics-led team." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="Careers &amp; Opportunities | Triad Realty Dubai" />
        <meta property="og:description" content="Build your real estate career in Dubai with Triad Realty." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <script type="application/ld+json">{JSON.stringify(pageSchema)}</script>
        {jobPostingSchemas.map((schema, i) => (
          <script key={i} type="application/ld+json">{JSON.stringify(schema)}</script>
        ))}
      </Helmet>

      <section className="pt-40 pb-12 section-pad bg-white" data-testid="careers-hero">
        <div className="container-x grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-7">
            <Breadcrumbs items={[{ label: "Careers", url: "/careers" }]} />
            <div className="overline text-[var(--gold-deep)]">Careers</div>
            <h1 className="font-display text-5xl md:text-7xl mt-6 leading-[0.95]">Build a career in <em className="text-[var(--gold-deep)]">UAE real estate.</em></h1>
            <p className="text-lg mt-8 max-w-xl text-[var(--ink-2)]">We hire slowly, mentor seriously, and reward results — joining Triad is joining a small team with an outsized point of view.</p>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-px bg-[var(--line)] self-end">
            <div className="bg-white p-6"><div className="overline opacity-60">Open Roles</div><div className="font-display text-4xl mt-2 text-[var(--gold-deep)]">{positions.length}</div></div>
            <div className="bg-white p-6"><div className="overline opacity-60">HQ</div><div className="font-display text-2xl mt-2">Dubai Marina</div></div>
          </div>
        </div>
      </section>

      <section className="section-pad bg-[var(--bg-alt)]" data-testid="careers-why">
        <div className="container-x">
          <div className="overline text-[var(--gold-deep)]">Why Work With Us</div>
          <h2 className="font-display text-4xl md:text-6xl mt-3">A small team, a sharp craft.</h2>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--line)]">
            {WHY.map((w) => (
              <div key={w.t} className="bg-white p-8">
                <CheckCircle2 className="text-[var(--gold-deep)]" size={22} />
                <h3 className="font-display text-2xl mt-5">{w.t}</h3>
                <p className="text-sm mt-3 text-[var(--ink-2)]">{w.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad bg-white" data-testid="careers-positions">
        <div className="container-x">
          <div className="overline text-[var(--gold-deep)]">Open Positions</div>
          <h2 className="font-display text-4xl md:text-6xl mt-3">We're hiring.</h2>

          <div className="mt-12 border-t border-[var(--line)]">
            {positions.map((p) => (
              <div key={p.id} className="border-b border-[var(--line)] py-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center hover:bg-[var(--bg-alt)] transition-colors px-4" data-testid={`position-${p.id}`}>
                <div className="md:col-span-5">
                  <h3 className="font-display text-2xl">{p.title}</h3>
                  <p className="text-sm text-[var(--muted)] mt-2 max-w-md">{p.summary}</p>
                </div>
                <div className="md:col-span-2"><div className="overline opacity-60">Type</div><div className="text-sm mt-1">{p.type}</div></div>
                <div className="md:col-span-2"><div className="overline opacity-60">Location</div><div className="text-sm mt-1">{p.location}</div></div>
                <div className="md:col-span-2"><div className="overline opacity-60">Experience</div><div className="text-sm mt-1">{p.experience}</div></div>
                <div className="md:col-span-1 text-right">
                  <button onClick={() => { setForm({ ...form, position: p.title }); document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" }); }} className="link-gold text-xs uppercase tracking-[0.22em]" data-testid={`apply-${p.id}`}>Apply →</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="apply" className="section-pad bg-[var(--ink)] text-white relative" data-testid="careers-application">
        <div className="grain absolute inset-0" />
        <div className="container-x relative grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <div className="overline text-[var(--gold)]">Application</div>
            <h2 className="font-display text-4xl md:text-6xl mt-3 leading-none">Send us your story.</h2>
            <p className="text-sm opacity-70 mt-6 max-w-sm">We read every application. Tell us about a deal you're proud of, or a property you wish you owned.</p>
          </div>
          <div className="lg:col-span-7">
            {status === "success" ? (
              <div className="border border-[var(--gold)]/40 p-10" data-testid="apply-success">
                <CheckCircle2 className="text-[var(--gold)]" />
                <h3 className="font-display text-3xl mt-4">Thank you.</h3>
                <p className="opacity-80 mt-2">Your application has been received. We'll be in touch.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-6" data-testid="apply-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <input required placeholder="Full name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-line-dark" data-testid="apply-name" />
                  <input required type="email" placeholder="Email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-line-dark" data-testid="apply-email" />
                  <input required placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-line-dark" data-testid="apply-phone" />
                  <input required placeholder="Position *" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="input-line-dark" data-testid="apply-position" />
                  <input type="number" placeholder="Years of experience" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} className="input-line-dark" data-testid="apply-experience" />
                  <input placeholder="Portfolio / LinkedIn URL" value={form.portfolio_url} onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })} className="input-line-dark" data-testid="apply-portfolio" />
                </div>
                <textarea rows={4} placeholder="A note about you" value={form.cover_letter} onChange={(e) => setForm({ ...form, cover_letter: e.target.value })} className="input-line-dark" data-testid="apply-cover" />
                {status === "error" && <p className="text-red-400 text-sm">Something went wrong. Please try again.</p>}
                <button type="submit" className="btn-ghost-light" disabled={status === "submitting"} data-testid="apply-submit">
                  {status === "submitting" ? "Sending…" : "Submit Application"} <ArrowRight size={14} />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
