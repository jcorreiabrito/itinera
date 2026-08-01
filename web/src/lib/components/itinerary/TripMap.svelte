<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { itinerary, type ItineraryItem } from '$lib/db';
  import { MapPin, Maximize2, Minimize2, ChevronUp, ChevronDown, Compass, Play, Square, Plus } from 'lucide-svelte';
  import { toast, Dialog, Button, Input, Field } from '$lib/components/ui';

  let {
    items = [],
    destination = '',
    tripId = '',
    onchanged,
  }: {
    items?: ItineraryItem[];
    destination?: string;
    tripId?: string;
    onchanged?: () => void;
  } = $props();

  let mapContainer = $state<HTMLDivElement | null>(null);
  let mapLoaded = $state(false);
  let mapError = $state(false);
  let isExpanded = $state(false);
  let isCollapsed = $state(false);
  let selectedIndex = $state<number | null>(null);

  // Quick Add Pin Dialog State
  let addModalOpen = $state(false);
  let isDroppingPin = $state(false);
  let pendingCoords = $state<{ lat: number; lng: number } | null>(null);
  let newPinTitle = $state('');
  let newPinDate = $state('');
  let newPinSaving = $state(false);

  // Route animation state
  let isAnimating = $state(false);
  let animProgress = $state(0);
  let animFrameId: number | null = null;
  let animMarker: any = null;

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
          title: i.title || 'Activity',
          locationName: name || address || 'Location',
          lat,
          lng,
          startTime: i.startTime,
          date: i.date,
          notes: i.notes,
        };
      })
  );

  let leafMap: L.Map | null = null;
  let polylineLayer: L.Polyline | null = null;
  let markersMap: Map<number, { marker: L.Marker; coords: [number, number] }> = new Map();

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
    sydney: [-33.8688, 151.2093],
  };

  function getCachedCoord(locStr: string): [number, number] | null {
    if (typeof localStorage === 'undefined' || !locStr) return null;
    try {
      const cached = localStorage.getItem(`itinera_geo_${locStr.toLowerCase()}`);
      if (cached) return JSON.parse(cached);
    } catch {}

    const key = Object.keys(CITY_COORDS).find((c) => locStr.toLowerCase().includes(c));
    return key ? CITY_COORDS[key] : null;
  }

  function setCachedCoord(locStr: string, coords: [number, number]) {
    if (typeof localStorage === 'undefined' || !locStr) return;
    try {
      localStorage.setItem(`itinera_geo_${locStr.toLowerCase()}`, JSON.stringify(coords));
    } catch {}
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
    } catch (e) {
      console.warn('Geocoding failed/offline for:', locStr);
    }
    return null;
  }

  onMount(() => {
    if (typeof window === 'undefined' || !mapContainer) return;
    initMap();
  });

  onDestroy(() => {
    stopRouteAnimation();
    if (leafMap) {
      leafMap.remove();
      leafMap = null;
    }
  });

  async function initMap() {
    if (!mapContainer) return;

    try {
      leafMap = L.map(mapContainer, {
        zoomControl: false,
        attributionControl: false,
      }).setView([20, 0], 2);

      L.control.zoom({ position: 'bottomright' }).addTo(leafMap);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(leafMap);

      // Handle map clicks for "Drop Pin" feature
      leafMap.on('click', (e: L.LeafletMouseEvent) => {
        if (isDroppingPin) {
          pendingCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
          addModalOpen = true;
          isDroppingPin = false;
        }
      });

      mapLoaded = true;
      await refreshMarkers();
    } catch (err) {
      console.error('Failed to initialize map', err);
      mapError = true;
    }
  }

  async function refreshMarkers() {
    if (!leafMap) return;

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
        if (coords && loc.item) {
          // Persist back to PouchDB so it syncs across devices
          const existingLoc = typeof loc.item.location === 'object' ? loc.item.location : { name: loc.locationName };
          itinerary.update(loc.item._id, {
            location: { ...existingLoc, lat: coords[0], lng: coords[1] },
          }).catch(() => {});
          // Polite rate limit for Nominatim
          await new Promise((r) => setTimeout(r, 1100));
        }
      }

      if (coords) {
        const pinIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div class="group relative flex items-center justify-center">
              <div class="h-8 w-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xs shadow-card ring-2 ring-surface border border-white transform transition-transform group-hover:scale-110">
                ${loc.index}
              </div>
              <div class="absolute -bottom-1 w-2 h-2 bg-primary-600 rotate-45 border-r border-b border-white"></div>
            </div>
          `,
          iconSize: [32, 36],
          iconAnchor: [16, 36],
          popupAnchor: [0, -32],
        });

        const popupContent = `
          <div class="p-1 max-w-xs font-sans">
            <div class="flex items-center space-x-1 text-xs font-semibold text-primary-700 uppercase tracking-wider mb-1">
              <span>Pin #${loc.index}</span>
              ${loc.startTime ? `<span>• ${loc.startTime}</span>` : ''}
            </div>
            <h4 class="font-serif font-bold text-ink text-sm mb-1">${loc.title}</h4>
            <p class="text-xs text-ink-muted flex items-center gap-1 mb-1">
              Location: ${loc.locationName}
            </p>
            ${loc.notes ? `<p class="text-xs text-ink/80 italic bg-surface-sunken p-1.5 rounded mt-1">${loc.notes}</p>` : ''}
          </div>
        `;

        const marker = L.marker(coords, { icon: pinIcon })
          .addTo(leafMap)
          .bindPopup(popupContent);

        marker.on('click', () => {
          selectedIndex = loc.index;
        });

        markersMap.set(loc.index, { marker, coords });
        bounds.push(coords);
      }
    }

    if (bounds.length > 0) {
      // Draw chronological travel route polyline
      polylineLayer = L.polyline(bounds, {
        color: '#2f6b4f',
        weight: 3,
        opacity: 0.7,
        dashArray: '6, 8',
      }).addTo(leafMap);

      if (bounds.length === 1) {
        leafMap.setView(bounds[0], 13);
      } else {
        leafMap.fitBounds(bounds, { padding: [40, 40] });
      }
    } else if (destination) {
      const destCoords = await geocode(destination);
      if (destCoords && leafMap) {
        leafMap.setView(destCoords, 11);
      }
    }
  }

  function focusLocation(idx: number) {
    selectedIndex = idx;
    const entry = markersMap.get(idx);
    if (entry && leafMap) {
      leafMap.flyTo(entry.coords, 14, { duration: 1.2 });
      entry.marker.openPopup();
    }
  }

  function startRouteAnimation() {
    const coordsList = Array.from(markersMap.values()).map((e) => e.coords);
    if (coordsList.length < 2 || !leafMap) {
      toast.error('At least 2 mapped locations are required to animate a route.');
      return;
    }

    stopRouteAnimation();
    isAnimating = true;

    const planeIcon = L.divIcon({
      className: 'animated-plane-icon',
      html: `<div class="text-2xl transform -translate-x-1/2 -translate-y-1/2">✈️</div>`,
      iconSize: [24, 24],
    });

    animMarker = L.marker(coordsList[0], { icon: planeIcon }).addTo(leafMap);

    let segmentIdx = 0;
    let step = 0;
    const stepsPerSegment = 60;

    function animateStep() {
      if (!isAnimating || segmentIdx >= coordsList.length - 1) {
        stopRouteAnimation();
        return;
      }

      const p1 = coordsList[segmentIdx];
      const p2 = coordsList[segmentIdx + 1];

      const lat = p1[0] + (p2[0] - p1[0]) * (step / stepsPerSegment);
      const lng = p1[1] + (p2[1] - p1[1]) * (step / stepsPerSegment);

      if (animMarker) animMarker.setLatLng([lat, lng]);

      step++;
      if (step > stepsPerSegment) {
        step = 0;
        segmentIdx++;
      }

      animFrameId = requestAnimationFrame(animateStep);
    }

    animFrameId = requestAnimationFrame(animateStep);
  }

  function stopRouteAnimation() {
    isAnimating = false;
    if (animFrameId != null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (animMarker) {
      animMarker.remove();
      animMarker = null;
    }
  }

  async function handleSaveNewPin() {
    const rawTripId = tripId || items[0]?.tripid || (items[0] as any)?.tripId;
    const targetTripId = typeof rawTripId === 'string' ? rawTripId : '';
    if (!newPinTitle.trim() || !pendingCoords || !targetTripId) return;

    newPinSaving = true;
    try {
      await itinerary.create(targetTripId, {
        title: newPinTitle.trim(),
        date: newPinDate || undefined,
        location: {
          name: `Pin (${pendingCoords.lat.toFixed(4)}, ${pendingCoords.lng.toFixed(4)})`,
          lat: pendingCoords.lat,
          lng: pendingCoords.lng,
        },
      });

      toast.success('Added new itinerary item from map pin!');
      addModalOpen = false;
      newPinTitle = '';
      pendingCoords = null;
      if (onchanged) onchanged();
    } catch {
      toast.error('Could not save map pin activity.');
    } finally {
      newPinSaving = false;
    }
  }
</script>

<div
  class={`rounded-xl border border-border bg-surface overflow-hidden shadow-soft transition-all duration-300 my-4 ${
    isExpanded ? 'fixed inset-4 z-50 my-0 shadow-sheet flex flex-col' : ''
  }`}
>
  <!-- Header bar -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-sunken/80">
    <div class="flex items-center space-x-2">
      <span class="grid size-7 place-items-center rounded-md bg-primary-100 text-primary-700">
        <Compass class="h-4 w-4" />
      </span>
      <div>
        <h3 class="font-serif text-sm font-semibold text-ink">Itinerary Map</h3>
        <p class="text-[11px] text-ink-muted">
          {locations.length > 0
            ? `${locations.length} pinned destination(s)`
            : destination
              ? `Centred on ${destination}`
              : 'Add locations to itinerary items to view pins'}
        </p>
      </div>
    </div>

    <div class="flex items-center space-x-1">
      <button
        type="button"
        onclick={() => (isDroppingPin = !isDroppingPin)}
        class={`inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
          isDroppingPin
            ? 'bg-accent-terracotta text-white'
            : 'bg-surface text-ink border border-border hover:bg-surface-sunken'
        }`}
        title="Click anywhere on the map to drop a new itinerary pin"
      >
        <Plus class="h-3.5 w-3.5" />
        <span>{isDroppingPin ? 'Click Map...' : 'Drop Pin'}</span>
      </button>

      {#if locations.length >= 2}
        <button
          type="button"
          onclick={() => (isAnimating ? stopRouteAnimation() : startRouteAnimation())}
          class={`inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            isAnimating
              ? 'bg-amber-600 text-white'
              : 'bg-surface text-primary-700 border border-border hover:bg-surface-sunken'
          }`}
          title="Animate Indiana Jones style route polyline"
        >
          {#if isAnimating}
            <Square class="h-3.5 w-3.5" />
            <span>Stop</span>
          {:else}
            <Play class="h-3.5 w-3.5" />
            <span>Animate Route</span>
          {/if}
        </button>
      {/if}

      <button
        type="button"
        onclick={() => (isExpanded = !isExpanded)}
        class="grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-ink transition-colors"
        title={isExpanded ? 'Minimize map' : 'Fullscreen map'}
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
        class="grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-ink transition-colors"
        title={isCollapsed ? 'Expand section' : 'Collapse section'}
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
    <div class={`relative w-full ${isExpanded ? 'flex-1' : 'h-80'} bg-surface-sunken flex flex-col`}>
      <div bind:this={mapContainer} class={`w-full h-full z-0 ${isDroppingPin ? 'cursor-crosshair' : ''}`}></div>

      {#if !mapLoaded && !mapError}
        <div class="absolute inset-0 flex items-center justify-center bg-surface/80 text-xs text-ink-muted space-x-2 z-10">
          <svg class="animate-spin h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading map & location markers...</span>
        </div>
      {/if}

      {#if locations.length > 0}
        <div class="z-10 border-t border-border bg-surface/95 backdrop-blur px-3 py-2 overflow-x-auto flex items-center space-x-2 scrollbar-none">
          <span class="text-[11px] font-semibold text-ink-muted uppercase tracking-wider shrink-0">Pins:</span>
          {#each locations as item (item.id)}
            <button
              type="button"
              onclick={() => focusLocation(item.index)}
              class={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 border ${
                selectedIndex === item.index
                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm ring-2 ring-primary-100'
                  : 'bg-surface text-ink border-border hover:bg-surface-sunken'
              }`}
            >
              <span class="w-4 h-4 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center">
                {item.index}
              </span>
              <span class="truncate max-w-[120px]">{item.title}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Modal for creating activity from dropped pin -->
<Dialog bind:open={addModalOpen} title="Add Activity at Map Location">
  <div class="space-y-4 text-sm">
    <p class="text-ink-muted text-xs">
      Creating a new activity pin at coordinates:
      {#if pendingCoords}
        <span class="font-mono font-semibold text-primary-700">
          {pendingCoords.lat.toFixed(4)}, {pendingCoords.lng.toFixed(4)}
        </span>
      {/if}
    </p>

    <Field label="Activity Title" required>
      <input
        type="text"
        value={newPinTitle}
        oninput={(e) => (newPinTitle = e.currentTarget.value)}
        placeholder="e.g. Scenic Overlook Stop"
        class="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-ink shadow-sm transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30"
      />
    </Field>

    <Field label="Date (Optional)">
      <input
        type="date"
        value={newPinDate}
        oninput={(e) => (newPinDate = e.currentTarget.value)}
        class="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-ink shadow-sm transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30"
      />
    </Field>

    <div class="flex justify-end space-x-2 pt-2">
      <Button variant="ghost" onclick={() => (addModalOpen = false)}>Cancel</Button>
      <Button disabled={!newPinTitle.trim() || newPinSaving} onclick={handleSaveNewPin}>
        {newPinSaving ? 'Saving...' : 'Add Map Pin'}
      </Button>
    </div>
  </div>
</Dialog>
