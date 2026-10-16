/**
 * Which kind of browser is holding the database, and whether anything is
 * holding on to it.
 *
 * This exists for one reason. Itinera keeps every trip in IndexedDB on the
 * device, and Safari evicts a site's storage after seven days without a visit —
 * unless the site is installed to the home screen, in which case it is treated
 * as an app and kept. A user who plans a trip in January and opens the app at
 * the airport in March finds nothing, and there is no way for them to have
 * known: no error, no warning, just an empty list. Chrome and Firefox do not do
 * this, so the warning has to be specific to iOS or it is noise everywhere else.
 *
 * Pure and parameterised rather than reading globals directly, so the cases
 * that only occur on someone else's phone are testable here.
 */

export interface PlatformEnv {
	userAgent: string;
	/** `navigator.maxTouchPoints`; iPadOS 13+ reports a desktop user agent. */
	maxTouchPoints?: number;
	/** `matchMedia('(display-mode: standalone)').matches` */
	displayModeStandalone?: boolean;
	/** `navigator.standalone` — the Safari-only equivalent. */
	navigatorStandalone?: boolean;
}

export function readEnv(): PlatformEnv {
	if (typeof navigator === 'undefined') return { userAgent: '' };
	const nav = navigator as Navigator & { standalone?: boolean };
	return {
		userAgent: nav.userAgent ?? '',
		maxTouchPoints: nav.maxTouchPoints,
		displayModeStandalone:
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(display-mode: standalone)').matches,
		navigatorStandalone: nav.standalone === true
	};
}

/**
 * iOS or iPadOS, including the iPad pretending to be a Mac.
 *
 * Since iPadOS 13 an iPad sends a macOS user agent, so `Macintosh` plus a touch
 * screen is the only way to tell it apart from a laptop. Getting this wrong in
 * either direction is bad: a false negative loses the warning on the device
 * that needs it, a false positive nags a desktop user forever.
 */
export function isIos(env: PlatformEnv): boolean {
	const ua = env.userAgent;
	if (/iPhone|iPod/.test(ua)) return true;
	if (/iPad/.test(ua)) return true;
	return /Macintosh/.test(ua) && (env.maxTouchPoints ?? 0) > 1;
}

/** Running as an installed app rather than in a browser tab. */
export function isStandalone(env: PlatformEnv): boolean {
	return env.displayModeStandalone === true || env.navigatorStandalone === true;
}

/**
 * Whether to tell the user their data can be evicted.
 *
 * Only iOS, only in a tab, and only once the trip database is on the device —
 * a first-time visitor reading an empty list has nothing to lose yet, and the
 * prompt would be the first thing they ever see.
 */
export function shouldWarnAboutEviction(env: PlatformEnv, hasLocalData: boolean): boolean {
	return isIos(env) && !isStandalone(env) && hasLocalData;
}
