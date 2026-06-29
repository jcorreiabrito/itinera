# Itinera – Personal Trip Planner

A self-hosted, **offline-first** trip planner. Plan trips on your phone or laptop, view and edit everything offline, and have it sync automatically when you’re back online. Runs entirely on your home server with a local database.

> **Status:** **Design complete – ready to build** • Owner: you (single user) • Date: 2026-06-23

## What it does

- **Home dashboard** of all your trips.
- Each trip has: **Overview • Itinerary • Checklist • Flights • Reservations • Costs & Budget**.
- Attach booking PDFs / screenshots to flights and reservations.
- Works **offline** (full create/edit) and **syncs** when reconnected.

## Design north stars

- **Mobile-first**, but genuinely great on desktop (responsive).
- **Local-first**: your data lives on your devices and your server – never a third party.
- **Low maintenance**: simple to run, simple to back up.

## Locked decisions (from kickoff)

| Topic | Decision |
|-------|----------|
| Users | Single user (just me) |
| Offline | **Full offline create/edit**, auto-sync on reconnect |
| Devices | Android (Chrome) + laptop/desktop browser |
| Deployment | Docker on home server |
| Data entry | Manual + file attachments (PDF/images) for v1 |
| Frontend | Installable **PWA** (SvelteKit) – see Architecture |
| Python | Kept via **FastAPI** for server-side "smarts" |

## Architecture at a glance

- **Local-first PWA + CouchDB.** A SvelteKit PWA reads/writes a local PouchDB on each device and syncs to a CouchDB "source of truth" on the home server. A small FastAPI service handles Python smarts (backups, exports, future imports). Reached securely over Tailscale. See `[docs/02-architecture.md]`

## Decisions: all foundational ones locked

- **Backbone:** Stack A – PouchDB ⇄ CouchDB + FastAPI helper.
- **Access:** LAN + VPN (Tailscale), no app login.
- Full log in `[docs/00-decision-log.md]`

## Documentation Index

| Doc | Purpose |
|-----|---------|
| `[docs/00-decision-log.md]` | Running log of every key decision + rationale |
| `[docs/01-requirements.md]` | Functional + non-functional requirements |
| `[docs/02-architecture.md]` | System architecture, data flow, deployment, backups |
| `[docs/03-tech-stack.md]` | Concrete technologies + rationale |
| `[docs/04-data-model.md]` | CouchDB document model + relationships |
| `[docs/05-offline-and-sync.md]` | Offline + sync strategy, conflicts, attachments |
| `[docs/06-page-home.md]` | Home / all trips screen plan |
| `[docs/07-page-trip-overview.md]` | Trip shell (navigation) + Overview dashboard |
| `[docs/08-page-itinerary.md]` | Day-by-day itinerary (timeline) |
| `[docs/09-page-checklist.md]` | Checklist (groups, templates, daily to-dos) |
| `[docs/10-page-flights.md]` | Flight bookings (multi-leg, airports, timezones) |
| `[docs/11-page-reservations.md]` | Reservations (tailored types, timeline) |
| `[docs/12-page-costs-budget.md]` | Costs per day + budget tracking |
| `[docs/13-ui-ux.md]` | UI/UX design system (color, warm, forest-green) |
| `[docs/14-roadmap.md]` | Build phases & milestones |

## Diagram conventions (LLM-first)

All diagrams are written to be **unambiguously machine-readable** – no ASCII-art mockups:

- **Mermaid** for everything: `flowchart` for screen layouts and process flows, `sequenceDiagram` for sync, `erDiagram` for the data model.
- **Screen layouts** are modeled as a region tree: a `subgraph` = a screen area; nodes = components; solid edges (`-->`) denote **vertical stacking order** ("appears below").
- **Tables and nested lists** carry exact field/content detail next to each diagram.
- Labels are quoted plain text so they parse cleanly.

This folder is a **planning workspace**. We design first, doc by doc, pausing to confirm important decisions before locking them in.