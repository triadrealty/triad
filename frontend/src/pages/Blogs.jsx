import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Calendar, Clock } from "lucide-react";
import { API_URL as API, resolveMediaUrl, SITE_URL } from "../config";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildArticleSchema, buildBreadcrumbSchema } from "../utils/seo";


export function Blogs() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let isMounted = true;
    axios.get(`${API}/blogs`).then((r) => {
      if (isMounted) setItems(r.data.results || []);
    });
    return () => {
      isMounted = false;
    };
  }, []);
  const [feature, ...rest] = items;
  const canonicalUrl = `${SITE_URL}/blogs`;
  const blogsSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Triad Realty Market Insights",
    url: canonicalUrl,
    description: "Premium real estate insights, market analyses, and off-plan investment updates in Dubai & the UAE.",
    publisher: {
      "@type": "Organization",
      name: "Triad Realty",
      logo: "https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444277/logo_ciuljv.png",
    },
    blogPost: items.slice(0, 10).map((b) => ({
      "@type": "BlogPosting",
      headline: b.title,
      url: `${SITE_URL}/blogs/${b.id}`,
      image: b.cover ? resolveMediaUrl(b.cover) : undefined,
      datePublished: b.date,
      author: { "@type": "Person", name: b.author || "Triad Consultant" },
      description: b.excerpt,
    })),
  };


  return (
    <>
      <Helmet>
        <title>Market Insights & Analyses | Triad Realty</title>
        <meta name="description" content="Discover premium real estate insights, off-plan investment guides, and strategic market reports for Dubai and UAE real estate." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="Market Insights & Analyses | Triad Realty" />
        <meta property="og:description" content="Discover premium real estate insights and strategic market reports for Dubai and UAE real estate." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <script type="application/ld+json">{JSON.stringify(blogsSchema)}</script>
      </Helmet>

      <section className="section-pad pt-40 bg-white">
        <div className="container-x">
          <Breadcrumbs items={[{ label: "Blogs", url: "/blogs" }]} />
          {feature && (
            <Link to={`/blogs/${feature.id}`} className="grid grid-cols-1 lg:grid-cols-12 gap-10 group" data-testid="blog-feature">
              <div className="lg:col-span-7 img-zoom aspect-[16/10]">
                <img 
                  src={resolveMediaUrl(feature.cover)} 
                  alt={`Feature Article: ${feature.title}`} 
                  width={800}
                  height={500}
                  loading="eager"
                  className="w-full h-full object-cover" 
                />
              </div>
              <div className="lg:col-span-5 self-center">
                <div className="overline text-[var(--gold-deep)]">{feature.category}</div>
                <h2 className="font-display text-4xl md:text-5xl mt-4 leading-tight group-hover:text-[var(--gold-deep)] transition-colors">{feature.title}</h2>
                <p className="mt-5 text-[var(--ink-2)]">{feature.excerpt}</p>
                <div className="mt-6 flex gap-5 text-xs text-[var(--muted)] tabular">
                  <span className="flex items-center gap-1"><Calendar size={12} />{feature.date}</span>
                  <span className="flex items-center gap-1"><Clock size={12} />{feature.read_minutes} min read</span>
                </div>
                <div className="mt-6 link-gold inline-flex items-center gap-2">Read article <ArrowUpRight size={14} /></div>
              </div>
            </Link>
          )}

          <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {rest.map((b) => (
              <Link to={`/blogs/${b.id}`} key={b.id} className="group" data-testid={`blog-${b.id}`}>
                <div className="aspect-[4/3] img-zoom">
                  <img 
                    src={resolveMediaUrl(b.cover)} 
                    alt={b.title} 
                    width={400}
                    height={300}
                    loading="lazy"
                    className="w-full h-full object-cover" 
                  />
                </div>
                <div className="overline text-[var(--gold-deep)] mt-5">{b.category}</div>
                <h3 className="font-display text-2xl mt-2 group-hover:text-[var(--gold-deep)] transition-colors">{b.title}</h3>
                <p className="text-sm text-[var(--muted)] mt-2">{b.excerpt}</p>
                <div className="mt-4 flex gap-4 text-xs text-[var(--muted)] tabular">
                  <span>{b.author}</span><span>·</span><span>{b.date}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function BlogDetail() {
  const { id } = useParams();
  const [b, setB] = useState(null);
  useEffect(() => {
    let isMounted = true;
    axios.get(`${API}/blogs/${id}`).then((r) => {
      if (isMounted) setB(r.data);
    }).catch(() => {
      if (isMounted) setB(null);
    });
    return () => {
      isMounted = false;
    };
  }, [id]);
  if (!b) return <div className="pt-40 section-pad container-x"><p>Loading…</p></div>;

  const canonicalUrl = `${SITE_URL}/blogs/${id}`;
  // Full Article schema with author, dates, publisher, image, wordCount etc.
  const blogPostSchema = buildArticleSchema(
    { ...b, cover: resolveMediaUrl(b.cover) },
    canonicalUrl
  );
  const breadcrumbsSchema = buildBreadcrumbSchema([
    { name: "Blogs", url: `${SITE_URL}/blogs` },
    { name: b.title, url: canonicalUrl },
  ]);


  return (
    <>
      <Helmet>
        <title>{`${b.title} | Triad Realty Insights`}</title>
        <meta name="description" content={b.excerpt} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={`${b.title} | Triad Realty Insights`} />
        <meta property="og:description" content={b.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={resolveMediaUrl(b.cover)} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(blogPostSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbsSchema)}</script>

      </Helmet>

      <section className="pt-32" data-testid="blog-detail">
        <div className="container-x px-5 lg:px-12">
          <Breadcrumbs items={[{ label: "Blogs", url: "/blogs" }, { label: b.title, url: `/blogs/${b.id}` }]} />
          <div className="overline text-[var(--gold-deep)] mt-10">{b.category}</div>
          <h1 className="font-display text-4xl md:text-6xl mt-4 leading-[1.05] max-w-4xl">{b.title}</h1>
          <div className="flex gap-5 text-sm text-[var(--muted)] mt-6 tabular">
            <span>{b.author}</span><span>·</span><span>{b.date}</span><span>·</span><span>{b.read_minutes} min read</span>
          </div>
        </div>
        <div className="container-x px-5 lg:px-12 mt-12">
          <div className="aspect-[16/9] img-zoom">
            <img 
              src={resolveMediaUrl(b.cover)} 
              alt={b.title} 
              width={1200}
              height={675}
              loading="eager"
              className="w-full h-full object-cover" 
            />
          </div>
        </div>
        <div className="container-x px-5 lg:px-12 max-w-3xl mx-auto mt-16 pb-32">
          <p className="text-xl leading-relaxed first-letter:font-display first-letter:text-6xl first-letter:float-left first-letter:mr-3 first-letter:text-[var(--gold-deep)]">
            {b.content}
          </p>
          <p className="text-lg leading-relaxed mt-6 text-[var(--ink-2)]">
            Reach out to a Triad consultant for a personalised version of this analysis tailored to your portfolio, capital outlay, and timeline.
          </p>
          <Link to="/contact" className="btn-gold mt-10 inline-flex">Speak to a Consultant <ArrowUpRight size={14} /></Link>
        </div>
      </section>
    </>
  );
}
