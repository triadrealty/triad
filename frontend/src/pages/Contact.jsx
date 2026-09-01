import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { COMPANY } from "../data";
import {
  Phone,
  Mail,
  MapPin,
  Instagram,
  Linkedin,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { API_URL as API, SITE_URL } from "../config";
import { DIAL_CODES, validatePhone, formatPhoneAsYouType } from "../utils/phoneValidation";
import { Helmet } from "react-helmet-async";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildContactPageSchema } from "../utils/seo";


// ─── Available time slots ──────────────────────────────────────────────────────
const TIME_SLOTS = [
  "9:00 AM", "9:30 AM",
  "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM",
  "1:00 PM",  "1:30 PM",
  "2:00 PM",  "2:30 PM",
  "3:00 PM",  "3:30 PM",
  "4:00 PM",  "4:30 PM",
  "5:00 PM",
];

// ─── Mini calendar helpers ─────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function startWeekday(y, m) { return new Date(y, m, 1).getDay(); }
function toIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function parseIso(iso) {
  if (!iso) return { y: 2026, m: 0, d: 1 };
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
}
function isWeekend(y, m, d) { const day = new Date(y, m, d).getDay(); return day === 0 || day === 6; }
function isBeforeToday(y, m, d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(y, m, d) < today;
}
function displayDate(iso) {
  if (!iso) return "";
  const { y, m, d } = parseIso(iso);
  return `${MONTHS[m]} ${d}, ${y}`;
}

// ─── Mini calendar component ───────────────────────────────────────────────────
function MiniCalendar({ selected, onChange }) {
  const today = new Date();
  const [viewY, setViewY] = useState(today.getFullYear());
  const [viewM, setViewM] = useState(today.getMonth());

  const total = daysInMonth(viewY, viewM);
  const start = startWeekday(viewY, viewM);
  const cells = Array.from({ length: start + total }, (_, i) => (i < start ? null : i - start + 1));

  const prev = () => { if (viewM === 0) { setViewM(11); setViewY(y => y - 1); } else setViewM(m => m - 1); };
  const next = () => { if (viewM === 11) { setViewM(0); setViewY(y => y + 1); } else setViewM(m => m + 1); };

  return (
    <div className="select-none border border-[var(--line)] p-4 bg-white">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prev} className="p-1.5 rounded hover:bg-[var(--bg-alt)] transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="font-display text-sm font-semibold">{MONTHS[viewM]} {viewY}</span>
        <button type="button" onClick={next} className="p-1.5 rounded hover:bg-[var(--bg-alt)] transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1 text-center">
        {DAYS.map(d => (
          <div key={d} className="text-[10px] text-[var(--muted)] uppercase tracking-widest py-1 font-medium">{d}</div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map((d, idx) => {
          if (!d) return <div key={idx} />;
          const iso = toIso(viewY, viewM, d);
          const past    = isBeforeToday(viewY, viewM, d);
          const weekend = isWeekend(viewY, viewM, d);
          const isSel   = selected === iso;
          const disabled = past || weekend;
          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(iso)}
              className={`text-xs py-2 rounded transition-all duration-150 ${
                isSel
                  ? "bg-[var(--gold)] text-[var(--ink)] font-semibold"
                  : disabled
                    ? "text-[var(--muted)]/30 cursor-not-allowed"
                    : "hover:bg-[var(--gold)]/15 text-[var(--ink)] cursor-pointer"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--muted)] mt-3 text-center">Weekdays only · UAE Business Hours</p>
    </div>
  );
}

export default function Contact() {
  const [searchParams] = useSearchParams();
  const projectParam = searchParams.get("project");
  const assetParam = searchParams.get("asset") || "brochure";
  const typeParam = searchParams.get("type");

  const [selectedCountry, setSelectedCountry] = useState(DIAL_CODES[0]); // UAE default
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "", notes: "" });
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const [phoneError, setPhoneError] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");

  const [projectData, setProjectData] = useState(null);
  const [contact, setContact] = useState({
    address:   COMPANY.address,
    phone:     COMPANY.phone,
    email:     COMPANY.email,
    whatsapp:  COMPANY.whatsapp,
    instagram: COMPANY.instagram,
    linkedin:  COMPANY.linkedin,
  });

  useEffect(() => {
    axios.get(`${API}/settings/homepage`)
      .then((res) => {
        if (res.data) {
          setContact({
            address:   res.data.company_address  || COMPANY.address,
            phone:     res.data.company_phone    || COMPANY.phone,
            email:     res.data.company_email    || COMPANY.email,
            whatsapp:  res.data.company_whatsapp || COMPANY.whatsapp,
            instagram: res.data.company_instagram || COMPANY.instagram,
            linkedin:  res.data.company_linkedin  || COMPANY.linkedin,
          });
        }
      })
      .catch(() => {/* use defaults */});
  }, []);

  // Fetch project details for brochure download layout
  useEffect(() => {
    if (projectParam) {
      axios.get(`${API}/projects/${projectParam}`)
        .then((res) => {
          if (res.data) setProjectData(res.data);
        })
        .catch(() => {
          const formattedName = projectParam
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          setProjectData({ name: formattedName, id: projectParam });
        });
    } else {
      setProjectData(null);
    }
  }, [projectParam]);

  // Handle phone changes with automatic formatting as they type
  const handlePhoneChange = (e) => {
    const inputVal = e.target.value;
    const cleaned = inputVal.replace(/[^\d\s\-()]/g, ""); // Allow basic formatting chars to let them type
    const formatted = formatPhoneAsYouType(cleaned, selectedCountry.code);
    setForm((prev) => ({ ...prev, phone: formatted }));
    if (phoneTouched) {
      setPhoneError(validatePhone(formatted, selectedCountry.dial, false));
    }
  };

  const handleCountryChange = (e) => {
    const country = DIAL_CODES.find((c) => c.code === e.target.value);
    if (country) {
      setSelectedCountry(country);
      const formatted = formatPhoneAsYouType(form.phone, country.code);
      setForm((prev) => ({ ...prev, phone: formatted }));
      if (phoneTouched) {
        setPhoneError(validatePhone(formatted, country.dial, false));
      }
    }
  };

  const handleBlur = () => {
    if (form.phone) {
      setPhoneTouched(true);
      setPhoneError(validatePhone(form.phone, selectedCountry.dial, false));
    }
  };

  const validateFields = () => {
    const err = {};
    if (!form.name.trim()) err.name = "Full name is required.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) err.email = "Valid email is required.";
    
    // If validation fails
    if (form.phone) {
      const pErr = validatePhone(form.phone, selectedCountry.dial, false);
      if (pErr) err.phone = pErr;
    }
    
    if (typeParam === "consultation") {
      if (!selectedDate) err.date = "Please select a preferred date.";
      if (!selectedTime) err.time = "Please select a preferred time slot.";
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setPhoneTouched(true);
    if (!validateFields()) return;

    setStatus("submitting");
    const formattedPhone = form.phone
      ? `${selectedCountry.dial}${form.phone.replace(/[\s\-()]/g, "")}`
      : "";

    try {
      if (typeParam === "consultation") {
        await axios.post(`${API}/consultations`, {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: formattedPhone,
          date: selectedDate,
          time_slot: selectedTime,
          notes: form.notes ? form.notes.trim() : "",
        });
      } else if (projectParam) {
        await axios.post(`${API}/leads`, {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: formattedPhone,
          project_id: projectParam,
          asset: assetParam,
          source_page: `/contact?project=${projectParam}`,
        });
      } else {
        await axios.post(`${API}/contacts`, {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: formattedPhone,
          subject: form.subject.trim(),
          message: form.message.trim(),
        });
      }
      setStatus("success");
      setForm({ name: "", email: "", phone: "", subject: "", message: "", notes: "" });
      setSelectedDate("");
      setSelectedTime("");
      setPhoneTouched(false);
      setPhoneError("");
      setErrors({});
    } catch {
      setStatus("error");
    }
  };

  // Helper to resolve title details
  const getHeaderInfo = () => {
    if (typeParam === "consultation") {
      return {
        overline: "Booking",
        title: <>Schedule a <em className="text-[var(--gold-deep)]">consultation.</em></>,
        desc: "Choose a time with a senior advisor. Online or in-office meetings are available."
      };
    }
    if (projectParam) {
      return {
        overline: "Exclusive Access",
        title: <>Download the <em className="text-[var(--gold-deep)]">{assetParam}</em></>,
        desc: `Get pricing sheets, floor plans, and developer access details for ${projectData?.name || projectParam} sent straight to your inbox.`
      };
    }
    return {
      overline: "Contact",
      title: <>Begin a <em className="text-[var(--gold-deep)]">conversation.</em></>,
      desc: "Whether you're exploring, comparing, or ready to close — a senior consultant will respond within a business day."
    };
  };

  const header = getHeaderInfo();

  const canonicalUrl = `${SITE_URL}/contact`;
  // Rich ContactPage + LocalBusiness with geo, opening hours, and multi-language contact points
  const contactPageSchema = buildContactPageSchema(canonicalUrl);


  return (
    <>
      <Helmet>
        <title>Contact & Advisory Booking | Triad Realty</title>
        <meta name="description" content="Reach out to Triad Realty Dubai. Book a luxury off-plan consultation, request brochures/floor plans, or connect with our investment desks directly." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content="Contact & Advisory Booking | Triad Realty" />
        <meta property="og:description" content="Book a luxury off-plan consultation, request brochures/floor plans, or connect with our investment desks." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg" />
        <script type="application/ld+json">{JSON.stringify(contactPageSchema)}</script>

      </Helmet>

      <section className="pt-40 pb-12 section-pad bg-white" data-testid="contact-hero">
        <div className="container-x">
          <Breadcrumbs items={[{ label: "Contact", url: "/contact" }]} />
          <div className="overline text-[var(--gold-deep)]">{header.overline}</div>
          <h1 className="font-display text-5xl md:text-7xl mt-6 leading-[0.95]">
            {header.title}
          </h1>
          <p className="text-lg mt-8 max-w-xl text-[var(--ink-2)]">
            {header.desc}
          </p>
        </div>
      </section>

      <section className="section-pad bg-white" data-testid="contact-main">
        <div className="container-x grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column: Contact details */}
          <div className="lg:col-span-5">
            <div className="space-y-8">
              <Detail icon={<Phone size={16} />}          label="Phone"     value={contact.phone}     href={`tel:${contact.phone.replace(/\s/g, "")}`}  testId="contact-detail-phone" />
              <Detail icon={<Mail size={16} />}           label="Email"     value={contact.email}     href={`mailto:${contact.email}`}                   testId="contact-detail-email" />
              <Detail icon={<MapPin size={16} />}         label="Office"    value={contact.address}                                                       testId="contact-detail-address" />
              {contact.instagram && (
                <Detail icon={<Instagram size={16} />}   label="Instagram" value="@triadrealty.ae"   href={contact.instagram}                            testId="contact-detail-instagram" />
              )}
              {contact.whatsapp && (
                <Detail icon={<MessageCircle size={16} />} label="WhatsApp" value={contact.phone}    href={contact.whatsapp}                             testId="contact-detail-whatsapp" />
              )}
            </div>

            <div className="mt-10 flex gap-4">
              {contact.instagram && (
                <a href={contact.instagram} target="_blank" rel="noreferrer" className="w-11 h-11 border border-[var(--line)] flex items-center justify-center hover:bg-[var(--ink)] hover:text-white transition-colors"><Instagram size={16} /></a>
              )}
              {contact.linkedin && (
                <a href={contact.linkedin}  target="_blank" rel="noreferrer" className="w-11 h-11 border border-[var(--line)] flex items-center justify-center hover:bg-[var(--ink)] hover:text-white transition-colors"><Linkedin size={16} /></a>
              )}
              {contact.whatsapp && (
                <a href={contact.whatsapp}  target="_blank" rel="noreferrer" className="w-11 h-11 border border-[var(--line)] flex items-center justify-center hover:bg-[var(--ink)] hover:text-white transition-colors"><MessageCircle size={16} /></a>
              )}
            </div>

            <div className="mt-12 aspect-[4/3] border border-[var(--line)] overflow-hidden">
              <iframe
                title="map"
                width="100%"
                height="100%"
                style={{ border: 0, filter: "grayscale(60%) contrast(0.95)" }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(contact.address)}&output=embed`}
              />
            </div>
          </div>

          {/* Right Column: Unified Form */}
          <div className="lg:col-span-7">
            {status === "success" ? (
              <div className="border border-[var(--gold)]/40 p-10" data-testid="contact-success">
                <CheckCircle2 className="text-[var(--gold-deep)]" />
                {typeParam === "consultation" ? (
                  <>
                    <h3 className="font-display text-3xl mt-4">Booking Confirmed!</h3>
                    <p className="text-[var(--muted)] mt-2">
                      Your consultation has been booked on <strong>{displayDate(selectedDate)}</strong> at <strong>{selectedTime}</strong>. A consultant will follow up shortly.
                    </p>
                  </>
                ) : projectParam ? (
                  <>
                    <h3 className="font-display text-3xl mt-4">Brochure Requested.</h3>
                    <p className="text-[var(--muted)] mt-2">
                      Thank you. We have sent the brochure information to your email.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-display text-3xl mt-4">Message received.</h3>
                    <p className="text-[var(--muted)] mt-2">A consultant will reach out within one business day.</p>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-7" data-testid="contact-form" noValidate>
                {/* 1. Date & Time Selection (only for consultation booking) */}
                {typeParam === "consultation" && (
                  <div className="space-y-6 border-b border-[var(--line)] pb-8">
                    <h3 className="font-display text-xl font-medium">1. Select Date & Time (GST)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar size={14} className="text-[var(--gold-deep)]" />
                          <span className="overline text-[var(--muted)]">Preferred Date</span>
                        </div>
                        <MiniCalendar selected={selectedDate} onChange={setSelectedDate} />
                        {errors.date && <p className="text-red-500 text-[11px] mt-1">{errors.date}</p>}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Clock size={14} className="text-[var(--gold-deep)]" />
                          <span className="overline text-[var(--muted)]">Time Slot</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
                          {TIME_SLOTS.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setSelectedTime(slot)}
                              className={`text-xs py-2.5 px-3 border transition-all ${
                                selectedTime === slot
                                  ? "bg-[var(--gold)] border-[var(--gold)] text-[var(--ink)] font-semibold"
                                  : "border-[var(--line)] hover:border-[var(--gold)] hover:bg-[var(--gold)]/10"
                              }`}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                        {errors.time && <p className="text-red-500 text-[11px] mt-1">{errors.time}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Contact details */}
                <div className="space-y-5">
                  {typeParam === "consultation" && (
                    <h3 className="font-display text-xl font-medium pt-2">2. Your Information</h3>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                    <div>
                      <input
                        required
                        placeholder="Full name *"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={`input-line ${errors.name ? "border-red-400" : ""}`}
                        data-testid="contact-name"
                      />
                      {errors.name && <p className="text-red-500 text-[11px] mt-1">{errors.name}</p>}
                    </div>

                    <div>
                      <input
                        required
                        type="email"
                        placeholder="Email *"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className={`input-line ${errors.email ? "border-red-400" : ""}`}
                        data-testid="contact-email"
                      />
                      {errors.email && <p className="text-red-500 text-[11px] mt-1">{errors.email}</p>}
                    </div>

                    {/* Phone with dial-code selector and validation */}
                    <div>
                      <div
                        className={`flex border-b ${
                          (phoneTouched && phoneError) || errors.phone ? "border-red-400" : "border-[var(--line)]"
                        } focus-within:border-[var(--ink)] transition-colors`}
                      >
                        <div className="flex items-center gap-1 pr-2 shrink-0">
                          <Phone size={14} className="text-[var(--muted)]" />
                          <select
                            value={selectedCountry.code}
                            onChange={handleCountryChange}
                            className="bg-transparent text-sm text-[var(--ink)] focus:outline-none cursor-pointer py-2 pr-1 max-w-[140px]"
                            aria-label="Country dial code"
                            data-testid="contact-dial-code"
                          >
                            {DIAL_CODES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.name} ({c.dial})
                              </option>
                            ))}
                          </select>
                        </div>

                        <input
                          type="tel"
                          placeholder="Phone"
                          value={form.phone}
                          inputMode="tel"
                          autoComplete="tel-national"
                          onChange={handlePhoneChange}
                          onBlur={handleBlur}
                          className="flex-1 bg-transparent text-sm py-2 focus:outline-none text-[var(--ink)] placeholder:text-[var(--muted)]"
                          data-testid="contact-phone"
                        />
                      </div>
                      {(phoneTouched && phoneError) || errors.phone ? (
                        <p className="text-red-500 text-[11px] mt-1">{phoneError || errors.phone}</p>
                      ) : (
                        <p className="text-[9px] text-[var(--muted)] mt-1">Format: auto-formats based on selected country.</p>
                      )}
                    </div>

                    {/* Subject field (only for general contact) */}
                    {!typeParam && !projectParam && (
                      <input
                        placeholder="Subject"
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        className="input-line"
                        data-testid="contact-subject"
                      />
                    )}
                  </div>

                  {/* Message/Notes textareas */}
                  {typeParam === "consultation" ? (
                    <textarea
                      rows={4}
                      placeholder="Any specific topics or questions? (optional)"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="input-line"
                      data-testid="contact-notes"
                    />
                  ) : (
                    <textarea
                      required
                      rows={5}
                      placeholder={
                        projectParam
                          ? `Please send me the brochure package for ${projectData?.name || projectParam} *`
                          : "Tell us a little about what you're looking for *"
                      }
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      className="input-line"
                      data-testid="contact-message"
                    />
                  )}
                </div>

                {status === "error" && (
                  <p className="text-red-600 text-sm">Something went wrong. Please try again.</p>
                )}

                <button
                  type="submit"
                  className="btn-gold"
                  disabled={status === "submitting"}
                  data-testid="contact-submit"
                >
                  {status === "submitting"
                    ? "Booking…"
                    : typeParam === "consultation"
                      ? "Book Now"
                      : projectParam
                        ? "Get the Brochure"
                        : "Send Message"}{" "}
                  <ArrowRight size={14} />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Detail({ icon, label, value, href, testId }) {
  const Inner = (
    <div className="flex items-start gap-4 border-b border-[var(--line)] pb-6">
      <div className="text-[var(--gold-deep)] mt-1">{icon}</div>
      <div>
        <div className="overline text-[var(--muted)]">{label}</div>
        <div className="font-display text-xl mt-1">{value}</div>
      </div>
    </div>
  );
  return href
    ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="block link-gold" data-testid={testId}>{Inner}</a>
    : <div data-testid={testId}>{Inner}</div>;
}
