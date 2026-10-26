<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import L from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import { bareTripUid, itinerary, settings, type ItineraryItem } from '$lib/db';
	import {
		Compass,
		Maximize2,
		Minimize2,
		ChevronUp,
		ChevronDown,
		Plus,
		CloudDownload,
		Settings as SettingsIcon
	} from 'lucide-svelte';
	import { toast, Dialog, Button, Field } from '$lib/components/ui';
	import { theme } from '$lib/stores/theme.svelte';
	import { t } from '$lib/i18n.svelte';

	let {
		items = [],
		destination = '',
		tripId = '',
		onchanged,
		heightClass = 'h-[min(20rem,45dvh)]',
		selectedId = null,
		onselect
	}: {
		items?: ItineraryItem[];
		destination?: string;
		tripId?: string;
		onchanged?: () => void;
		/**
		 * Height of the map body when inline. The workspace docks a shorter map
		 * below the day; the default keeps the original viewport-clamped size.
		 */
		heightClass?: string;
		/** The item whose marker should be highlighted, if any. */
		selectedId?: string | null;
		/** Selecting a marker hands the item to the caller (the inspector). */
		onselect?: (item: ItineraryItem) => void;
	} = $props();

	let mapContainer = $state<HTMLDivElement | null>(null);
	let mapLoaded = $state(false);
	let mapError = $state(false);
	let isExpanded = $state(false);
	let isCollapsed = $state(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
	let selectedIndex = $state<number | null>(null);

	// Quick Add Pin Dialog State
	let addModalOpen = $state(false);
	let isDroppingPin = $state(false);
	let pendingCoords = $state<{ lat: number; lng: number } | null>(null);
	let newPinTitle = $state('');
	let newPinDate = $state('');
	let newPinSaving = $state(false);

	// Active locations with valid location info or coordinates
	let locations = $derived(
		items
			.filter((i) => {
				if (!i.location) return false;
				if (typeof i.location === 'string') return (i.location as string).trim().length > 0;
				const loc = i.location as { name?: string; address?: string; lat?: number; lng?: number };
				return (
					(loc.lat != null && loc.lng != null) ||
					(loc.name && loc.name.trim().length > 0) ||
					(loc.address && loc.address.trim().length > 0)
				);
			})
			.map((i, idx) => {
				let name = '';
				let address = '';
				let lat: number | undefined;
				let lng: number | undefined;

				if (typeof i.location === 'string') {
					name = (i.location as string).trim();
				} else if (i.location) {
					const loc = i.location as { name?: string; address?: string; lat?: number; lng?: number };
					name = loc.name || '';
					address = loc.address || '';
					lat = loc.lat;
					lng = loc.lng;
				}

				return {
					index: idx + 1,
					id: i._id,
					item: i,
					title: i.title || t('label_activity'),
					locationName: name || address || t('map_location'),
					lat,
					lng,
					startTime: i.startTime,
					date: i.date,
					notes: i.notes
				};
			})
	);

	interface MarkerEntry {
		marker: L.Marker;
		coords: [number, number];
		itemId: string;
	}

	let leafMap: L.Map | null = null;
	let polylineLayer: L.Polyline | null = null;
	/* eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain Map is correct here: this is a local accumulator/registry rebuilt on every run, not reactive $state. SvelteMap would add reactivity nobody reads. */
	let markersMap: Map<number, MarkerEntry> = new Map();
	/** Incremented by every marker rebuild so a slow geocode cannot paint into a newer run. */
	let markerGeneration = 0;
	let lastSelectedId: string | null = null;

	const CITY_COORDS: Record<string, [number, number]> = {
		paris: [48.8566, 2.3522],
		london: [51.5074, -0.1278],
		tokyo: [35.6762, 139.6503],
		'new york': [40.7128, -74.006],
		kyoto: [35.0116, 135.7681],
		rome: [41.9028, 12.4964],
		barcelona: [41.3851, 2.1734],
		amsterdam: [52.3676, 4.9041],
		lisbon: [38.7223, -9.1393],
		berlin: [52.52, 13.405],
		cancun: [21.1619, -86.8515],
		sydney: [-33.8688, 151.2093]
	};

	function getCachedCoord(locStr: string): [number, number] | null {
		if (typeof localStorage === 'undefined' || !locStr) return null;
		try {
			const cached = localStorage.getItem(`itinera_geo_${locStr.toLowerCase()}`);
			if (cached) return JSON.parse(cached);
		} catch {
			/* corrupt cache entry — fall through to the built-in city table */
		}

		const key = Object.keys(CITY_COORDS).find((c) => locStr.toLowerCase().includes(c));
		return key ? CITY_COORDS[key] : null;
	}

	function setCachedCoord(locStr: string, coords: [number, number]) {
		if (typeof localStorage === 'undefined' || !locStr) return;
		try {
			localStorage.setItem(`itinera_geo_${locStr.toLowerCase()}`, JSON.stringify(coords));
		} catch {
			/* quota or private mode — the cache is an optimisation, never required */
		}
	}

	async function geocode(locStr: string): Promise<[number, number] | null> {
		if (!locStr) return null;
		const cached = getCachedCoord(locStr);
		if (cached) return cached;

		try {
			const res = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locStr)}`,
				{ headers: { 'User-Agent': 'ItineraTravelPlanner/1.0' } }
			);
			if (!res.ok) return null;
			const data = await res.json();
			if (data && data.length > 0) {
				const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
				setCachedCoord(locStr, coords);
				return coords;
			}
		} catch {
			// offline or geocoding unavailable
		}
		return null;
	}

	let currentTileLayer: L.TileLayer | null = null;
	let downloadingOffline = $state(false);
	let cartoApiKey = $state<string>('');
	let destroyed = false;

	onMount(async () => {
		if (typeof window === 'undefined' || !mapContainer) return;
		try {
			const s = await settings.get();
			if (s?.cartoApiKey) cartoApiKey = s.cartoApiKey.trim();
		} catch {
			/* settings unavailable — fall back to localStorage below */
		}
		// The pane can close while settings are loading; mounting a map on a
		// detached container would leave a Leaflet instance with nothing to remove.
		if (destroyed) return;
		if (!cartoApiKey && typeof localStorage !== 'undefined') {
			cartoApiKey = localStorage.getItem('itinera_carto_api_key') || '';
		}
		initMap();
	});

	onDestroy(() => {
		// Cancel any geocode still in flight: it would otherwise add markers to a
		// map that has already been removed.
		destroyed = true;
		markerGeneration += 1;
		if (leafMap) {
			leafMap.remove();
			leafMap = null;
		}
	});

	function updateTileLayer() {
		if (!leafMap) return;
		if (currentTileLayer) {
			currentTileLayer.remove();
		}

		if (cartoApiKey) {
			const tileUrl = theme.isDark
				? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoApiKey)}`
				: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoApiKey)}`;
			currentTileLayer = L.tileLayer(tileUrl, {
				maxZoom: 19,
				attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
				referrerPolicy: 'strict-origin-when-cross-origin'
			}).addTo(leafMap);
		} else {
			// Fallback: OpenStreetMap (100% free, no API key needed, zero watermark)
			currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				referrerPolicy: 'strict-origin-when-cross-origin',
				className: theme.isDark ? 'osm-dark-tiles' : ''
			}).addTo(leafMap);
		}
	}

	$effect(() => {
		const _dark = theme.isDark;
		if (mapLoaded && leafMap) {
			updateTileLayer();
		}
	});

	async function downloadOfflineMap() {
		if (downloadingOffline) return;
		downloadingOffline = true;
		toast.info(t('map_downloading_tiles'));
		try {
			let centerLat = 20,
				centerLng = 0;
			if (locations.length > 0 && locations[0].lat != null && locations[0].lng != null) {
				centerLat = locations[0].lat;
				centerLng = locations[0].lng;
			} else if (leafMap) {
				const c = leafMap.getCenter();
				centerLat = c.lat;
				centerLng = c.lng;
			} else if (destination) {
				const coords = await geocode(destination);
				if (coords) {
					centerLat = coords[0];
					centerLng = coords[1];
				}
			}

			const tilesToFetch: string[] = [];
			const subdomains = ['a', 'b', 'c'];
			for (let z = 12; z <= 14; z++) {
				const n = Math.pow(2, z);
				const x = Math.floor(((centerLng + 180) / 360) * n);
				const latRad = (centerLat * Math.PI) / 180;
				const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);

				for (let dx = -1; dx <= 1; dx++) {
					for (let dy = -1; dy <= 1; dy++) {
						const tx = x + dx;
						const ty = y + dy;
						if (cartoApiKey) {
							const s = subdomains[Math.abs(tx + ty) % 3];
							tilesToFetch.push(
								`https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${tx}/${ty}.png?key=${encodeURIComponent(cartoApiKey)}`
							);
							tilesToFetch.push(
								`https://${s}.basemaps.cartocdn.com/dark_all/${z}/${tx}/${ty}.png?key=${encodeURIComponent(cartoApiKey)}`
							);
						} else {
							tilesToFetch.push(`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`);
						}
					}
				}
			}

			await Promise.allSettled(tilesToFetch.map((url) => fetch(url, { mode: 'no-cors' })));
			toast.success(t('map_offline_ready', { n: String(tilesToFetch.length) }));
		} catch (err) {
			console.error('Failed to pre-cache map tiles', err);
			toast.error(t('map_download_failed'));
		} finally {
			downloadingOffline = false;
		}
	}

	$effect(() => {
		if (!isCollapsed && leafMap) {
			setTimeout(() => leafMap?.invalidateSize(), 150);
		}
	});

	async function initMap() {
		if (!mapContainer) return;

		try {
			leafMap = L.map(mapContainer, {
				zoomControl: false,
				attributionControl: false,
				dragging: true
			}).setView([20, 0], 2);

			L.control
				.attribution({
					prefix: false,
					position: 'bottomleft'
				})
				.addTo(leafMap);
			L.control.zoom({ position: 'bottomright' }).addTo(leafMap);
			updateTileLayer();

			// Handle map clicks for "Drop Pin" feature
			leafMap.on('click', (e: L.LeafletMouseEvent) => {
				if (isDroppingPin) {
					pendingCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
					addModalOpen = true;
					isDroppingPin = false;
				}
			});

			mapLoaded = true;
		} catch (err) {
			console.error('Failed to initialize map', err);
			mapError = true;
		}
	}

	/*
	 * Rebuild the pins when the items change, not only when the map mounts.
	 *
	 * The workspace swaps the map's items when the selected day changes, and the
	 * old inline map had the same defect: a saved edit changed the props but not
	 * the pins. The signature is what makes the effect idempotent; `refreshMarkers`
	 * itself is free to rebuild as often as the effect decides.
	 */
	const locationSignature = $derived(
		`${destination}|${locations
			.map((loc) => `${loc.id}:${loc.lat ?? ''}:${loc.lng ?? ''}:${loc.locationName}`)
			.join('|')}`
	);
	let renderedSignature: string | null = null;

	$effect(() => {
		const signature = locationSignature;
		if (!mapLoaded || signature === renderedSignature) return;
		renderedSignature = signature;
		void refreshMarkers();
	});

	$effect(() => {
		const id = selectedId ?? null;
		if (!mapLoaded) return;
		applySelectedMarker(id);
		if (id && id !== lastSelectedId) focusMarker(id);
		lastSelectedId = id;
	});

	function applySelectedMarker(id: string | null) {
		for (const [index, entry] of markersMap) {
			entry.marker.getElement()?.classList.toggle('itinera-pin-selected', entry.itemId === id);
			if (entry.itemId === id) selectedIndex = index;
		}
	}

	/** Fly to an item's pin and open its popup; no-op while it has no marker. */
	function focusMarker(id: string): boolean {
		for (const [index, entry] of markersMap) {
			if (entry.itemId !== id) continue;
			selectedIndex = index;
			if (leafMap) {
				leafMap.flyTo(entry.coords, Math.max(leafMap.getZoom(), 13), { duration: 1.2 });
				entry.marker.openPopup();
			}
			return true;
		}
		return false;
	}

	async function refreshMarkers() {
		if (!leafMap) return;
		const generation = ++markerGeneration;

		// Clear existing markers
		markersMap.forEach((entry) => entry.marker.remove());
		markersMap.clear();
		if (polylineLayer) polylineLayer.remove();

		const bounds: [number, number][] = [];

		for (const loc of locations) {
			let coords: [number, number] | null = null;
			if (loc.lat != null && loc.lng != null) {
				coords = [loc.lat, loc.lng];
			} else {
				coords = await geocode(loc.locationName);
				// A day change or a reload started a newer rebuild while this one
				// was geocoding; let that run own the map from here.
				if (generation !== markerGeneration || !leafMap) return;
				if (coords && loc.item) {
					const existingLoc =
						typeof loc.item.location === 'object' ? loc.item.location : { name: loc.locationName };
					itinerary
						.update(loc.item._id, {
							location: { ...existingLoc, lat: coords[0], lng: coords[1] }
						})
						.catch(() => {});
				}
			}

			if (coords) {
				const pinIcon = L.divIcon({
					className: 'custom-map-pin',
					html: `
            <div class="group relative flex items-center justify-center">
              <div class="pin-dot h-8 w-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xs shadow-card ring-2 ring-surface border border-white transform transition-transform group-hover:scale-110">
                ${loc.index}
              </div>
              <div class="absolute -bottom-1 w-2 h-2 bg-primary-600 rotate-45 border-r border-b border-white"></div>
            </div>
          `,
					iconSize: [32, 36],
					iconAnchor: [16, 36],
					popupAnchor: [0, -32]
				});

				const popupContent = `
          <div class="p-1 max-w-xs font-sans">
            <div class="flex items-center space-x-1 text-xs font-semibold text-primary-700 uppercase tracking-wider mb-1">
              <span>${t('map_pin_number', { n: String(loc.index) })}</span>
              ${loc.startTime ? `<span>• ${loc.startTime}</span>` : ''}
            </div>
            <h4 class="font-serif font-bold text-ink text-sm mb-1">${loc.title}</h4>
            <p class="text-xs text-ink-muted flex items-center gap-1 mb-1">
              ${loc.locationName}
            </p>
            ${loc.notes ? `<p class="text-xs text-ink/80 italic bg-surface-sunken p-1.5 rounded mt-1">${loc.notes}</p>` : ''}
          </div>
        `;

				const marker = L.marker(coords, { icon: pinIcon }).addTo(leafMap).bindPopup(popupContent);

				marker.on('click', () => {
					selectedIndex = loc.index;
					onselect?.(loc.item);
				});

				markersMap.set(loc.index, { marker, coords, itemId: loc.id });
				bounds.push(coords);
			}
		}

		if (bounds.length > 0) {
			// Draw chronological travel route polyline
			polylineLayer = L.polyline(bounds, {
				color: '#2f6b4f',
				weight: 3,
				opacity: 0.7,
				dashArray: '6, 8'
			}).addTo(leafMap);

			if (bounds.length === 1) {
				leafMap.setView(bounds[0], 13);
			} else {
				leafMap.fitBounds(bounds, { padding: [40, 40] });
			}
		} else if (destination) {
			const destCoords = await geocode(destination);
			if (generation !== markerGeneration || !leafMap) return;
			if (destCoords) {
				leafMap.setView(destCoords, 11);
			}
		}

		applySelectedMarker(selectedId ?? null);
		if (selectedId) focusMarker(selectedId);
	}

	function focusLocation(idx: number) {
		selectedIndex = idx;
		const entry = markersMap.get(idx);
		if (entry && leafMap) {
			leafMap.flyTo(entry.coords, 14, { duration: 1.2 });
			entry.marker.openPopup();
		}
	}

	async function handleSaveNewPin() {
		const rawTripId = tripId || items[0]?.tripid || (items[0] as { tripId?: string })?.tripId;
		const targetTripId = typeof rawTripId === 'string' ? bareTripUid(rawTripId) : '';
		if (!newPinTitle.trim() || !pendingCoords || !targetTripId) return;

		newPinSaving = true;
		try {
			await itinerary.create(targetTripId, {
				title: newPinTitle.trim(),
				date: newPinDate || undefined,
				location: {
					name: t('map_pin_name', {
						lat: pendingCoords.lat.toFixed(4),
						lng: pendingCoords.lng.toFixed(4)
					}),
					lat: pendingCoords.lat,
					lng: pendingCoords.lng
				}
			});

			toast.success(t('pin_added'));
			addModalOpen = false;
			newPinTitle = '';
			pendingCoords = null;
			if (onchanged) onchanged();
		} catch {
			toast.error(t('could_not_save_pin'));
		} finally {
			newPinSaving = false;
		}
	}
</script>

<div
	class={`my-4 overflow-hidden rounded-xl border border-border bg-surface shadow-soft transition-all duration-300 ${
		isExpanded ? 'fixed inset-4 z-[60] my-0 flex flex-col shadow-sheet' : ''
	}`}
>
	<!-- Header bar -->
	<div
		class="flex items-center justify-between gap-2 border-b border-border bg-surface-sunken/80 px-3 py-2.5 sm:px-4 sm:py-3"
	>
		<div class="flex min-w-0 flex-1 items-center space-x-2">
			<span
				class="grid size-7 shrink-0 place-items-center rounded-md bg-primary-100 text-primary-700"
			>
				<Compass class="h-4 w-4" />
			</span>
			<div class="min-w-0 flex-1">
				<h3 class="truncate font-serif text-sm font-semibold text-ink">{t('itinerary_map')}</h3>
				<p class="truncate text-[11px] text-ink-muted">
					{locations.length > 0
						? t('map_pins_count', { n: String(locations.length) })
						: destination
							? destination
							: t('map_hint')}
				</p>
			</div>
		</div>

		<div class="flex shrink-0 items-center space-x-1 sm:space-x-1.5">
			<button
				type="button"
				onclick={downloadOfflineMap}
				disabled={downloadingOffline}
				class="inline-flex min-h-touch items-center space-x-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken disabled:opacity-50 sm:px-2.5"
				title={t('download_offline_map')}
			>
				<CloudDownload class="h-3.5 w-3.5 text-primary-600" />
				<span class="hidden sm:inline"
					>{downloadingOffline ? t('downloading') : t('offline_map')}</span
				>
			</button>

			<button
				type="button"
				onclick={() => (isDroppingPin = !isDroppingPin)}
				class={`inline-flex min-h-touch items-center space-x-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-2.5 ${
					isDroppingPin
						? 'bg-accent-terracotta text-white'
						: 'border border-border bg-surface text-ink hover:bg-surface-sunken'
				}`}
				title={t('drop_pin')}
			>
				<Plus class="h-3.5 w-3.5" />
				<span class="hidden sm:inline">{isDroppingPin ? t('click_map') : t('drop_pin')}</span>
			</button>

			<a
				href={resolve('/settings')}
				class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-ink"
				title={t('map_settings')}
			>
				<SettingsIcon class="h-4 w-4" />
			</a>

			<button
				type="button"
				onclick={() => (isExpanded = !isExpanded)}
				class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-ink"
				title={isExpanded ? t('minimize_map') : t('fullscreen_map')}
			>
				{#if isExpanded}
					<Minimize2 class="h-4 w-4" />
				{:else}
					<Maximize2 class="h-4 w-4" />
				{/if}
			</button>

			<button
				type="button"
				onclick={() => (isCollapsed = !isCollapsed)}
				class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-ink"
				title={isCollapsed ? t('expand_section') : t('collapse_section')}
			>
				{#if isCollapsed}
					<ChevronDown class="h-4 w-4" />
				{:else}
					<ChevronUp class="h-4 w-4" />
				{/if}
			</button>
		</div>
	</div>

	{#if !isCollapsed}
		<!--
			The inline map is viewport-clamped: a flat 20rem is over 80% of a phone
			held in landscape. `min()` keeps it at exactly 20rem on any desktop
			viewport (45dvh only binds below ~711px of height). The expanded path is
			left alone — it is `fixed inset-4` and fills through `flex-1`.
		-->
		<div
			class={`relative w-full ${
				isExpanded ? 'flex-1' : heightClass
			} flex flex-col bg-surface-sunken`}
		>
			<div
				bind:this={mapContainer}
				class={`z-0 h-full w-full ${isDroppingPin ? 'cursor-crosshair' : ''}`}
			></div>

			{#if !mapLoaded && !mapError}
				<div
					class="absolute inset-0 z-10 flex items-center justify-center space-x-2 bg-surface/80 text-xs text-ink-muted"
				>
					<svg class="h-4 w-4 animate-spin text-primary-600" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					<span>{t('loading')}</span>
				</div>
			{/if}

			{#if locations.length > 0}
				<div
					class="scrollbar-none z-10 flex items-center space-x-2 overflow-x-auto border-t border-border bg-surface/95 px-3 py-2 backdrop-blur"
				>
					<span class="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-muted"
						>{t('map_pins_label')}</span
					>
					{#each locations as item (item.id)}
						<button
							type="button"
							onclick={() => focusLocation(item.index)}
							class={`inline-flex shrink-0 items-center space-x-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
								selectedIndex === item.index
									? 'border-primary-600 bg-primary-600 text-white shadow-sm ring-2 ring-primary-100'
									: 'border-border bg-surface text-ink hover:bg-surface-sunken'
							}`}
						>
							<span
								class="flex h-4 w-4 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700"
							>
								{item.index}
							</span>
							<span class="max-w-[120px] truncate">{item.title}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Modal for creating activity from dropped pin -->
<Dialog bind:open={addModalOpen} title={t('add_pin_title')}>
	<div class="space-y-4 text-sm">
		<p class="text-xs text-ink-muted">
			{#if pendingCoords}
				<span class="font-mono font-semibold text-primary-700">
					({pendingCoords.lat.toFixed(4)}, {pendingCoords.lng.toFixed(4)})
				</span>
			{/if}
		</p>

		<Field label={t('activity_title')} required>
			<input
				type="text"
				value={newPinTitle}
				oninput={(e) => (newPinTitle = e.currentTarget.value)}
				placeholder={t('map_pin_title_placeholder')}
				class="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-ink shadow-sm transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30"
			/>
		</Field>

		<Field label={`${t('days')} (${t('optional')})`}>
			<input
				type="date"
				value={newPinDate}
				oninput={(e) => (newPinDate = e.currentTarget.value)}
				class="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-ink shadow-sm transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30"
			/>
		</Field>

		<div class="flex justify-end space-x-2 pt-2">
			<Button variant="ghost" onclick={() => (addModalOpen = false)}>{t('cancel')}</Button>
			<Button disabled={!newPinTitle.trim() || newPinSaving} onclick={handleSaveNewPin}>
				{newPinSaving ? t('saving') : t('save')}
			</Button>
		</div>
	</div>
</Dialog>

<style>
	/*
	 * The marker div is created by Leaflet, so a scoped selector cannot reach it.
	 * Only the ring is added: transforming the icon would fight Leaflet's own
	 * positioning transform and move the pin off its coordinates.
	 */
	:global(.itinera-pin-selected .pin-dot) {
		box-shadow: 0 0 0 3px rgb(var(--color-primary-200-rgb));
	}
</style>
