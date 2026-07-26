import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
/** OAuth account linkage type. Mirrors the Auth.js adapter vocabulary so the
 *  existing `accounts` table (created by migration 0000) keeps its shape. */
type AdapterAccountType = "oauth" | "oidc" | "email" | "webauthn";

// ---------------------------------------------------------------------------
// Enums — closed sets from the spec. Adding a value later is a cheap migration.
// ---------------------------------------------------------------------------

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free",
  "beginner",
  "pro",
]);

export const billingIntervalEnum = pgEnum("billing_interval", [
  "monthly",
  "annual",
]);

export const aspectRatioEnum = pgEnum("aspect_ratio", [
  "portrait",
  "square",
  "landscape",
  "fullscreen",
]);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const templateCategoryEnum = pgEnum("template_category", [
  "text",
  "graphics",
  "overlays",
  "logos",
  "social",
  "charts-data",
  "money",
  "app-website",
  "ui-elements",
  "launch-videos",
]);

export const templateStatusEnum = pgEnum("template_status", [
  "draft",
  "submitted",
  "approved",
]);

export const exportFormatEnum = pgEnum("export_format", [
  "mp4",
  "gif",
  "mov",
  "webm",
]);

export const exportQualityEnum = pgEnum("export_quality", [
  "fast",
  "balanced",
  "high",
]);

export const exportStatusEnum = pgEnum("export_status", [
  "queued",
  "rendering",
  "done",
  "failed",
]);

export const generationOutcomeEnum = pgEnum("generation_outcome", [
  "accepted",
  "rejected_moderation",
  "rejected_rate_limit",
  "rejected_credits",
  "rejected_access",
  "failed",
]);

// ---------------------------------------------------------------------------
// Auth tables — shape required by @auth/drizzle-adapter, extended with our
// domain columns (passwordHash for credentials login, isAdmin).
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"), // null for OAuth-only users
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// Workspaces — one personal workspace per user for now.
// Members/roles/invites are deliberately deferred until team plans are real.
// NOTE: no creditBalance column — balance is derived from credit_txns (ledger).
// ---------------------------------------------------------------------------

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionTier: subscriptionTierEnum("subscription_tier")
      .notNull()
      .default("free"),
    billingInterval: billingIntervalEnum("billing_interval"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("workspaces_owner_idx").on(t.ownerId)],
);

// ---------------------------------------------------------------------------
// Projects / scenes / versions / messages
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    aspectRatio: aspectRatioEnum("aspect_ratio").notNull().default("landscape"),
    backgroundColor: text("background_color").notNull().default("#0b0b0f"),
    fontFamily: text("font_family").notNull().default("Inter"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("projects_workspace_idx").on(t.workspaceId)],
);

export const scenes = pgTable(
  "scenes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    durationInFrames: integer("duration_in_frames").notNull().default(180),
    fps: integer("fps").notNull().default(60),
    code: text("code"),
    params: jsonb("params"),
    prompt: text("prompt"),
    modelId: text("model_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("scenes_project_idx").on(t.projectId)],
);

export const versions = pgTable(
  "versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    params: jsonb("params"),
    label: text("label"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("versions_scene_idx").on(t.sceneId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("messages_scene_idx").on(t.sceneId)],
);

// ---------------------------------------------------------------------------
// Templates — the seed corpus (M3) and later community submissions.
// The `embedding vector(N)` column is deliberately ABSENT: it lands in the M4
// migration once the embedding model (and therefore the dimension) is pinned.
// ---------------------------------------------------------------------------

export const templates = pgTable(
  "templates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Stable human-readable id for idempotent re-seeding of the built-in corpus.
    slug: text("slug").unique(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    category: templateCategoryEnum("category").notNull(),
    code: text("code").notNull(),
    params: jsonb("params").notNull(),
    durationInFrames: integer("duration_in_frames").notNull().default(180),
    fps: integer("fps").notNull().default(60),
    thumbnailUrl: text("thumbnail_url"),
    previewVideoUrl: text("preview_video_url"),
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: templateStatusEnum("status").notNull().default("draft"),
    remixCount: integer("remix_count").notNull().default(0),
    // 768-dim to match gemini-embedding-001 truncated output (and the offline
    // fallback). Nullable: rows may exist before embed-templates runs.
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("templates_category_idx").on(t.category),
    index("templates_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Rendered file bytes live in Postgres for now (M11): no blob-storage
 *  dependency, and clips this short stay in the low megabytes. The swap point
 *  to R2/S3 later is exports.fileData → outputUrl — contained by design. */
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const exports = pgTable(
  "exports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The exact scene version being rendered (M11). */
    sceneId: text("scene_id").references(() => scenes.id, {
      onDelete: "cascade",
    }),
    format: exportFormatEnum("format").notNull(),
    quality: exportQualityEnum("quality").notNull().default("balanced"),
    transparent: boolean("transparent").notNull().default(false),
    status: exportStatusEnum("status").notNull().default("queued"),
    outputUrl: text("output_url"),
    error: text("error"),
    fileData: bytea("file_data"),
    fileSize: integer("file_size"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("exports_project_idx").on(t.projectId),
    index("exports_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Generation events — one row per generation ATTEMPT, accepted or not.
//
// Deliberately one table serving three needs that all want the same rows:
//   1. Rate limiting (M6)  — count rows per workspace in a time window.
//   2. Abuse review (§5)   — what was asked for, and what the gate decided.
//   3. Analytics (M14)     — regeneration rate, the key output-quality signal.
//
// Rejected attempts are recorded too: a workspace hammering the moderation gate
// is exactly the signal worth having, and it must not be cheap to erase by
// simply failing. `tier` is plain text, not an enum — the Tier union lives in
// the server-only model ladder and must not be mirrored into a DB enum that a
// migration could drift from.
// ---------------------------------------------------------------------------

export const generationEvents = pgTable(
  "generation_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    tier: text("tier").notNull(),
    outcome: generationOutcomeEnum("outcome").notNull(),
    prompt: text("prompt").notNull(),
    /** Rejection reason / error class. Never the raw generated code. */
    detail: text("detail"),
    sceneId: text("scene_id").references(() => scenes.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // Composite, in this order: every rate-limit query is
    // "this workspace, since T" and is served entirely by this index.
    index("generation_events_workspace_created_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Credit ledger — append-only. Balance = SUM(delta). There is no mutable
// balance column anywhere, by design. See lib/credits/ledger.ts.
// ---------------------------------------------------------------------------

export const creditTxns = pgTable(
  "credit_txns",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(), // positive = grant, negative = debit
    reason: text("reason").notNull(), // e.g. 'signup_grant', 'generation', 'refund'
    modelId: text("model_id"),
    sceneId: text("scene_id").references(() => scenes.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_txns_workspace_idx").on(t.workspaceId),
    index("credit_txns_created_idx").on(t.createdAt),
  ],
);
