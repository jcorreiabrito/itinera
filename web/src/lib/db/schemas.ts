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

export const DENSITY_PREFS = ['comfortable', 'compact'] as const;
export const densityPrefSchema = z.enum(DENSITY_PREFS);
export type DensityPref = (typeof DENSITY_PREFS)[number];

/** Kinds of document an expense / itinerary item / attachment can link to. */
export const LINKED_TYPES = ['flight', 'reservation', 'itineraryItem', 'trip'] as const;
export type LinkedType = (typeof LINKED_TYPES)[number];

// --- Shared base -----------------------------------------------------------

/**
 * An optional field that also accepts `null` as "not set".
 *
 * Hand-edited JSON and the importer spell an absent value as `null`, while
 * `z.string().optional()` accepts only `undefined`. A trip imported with
 * `"startDate": null` could therefore be read but never written again:
 * archiving, editing or deleting it failed validation. `preprocess` maps the
 * `null` to `undefined`, so the document is cleaned on its next write and the
 * inferred TypeScript type stays `T | undefined` rather than gaining `null`.
 *
 * Fields where `null` is a real value (`deletedAt`, `dayOrdinal`, a linked id)
 * keep their explicit `.nullable()`.
 */
function optional<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess((value) => (value === null ? undefined : value), schema.optional());
}

/** Fields stamped on every write and required by this layer's own writes. */
const baseShape = {
	_id: z.string(),
	_rev: optional(z.string()),
	tripid: optional(z.string()),
	createdAt: z.string(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable().default(null),
	schemaVersion: z.number().int()
};

// --- Nested value objects ---------------------------------------------------

export const destinationSchema = z
	.object({
		id: optional(z.string()),
		name: z.string(),
		country: optional(z.string()),
		lat: optional(z.number()),
		lng: optional(z.number()),
		arriveDate: optional(z.string()),
		departDate: optional(z.string())
	})
	.passthrough();
export type Destination = z.infer<typeof destinationSchema>;

export const budgetSchema = z
	.object({
		total: optional(z.number()),
		byCategory: optional(z.record(z.number())),
		perDay: optional(z.number())
	})
	.passthrough();
export type Budget = z.infer<typeof budgetSchema>;

export const geolocationSchema = z
	.object({
		name: optional(z.string()),
		address: optional(z.string()),
		lat: optional(z.number()),
		lng: optional(z.number())
	})
	.passthrough();
export type GeoLocation = z.infer<typeof geolocationSchema>;

/** Airport snapshot copied onto a flight segment (stable even if the dataset changes). */
export const airportSnapshotSchema = z
	.object({
		code: optional(z.string()),
		name: optional(z.string()),
		city: optional(z.string()),
		tz: optional(z.string())
	})
	.passthrough();
export type AirportSnapshot = z.infer<typeof airportSnapshotSchema>;

export const flightSegmentSchema = z
	.object({
		airline: optional(z.string()),
		flightNumber: optional(z.string()),
		from: optional(airportSnapshotSchema),
		to: optional(airportSnapshotSchema),
		departLocal: optional(z.string()),
		arriveLocal: optional(z.string()),
		seat: optional(z.string()),
		terminal: optional(z.string()),
		gate: optional(z.string()),
		baggage: optional(z.string()),
		checkInOpensAt: optional(z.string()),
		notes: optional(z.string())
	})
	.passthrough();
export type FlightSegment = z.infer<typeof flightSegmentSchema>;

export const reservationContactSchema = z
	.object({
		phone: optional(z.string()),
		email: optional(z.string()),
		url: optional(z.string())
	})
	.passthrough();
export type ReservationContact = z.infer<typeof reservationContactSchema>;

export const checklistTemplateItemSchema = z
	.object({
		text: z.string(),
		group: optional(z.string()),
		order: optional(z.number()),
		note: optional(z.string()),
		quantity: optional(z.number()),
		important: optional(z.boolean())
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
		title: optional(z.string()),
		destinations: z.array(destinationSchema).default([]),
		startDate: optional(z.string()),
		endDate: optional(z.string()),
		/**
		 * How the trip's day list is defined. Absent means "infer": a trip with
		 * both dates is dated, a trip with neither is a dream. Storing it
		 * explicitly once the user chooses avoids re-deriving from partial data.
		 */
		dateMode: optional(z.enum(['dated', 'dream'])),
		/** Number of numbered days on a dream trip (the authoritative length). */
		dreamDayCount: optional(z.number().int().min(1).max(366)),
		primaryTimezone: optional(z.string()),
		archived: z.boolean().default(false),
		archivedAt: z.string().nullable().optional(),
		homeCurrency: optional(z.string()),
		budget: optional(budgetSchema),
		stage: z.enum(['planning', 'confirmed']).default('confirmed'),
		coverImageAttId: z.string().nullable().optional(),
		notes: optional(z.string()),
		tags: z.array(z.string()).default([]),
		travelerCount: z.number().int().min(1).default(1)
	})
	.passthrough();
export type Trip = z.infer<typeof tripSchema>;

export const tripDaySchema = z
	.object({
		...baseShape,
		type: z.literal('tripDay'),
		date: optional(z.string()),
		/** Dream-plan position. Dated day docs leave this absent. */
		ordinal: optional(z.number().int().min(1)),
		/** Soft weekday wish, 1 = Monday … 7 = Sunday. Dream mode only. */
		weekdayHint: z.number().int().min(1).max(7).nullable().optional(),
		title: optional(z.string()),
		notes: optional(z.string())
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
		/** Dream-plan position. Mutually exclusive with `date` in stored data. */
		dayOrdinal: z.number().int().min(1).nullable().optional(),
		allDay: z.boolean().default(false),
		startTime: optional(z.string()),
		endTime: optional(z.string()),
		title: optional(z.string()),
		category: optional(itineraryCategorySchema),
		location: optional(geolocationSchema),
		notes: optional(z.string()),
		linkedFlightId: z.string().nullable().optional(),
		linkedReservationId: z.string().nullable().optional(),
		estCost: optional(z.number()),
		currency: optional(z.string()),
		costs: optional(z.array(itineraryCostItemSchema)),
		order: z.number().default(0)
	})
	.passthrough();
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;

export const checklistItemSchema = z
	.object({
		...baseShape,
		type: z.literal('checklistItem'),
		text: optional(z.string()),
		group: optional(z.string()),
		done: z.boolean().default(false),
		doneAt: z.string().nullable().optional(),
		dueDate: z.string().nullable().optional(),
		date: z.string().nullable().optional(),
		note: optional(z.string()),
		quantity: optional(z.number()),
		important: optional(z.boolean()),
		order: z.number().default(0)
	})
	.passthrough();
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const flightSchema = z
	.object({
		...baseShape,
		type: z.literal('flight'),
		bookingRef: optional(z.string()),
		checkInUrl: optional(z.string()),
		segments: z.array(flightSegmentSchema).default([]),
		cost: optional(z.number()),
		currency: optional(z.string()),
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
		kind: optional(reservationKindSchema),
		name: optional(z.string()),
		location: optional(geolocationSchema),
		start: z.string().nullable().optional(),
		end: z.string().nullable().optional(),
		confirmation: optional(z.string()),
		cost: optional(z.number()),
		currency: optional(z.string()),
		contact: optional(reservationContactSchema),
		details: z.record(z.unknown()).default({}),
		notes: optional(z.string()),
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
		category: optional(expenseCategorySchema),
		description: optional(z.string()),
		amountEstimate: z.number().nullable().optional(),
		amountActual: z.number().nullable().optional(),
		currency: optional(z.string()),
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
		filename: optional(z.string()),
		mime: optional(z.string()),
		/** View-safe MIME derived from `mime` (inline-renderable types pass through,
		 * everything else becomes `application/octet-stream`). See `attachment-mime.ts`. */
		safeMime: optional(z.string()),
		size: optional(z.number()),
		ownerType: optional(z.string()),
		ownerId: optional(z.string())
	})
	.passthrough();
export type Attachment = z.infer<typeof attachmentSchema>;

export const checklistTemplateSchema = z
	.object({
		...baseShape,
		type: z.literal('checklistTemplate'),
		name: optional(z.string()),
		isDefault: optional(z.boolean()),
		items: z.array(checklistTemplateItemSchema).default([])
	})
	.passthrough();
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;

export const settingsSchema = z
	.object({
		...baseShape,
		type: z.literal('settings'),
		homeCurrencyDefault: optional(z.string()),
		defaultChecklistTemplateId: z.string().nullable().optional(),
		theme: optional(themePrefSchema),
		/**
		 * List density. Defaulted here as well as in the repository so a settings
		 * document written before this field existed still reads as a complete
		 * preference rather than leaving every reader to guess.
		 */
		density: densityPrefSchema.default('comfortable'),
		firstDayOfWeek: optional(z.number().int()),
		language: optional(z.string()),
		cartoApiKey: optional(z.string()),
		/**
		 * Days a deleted document is kept in the Trash before it is purged for
		 * good. `0` — the default, and what an absent field means — keeps
		 * everything: purging is irreversible, so it stays opt-in.
		 */
		trashRetentionDays: optional(z.number().int().min(0))
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
