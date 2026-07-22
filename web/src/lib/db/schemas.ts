/**
 * Document schemas (Zod) + inferred TypeScript types for every Itinera document.
 *
 * Mirrors `docs/04-data-model.md` and the server-side Pydantic models in
 * `api/app/models.py` (same camelCase field names). Schemas are **lenient**
 * (`.passthrough()` + optional domain fields) so that documents arriving from
 * sync – possibly carrying CouchDB internals (`_attachments`, `_conflicts`, …)
 * or fields from a newer client – always round-trip. The repository layer
 * enforces the *required* inputs at the TypeScript boundary on create.
 *
 * The shared infrastructure fields (`createdAt`, `updatedAt`, `schemaVersion`)
 * are required because **we stamp them on every write**; validating them guards
 * against our own bugs. Foreign documents are not validated by this layer.
 */

import { z } from 'zod';

// --- Enumerations ---------------------------------------------------------

export const ITINERARY_CATEGORIES = [
  'sightseeing',
  'food',
  'transport',
  'lodging',
  'activity',
  'free',
  'other'
] as const;
export const itineraryCategorySchema = z.enum(ITINERARY_CATEGORIES);
export type ItineraryCategory = (typeof ITINERARY_CATEGORIES)[number];

export const EXPENSE_CATEGORIES = [
  'transport',
  'lodging',
  'food',
  'activities',
  'shopping',
  'fees',
  'other'
] as const;
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const RESERVATION_KINDS = [
  'lodging',
  'car',
  'restaurant',
  'activity',
  'transport',
  'other'
] as const;
export const reservationKindSchema = z.enum(RESERVATION_KINDS);
export type ReservationKind = (typeof RESERVATION_KINDS)[number];

export const THEME_PREFS = ['system', 'light', 'dark'] as const;
export const themePrefSchema = z.enum(THEME_PREFS);
export type ThemePref = (typeof THEME_PREFS)[number];

/** Kinds of document an expense / itinerary item / attachment can link to. */
export const LINKED_TYPES = ['flight', 'reservation', 'itineraryItem', 'trip'] as const;
export type LinkedType = (typeof LINKED_TYPES)[number];

// --- Shared base -----------------------------------------------------------

/** Fields stamped on every write and required by this layer's own writes. */
const baseShape = {
  _id: z.string(),
  _rev: z.string().optional(),
  tripid: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().default(null),
  schemaVersion: z.number().int()
};

// --- Nested value objects ---------------------------------------------------

export const destinationSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    country: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    arriveDate: z.string().optional(),
    departDate: z.string().optional()
  })
  .passthrough();
export type Destination = z.infer<typeof destinationSchema>;

export const budgetSchema = z
  .object({
    total: z.number().optional(),
    byCategory: z.record(z.number()).optional(),
    perDay: z.number().optional()
  })
  .passthrough();
export type Budget = z.infer<typeof budgetSchema>;

export const geolocationSchema = z
  .object({
    name: z.string().optional(),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional()
  })
  .passthrough();
export type GeoLocation = z.infer<typeof geolocationSchema>;

/** Airport snapshot copied onto a flight segment (stable even if the dataset changes). */
export const airportSnapshotSchema = z
  .object({
    code: z.string().optional(),
    name: z.string().optional(),
    city: z.string().optional(),
    tz: z.string().optional()
  })
  .passthrough();
export type AirportSnapshot = z.infer<typeof airportSnapshotSchema>;

export const flightSegmentSchema = z
  .object({
    airline: z.string().optional(),
    flightNumber: z.string().optional(),
    from: airportSnapshotSchema.optional(),
    to: airportSnapshotSchema.optional(),
    departLocal: z.string().optional(),
    arriveLocal: z.string().optional(),
    seat: z.string().optional(),
    terminal: z.string().optional(),
    gate: z.string().optional(),
    baggage: z.string().optional(),
    checkInOpensAt: z.string().optional(),
    notes: z.string().optional()
  })
  .passthrough();
export type FlightSegment = z.infer<typeof flightSegmentSchema>;

export const reservationContactSchema = z
  .object({
    phone: z.string().optional(),
    email: z.string().optional(),
    url: z.string().optional()
  })
  .passthrough();
export type ReservationContact = z.infer<typeof reservationContactSchema>;

export const checklistTemplateItemSchema = z
  .object({
    text: z.string(),
    group: z.string().optional(),
    order: z.number().optional(),
    note: z.string().optional(),
    quantity: z.number().optional(),
    important: z.boolean().optional()
  })
  .passthrough();
export type ChecklistTemplateItem = z.infer<typeof checklistTemplateItemSchema>;

// --- Kind-specific reservation details (typed helpers; stored loosely) ------

export interface LodgingDetails {
  nights?: number;
  roomType?: string;
  address?: string;
}

export interface CarDetails {
  pickupLocation?: string;
  dropoffLocation?: string;
  company?: string;
  carClass?: string;
}

export interface RestaurantDetails {
  partySize?: number;
}

export interface ActivityDetails {
  provider?: string;
  meetingPoint?: string;
}

export interface TransportDetails {
  mode?: 'train' | 'bus' | 'ferry' | 'transfer';
  from?: string;
  to?: string;
  carrier?: string;
  seat?: string;
  coach?: string;
}

export type ReservationDetails =
  | LodgingDetails
  | CarDetails
  | RestaurantDetails
  | ActivityDetails
  | TransportDetails
  | Record<string, unknown>;

// --- Top-level documents ---------------------------------------------------

export const tripSchema = z
  .object({
    ...baseShape,
    type: z.literal('trip'),
    title: z.string().optional(),
    destinations: z.array(destinationSchema).default([]),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    primaryTimezone: z.string().optional(),
    archived: z.boolean().default(false),
    archivedAt: z.string().nullable().optional(),
    homeCurrency: z.string().optional(),
    budget: budgetSchema.optional(),
    coverImageAttId: z.string().nullable().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).default([]),
    travelerCount: z.number().int().min(1).default(1)
  })
  .passthrough();
export type Trip = z.infer<typeof tripSchema>;

export const tripDaySchema = z
  .object({
    ...baseShape,
    type: z.literal('tripDay'),
    date: z.string().optional(),
    title: z.string().optional(),
    notes: z.string().optional()
  })
  .passthrough();
export type TripDay = z.infer<typeof tripDaySchema>;

export const itineraryCostItemSchema = z
  .object({
    id: z.string(),
    label: z.string().default(''),
    category: expenseCategorySchema.default('activities'),
    amount: z.number().default(0)
  })
  .passthrough();
export type ItineraryCostItem = z.infer<typeof itineraryCostItemSchema>;

export const itineraryItemSchema = z
  .object({
    ...baseShape,
    type: z.literal('itineraryItem'),
    date: z.string().nullable().optional(),
    allDay: z.boolean().default(false),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    title: z.string().optional(),
    category: itineraryCategorySchema.optional(),
    location: geolocationSchema.optional(),
    notes: z.string().optional(),
    linkedFlightId: z.string().nullable().optional(),
    linkedReservationId: z.string().nullable().optional(),
    estCost: z.number().optional(),
    currency: z.string().optional(),
    costs: z.array(itineraryCostItemSchema).optional(),
    order: z.number().default(0)
  })
  .passthrough();
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;

export const checklistItemSchema = z
  .object({
    ...baseShape,
    type: z.literal('checklistItem'),
    text: z.string().optional(),
    group: z.string().optional(),
    done: z.boolean().default(false),
    doneAt: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    note: z.string().optional(),
    quantity: z.number().optional(),
    important: z.boolean().optional(),
    order: z.number().default(0)
  })
  .passthrough();
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const flightSchema = z
  .object({
    ...baseShape,
    type: z.literal('flight'),
    bookingRef: z.string().optional(),
    checkInUrl: z.string().optional(),
    segments: z.array(flightSegmentSchema).default([]),
    cost: z.number().optional(),
    currency: z.string().optional(),
    attachmentIds: z.array(z.string()).default([]),
    order: z.number().default(0),
    costType: z.enum(['total', 'per_person']).default('total')
  })
  .passthrough();
export type Flight = z.infer<typeof flightSchema>;

export const reservationSchema = z
  .object({
    ...baseShape,
    type: z.literal('reservation'),
    kind: reservationKindSchema.optional(),
    name: z.string().optional(),
    location: geolocationSchema.optional(),
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional(),
    confirmation: z.string().optional(),
    cost: z.number().optional(),
    currency: z.string().optional(),
    contact: reservationContactSchema.optional(),
    details: z.record(z.unknown()).default({}),
    notes: z.string().optional(),
    attachmentIds: z.array(z.string()).default([]),
    order: z.number().default(0),
    costType: z.enum(['total', 'per_person']).default('total')
  })
  .passthrough();
export type Reservation = z.infer<typeof reservationSchema>;

export const expenseSchema = z
  .object({
    ...baseShape,
    type: z.literal('expense'),
    date: z.string().nullable().optional(),
    category: expenseCategorySchema.optional(),
    description: z.string().optional(),
    amountEstimate: z.number().nullable().optional(),
    amountActual: z.number().nullable().optional(),
    currency: z.string().optional(),
    fxRate: z.number().nullable().optional(),
    paid: z.boolean().default(false),
    linkedType: z.enum(LINKED_TYPES).nullable().optional(),
    linkedId: z.string().nullable().optional(),
    costType: z.enum(['total', 'per_person']).default('total')
  })
  .passthrough();
export type Expense = z.infer<typeof expenseSchema>;

export const attachmentSchema = z
  .object({
    ...baseShape,
    type: z.literal('attachment'),
    filename: z.string().optional(),
    mime: z.string().optional(),
    /** View-safe MIME derived from `mime` (inline-renderable types pass through,
     * everything else becomes `application/octet-stream`). See `attachment-mime.ts`. */
    safeMime: z.string().optional(),
    size: z.number().optional(),
    ownerType: z.string().optional(),
    ownerId: z.string().optional()
  })
  .passthrough();
export type Attachment = z.infer<typeof attachmentSchema>;

export const checklistTemplateSchema = z
  .object({
    ...baseShape,
    type: z.literal('checklistTemplate'),
    name: z.string().optional(),
    isDefault: z.boolean().optional(),
    items: z.array(checklistTemplateItemSchema).default([])
  })
  .passthrough();
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;

export const settingsSchema = z
  .object({
    ...baseShape,
    type: z.literal('settings'),
    homeCurrencyDefault: z.string().optional(),
    defaultChecklistTemplateId: z.string().nullable().optional(),
    theme: themePrefSchema.optional(),
    firstDayOfWeek: z.number().int().optional(),
    language: z.string().optional()
  })
  .passthrough();
export type Settings = z.infer<typeof settingsSchema>;

// --- Discriminated union + registry ----------------------------------------

/** Any Itinera document. */
export type AnyDoc =
  | Trip
  | TripDay
  | ItineraryItem
  | ChecklistItem
  | Flight
  | Reservation
  | Expense
  | Attachment
  | ChecklistTemplate
  | Settings;

/** The CouchDB internal fields that may ride along on any stored document. */
export interface CouchMeta {
  _rev?: string;
  _revisions?: { start: number; ids: string[] };
  _conflicts?: string[];
  _attachments?: Record<string, PouchAttachmentMeta>;
}

/** Shape of an entry in a document's `_attachments` map. */
export interface PouchAttachmentMeta {
  content_type?: string;
  digest?: string;
  length?: number;
  stub?: boolean;
  data?: string | Blob;
}

/** Map of document type -> its Zod schema, for generic validation/migration. */
export const SCHEMA_BY_TYPE = {
  trip: tripSchema,
  tripDay: tripDaySchema,
  itineraryItem: itineraryItemSchema,
  checklistItem: checklistItemSchema,
  flight: flightSchema,
  reservation: reservationSchema,
  expense: expenseSchema,
  attachment: attachmentSchema,
  checklistTemplate: checklistTemplateSchema,
  settings: settingsSchema
} as const;

/**
 * Validate a document against its type's schema before writing. Throws a
 * descriptive `ZodError` on failure. Unknown types pass through unchanged
 * (foreign data is never rejected by this layer).
 */
export function validateDoc<T extends AnyDoc>(doc: T): T {
  const schema = SCHEMA_BY_TYPE[doc.type as keyof typeof SCHEMA_BY_TYPE];
  if (!schema) return doc;
  return schema.parse(doc) as T;
}

/** Safe variant of `@link validateDoc` returning Zod's result object. */
export function safeValidateDoc(doc: AnyDoc): z.SafeParseReturnType<unknown, AnyDoc> {
  const schema = SCHEMA_BY_TYPE[doc.type as keyof typeof SCHEMA_BY_TYPE];
  if (!schema) return { success: true, data: doc };
  return schema.safeParse(doc) as z.SafeParseReturnType<unknown, AnyDoc>;
}
