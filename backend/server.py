"""Triad Realty API — entry point (uvicorn server:app)."""

import logging
import os
import re
import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Optional
import io

import hashlib
import httpx
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, status, UploadFile, File
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from db import (
    USE_MONGO,
    MONGO_URL,
    close_db,
    db_count,
    db_delete,
    db_delete_many,
    db_find,
    db_find_one,
    db_insert,
    db_update,
    db_update_one,
)
from deps import (
    get_current_user,
    require_developer,
    require_owner,
    require_owner_or_developer,
    require_staff_or_owner,
)
from middleware import AdminRouteGuardMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware
from rate_limit import check_account_lockout, client_ip, record_failed_login, clear_failed_logins
from seed_data import BLOGS, CAREERS, PROJECTS, GALLERY
from security import (
    ROLE_DEVELOPER,
    ROLE_OWNER,
    ROLE_STAFF,
    create_access_token,
    has_strong_jwt_secret,
    hash_password,
    verify_password,
    validate_password_strength,
    generate_reset_token,
    verify_reset_token,
    generate_verification_token,
    verify_verification_token,
    generate_refresh_token,
    hash_refresh_token,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR", str(ROOT_DIR / "uploads"))).resolve()
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# ── Cloudinary configuration (used for persistent image storage on Render) ──
_CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
_CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "")
_CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "")
_USE_CLOUDINARY = bool(_CLOUDINARY_CLOUD_NAME and _CLOUDINARY_API_KEY and _CLOUDINARY_API_SECRET)
if _USE_CLOUDINARY:
    cloudinary.config(
        cloud_name=_CLOUDINARY_CLOUD_NAME,
        api_key=_CLOUDINARY_API_KEY,
        api_secret=_CLOUDINARY_API_SECRET,
        secure=True,
    )

DEFAULT_ORG_ID = os.environ.get("DEFAULT_ORG_ID", "default-org")

# Credentials must be set in .env — missing values raise RuntimeError at startup.
DEVELOPER_EMAIL = os.environ.get("DEVELOPER_EMAIL", "developer@triad.ae")
DEVELOPER_PASSWORD = os.environ.get("DEVELOPER_PASSWORD", "")
OWNER_EMAIL = os.environ.get("OWNER_EMAIL", "owner@triad.ae")
OWNER_PASSWORD = os.environ.get("OWNER_PASSWORD", "")
STAFF_EMAIL = os.environ.get("STAFF_EMAIL", "normal@triad.ae")
STAFF_PASSWORD = os.environ.get("STAFF_PASSWORD", "")

# Email aliases: any key email will resolve to its value before lookup
EMAIL_ALIASES: dict[str, str] = {
    "onwer@triad.ae": OWNER_EMAIL,
}
REELLY_BASE = os.environ.get(
    "REELLY_API_BASE",
    "https://search-listings-production.up.railway.app/v1",
)
REELLY_API_KEY = os.environ.get("REELLY_API_KEY", "")
TARGET_PROJECT_COUNT = int(os.environ.get("TARGET_PROJECT_COUNT", "100"))
ENVIRONMENT = os.environ.get("ENVIRONMENT", os.environ.get("APP_ENV", "development")).lower()
IS_PROD = ENVIRONMENT in {"production", "prod"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in (
            "event",
            "request_id",
            "client_ip",
            "method",
            "path",
            "status_code",
            "user_id",
            "email",
            "role",
            "policy",
            "duration_ms",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, separators=(",", ":"))


def configure_logging() -> None:
    handler = logging.StreamHandler()
    if os.environ.get("LOG_FORMAT", "json" if IS_PROD else "text").lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())


configure_logging()

app = FastAPI(title="Triad Realty API")
api_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# CORS — must be registered before any route is included
# ---------------------------------------------------------------------------
_cors_origins_raw = os.environ.get(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
)
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
if "*" in _cors_origins:
    if IS_PROD:
        raise RuntimeError("CORS_ORIGINS cannot contain '*' in production")
    _cors_origins = [origin for origin in _cors_origins if origin != "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["Retry-After", "X-Request-ID"],
)

logger = logging.getLogger(__name__)
reelly_client: Optional[httpx.AsyncClient] = None
_server_start_time: datetime = datetime.now(timezone.utc)

_allowed_hosts_raw = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1,*.localhost")
_allowed_hosts = [h.strip() for h in _allowed_hosts_raw.split(",") if h.strip()]

# Always explicitly allow the Render production hostname
_RENDER_URL = "webtriad-9.onrender.com"
if _RENDER_URL not in _allowed_hosts:
    _allowed_hosts.append(_RENDER_URL)
if "*.onrender.com" not in _allowed_hosts:
    _allowed_hosts.append("*.onrender.com")

# Render also sets RENDER_EXTERNAL_HOSTNAME at runtime — add it too
_render_hostname = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if _render_hostname and _render_hostname not in _allowed_hosts:
    _allowed_hosts.append(_render_hostname)

# Internal health checks and reverse proxy may send requests with
# 'localhost' or IP addresses as the Host header. Always include them so the
# TrustedHostMiddleware doesn't reject those internal probes.
for _internal in ("localhost", "127.0.0.1", "0.0.0.0"):
    if _internal not in _allowed_hosts:
        _allowed_hosts.append(_internal)

# On Render, TLS is terminated at the load-balancer level — the app only sees
# plain HTTP with rewritten Host headers. Use '*' so TrustedHostMiddleware
# never blocks a legitimate Render-forwarded request.
if os.environ.get("RENDER") or os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    _allowed_hosts = ["*"]
elif IS_PROD and all(h in {"localhost", "127.0.0.1", "0.0.0.0", "*.localhost"} for h in _allowed_hosts):
    logger.warning("No explicit production hostnames configured in ALLOWED_HOSTS. Allowing all hosts as fallback.")
    _allowed_hosts = ["*"]

app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hosts)
# NOTE: Do NOT use HTTPSRedirectMiddleware on Render.  Render terminates TLS at
# its reverse proxy, so requests arrive at the app over plain HTTP.  The
# middleware would see HTTP and issue an infinite redirect loop.  Render itself
# enforces HTTPS at the infrastructure level.
# if IS_PROD and os.environ.get("FORCE_HTTPS", "true").lower() == "true":
#     app.add_middleware(HTTPSRedirectMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AdminRouteGuardMiddleware)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.exception(
            "api.unhandled_exception",
            extra={
                "event": "api.unhandled_exception",
                "request_id": request_id,
                "client_ip": client_ip(request),
                "method": request.method,
                "path": request.url.path,
                "duration_ms": duration_ms,
            },
        )
        raise

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    if response.status_code >= 400:
        level = logging.ERROR if response.status_code >= 500 else logging.WARNING
        logger.log(
            level,
            "api.request_error",
            extra={
                "event": "api.request_error",
                "request_id": request_id,
                "client_ip": client_ip(request),
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if IS_PROD and exc.status_code >= 500:
        detail = "An internal server error occurred."
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail},
        headers={**(exc.headers or {}), "X-Request-ID": getattr(request.state, "request_id", "")},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "api.validation_error",
        extra={
            "event": "api.validation_error",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_ip(request),
            "method": request.method,
            "path": request.url.path,
            "status_code": status.HTTP_422_UNPROCESSABLE_ENTITY,
        },
    )
    detail = "Invalid request." if IS_PROD else exc.errors()
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "api.internal_error",
        extra={
            "event": "api.internal_error",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_ip(request),
            "method": request.method,
            "path": request.url.path,
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
        },
    )
    detail = "An internal server error occurred." if IS_PROD else str(exc)
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": detail})


# ----------------------------- Models -----------------------------
class LeadIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(..., max_length=30)
    project_id: Optional[str] = Field(None, max_length=100)
    asset: Optional[str] = Field("brochure", max_length=50)
    source_page: Optional[str] = Field(None, max_length=200)

    @field_validator("name", "phone", mode="before")
    @classmethod
    def strip_str(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class Lead(LeadIn):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organization_id: str = DEFAULT_ORG_ID
    status: str = "new"
    assigned_to: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class LeadPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    status: Optional[str] = Field(None, max_length=50)
    assigned_to: Optional[str] = Field(None, max_length=100)


class ContactIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    subject: Optional[str] = Field(None, max_length=200)
    message: str = Field(..., min_length=1, max_length=5000)

    @field_validator("name", "phone", "subject", "message", mode="before")
    @classmethod
    def strip_str(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class Contact(ContactIn):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)


class ApplicationIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(..., max_length=30)
    position: str = Field(..., max_length=120)
    experience_years: Optional[int] = Field(None, ge=0, le=60)
    cover_letter: Optional[str] = Field(None, max_length=10000)
    portfolio_url: Optional[str] = Field(None, max_length=500)

    @field_validator("name", "phone", "position", "cover_letter", mode="before")
    @classmethod
    def strip_str(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class Application(ApplicationIn):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    organization_id: Optional[str] = None


class OwnerCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    organization_name: str


class OwnerPatch(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    organization_name: Optional[str] = None


class StaffPatch(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None


class OrgPatch(BaseModel):
    name: Optional[str] = None


class PopupSettingsIn(BaseModel):
    tag: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    btn1_label: Optional[str] = None
    btn1_link: Optional[str] = None
    btn2_label: Optional[str] = None
    btn2_link: Optional[str] = None
    active: bool
    poster_image_url: Optional[str] = None
    project_link: Optional[str] = None
    popup_type: Optional[str] = None


class ReviewsSettingsIn(BaseModel):
    hero_title: str
    hero_description: str
    testimonials_title: str
    average_rating: float



class ConsultationIn(BaseModel):
    """Booking payload submitted from the public consultation modal."""
    model_config = ConfigDict(extra="ignore")
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    date: str = Field(..., min_length=1, max_length=50)   # e.g. "2026-07-01"
    time_slot: str = Field(..., min_length=1, max_length=50)  # e.g. "10:00 AM"
    notes: Optional[str] = Field(None, max_length=500)


class HomepageSettingsIn(BaseModel):
    launch_title: str
    launch_description: str
    launch_video_url: Optional[str] = None
    stat1_value: str
    stat1_label: str
    stat2_value: str
    stat2_label: str
    stat3_value: str
    stat3_label: str
    stat4_value: str
    stat4_label: str
    founders_image_url: Optional[str] = None
    team_comes_first: Optional[bool] = False
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    company_whatsapp: Optional[str] = None
    company_instagram: Optional[str] = None
    company_linkedin: Optional[str] = None


# ─── Admin CMS typed input models ───────────────────────────────────────────
# These replace the raw `dict` payloads previously accepted by admin endpoints,
# preventing arbitrary field injection (NoSQL / object-pollution style attacks).

class ProjectIn(BaseModel):
    """Validated project payload for admin create/update."""
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = Field(None, max_length=150)
    name: str = Field(..., min_length=1, max_length=200)
    developer: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=200)
    emirate: Optional[str] = Field(None, max_length=100)
    type: Optional[str] = Field(None, max_length=100)
    configuration: Optional[list] = None
    price_from: Optional[int] = Field(None, ge=0)
    price_currency: Optional[str] = Field("AED", max_length=10)
    sqft_from: Optional[int] = Field(None, ge=0)
    handover: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = Field(None, max_length=100)
    hot: Optional[bool] = False
    tagline: Optional[str] = Field(None, max_length=300)
    hero: Optional[str] = Field(None, max_length=500)
    gallery: Optional[list] = None
    amenities: Optional[list] = None
    payment_plan: Optional[list] = None
    floor_plan: Optional[str] = Field(None, max_length=500)
    floor_plans: Optional[list] = None
    map_image: Optional[str] = Field(None, max_length=500)
    transactions: Optional[list] = None
    description: Optional[str] = Field(None, max_length=5000)
    source: Optional[str] = Field(None, max_length=50)
    brochure_url: Optional[str] = Field(None, max_length=500)

    @field_validator("name", "developer", "location", "emirate", "type", "tagline", "description", mode="before")
    @classmethod
    def strip_str(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class BlogIn(BaseModel):
    """Validated blog payload for admin create/update."""
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = Field(None, max_length=150)
    title: str = Field(..., min_length=1, max_length=300)
    slug: Optional[str] = Field(None, max_length=300)
    author: Optional[str] = Field(None, max_length=120)
    date: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=100)
    excerpt: Optional[str] = Field(None, max_length=1000)
    content: Optional[str] = Field(None, max_length=100000)
    hero: Optional[str] = Field(None, max_length=500)
    tags: Optional[list] = None

    @field_validator("title", "author", "category", "excerpt", mode="before")
    @classmethod
    def strip_str(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class ReviewIn(BaseModel):
    """Validated review payload for admin create."""
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = Field(None, max_length=150)
    author: Optional[str] = Field(None, max_length=120)
    name: Optional[str] = Field(None, max_length=120)
    rating: int = Field(5, ge=1, le=5)
    text: Optional[str] = Field(None, max_length=2000)
    description: Optional[str] = Field(None, max_length=2000)
    date: Optional[str] = Field(None, max_length=50)
    avatar: Optional[str] = Field(None, max_length=500)
    source: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = Field(None, max_length=120)
    country: Optional[str] = Field(None, max_length=120)
    youtubeCode: Optional[str] = Field(None, max_length=2000)

    @field_validator("author", "name", "text", "description", "role", "country", "youtubeCode", mode="before")
    @classmethod
    def strip_str(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


# Valid tier keys for team members
TEAM_TIERS = ["co-founder", "senior-portfolio-manager", "portfolio-manager", "property-investment-consultant", "none"]

DEFAULT_TEAM_SETTINGS = {
    "id": "team",
    "tier_order": ["co-founder", "senior-portfolio-manager", "portfolio-manager", "property-investment-consultant"],
}


class TeamMemberIn(BaseModel):
    name: str
    role: str
    tier: Optional[str] = "senior-portfolio-manager"
    experience: Optional[str] = None
    speaks: Optional[str] = None
    photo: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    linkedin: Optional[str] = None
    facebook: Optional[str] = None
    bio: Optional[str] = None
    videoUrl: Optional[str] = None
    videoUrl2: Optional[str] = None
    isFounder: Optional[bool] = False
    showOnHome: Optional[bool] = True
    showOnAbout: Optional[bool] = True
    sortOrder: Optional[int] = 0


class TeamSettingsIn(BaseModel):
    tier_order: list = ["senior-portfolio-manager", "portfolio-manager", "property-investment-consultant"]


class TeamMemberOut(TeamMemberIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))


DEFAULT_HOMEPAGE_SETTINGS = {
    "id": "homepage",
    "launch_title": "Why Triad Realty?",
    "launch_description": (
        "Renowned for curated UAE launches, sharp market intelligence, and client-first advisory, "
        "Triad Realty blends developer access with disciplined investment guidance."
    ),
    "launch_video_url": "",
    "stat1_value": "50,000+",
    "stat1_label": "Homes delivered*",
    "stat2_value": "54,000+",
    "stat2_label": "In planning and progress*",
    "stat3_value": "100+",
    "stat3_label": "Awards received",
    "stat4_value": "9",
    "stat4_label": "Countries",
    "founders_image_url": "https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg",
    "team_comes_first": False,
    "company_address": "Office 1204, Marina Plaza, Dubai Marina, Dubai, UAE",
    "company_phone": "+971 54 519 3393",
    "company_email": "info@triadrealityuae.com",
    "company_whatsapp": "https://wa.me/971545193393?text=Hello%2C%20I%27m%20interested%20in%20a%20property%20consultation.",
    "company_instagram": "https://www.instagram.com/triadrealty.ae?igsh=MWZpd2pmeTZwMGhzcA==",
    "company_linkedin": "https://www.linkedin.com/company/triadrealty-ae/",
}


DEFAULT_REVIEWS_SETTINGS = {
    "id": "reviews",
    "hero_title": "Real stories, real trust.",
    "hero_description": "Listen to video reviews and experiences shared by international and local buyers who acquired properties through Triad.",
    "testimonials_title": "Trusted advice, clear outcomes.",
    "average_rating": 4.9,
}


def user_public(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name"),
        "role": u["role"],
        "organization_id": u.get("organization_id"),
        "is_verified": u.get("is_verified", True),
    }


async def revoke_user_refresh_tokens(user_id: str) -> None:
    user_tokens = await db_find("refresh_tokens", {"user_id": user_id})
    for token in user_tokens:
        if not token.get("is_revoked", False):
            await db_update("refresh_tokens", token["id"], {"is_revoked": True})


async def set_user_password(user_id: str, password: str, extra_updates: Optional[dict] = None):
    changed_at = now_iso()
    updates = {
        "password_hash": hash_password(password),
        "password_changed_at": changed_at,
        "session_version": str(uuid.uuid4()),
    }
    if extra_updates:
        updates.update(extra_updates)
    updated = await db_update("users", user_id, updates)
    await revoke_user_refresh_tokens(user_id)
    return updated


# ----------------------------- Startup seed -----------------------------
async def seed_content():
    # When MongoDB is connected, the real data has already been migrated there.
    # Only seed sample data for development (in-memory store).
    if USE_MONGO:
        logger.info("MongoDB connected — skipping sample data seeding (real data already in Atlas)")
        return

    if await db_count("projects") == 0:
        for p in PROJECTS:
            await db_insert("projects", dict(p))
        logger.info("Seeded %d projects", len(PROJECTS))

    # Ensure we always have a full catalog for the Projects page.
    current_projects = await db_find("projects")
    if len(current_projects) < TARGET_PROJECT_COUNT:
        existing_ids = {p.get("id") for p in current_projects if p.get("id")}
        generated = []
        idx = 1
        while len(current_projects) + len(generated) < TARGET_PROJECT_COUNT:
            base = PROJECTS[(idx - 1) % len(PROJECTS)]
            gen_id = f"{base['id']}-auto-{idx}"
            idx += 1
            if gen_id in existing_ids:
                continue

            price_base = int(base.get("price_from", 1_000_000))
            sqft_base = int(base.get("sqft_from", 700))
            price_factor = 1 + (((idx % 9) - 4) * 0.035)
            sqft_factor = 1 + (((idx % 7) - 3) * 0.025)
            tx_price = int(max(300_000, price_base * (0.88 + (idx % 5) * 0.04)))

            generated_doc = {
                **base,
                "id": gen_id,
                "name": f"{base.get('name', 'Project')} {idx}",
                "price_from": int(max(300_000, price_base * price_factor)),
                "sqft_from": int(max(350, sqft_base * sqft_factor)),
                "transactions": [
                    {"date": "2026-01-14", "unit": "1BR - 720 sqft", "price": tx_price},
                    {"date": "2026-03-07", "unit": "2BR - 1,080 sqft", "price": int(tx_price * 1.15)},
                ],
            }
            generated.append(generated_doc)
            existing_ids.add(gen_id)

        for doc in generated:
            await db_insert("projects", doc)
        logger.info("Auto-generated %d additional projects (total=%d)", len(generated), len(current_projects) + len(generated))

    if await db_count("blogs") == 0:
        for b in BLOGS:
            await db_insert("blogs", dict(b))
        logger.info("Seeded %d blogs", len(BLOGS))
    # Default team seeding deleted per requirements
    pass
    if not await db_find_one("settings", {"id": "launch_popup"}):
        await db_insert("settings", {
            "id": "launch_popup",
            "tag": "New Launch",
            "title": "Marina Aurora — Pre-Launch",
            "description": "Exclusive access to Emaar's newest waterfront tower before the public release.",
            "btn1_label": "View Details",
            "btn1_link": "/projects/marina-aurora",
            "btn2_label": "Compare",
            "btn2_link": "/analysis",
            "active": True
        })
        logger.info("Seeded default launch popup settings")
    if not await db_find_one("settings", {"id": "homepage"}):
        await db_insert("settings", dict(DEFAULT_HOMEPAGE_SETTINGS))
        logger.info("Seeded default homepage settings")
    if not await db_find_one("settings", {"id": "reviews"}):
        await db_insert("settings", dict(DEFAULT_REVIEWS_SETTINGS))
        logger.info("Seeded default reviews settings")
    # Seed default text testimonials into the reviews collection so admin can edit them
    text_review_count = await db_count("reviews")
    if text_review_count == 0:
        default_testimonials = [
            {
                "id": f"seed-review-{i}",
                "name": item["name"],
                "role": item["role"],
                "country": item["country"],
                "rating": item["rating"],
                "description": item["quote"],
                "youtubeCode": "",
                "avatar": "",
                "createdAt": now_iso(),
            }
            for i, item in enumerate([
                {"name": "Client Review 01", "role": "Off-Plan Buyer", "country": "UAE", "rating": 5,
                 "quote": "Triad explained every launch, payment plan, and risk with complete clarity. I felt informed at each step and confident before booking my unit."},
                {"name": "Client Review 02", "role": "Business Owner", "country": "UAE", "rating": 5,
                 "quote": "The team understood my budget quickly, shortlisted serious options, and handled the negotiation professionally. Their follow-up after booking was excellent."},
                {"name": "Client Review 03", "role": "Portfolio Investor", "country": "India", "rating": 5,
                 "quote": "What stood out was the transparency. Triad compared communities, rental potential, and exit options in a way that made the decision process simple."},
                {"name": "Client Review 04", "role": "International Buyer", "country": "United Kingdom", "rating": 5,
                 "quote": "Buying from overseas felt much easier with Triad managing the details. They were responsive, honest, and careful with every document and deadline."},
                {"name": "Client Review 05", "role": "Family Buyer", "country": "UAE", "rating": 5,
                 "quote": "They listened to our family needs first, then suggested communities that matched our lifestyle, schools, and long-term plans. The guidance felt personal."},
            ])
        ]
        for t in default_testimonials:
            await db_insert("reviews", t)
        logger.info("Seeded %d default text testimonials into reviews", len(default_testimonials))
    if await db_count("experience") == 0:
        for i, url in enumerate(GALLERY):
            await db_insert("experience", {
                "id": f"seed-experience-{i}",
                "type": "photo",
                "url": url,
                "createdAt": now_iso()
            })
        logger.info("Seeded %d default experience gallery items", len(GALLERY))



async def _upsert_default_user(
    email: str,
    password: str,
    role: str,
    name: str,
    organization_id: Optional[str],
):
    existing = await db_find_one("users", {"email": email.strip().lower()})
    created_at = existing.get("created_at") if existing else now_iso()

    # Seed passwords are only used when the account is first created. Existing
    # accounts keep their current hash so a reset is not undone on restart.
    p_hash = existing["password_hash"] if existing else hash_password(password)
    password_changed_at = existing.get("password_changed_at") if existing else created_at
    session_version = existing.get("session_version") if existing else str(uuid.uuid4())

    doc = {
        "email": email.strip().lower(),
        "password_hash": p_hash,
        "password_changed_at": password_changed_at,
        "session_version": session_version,
        "name": name,
        "role": role,
        "organization_id": organization_id,
        "created_at": created_at,
    }

    if existing:
        return await db_update("users", existing["id"], doc)

    doc["id"] = str(uuid.uuid4())
    await db_insert("users", doc)
    return doc


async def seed_default_users():
    org = await db_find_one("organizations", {"id": DEFAULT_ORG_ID})
    if not org:
        await db_insert(
            "organizations",
            {"id": DEFAULT_ORG_ID, "name": "Triad Realty", "created_at": now_iso()},
        )

    # Clean up the legacy duplicate/typo user from the database if present
    # to avoid confusion in the admin panel and login issues.
    await db_delete_many("users", {"email": "onwer@triad.ae"})

    await _upsert_default_user(
        email=DEVELOPER_EMAIL,
        password=DEVELOPER_PASSWORD,
        role=ROLE_DEVELOPER,
        name="Platform Developer",
        organization_id=None,
    )
    await _upsert_default_user(
        email=OWNER_EMAIL,
        password=OWNER_PASSWORD,
        role=ROLE_OWNER,
        name="Organization Owner",
        organization_id=DEFAULT_ORG_ID,
    )
    await _upsert_default_user(
        email=STAFF_EMAIL,
        password=STAFF_PASSWORD,
        role=ROLE_STAFF,
        name="Staff User",
        organization_id=DEFAULT_ORG_ID,
    )

    logger.info("Seeded default admin users (developer/owner/staff)")


@app.on_event("startup")
async def on_startup():
    global reelly_client
    environment = os.environ.get("ENVIRONMENT", os.environ.get("APP_ENV", "development")).lower()
    is_prod = environment in {"production", "prod"}

    if is_prod and not has_strong_jwt_secret():
        raise RuntimeError("JWT_SECRET must be set to a strong value in production")

    # Require all three seeded account passwords to be explicitly configured.
    for var_name, value in [
        ("DEVELOPER_PASSWORD", DEVELOPER_PASSWORD),
        ("OWNER_PASSWORD",     OWNER_PASSWORD),
        ("STAFF_PASSWORD",     STAFF_PASSWORD),
    ]:
        if not value:
            raise RuntimeError(
                f"{var_name} must be set in .env. "
                "Refusing to start with an empty password."
            )

    reelly_client = httpx.AsyncClient(timeout=30.0)
    await seed_content()
    await seed_default_users()


@app.on_event("shutdown")
async def shutdown_db_client():
    global reelly_client
    if reelly_client:
        await reelly_client.aclose()
        reelly_client = None
    await close_db()


# ----------------------------- Auth -----------------------------
@api_router.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    raw_email = payload.email.strip().lower()

    # Per-account lockout check (5 failures in 15 min)
    check_account_lockout(raw_email)

    # Resolve any known email aliases (e.g. typo variants)
    lookup_email = EMAIL_ALIASES.get(raw_email, raw_email)
    user = await db_find_one("users", {"email": lookup_email})
    # Also try the raw email directly in case alias target doesn't exist
    if not user and lookup_email != raw_email:
        user = await db_find_one("users", {"email": raw_email})

    if not user or not verify_password(payload.password, user["password_hash"]):
        # Record failure and give a generic message (prevents user enumeration)
        record_failed_login(raw_email)
        logger.warning(
            "auth.login.failed",
            extra={
                "event": "auth.login.failed",
                "request_id": getattr(request.state, "request_id", None),
                "client_ip": client_ip(request),
                "email": raw_email[:3] + "***",
                "status_code": status.HTTP_401_UNAUTHORIZED,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Success: clear the lockout counter
    clear_failed_logins(raw_email)

    token = create_access_token(
        user["id"],
        user["role"],
        user.get("organization_id"),
        user.get("session_version"),
    )
    
    # Generate and store refresh token
    refresh_token = generate_refresh_token()
    rf_hash = hash_refresh_token(refresh_token)
    await db_insert(
        "refresh_tokens",
        {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "token_hash": rf_hash,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            "is_revoked": False,
            "replaced_by_hash": None,
            "created_at": now_iso(),
        },
    )

    ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True if ENVIRONMENT == "production" else False,
        samesite="lax",
        path="/api/auth",
        max_age=7 * 24 * 60 * 60,
    )

    att_id = str(uuid.uuid4())
    await db_insert(
        "attendance",
        {
            "id": att_id,
            "user_id": user["id"],
            "organization_id": user.get("organization_id"),
            "login_at": now_iso(),
            "logout_at": None,
        },
    )
    logger.info(
        "auth.login.success",
        extra={
            "event": "auth.login.success",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_ip(request),
            "user_id": user["id"],
            "role": user["role"],
        },
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_public(user),
        "attendance_id": att_id,
        "refresh_token": refresh_token,
    }


@api_router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    user=Depends(get_current_user),
):
    # Revoke current refresh token if present in cookies
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        rf_hash = hash_refresh_token(refresh_token)
        token_record = await db_find_one("refresh_tokens", {"token_hash": rf_hash})
        if token_record:
            await db_update("refresh_tokens", token_record["id"], {"is_revoked": True})
    
    response.delete_cookie(key="refresh_token", path="/api/auth")

    records = await db_find("attendance", {"user_id": user["id"], "logout_at": None})
    for rec in records:
        await db_update("attendance", rec["id"], {"logout_at": now_iso()})
    logger.info(
        "auth.logout",
        extra={
            "event": "auth.logout",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_ip(request),
            "user_id": user["id"],
            "role": user["role"],
        },
    )
    return {"detail": "Logged out"}


class RefreshIn(BaseModel):
    refresh_token: Optional[str] = None


@api_router.post("/auth/refresh")
async def refresh_token_endpoint(
    request: Request,
    response: Response,
    payload: Optional[RefreshIn] = None,
):
    # Prioritize payload/body first, then fall back to cookies, headers
    refresh_token = None
    if payload and payload.refresh_token:
        refresh_token = payload.refresh_token
    else:
        refresh_token = request.cookies.get("refresh_token")

    if not refresh_token:
        # Check custom X-Refresh-Token headers
        refresh_token = request.headers.get("x-refresh-token") or request.headers.get("X-Refresh-Token")

    if not refresh_token:
        # Check standard Authorization header as fallback (only if it matches refresh token shape)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            potential_token = auth_header.split(" ")[1]
            if len(potential_token) == 64 and "." not in potential_token:
                refresh_token = potential_token

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    rf_hash = hash_refresh_token(refresh_token)
    token_record = await db_find_one("refresh_tokens", {"token_hash": rf_hash})

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Check expiration (robust datetime validation)
    expires_val = token_record["expires_at"]
    if isinstance(expires_val, str):
        expires_at = datetime.fromisoformat(expires_val)
    else:
        expires_at = expires_val

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    else:
        expires_at = expires_at.astimezone(timezone.utc)

    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    user_id = token_record["user_id"]

    # Check revocation / token reuse detection
    if token_record.get("is_revoked", False):
        # Revoke all tokens for this user!
        user_tokens = await db_find("refresh_tokens", {"user_id": user_id})
        for t in user_tokens:
            await db_update("refresh_tokens", t["id"], {"is_revoked": True})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. All sessions revoked.",
        )

    # Revoke old token
    new_token = generate_refresh_token()
    new_hash = hash_refresh_token(new_token)
    await db_update(
        "refresh_tokens",
        token_record["id"],
        {"is_revoked": True, "replaced_by_hash": new_hash},
    )

    # Insert new refresh token record
    await db_insert(
        "refresh_tokens",
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "token_hash": new_hash,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            "is_revoked": False,
            "replaced_by_hash": None,
            "created_at": now_iso(),
        },
    )

    user = await db_find_one("users", {"id": user_id})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    access_token = create_access_token(
        user["id"],
        user["role"],
        user.get("organization_id"),
        user.get("session_version"),
    )

    ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
    response.set_cookie(
        key="refresh_token",
        value=new_token,
        httponly=True,
        secure=True if ENVIRONMENT == "production" else False,
        samesite="lax",
        path="/api/auth",
        max_age=7 * 24 * 60 * 60,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_public(user),
        "refresh_token": new_token,
    }


@api_router.get("/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return user_public(user)


@api_router.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user=Depends(get_current_user)):
    """Authenticated users can change their own password.
    Requires the current password to be supplied correctly.
    """
    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    try:
        validate_password_strength(payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    await set_user_password(user["id"], payload.new_password)
    logger.info(
        "auth.password_changed",
        extra={
            "event": "auth.password_changed",
            "user_id": user["id"],
            "role": user["role"],
        },
    )
    return {"detail": "Password updated successfully. Please log in again."}


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordIn, request: Request):
    """Generate a time-limited password-reset token for the given email.

    In production you would email the plain token to the user.  For now the
    token is returned in the response body so it can be used in development
    without an SMTP server.
    """
    email = payload.email.strip().lower()
    user = await db_find_one("users", {"email": email})
    # Always return 200 to prevent email enumeration
    if not user:
        return {"detail": "If that email exists, a reset link has been issued."}
    plain_token, hashed_token, expiry_iso = generate_reset_token()
    await db_update(
        "users",
        user["id"],
        {
            "reset_token_hash": hashed_token,
            "reset_token_expiry": expiry_iso,
        },
    )
    logger.info(
        "auth.password_reset.issued",
        extra={
            "event": "auth.password_reset.issued",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_ip(request),
            "user_id": user["id"],
        },
    )
    response = {"detail": "If that email exists, a reset link has been issued."}
    environment = os.environ.get("ENVIRONMENT", os.environ.get("APP_ENV", "development")).lower()
    if environment not in {"production", "prod"}:
        response.update({"reset_token": plain_token, "expires_at": expiry_iso})
    return response


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordIn, request: Request):
    """Exchange a valid reset token for a new password."""
    try:
        validate_password_strength(payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    candidate_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    target_user = await db_find_one("users", {"reset_token_hash": candidate_hash})
    if target_user and not verify_reset_token(
        payload.token,
        target_user["reset_token_hash"],
        target_user.get("reset_token_expiry", ""),
    ):
        target_user = None

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    changed_at = now_iso()
    updated = await db_update_one(
        "users",
        {"id": target_user["id"], "reset_token_hash": candidate_hash},
        {
            "password_hash": hash_password(payload.new_password),
            "password_changed_at": changed_at,
            "session_version": str(uuid.uuid4()),
            "reset_token_hash": None,
            "reset_token_expiry": None,
        },
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    await revoke_user_refresh_tokens(target_user["id"])
    logger.info(
        "auth.password_reset.completed",
        extra={
            "event": "auth.password_reset.completed",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_ip(request),
            "user_id": target_user["id"],
        },
    )

    return {"detail": "Password has been reset successfully"}


class VerifyEmailIn(BaseModel):
    token: str


class ResendVerificationIn(BaseModel):
    email: EmailStr


@api_router.post("/auth/verify-email")
async def verify_email(payload: VerifyEmailIn, request: Request):
    """Verify a user's email address using a time-limited verification token."""
    candidate_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    user = await db_find_one("users", {"verification_token_hash": candidate_hash})
    if user and not verify_verification_token(
        payload.token,
        user["verification_token_hash"],
        user.get("verification_token_expiry", ""),
    ):
        user = None

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    await db_update_one(
        "users",
        {"id": user["id"], "verification_token_hash": candidate_hash},
        {
            "is_verified": True,
            "verification_token_hash": None,
            "verification_token_expiry": None,
        },
    )
    logger.info(
        "auth.email_verified",
        extra={
            "event": "auth.email_verified",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_ip(request),
            "user_id": user["id"],
        },
    )
    return {"detail": "Email verified successfully"}


@api_router.post("/auth/resend-verification")
async def resend_verification(payload: ResendVerificationIn, request: Request):
    """Generate and issue a new email verification token for unverified accounts."""
    email = payload.email.strip().lower()
    user = await db_find_one("users", {"email": email})
    # Always return 200 to prevent email enumeration
    if not user or user.get("is_verified", False):
        return {"detail": "If that email exists and requires verification, a new link has been sent."}

    plain_token, hashed_token, expiry_iso = generate_verification_token()
    await db_update(
        "users",
        user["id"],
        {
            "verification_token_hash": hashed_token,
            "verification_token_expiry": expiry_iso,
        },
    )
    logger.info(
        "auth.verification_issued",
        extra={
            "event": "auth.verification_issued",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_ip(request),
            "user_id": user["id"],
        },
    )
    response = {"detail": "If that email exists and requires verification, a new link has been sent."}
    environment = os.environ.get("ENVIRONMENT", os.environ.get("APP_ENV", "development")).lower()
    if environment not in {"production", "prod"}:
        response.update({"verification_token": plain_token, "expires_at": expiry_iso})
    return response


# ----------------------------- Developer: owners & orgs -----------------------------
@api_router.post("/admin/owners")
async def create_owner(payload: OwnerCreate, _=Depends(require_developer)):
    try:
        validate_password_strength(payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    existing = await db_find_one("users", {"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    org_id = str(uuid.uuid4())
    await db_insert(
        "organizations",
        {"id": org_id, "name": payload.organization_name, "created_at": now_iso()},
    )
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "password_changed_at": now_iso(),
        "session_version": str(uuid.uuid4()),
        "name": payload.name,
        "role": ROLE_OWNER,
        "organization_id": org_id,
        "created_at": now_iso(),
    }
    await db_insert("users", doc)
    logger.info(
        "auth.account_created",
        extra={"event": "auth.account_created", "user_id": user_id, "role": ROLE_OWNER},
    )
    return {"user": user_public(doc), "organization": {"id": org_id, "name": payload.organization_name}}


@api_router.get("/admin/owners")
async def list_owners(_=Depends(require_developer)):
    owners = await db_find("users", {"role": ROLE_OWNER})
    orgs = {o["id"]: o for o in await db_find("organizations")}
    results = []
    for o in owners:
        org = orgs.get(o.get("organization_id"), {})
        results.append({**user_public(o), "organization_name": org.get("name")})
    return {"count": len(results), "results": results}


@api_router.patch("/admin/organizations/{org_id}")
async def patch_organization(org_id: str, payload: OrgPatch, _=Depends(require_developer)):
    org = await db_find_one("organizations", {"id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        await db_update("organizations", org_id, updates)
    return await db_find_one("organizations", {"id": org_id})


@api_router.get("/admin/organizations")
async def list_organizations(_=Depends(require_developer)):
    items = await db_find("organizations")
    return {"count": len(items), "results": items}


@api_router.patch("/admin/owners/{owner_id}")
async def patch_owner(owner_id: str, payload: OwnerPatch, _=Depends(require_developer)):
    owner = await db_find_one("users", {"id": owner_id, "role": ROLE_OWNER})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.email is not None:
        email_lower = payload.email.lower()
        existing = await db_find_one("users", {"email": email_lower})
        if existing and existing["id"] != owner_id:
            raise HTTPException(status_code=400, detail="Email already registered")
        updates["email"] = email_lower
    if payload.password is not None:
        try:
            validate_password_strength(payload.password)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
        updates["password_hash"] = hash_password(payload.password)
        updates["password_changed_at"] = now_iso()
        updates["session_version"] = str(uuid.uuid4())
        
    if updates:
        await db_update("users", owner_id, updates)
        if "password_hash" in updates:
            await revoke_user_refresh_tokens(owner_id)
        
    if payload.organization_name is not None and owner.get("organization_id"):
        await db_update("organizations", owner["organization_id"], {"name": payload.organization_name})
        
    updated_owner = await db_find_one("users", {"id": owner_id})
    org = await db_find_one("organizations", {"id": updated_owner.get("organization_id")})
    return {"user": user_public(updated_owner), "organization_name": org.get("name") if org else None}


@api_router.delete("/admin/owners/{owner_id}")
async def delete_owner(owner_id: str, _=Depends(require_developer)):
    owner = await db_find_one("users", {"id": owner_id, "role": ROLE_OWNER})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    if owner.get("organization_id"):
        await db_delete("organizations", owner["organization_id"])
        
    await db_delete("users", owner_id)
    return {"detail": "Owner and organization deleted"}


# ----------------------------- Owner: staff -----------------------------
@api_router.post("/admin/staff")
async def create_staff(payload: UserCreate, user=Depends(require_owner)):
    try:
        validate_password_strength(payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    existing = await db_find_one("users", {"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": str(uuid.uuid4()),
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "password_changed_at": now_iso(),
        "session_version": str(uuid.uuid4()),
        "name": payload.name,
        "role": ROLE_STAFF,
        "organization_id": user["organization_id"],
        "created_at": now_iso(),
    }
    await db_insert("users", doc)
    logger.info(
        "auth.account_created",
        extra={"event": "auth.account_created", "user_id": doc["id"], "role": ROLE_STAFF},
    )
    return user_public(doc)


@api_router.get("/admin/staff")
async def list_staff(user=Depends(require_owner)):
    items = await db_find("users", {"role": ROLE_STAFF, "organization_id": user["organization_id"]})
    return {"count": len(items), "results": [user_public(u) for u in items]}


@api_router.delete("/admin/staff/{staff_id}")
async def delete_staff(staff_id: str, user=Depends(require_owner)):
    staff = await db_find_one("users", {"id": staff_id, "role": ROLE_STAFF})
    if not staff or staff.get("organization_id") != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Staff not found")
    await db_delete("users", staff_id)
    return {"detail": "Deleted"}


@api_router.patch("/admin/staff/{staff_id}")
async def patch_staff(staff_id: str, payload: StaffPatch, user=Depends(require_owner)):
    staff = await db_find_one("users", {"id": staff_id, "role": ROLE_STAFF})
    if not staff or staff.get("organization_id") != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Staff not found")
        
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.email is not None:
        email_lower = payload.email.lower()
        existing = await db_find_one("users", {"email": email_lower})
        if existing and existing["id"] != staff_id:
            raise HTTPException(status_code=400, detail="Email already registered")
        updates["email"] = email_lower
    if payload.password is not None:
        try:
            validate_password_strength(payload.password)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
        updates["password_hash"] = hash_password(payload.password)
        updates["password_changed_at"] = now_iso()
        updates["session_version"] = str(uuid.uuid4())
        
    if updates:
        await db_update("users", staff_id, updates)
        if "password_hash" in updates:
            await revoke_user_refresh_tokens(staff_id)
        
    updated_staff = await db_find_one("users", {"id": staff_id})
    return user_public(updated_staff)


# ----------------------------- Attendance -----------------------------
@api_router.get("/admin/attendance")
async def attendance_dashboard(user=Depends(require_owner)):
    org_id = user["organization_id"]
    staff = await db_find("users", {"role": ROLE_STAFF, "organization_id": org_id})
    staff_ids = {s["id"] for s in staff}
    records = await db_find("attendance")
    org_records = [r for r in records if r.get("user_id") in staff_ids or r.get("organization_id") == org_id]
    return {"count": len(org_records), "results": org_records}


# ----------------------------- Leads (protected) -----------------------------
@api_router.get("/admin/leads")
async def admin_list_leads(user=Depends(require_staff_or_owner)):
    if user["role"] == ROLE_STAFF:
        items = await db_find("leads", {"assigned_to": user["id"]})
    else:
        items = await db_find("leads", {"organization_id": user["organization_id"]})
    return {"count": len(items), "results": items}


@api_router.patch("/admin/leads/{lead_id}")
async def admin_patch_lead(lead_id: str, payload: LeadPatch, user=Depends(require_staff_or_owner)):
    lead = await db_find_one("leads", {"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user["role"] == ROLE_STAFF:
        if lead.get("assigned_to") != user["id"]:
            raise HTTPException(status_code=403, detail="Not your lead")
    elif lead.get("organization_id") != user["organization_id"]:
        raise HTTPException(status_code=403, detail="Not in your organization")
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = now_iso()
    updated = await db_update("leads", lead_id, updates)
    return updated


@api_router.delete("/admin/leads")
async def admin_clear_leads(user=Depends(require_owner)):
    await db_delete_many("leads", {"organization_id": user["organization_id"]})
    return {"detail": "All leads cleared"}


@api_router.get("/leads")
async def list_leads(user=Depends(require_owner_or_developer)):
    # Developer has platform-wide visibility; owners only see their org's leads
    if user["role"] == ROLE_DEVELOPER:
        items = await db_find("leads")
    else:
        items = await db_find("leads", {"organization_id": user["organization_id"]})
    return {"count": len(items), "results": items}


@api_router.get("/contacts")
async def list_contacts(user=Depends(require_owner_or_developer)):
    # Developer has platform-wide visibility; owners only see their org's contacts
    if user["role"] == ROLE_DEVELOPER:
        items = await db_find("contacts")
    else:
        items = await db_find("contacts", {"organization_id": user["organization_id"]})
    return {"count": len(items), "results": items}


@api_router.get("/applications")
async def list_applications(user=Depends(require_owner_or_developer)):
    # Developer has platform-wide visibility; owners only see their org's applications
    if user["role"] == ROLE_DEVELOPER:
        items = await db_find("applications")
    else:
        items = await db_find("applications", {"organization_id": user["organization_id"]})
    return {"count": len(items), "results": items}


# ----------------------------- Public POST (rate limited) -----------------------------
@api_router.post("/leads", response_model=Lead)
async def create_lead(payload: LeadIn, request: Request):
    lead = Lead(**payload.model_dump(), organization_id=DEFAULT_ORG_ID)
    await db_insert("leads", lead.model_dump())
    return lead


@api_router.post("/contacts", response_model=Contact)
async def create_contact(payload: ContactIn, request: Request):
    c = Contact(**payload.model_dump())
    c_doc = c.model_dump()
    c_doc["organization_id"] = DEFAULT_ORG_ID
    await db_insert("contacts", c_doc)
    return c


@api_router.post("/applications", response_model=Application)
async def create_application(payload: ApplicationIn, request: Request):
    a = Application(**payload.model_dump())
    a_doc = a.model_dump()
    a_doc["organization_id"] = DEFAULT_ORG_ID
    await db_insert("applications", a_doc)
    return a


# ----------------------------- Projects / blogs (public read, DB) -----------------------------
def filter_projects(
    items: list,
    emirate: Optional[str] = None,
    location: Optional[str] = None,
    type: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    configuration: Optional[str] = None,
    hot: Optional[bool] = None,
    q: Optional[str] = None,
):
    results = items
    if emirate:
        results = [p for p in results if p["emirate"].lower() == emirate.lower()]
    if location:
        results = [p for p in results if location.lower() in p["location"].lower()]
    if type:
        results = [p for p in results if p["type"].lower() == type.lower()]
    if min_price is not None:
        results = [p for p in results if p["price_from"] >= min_price]
    if max_price is not None:
        results = [p for p in results if p["price_from"] <= max_price]
    if configuration:
        config_upper = configuration.upper()
        results = [
            p
            for p in results
            if config_upper in [c.upper() for c in p["configuration"]]
        ]
    if hot is not None:
        results = [p for p in results if p["hot"] == hot]
    if q:
        ql = q.lower()
        results = [
            p
            for p in results
            if ql in p["name"].lower()
            or ql in p["description"].lower()
            or ql in p["location"].lower()
        ]
    return results


@api_router.get("/")
async def root():
    return {"service": "Triad Realty API", "status": "ok"}


@api_router.get("/settings/popup")
async def get_popup_settings():
    s = await db_find_one("settings", {"id": "launch_popup"})
    if not s:
        return {
            "id": "launch_popup",
            "tag": "New Launch",
            "title": "Marina Aurora — Pre-Launch",
            "description": "Exclusive access to Emaar's newest waterfront tower before the public release.",
            "btn1_label": "View Details",
            "btn1_link": "/projects/marina-aurora",
            "btn2_label": "Compare",
            "btn2_link": "/analysis",
            "active": True,
            "poster_image_url": "",
            "project_link": "",
            "popup_type": "text",
        }
    if "popup_type" not in s:
        s["popup_type"] = "image" if s.get("poster_image_url") else "text"
    return s


# ── Consultation bookings ──────────────────────────────────────────────────────

@api_router.post("/consultations", status_code=201)
async def book_consultation(payload: ConsultationIn):
    """Public endpoint — record a consultation booking."""
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": DEFAULT_ORG_ID,
        "name": payload.name,
        "email": payload.email,
        "phone": payload.phone or "",
        "date": payload.date,
        "time_slot": payload.time_slot,
        "notes": payload.notes or "",
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
    }
    await db_insert("consultations", doc)
    return {"ok": True, "id": doc["id"]}


@api_router.get("/admin/consultations")
async def list_consultations(user=Depends(require_owner_or_developer)):
    """List consultation bookings. Developers see all; owners see only their org."""
    items = await db_find("consultations", {})
    if user["role"] != ROLE_DEVELOPER:
        org_id = user["organization_id"]
        items = [i for i in items if i.get("organization_id") == org_id or i.get("organization_id") is None]
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"count": len(items), "results": items}


class ConsultationStatusIn(BaseModel):
    """Typed payload for consultation status updates."""
    status: str = Field(..., pattern="^(pending|confirmed|cancelled)$")


@api_router.patch("/admin/consultations/{cid}")
async def update_consultation_status(cid: str, payload: ConsultationStatusIn, user=Depends(require_owner_or_developer)):
    """Update consultation status (pending / confirmed / cancelled)."""
    consultation = await db_find_one("consultations", {"id": cid})
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    # Ownership check: owners can only update their own org's consultations
    if user["role"] != ROLE_DEVELOPER:
        if consultation.get("organization_id") != user["organization_id"] and consultation.get("organization_id") is not None:
            raise HTTPException(status_code=403, detail="Not authorised to modify this consultation")
    updated = await db_update("consultations", cid, {"status": payload.status})
    return updated


@api_router.delete("/admin/consultations/{cid}")
async def delete_consultation(cid: str, user=Depends(require_owner_or_developer)):
    """Delete a consultation. Ownership enforced for non-developer roles."""
    consultation = await db_find_one("consultations", {"id": cid})
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    # Ownership check
    if user["role"] != ROLE_DEVELOPER:
        if consultation.get("organization_id") != user["organization_id"] and consultation.get("organization_id") is not None:
            raise HTTPException(status_code=403, detail="Not authorised to delete this consultation")
    await db_delete("consultations", cid)
    return {"ok": True}



@api_router.get("/settings/homepage")
async def get_homepage_settings():
    s = await db_find_one("settings", {"id": "homepage"})
    if not s:
        return DEFAULT_HOMEPAGE_SETTINGS
    return {**DEFAULT_HOMEPAGE_SETTINGS, **s}


@api_router.get("/settings/team")
async def get_team_settings():
    s = await db_find_one("settings", {"id": "team"})
    if not s:
        return DEFAULT_TEAM_SETTINGS
    return {**DEFAULT_TEAM_SETTINGS, **s}


@api_router.get("/settings/reviews")
async def get_reviews_settings():
    s = await db_find_one("settings", {"id": "reviews"})
    if not s:
        return DEFAULT_REVIEWS_SETTINGS
    return {**DEFAULT_REVIEWS_SETTINGS, **s}


@api_router.get("/projects")
async def list_projects(
    emirate: Optional[str] = None,
    location: Optional[str] = None,
    type: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    configuration: Optional[str] = None,
    hot: Optional[bool] = None,
    q: Optional[str] = None,
    page: int = 1,
    per_page: int = 0,
):
    items = await db_find("projects")
    results = filter_projects(items, emirate, location, type, min_price, max_price, configuration, hot, q)
    total = len(results)
    if per_page > 0:
        start = max(0, (page - 1) * per_page)
        end = start + per_page
        results = results[start:end]
    return {"count": total, "results": results}


@api_router.get("/projects/{project_id}")
async def get_project(project_id: str):
    p = await db_find_one("projects", {"id": project_id})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@api_router.get("/blogs")
async def list_blogs():
    items = await db_find("blogs")
    return {"count": len(items), "results": items}


@api_router.get("/blogs/{blog_id}")
async def get_blog(blog_id: str):
    b = await db_find_one("blogs", {"id": blog_id})
    if not b:
        raise HTTPException(status_code=404, detail="Blog not found")
    return b


@api_router.get("/careers")
async def list_careers():
    return {"count": len(CAREERS), "results": CAREERS}


@api_router.get("/reviews")
async def list_reviews():
    items = await db_find("reviews")
    return {"count": len(items), "results": items}


@api_router.post("/reviews")
async def public_create_review(payload: ReviewIn):
    doc = payload.model_dump(exclude_none=True)
    if not doc.get("id"):
        doc["id"] = str(uuid.uuid4())
    doc["createdAt"] = now_iso()
    
    # Unify name/author and description/text
    if doc.get("name"):
        doc["author"] = doc["name"]
    elif doc.get("author"):
        doc["name"] = doc["author"]
        
    if doc.get("description"):
        doc["text"] = doc["description"]
    elif doc.get("text"):
        doc["description"] = doc["text"]
        
    await db_insert("reviews", doc)
    return doc


@api_router.get("/experience")
async def list_experience():
    items = await db_find("experience")
    return {"count": len(items), "results": items}


# ----------------------------- Admin CMS: projects & blogs (developer) -----------------------------
@api_router.get("/admin/projects")
async def admin_list_projects(_=Depends(require_owner_or_developer)):
    items = await db_find("projects")
    return {"count": len(items), "results": items}


@api_router.post("/admin/projects")
async def admin_create_project(payload: ProjectIn, _=Depends(require_owner_or_developer)):
    doc = payload.model_dump(exclude_none=True)
    if not doc.get("id"):
        doc["id"] = str(uuid.uuid4())
    await db_insert("projects", doc)
    return doc


@api_router.patch("/admin/projects/{project_id}")
async def admin_update_project(project_id: str, payload: ProjectIn, _=Depends(require_owner_or_developer)):
    p = await db_find_one("projects", {"id": project_id})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    updates = payload.model_dump(exclude_none=True)
    updates.pop("id", None)
    return await db_update("projects", project_id, updates)


@api_router.delete("/admin/projects/{project_id}")
async def admin_delete_project(project_id: str, _=Depends(require_owner_or_developer)):
    await db_delete("projects", project_id)
    return {"detail": "Deleted"}


@api_router.get("/admin/blogs")
async def admin_list_blogs(_=Depends(require_owner_or_developer)):
    items = await db_find("blogs")
    return {"count": len(items), "results": items}


@api_router.post("/admin/blogs")
async def admin_create_blog(payload: BlogIn, _=Depends(require_owner_or_developer)):
    doc = payload.model_dump(exclude_none=True)
    if not doc.get("id"):
        doc["id"] = str(uuid.uuid4())
    await db_insert("blogs", doc)
    return doc


@api_router.patch("/admin/blogs/{blog_id}")
async def admin_update_blog(blog_id: str, payload: BlogIn, _=Depends(require_owner_or_developer)):
    b = await db_find_one("blogs", {"id": blog_id})
    if not b:
        raise HTTPException(status_code=404, detail="Blog not found")
    updates = payload.model_dump(exclude_none=True)
    updates.pop("id", None)
    return await db_update("blogs", blog_id, updates)


@api_router.delete("/admin/blogs/{blog_id}")
async def admin_delete_blog(blog_id: str, _=Depends(require_owner_or_developer)):
    await db_delete("blogs", blog_id)
    return {"detail": "Deleted"}


# ----------------------------- Admin CMS: Reviews (developer) -----------------------------
@api_router.post("/admin/reviews")
async def admin_create_review(payload: ReviewIn, _=Depends(require_owner_or_developer)):
    doc = payload.model_dump(exclude_none=True)
    if not doc.get("id"):
        doc["id"] = str(uuid.uuid4())
    doc["createdAt"] = now_iso()
    
    # Unify name/author and description/text
    if doc.get("name"):
        doc["author"] = doc["name"]
    elif doc.get("author"):
        doc["name"] = doc["author"]
        
    if doc.get("description"):
        doc["text"] = doc["description"]
    elif doc.get("text"):
        doc["description"] = doc["text"]
        
    await db_insert("reviews", doc)
    return doc


@api_router.patch("/admin/reviews/{review_id}")
async def admin_update_review(review_id: str, payload: ReviewIn, _=Depends(require_owner_or_developer)):
    r = await db_find_one("reviews", {"id": review_id})
    if not r:
        raise HTTPException(status_code=404, detail="Review not found")
    updates = payload.model_dump(exclude_none=True)
    updates.pop("id", None)
    
    # Unify name/author and description/text
    if "name" in updates:
        updates["author"] = updates["name"]
    elif "author" in updates:
        updates["name"] = updates["author"]
        
    if "description" in updates:
        updates["text"] = updates["description"]
    elif "text" in updates:
        updates["description"] = updates["text"]
        
    return await db_update("reviews", review_id, updates)


@api_router.delete("/admin/reviews/{review_id}")
async def admin_delete_review(review_id: str, _=Depends(require_owner_or_developer)):
    await db_delete("reviews", review_id)
    return {"detail": "Deleted"}


# ─── Allowed upload MIME types and extensions ────────────────────────────────
_ALLOWED_UPLOADS = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".gif": {"image/gif"},
    ".webp": {"image/webp"},
    ".pdf": {"application/pdf"},
    ".mp4": {"video/mp4", "video/quicktime"},
    ".mov": {"video/quicktime", "video/mp4"},
    ".webm": {"video/webm"},
}
_ALLOWED_UPLOAD_EXTS = set(_ALLOWED_UPLOADS)
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
_UPLOAD_FILENAME_RE = re.compile(r"^[a-f0-9-]{36}[a-zA-Z0-9_\-\s().]*\.(jpg|jpeg|png|gif|webp|pdf|mp4|mov|webm)$")


def _detect_upload_mime(data: bytes) -> Optional[str]:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        brands = data[8:32]
        return "video/quicktime" if b"qt  " in brands else "video/mp4"
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm"
    return None


def _scan_upload_bytes(data: bytes, mime_type: str) -> None:
    lower_head = data[:8192].lower()
    if b"eicar-standard-antivirus-test-file" in data.lower():
        raise HTTPException(status_code=400, detail="Upload failed security scan.")
    if any(marker in lower_head for marker in (b"<script", b"<html", b"javascript:", b"<?php")):
        raise HTTPException(status_code=400, detail="Upload contains active content.")
    if mime_type == "application/pdf":
        lower_pdf = data[:2_000_000].lower()
        if any(marker in lower_pdf for marker in (b"/javascript", b"/js", b"/openaction", b"/aa")):
            raise HTTPException(status_code=400, detail="PDF contains active content.")


# ----------------------------- Admin CMS: Experience (owner or developer) -----------------------------
class ExperienceIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = Field(None, max_length=150)
    type: Optional[str] = Field("photo", max_length=20)
    url: str = Field(..., max_length=500)


@api_router.post("/admin/experience")
async def admin_create_experience(payload: ExperienceIn, user=Depends(require_owner_or_developer)):
    doc = payload.model_dump(exclude_none=True)
    if not doc.get("id"):
        doc["id"] = str(uuid.uuid4())
    doc["createdAt"] = now_iso()
    # Stamp the creating user's org so we can enforce ownership on delete
    doc["organization_id"] = user.get("organization_id") or DEFAULT_ORG_ID
    await db_insert("experience", doc)
    return doc


@api_router.delete("/admin/experience/{experience_id}")
async def admin_delete_experience(experience_id: str, user=Depends(require_owner_or_developer)):
    item = await db_find_one("experience", {"id": experience_id})
    if not item:
        raise HTTPException(status_code=404, detail="Experience item not found")
    # Developers may delete any item; owners may only delete items from their org
    if user["role"] != ROLE_DEVELOPER:
        item_org = item.get("organization_id")
        if item_org and item_org != user["organization_id"]:
            raise HTTPException(status_code=403, detail="Not authorised to delete this item")
    await db_delete("experience", experience_id)
    return {"detail": "Deleted"}


@api_router.get("/admin/system/health")
async def system_health(_=Depends(require_owner_or_developer)):
    now = datetime.now(timezone.utc)
    uptime_seconds = int((now - _server_start_time).total_seconds())
    uptime_hours   = uptime_seconds // 3600
    uptime_minutes = (uptime_seconds % 3600) // 60
    uptime_str = f"{uptime_hours}h {uptime_minutes}m" if uptime_hours else f"{uptime_minutes}m"

    # Fetch recent leads (last 10)
    all_leads = await db_find("leads")
    all_leads_sorted = sorted(all_leads, key=lambda l: l.get("created_at", ""), reverse=True)
    recent_leads = [
        {
            "name":    l.get("name", ""),
            "email":   l.get("email", ""),
            "phone":   l.get("phone", ""),
            "asset":   l.get("asset", ""),
            "source":  l.get("source_page", ""),
            "created_at": l.get("created_at", ""),
        }
        for l in all_leads_sorted[:10]
    ]

    # Environment / config checks
    checks = {
        "jwt_secret_strong":  has_strong_jwt_secret(),
        "reelly_api_key_set": bool(REELLY_API_KEY),
        "database":           "mongodb" if USE_MONGO else "in-memory",
        "mongo_uri_set":      bool(MONGO_URL),
        "cloudinary_configured": _USE_CLOUDINARY,
        "sendgrid_key_set":   bool(os.environ.get("SENDGRID_API_KEY")),
    }

    return {
        "status":      "ok",
        "uptime":      uptime_str,
        "uptime_seconds": uptime_seconds,
        "server_started": _server_start_time.isoformat(),
        "timestamp":   now.isoformat(),
        "database":    "mongodb" if USE_MONGO else "in-memory",
        "counts": {
            "projects": await db_count("projects"),
            "blogs":    await db_count("blogs"),
            "users":    await db_count("users"),
            "leads":    await db_count("leads"),
            "reviews":  await db_count("reviews"),
            "team":     await db_count("team"),
        },
        # legacy keys kept for existing sidebar usage
        "projects":    await db_count("projects"),
        "users":       await db_count("users"),
        "leads":       await db_count("leads"),
        "checks":      checks,
        "recent_leads": recent_leads,
    }


# ----------------------------- Team (public read, developer CRUD) -----------------------------
@api_router.get("/team")
async def list_team():
    items = await db_find("team")
    for item in items:
        if "showOnHome" not in item:
            item["showOnHome"] = True
        if "showOnAbout" not in item:
            item["showOnAbout"] = True
        if "sortOrder" not in item:
            item["sortOrder"] = 0
    return {"count": len(items), "results": items}


@api_router.get("/team/{member_id}")
async def get_team_member(member_id: str):
    item = await db_find_one("team", {"id": member_id})
    if not item:
        raise HTTPException(status_code=404, detail="Team member not found")
    if "showOnHome" not in item:
        item["showOnHome"] = True
    if "showOnAbout" not in item:
        item["showOnAbout"] = True
    if "sortOrder" not in item:
        item["sortOrder"] = 0
    return item


@api_router.post("/team")
async def create_team_member(payload: TeamMemberIn, _=Depends(require_owner_or_developer)):
    member = TeamMemberOut(**payload.model_dump())
    await db_insert("team", member.model_dump())
    return member


@api_router.put("/team/{member_id}")
async def update_team_member(member_id: str, payload: TeamMemberIn, _=Depends(require_owner_or_developer)):
    updated = await db_update("team", member_id, payload.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Team member not found")
    return updated


@api_router.delete("/team/{member_id}")
async def delete_team_member(member_id: str, _=Depends(require_owner_or_developer)):
    await db_delete("team", member_id)
    return {"detail": "Deleted"}


# ----------------------------- Reelly proxy -----------------------------
async def _reelly_request(path: str, params: Optional[dict] = None):
    global reelly_client
    if not REELLY_API_KEY:
        raise HTTPException(status_code=503, detail="External listings API not configured")
    url = f"{REELLY_BASE.rstrip('/')}/{path.lstrip('/')}"
    if reelly_client is None:
        reelly_client = httpx.AsyncClient(timeout=30.0)

    try:
        r = await reelly_client.get(
            url,
            params=params,
            headers={"X-API-Key": REELLY_API_KEY, "accept": "application/json"},
        )
    except httpx.HTTPError as exc:
        logger.warning("External API request failed: %s", exc)
        raise HTTPException(status_code=502, detail="External API unavailable") from exc

    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail="External API error")
    return r.json()


@api_router.get("/external/properties")
async def proxy_properties(
    page: int = 1,
    per_page: int = 50,
    has_escrow: bool = True,
    price_type: str = "area",
):
    return await _reelly_request(
        "properties",
        {"page": page, "per_page": per_page, "has_escrow": has_escrow, "price_type": price_type},
    )


@api_router.get("/external/properties/{property_id}")
async def proxy_property_detail(property_id: str):
    return await _reelly_request(f"properties/{property_id}")


@api_router.get("/external/property-markers")
async def proxy_property_markers():
    return await _reelly_request("property-markers")


@api_router.get("/external/areas")
async def proxy_areas():
    return await _reelly_request("areas")


@api_router.get("/external/unit-bedrooms")
async def proxy_unit_bedrooms():
    return await _reelly_request("unit-bedrooms")


@api_router.get("/external/sale-statuses")
async def proxy_sale_statuses():
    return await _reelly_request("sale-statuses")


# ----------------------------- External → DB sync -----------------------------
def _normalize_reelly_project(item: dict) -> dict:
    """Map a Reelly API property object to the internal project schema."""
    import re

    def fmt_price(val):
        try:
            return f"AED {int(float(val)):,}"
        except Exception:
            return "Contact for price"

    price_from = int(float(item.get("min_price_aed") or item.get("price_from") or 0))
    sqft_from = int(float(item.get("min_area_sqft") or item.get("sqft_from") or 0))
    name = item.get("name") or item.get("title") or "Unnamed"
    developer = item.get("developer") or item.get("developer_name") or ""
    location = item.get("area") or item.get("location") or ""
    city = item.get("city") or "Dubai"

    # Derive a stable slug id from the Reelly id or name
    raw_id = str(item.get("id") or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"))
    project_id = f"ext-{raw_id}"

    completion = item.get("completion_datetime") or item.get("handover") or ""
    if completion and "T" in completion:
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(completion.replace("Z", "+00:00"))
            completion = dt.strftime("Q%-m %Y")
        except Exception:
            pass

    beds_raw = item.get("unit_bedrooms") or item.get("bedrooms") or ""
    configs = [b.strip() for b in str(beds_raw).split(",") if b.strip()] if beds_raw else []

    cover = item.get("cover_image_url") or item.get("hero") or ""
    
    # Collect from structured lobby, interior, and architecture fields
    gallery_images = []
    for section in ["lobby", "interior", "architecture"]:
        sec_imgs = item.get(section) or []
        if isinstance(sec_imgs, list):
            for img in sec_imgs:
                if isinstance(img, dict) and img.get("url"):
                    gallery_images.append(img["url"])
                elif isinstance(img, str):
                    gallery_images.append(img)
                    
    # Fallback to general gallery field
    if not gallery_images:
        gallery = item.get("gallery") or []
        if isinstance(gallery, str):
            gallery_images = [gallery]
        elif isinstance(gallery, list):
            for img in gallery:
                if isinstance(img, dict) and img.get("url"):
                    gallery_images.append(img["url"])
                elif isinstance(img, str):
                    gallery_images.append(img)

    # Reelly API brochure field
    brochure_url = item.get("marketing_brochure") or ""

    # Reelly API floor plans array
    floor_plans_raw = item.get("floor_plans") or []
    floor_plans = []
    if isinstance(floor_plans_raw, list):
        for fp in floor_plans_raw:
            if isinstance(fp, dict) and fp.get("file"):
                floor_plans.append({
                    "id": str(fp.get("id") or fp.get("name") or uuid.uuid4()),
                    "name": fp.get("name") or "Floor Plan",
                    "file": fp.get("file"),
                    "description": fp.get("description") or ""
                })
            elif isinstance(fp, str):
                floor_plans.append({
                    "id": fp,
                    "name": "Floor Plan",
                    "file": fp,
                    "description": ""
                })

    # Try to find a typical unit layout image to display in the main floor_plan img view
    layout_img = ""
    typical_units = item.get("typical_units") or []
    if isinstance(typical_units, list):
        for tu in typical_units:
            layouts = tu.get("layout") or []
            if isinstance(layouts, list):
                for lay in layouts:
                    if isinstance(lay, dict):
                        img_obj = lay.get("image")
                        if isinstance(img_obj, dict) and img_obj.get("url"):
                            layout_img = img_obj["url"]
                            break
                        elif isinstance(lay.get("url"), str):
                            layout_img = lay["url"]
                            break
            if layout_img:
                break
    
    if not layout_img and floor_plans:
        layout_img = floor_plans[0]["file"]

    return {
        "id": project_id,
        "name": name,
        "developer": developer,
        "location": location,
        "emirate": city,
        "type": item.get("property_type") or "Apartment",
        "configuration": configs,
        "price_from": price_from,
        "price_currency": "AED",
        "sqft_from": sqft_from,
        "handover": completion,
        "status": item.get("sale_status") or "Off-Plan",
        "hot": bool(item.get("is_partner_project") or item.get("hot")),
        "tagline": f"Premium {(item.get('property_type') or 'property').lower()} in {location}.",
        "hero": cover,
        "gallery": gallery_images[:10],
        "amenities": ["Swimming Pool", "Gymnasium", "Concierge", "Covered Parking"],
        "payment_plan": [
            {"milestone": "Booking", "percent": 10},
            {"milestone": "Construction", "percent": 50},
            {"milestone": "Handover", "percent": 40},
        ],
        "floor_plan": layout_img,
        "floor_plans": floor_plans,
        "map_image": "",
        "transactions": [],
        "description": f"{name} by {developer} in {location}, {city}. {item.get('has_escrow') and 'Escrow protected.' or ''} Handover {completion}.",
        "source": "reelly",
        "brochure_url": brochure_url,
    }


@api_router.post("/admin/sync-external-projects")
async def sync_external_projects(_=Depends(require_developer)):
    """Fetch all pages from the Reelly API and upsert them into the projects collection."""
    if not REELLY_API_KEY:
        raise HTTPException(status_code=503, detail="REELLY_API_KEY not set")

    page = 1
    per_page = 50
    total_synced = 0
    total_updated = 0

    while True:
        data = await _reelly_request(
            "properties",
            {"page": page, "per_page": per_page, "has_escrow": True, "price_type": "area"},
        )
        items = data.get("items") or []
        if not items:
            break

        for item in items:
            doc = _normalize_reelly_project(item)
            existing = await db_find_one("projects", {"id": doc["id"]})
            if existing:
                await db_update("projects", doc["id"], doc)
                total_updated += 1
            else:
                await db_insert("projects", doc)
                total_synced += 1

        pagination = data.get("pagination") or {}
        if not pagination.get("has_next"):
            break
        page += 1

    return {
        "detail": "Sync complete",
        "inserted": total_synced,
        "updated": total_updated,
        "total": total_synced + total_updated,
    }


@api_router.get("/admin/preview-external-projects")
async def preview_external_projects(page: int = 1, per_page: int = 10, _=Depends(require_developer)):
    """Preview external Reelly listings without saving to DB."""
    if not REELLY_API_KEY:
        raise HTTPException(status_code=503, detail="REELLY_API_KEY not set")
    data = await _reelly_request(
        "properties",
        {"page": page, "per_page": per_page, "has_escrow": True, "price_type": "area"},
    )
    items = [_normalize_reelly_project(i) for i in (data.get("items") or [])]
    return {"count": len(items), "pagination": data.get("pagination"), "results": items}



@api_router.put("/admin/settings/popup")
async def update_popup_settings(payload: PopupSettingsIn, _=Depends(require_owner_or_developer)):
    s = await db_find_one("settings", {"id": "launch_popup"})
    if not s:
        doc = {"id": "launch_popup", **payload.model_dump()}
        await db_insert("settings", doc)
        return doc
    updates = payload.model_dump()
    return await db_update("settings", "launch_popup", updates)


@api_router.put("/admin/settings/homepage")
async def update_homepage_settings(payload: HomepageSettingsIn, _=Depends(require_owner_or_developer)):
    s = await db_find_one("settings", {"id": "homepage"})
    if not s:
        doc = {"id": "homepage", **payload.model_dump()}
        await db_insert("settings", doc)
        return doc
    updates = payload.model_dump()
    return await db_update("settings", "homepage", updates)


@api_router.put("/admin/settings/team")
async def update_team_settings(payload: TeamSettingsIn, _=Depends(require_owner_or_developer)):
    # Validate tier order contains only known tiers
    for t in payload.tier_order:
        if t not in TEAM_TIERS:
            raise HTTPException(status_code=400, detail=f"Unknown tier: {t}")
    s = await db_find_one("settings", {"id": "team"})
    if not s:
        doc = {"id": "team", **payload.model_dump()}
        await db_insert("settings", doc)
        return doc
    return await db_update("settings", "team", payload.model_dump())


@api_router.put("/admin/settings/reviews")
async def update_reviews_settings(payload: ReviewsSettingsIn, _=Depends(require_owner_or_developer)):
    s = await db_find_one("settings", {"id": "reviews"})
    if not s:
        doc = {"id": "reviews", **payload.model_dump()}
        await db_insert("settings", doc)
        return doc
    updates = payload.model_dump()
    return await db_update("settings", "reviews", updates)


@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), _=Depends(require_owner_or_developer)):
    # ── Validate declared content type ─────────────────────────────────────
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    declared_type = content_type or "application/octet-stream"

    # ── Validate file extension ────────────────────────────────────────────
    original_name = Path(file.filename or "upload").name
    ext = Path(original_name).suffix.lower()
    if ext not in _ALLOWED_UPLOAD_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '{ext}' is not allowed.",
        )

    if declared_type != "application/octet-stream" and declared_type not in _ALLOWED_UPLOADS[ext]:
        raise HTTPException(
            status_code=400,
            detail="Declared file type does not match the file extension.",
        )

    # ── Read & size-check ──────────────────────────────────────────────────
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the maximum allowed size of {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    detected_type = _detect_upload_mime(data)
    if not detected_type or detected_type not in _ALLOWED_UPLOADS[ext]:
        raise HTTPException(status_code=400, detail="File contents do not match an allowed file type.")

    _scan_upload_bytes(data, detected_type)

    # ── Upload to Cloudinary (persistent) or local disk (dev fallback) ────────
    safe_name = f"{uuid.uuid4()}{ext}"

    if _USE_CLOUDINARY:
        # Upload to Cloudinary — survives container restarts/redeploys
        try:
            result = cloudinary.uploader.upload(
                io.BytesIO(data),
                public_id=safe_name.rsplit(".", 1)[0],  # filename without ext
                resource_type="auto",
                folder="triad-realty",
            )
            url = result.get("secure_url", "")
        except Exception as exc:
            logger.exception("cloudinary.upload_failed", extra={"error": str(exc)})
            raise HTTPException(status_code=500, detail="Image upload failed. Please try again.")
    else:
        # Fallback: local disk (development only — not persistent on Render)
        file_path = (UPLOADS_DIR / safe_name).resolve()
        if file_path.parent != UPLOADS_DIR:
            raise HTTPException(status_code=400, detail="Invalid upload path.")
        with file_path.open("wb") as buffer:
            buffer.write(data)
        url = f"/uploads/{safe_name}"

    return {"url": url, "content_type": detected_type, "size": len(data)}


# ── Dubai Report ──────────────────────────────────────────────────────────────

_DEFAULT_DUBAI_REPORT = {
    "id": "dubai_report",
    "title": "The Dubai Market Report 2003–2026",
    "subtitle": "Two decades of real estate transformation — data-driven insights for the discerning investor.",
    "edition": "2026 Edition",
    "published_date": "July 2026",
    "hero_image_url": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=2000&q=85",
    "brochure_image_url": "/dubai_report_brochure.png",
    "brochure_download_url": "",
    "highlights": [
        {
            "icon": "trending-up",
            "label": "Total Transaction Volume",
            "value": "AED 528B+",
            "description": "Cumulative real estate transactions recorded across Dubai from 2003 to 2026.",
        },
        {
            "icon": "bar-chart",
            "label": "Price Growth (23 Years)",
            "value": "+340%",
            "description": "Average residential price appreciation since freehold ownership was introduced.",
        },
        {
            "icon": "percent",
            "label": "Peak Rental Yield",
            "value": "9.8%",
            "description": "Highest recorded net rental yield in prime Dubai communities (2025).",
        },
        {
            "icon": "globe",
            "label": "International Buyer Share",
            "value": "68%",
            "description": "Share of Dubai property transactions attributed to international investors in 2025.",
        },
    ],
    "key_insights": [
        "Dubai property prices have recovered +120% since the 2009 correction and now trade at all-time highs.",
        "The off-plan segment represents 62% of all 2025 transactions, signaling strong developer confidence.",
        "Rental demand from HNWI relocations grew 41% YoY as Dubai cements itself as a global wealth hub.",
        "Average time-to-sell for prime properties dropped to just 18 days in Q1 2026 — a historic low.",
    ],
    "report_sections": [
        {"title": "Market Overview 2003–2026", "pages": "pp. 1–18"},
        {"title": "Price Trend Analysis by District", "pages": "pp. 19–42"},
        {"title": "Rental Yield Benchmarking", "pages": "pp. 43–58"},
        {"title": "Off-Plan Market Deep Dive", "pages": "pp. 59–74"},
        {"title": "International Investment Flows", "pages": "pp. 75–88"},
        {"title": "2026–2028 Outlook & Forecasts", "pages": "pp. 89–100"},
    ],
    "active": True,
    "require_auth_for_download": True,
    "cta_heading": "Access the Full Report",
    "cta_subheading": "Register to download the complete 100-page report including proprietary market data, district maps, and analyst forecasts.",
    "cta_button_label": "Download Full Report",
}


class DubaiReportUpdateIn(BaseModel):
    """Admin payload to update the Dubai Report page content."""
    title: Optional[str] = None
    subtitle: Optional[str] = None
    edition: Optional[str] = None
    published_date: Optional[str] = None
    hero_image_url: Optional[str] = None
    brochure_image_url: Optional[str] = None
    brochure_download_url: Optional[str] = None
    highlights: Optional[list] = None
    key_insights: Optional[list] = None
    report_sections: Optional[list] = None
    active: Optional[bool] = None
    require_auth_for_download: Optional[bool] = None
    cta_heading: Optional[str] = None
    cta_subheading: Optional[str] = None
    cta_button_label: Optional[str] = None


class DubaiReportLeadIn(BaseModel):
    """Registration lead for Dubai Report download."""
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    country: Optional[str] = Field(None, max_length=80)
    message: Optional[str] = Field(None, max_length=500)


@api_router.get("/dubai-report")
async def get_dubai_report():
    """Public endpoint — fetch the Dubai Report page content."""
    stored = await db_find_one("settings", {"id": "dubai_report"})
    if not stored:
        return _DEFAULT_DUBAI_REPORT
    return {**_DEFAULT_DUBAI_REPORT, **stored}


@api_router.patch("/admin/dubai-report")
async def update_dubai_report(payload: DubaiReportUpdateIn, user=Depends(require_owner_or_developer)):
    """Admin endpoint — update Dubai Report page content."""
    existing = await db_find_one("settings", {"id": "dubai_report"})
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    updates["updated_by"] = user.get("email", "")

    if existing:
        await db_update("settings", "dubai_report", updates)
    else:
        await db_insert("settings", {"id": "dubai_report", **_DEFAULT_DUBAI_REPORT, **updates})

    stored = await db_find_one("settings", {"id": "dubai_report"})
    return {**_DEFAULT_DUBAI_REPORT, **(stored or {})}


@api_router.post("/dubai-report/register", status_code=201)
async def register_for_dubai_report(payload: DubaiReportLeadIn, request: Request):
    """Public endpoint — register interest / request download access for the Dubai Report."""
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": DEFAULT_ORG_ID,
        "name": payload.name,
        "email": str(payload.email),
        "phone": payload.phone or "",
        "country": payload.country or "",
        "message": payload.message or "Dubai Report Download Request",
        "source": "dubai_report",
        "status": "new",
        "created_at": now_iso(),
        "ip": client_ip(request),
    }
    await db_insert("leads", doc)
    return {"ok": True, "id": doc["id"], "message": "Registration successful. Your download link has been sent."}


@api_router.get("/admin/dubai-report/leads")
async def list_dubai_report_leads(user=Depends(require_owner_or_developer)):
    """Admin endpoint — list Dubai Report registration leads (filtered by organization for owners)."""
    if user["role"] == ROLE_DEVELOPER:
        all_leads = await db_find("leads", {"source": "dubai_report"})
    else:
        org_id = user.get("organization_id")
        all_leads = await db_find("leads", {"source": "dubai_report", "organization_id": org_id})
    all_leads.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"count": len(all_leads), "results": all_leads}


app.include_router(api_router)

# ----------------------------- Serve Static Frontend -----------------------------
frontend_path = os.path.join(os.path.dirname(__file__), "frontend_build")

# Mount /static only when the build folder exists (guards against startup crash).
# The folder is created during the Render build step via `cp -r build ../backend/frontend_build`.
_static_dir = os.path.join(frontend_path, "static")
if os.path.isdir(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")


@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    if not _UPLOAD_FILENAME_RE.fullmatch(filename):
        raise HTTPException(status_code=404, detail="Not Found")
    file_path = (UPLOADS_DIR / filename).resolve()
    if file_path.parent != UPLOADS_DIR or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(
        file_path,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )


@app.get("/robots.txt")
async def serve_robots():
    site_url = os.getenv("SITE_URL", "https://www.triadrealty.ae").rstrip("/")
    content = (
        "# Triad Realty - robots.txt\n\n"
        "User-agent: *\n"
        "Allow: /\n\n"
        "# Private areas\n"
        "Disallow: /admin/\n"
        "Disallow: /dashboard/\n"
        "Disallow: /login\n"
        "Disallow: /register\n"
        "Disallow: /api/\n"
        "Disallow: /private/\n"
        "Disallow: /tmp/\n"
        "Disallow: /internal/\n\n"
        "# Sitemap\n"
        f"Sitemap: {site_url}/sitemap.xml\n\n"
        "# Preferred host (supported by some search engines)\n"
        f"Host: {site_url}"
    )
    return Response(content=content, media_type="text/plain")


@app.get("/sitemap.xml")
async def serve_sitemap():
    # Base URL for sitemap — always use the production canonical domain
    base_url = os.getenv("SITE_URL", "https://www.triadrealty.ae").rstrip("/")
    current_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    # Query all active database items dynamically
    projects = await db_find("projects") or []
    blogs = await db_find("blogs") or []
    team_members = await db_find("team") or []

    # Static pages configuration with specified priorities and frequencies:
    # Homepage = 1.0 (daily)
    # Properties = 0.9 (daily) -> /projects
    # Services = 0.9 (monthly) -> /experience-immersive
    # Communities = 0.9 (weekly) -> /gallery or /analysis
    # Blog list = 0.8 (weekly) -> /blogs
    # About = 0.8 (weekly) -> /about
    # Contact = 0.8 (yearly) -> /contact
    # Careers = 0.7 (weekly) -> /careers
    static_routes = [
        # (route, changefreq, priority)
        ("", "daily", "1.0"),
        ("/about", "weekly", "0.8"),
        ("/projects", "daily", "0.9"),
        ("/analysis", "weekly", "0.9"),
        ("/reviews", "weekly", "0.8"),
        ("/gallery", "weekly", "0.9"),
        ("/blogs", "weekly", "0.8"),
        ("/careers", "weekly", "0.7"),
        ("/contact", "yearly", "0.8"),
        ("/team", "weekly", "0.8"),
        ("/experience-immersive", "monthly", "0.9"),
    ]

    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!-- Dynamic XML Sitemap Generated for Triad Realty according to Google Sitemap Protocol -->',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
        ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
        ' xmlns:xhtml="http://www.w3.org/1999/xhtml">'
    ]


    # Generate sitemap links for static routes
    for route, freq, prio in static_routes:
        xml_lines.append(
            f"  <url>\n"
            f"    <loc>{base_url}{route}</loc>\n"
            f"    <lastmod>{current_date}</lastmod>\n"
            f"    <changefreq>{freq}</changefreq>\n"
            f"    <priority>{prio}</priority>\n"
            f"  </url>"
        )

    # Dynamic real estate projects sitemap (/projects/:id)
    # Priority: 0.9, Changefreq: daily
    for proj in projects:
        if isinstance(proj, dict) and "id" in proj:
            # Check if there is an explicit updated timestamp, fallback to current_date
            lastmod = proj.get("created_at") or proj.get("updated_at")
            lastmod_val = current_date
            if lastmod:
                try:
                    lastmod_val = datetime.fromisoformat(lastmod.replace("Z", "+00:00")).strftime('%Y-%m-%d')
                except ValueError:
                    pass

            img_url = proj.get("hero") or proj.get("cover", "")
            img_title = proj.get("name", "")
            img_caption = proj.get("tagline") or proj.get("description", "")[:120]
            image_block = ""
            if img_url:
                image_block = (
                    f"    <image:image>\n"
                    f"      <image:loc>{img_url}</image:loc>\n"
                    f"      <image:title>{img_title}</image:title>\n"
                    + (f"      <image:caption>{img_caption}</image:caption>\n" if img_caption else "")
                    + f"    </image:image>\n"
                )

            xml_lines.append(
                f"  <url>\n"
                f"    <loc>{base_url}/projects/{proj['id']}</loc>\n"
                f"    <lastmod>{lastmod_val}</lastmod>\n"
                f"    <changefreq>daily</changefreq>\n"
                f"    <priority>0.9</priority>\n"
                + image_block +
                f"  </url>"
            )


    # Dynamic blog pages sitemap (/blogs/:id)
    # Priority: 0.8, Changefreq: weekly
    for blog in blogs:
        if isinstance(blog, dict) and "id" in blog:
            # Parse the blog's publication date if present
            blog_date = blog.get("date")
            lastmod_val = current_date
            if blog_date:
                try:
                    # Validate standard YYYY-MM-DD parsing
                    datetime.strptime(blog_date, "%Y-%m-%d")
                    lastmod_val = blog_date
                except ValueError:
                    pass

            xml_lines.append(
                f"  <url>\n"
                f"    <loc>{base_url}/blogs/{blog['id']}</loc>\n"
                f"    <lastmod>{lastmod_val}</lastmod>\n"
                f"    <changefreq>weekly</changefreq>\n"
                f"    <priority>0.8</priority>\n"
                f"  </url>"
            )

    # Dynamic team consultants sitemap (/team/:id)
    # Priority: 0.7, Changefreq: monthly
    for member in team_members:
        if isinstance(member, dict) and "id" in member:
            xml_lines.append(
                f"  <url>\n"
                f"    <loc>{base_url}/team/{member['id']}</loc>\n"
                f"    <lastmod>{current_date}</lastmod>\n"
                f"    <changefreq>monthly</changefreq>\n"
                f"    <priority>0.7</priority>\n"
                f"  </url>"
            )

    xml_lines.append("</urlset>")
    return Response(content="\n".join(xml_lines), media_type="application/xml")


# ---------------------------------------------------------------------------
# Bot-detection helpers for the catch-all React route
# ---------------------------------------------------------------------------
_BOT_UAS = (
    "googlebot", "bingbot", "slurp", "duckduckbot", "facebookexternalhit",
    "twitterbot", "linkedinbot", "whatsapp", "telegrambot", "discordbot",
    "slackbot", "gptbot", "chatgpt-user", "anthropic-ai", "claudebot",
    "perplexitybot", "cohere-ai", "applebot", "google-extended",
    "amazonbot", "semrushbot", "ahrefsbot", "mj12bot",
)


def _is_crawler(user_agent: str) -> bool:
    ua = (user_agent or "").lower()
    return any(bot in ua for bot in _BOT_UAS)


def _escape_xml(text: str) -> str:
    """Minimal HTML/XML escaping for injected strings."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


async def _build_bot_html(full_path: str, index_html: str, base_url: str) -> str:
    """Inject page-specific meta + JSON-LD into the HTML shell for crawlers."""
    import json as _json

    title = "Triad Realty \u2014 Luxury Real Estate Dubai & UAE"
    description = (
        "Discreet, data-led property consultancy across Dubai and the Northern Emirates "
        "\u2014 off-plan investments, resale acquisitions, and luxury portfolio management."
    )
    og_image = "https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444306/three_founders_kuwre9.jpg"
    canonical = f"{base_url}/{full_path.lstrip('/')}"
    ld_json_blocks = []

    parts = full_path.strip("/").split("/")

    try:
        # ── /projects/:id ──────────────────────────────────────────────────
        if len(parts) == 2 and parts[0] == "projects":
            proj = await db_find_one("projects", {"id": parts[1]})
            if proj:
                name = _escape_xml(proj.get("name", "Project"))
                developer = _escape_xml(proj.get("developer", ""))
                location = _escape_xml(proj.get("location", "") or proj.get("emirate", "UAE"))
                desc_raw = proj.get("tagline") or proj.get("description") or ""
                desc = _escape_xml(desc_raw[:160])
                price = proj.get("price_from", 0)
                handover = proj.get("handover", "")
                hero = proj.get("hero") or proj.get("cover", og_image)

                title = f"{name} by {developer} | Triad Realty"
                description = f"Discover {name} in {location}. Starting from AED {price:,.0f}. Handover: {handover}. {desc_raw[:80]}"
                og_image = hero

                ld_json_blocks.append(_json.dumps({
                    "@context": "https://schema.org",
                    "@type": "Product",
                    "name": proj.get("name"),
                    "description": desc_raw[:500],
                    "image": hero,
                    "offers": {
                        "@type": "Offer",
                        "priceCurrency": "AED",
                        "price": price,
                        "availability": "https://schema.org/InStock",
                    },
                    "brand": {"@type": "Brand", "name": proj.get("developer", "Triad Realty")},
                }, ensure_ascii=False))

        # ── /blogs/:id ──────────────────────────────────────────────────────
        elif len(parts) == 2 and parts[0] == "blogs":
            blog = await db_find_one("blogs", {"id": parts[1]})
            if blog:
                btitle = _escape_xml(blog.get("title", "Blog"))
                bexcerpt = blog.get("excerpt") or blog.get("content", "")[:160]
                bdesc = _escape_xml(bexcerpt)
                bimage = blog.get("cover", og_image)
                bauthor = blog.get("author", "Triad Consultant")
                bdate = blog.get("date", "")

                title = f"{btitle} | Triad Realty Insights"
                description = bexcerpt[:160]
                og_image = bimage

                ld_json_blocks.append(_json.dumps({
                    "@context": "https://schema.org",
                    "@type": "BlogPosting",
                    "headline": blog.get("title"),
                    "image": bimage,
                    "datePublished": bdate,
                    "description": bexcerpt[:500],
                    "author": {"@type": "Person", "name": bauthor},
                    "publisher": {
                        "@type": "Organization",
                        "name": "Triad Realty",
                        "logo": "https://res.cloudinary.com/dhxttgpfj/image/upload/v1783444277/logo_ciuljv.png",
                    },
                }, ensure_ascii=False))

        # ── /team/:id ───────────────────────────────────────────────────────
        elif len(parts) == 2 and parts[0] == "team":
            member = await db_find_one("team", {"id": parts[1]})
            if member:
                mname = _escape_xml(member.get("name", "Consultant"))
                mrole = _escape_xml(member.get("role", "Property Consultant"))
                mspeaks = member.get("speaks", "")
                mphoto = member.get("photo", og_image)

                title = f"{mname} | {mrole} — Triad Realty"
                description = f"Contact {member.get('name')}, {mrole} at Triad Realty Dubai. Speaks: {mspeaks}."
                og_image = mphoto

                ld_json_blocks.append(_json.dumps({
                    "@context": "https://schema.org",
                    "@type": "Person",
                    "name": member.get("name"),
                    "jobTitle": member.get("role"),
                    "image": mphoto,
                    "email": member.get("email"),
                    "telephone": member.get("phone"),
                    "worksFor": {
                        "@type": "Organization",
                        "name": "Triad Realty",
                        "url": base_url,
                    },
                }, ensure_ascii=False))

    except Exception:
        # Never break page delivery for crawlers
        pass

    # Build the injection block
    og_title = _escape_xml(title)
    og_desc = _escape_xml(description[:200])
    ld_scripts = "\n".join(
        f'    <script type="application/ld+json">{block}</script>'
        for block in ld_json_blocks
    )

    injection = (
        f'    <title>{og_title}</title>\n'
        f'    <meta name="description" content="{og_desc}" />\n'
        f'    <meta property="og:title" content="{og_title}" />\n'
        f'    <meta property="og:description" content="{og_desc}" />\n'
        f'    <meta property="og:image" content="{og_image}" />\n'
        f'    <meta property="og:url" content="{canonical}" />\n'
        f'    <meta name="twitter:card" content="summary_large_image" />\n'
        f'    <meta name="twitter:title" content="{og_title}" />\n'
        f'    <meta name="twitter:description" content="{og_desc}" />\n'
        f'    <meta name="twitter:image" content="{og_image}" />\n'
        + (ld_scripts + "\n" if ld_scripts else "")
    )

    # Inject after <head> tag
    return index_html.replace("<head>", f"<head>\n{injection}", 1)


# Catch-all: ALWAYS registered so React Router paths (/projects, /about, …)
# never return a FastAPI 404. Non-API requests fall through to index.html.
@app.get("/{full_path:path}")
async def serve_react(full_path: str, request: Request):
    # Let /api/* routes surface their own 404 from FastAPI
    if full_path.startswith("api") or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")

    index_file = os.path.join(frontend_path, "index.html")
    if not os.path.isfile(index_file):
        raise HTTPException(
            status_code=503,
            detail="Frontend not built yet — run `npm run build` and copy to backend/frontend_build"
        )

    # Serve a specific file if it exists (e.g. favicon.ico, manifest.json)
    requested_file = os.path.join(frontend_path, full_path)
    if full_path and os.path.isfile(requested_file):
        return FileResponse(requested_file)

    # ── Bot-detection: inject page-specific meta for crawlers ───────────────
    ua = request.headers.get("user-agent", "")
    if _is_crawler(ua):
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                html = f.read()
            site_url = os.getenv("SITE_URL", "https://www.triadrealty.ae").rstrip("/")
            html = await _build_bot_html(full_path, html, site_url)
            return Response(content=html, media_type="text/html")
        except Exception:
            pass  # Fall through to standard FileResponse on any error

    # All other paths → hand off to React Router
    return FileResponse(index_file)
