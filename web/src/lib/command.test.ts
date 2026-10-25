import { describe, expect, it } from 'vitest';
import {
	COMMAND_GROUP_ORDER,
	fuzzyScore,
	groupCommands,
	matchCommands,
	normalize,
	orderByRecents,
	scoreCommand,
	tripCommandId,
	tripCommands,
	tripSectionCommands,
	type Command
} from './command';

const command = (partial: Partial<Command> & Pick<Command, 'id' | 'group' | 'label'>): Command => ({
	href: `/${partial.id}`,
	...partial
});

const scored = (text: string, query: string): number => {
	const value = fuzzyScore(text, query);
	expect(value, `${text} should match ${query}`).not.toBeNull();
	return value as number;
};

describe('normalize', () => {
	it('lowercases', () => {
		expect(normalize('Lisbon')).toBe('lisbon');
	});

	it('strips Portuguese accents in both directions', () => {
		expect(normalize('São Paulo')).toBe('sao paulo');
		expect(normalize('AÇÃO')).toBe('acao');
		expect(normalize('Bragança')).toBe('braganca');
	});

	it('strips the marks from other Latin scripts too', () => {
		expect(normalize('Añadir')).toBe('anadir');
	});
});

describe('fuzzyScore', () => {
	it('treats an empty query as a match for everything', () => {
		expect(fuzzyScore('anything', '')).toBe(0);
		expect(fuzzyScore('anything', '   ')).toBe(0);
	});

	it('ignores case', () => {
		expect(scored('Lisbon', 'LIS')).toBe(scored('Lisbon', 'lis'));
	});

	it('matches accented text from an unaccented query and the reverse', () => {
		expect(scored('São Paulo', 'sao')).toBeGreaterThan(0);
		expect(scored('Sao Paulo', 'são')).toBeGreaterThan(0);
	});

	it('ranks a prefix above a word start above a buried substring', () => {
		const prefix = scored('Trip to Porto', 'trip');
		const wordStart = scored('My trip', 'trip');
		const substring = scored('Roundtrip', 'trip');

		expect(prefix).toBeGreaterThan(wordStart);
		expect(wordStart).toBeGreaterThan(substring);
	});

	it('prefers a shorter title when the tier is the same', () => {
		expect(scored('Trip', 'trip')).toBeGreaterThan(scored('Trip to Porto', 'trip'));
	});

	it('accepts a scattered subsequence as a last resort', () => {
		const scattered = scored('Barcelona', 'brc');
		expect(scattered).toBeGreaterThan(0);
		expect(scattered).toBeLessThan(scored('Barcelona', 'barc'));
	});

	it('returns null when nothing matches', () => {
		expect(fuzzyScore('Lisbon', 'xyz')).toBeNull();
	});
});

describe('scoreCommand', () => {
	it('searches hidden keywords as well as the label', () => {
		const preferences = command({
			id: 'settings',
			group: 'actions',
			label: 'Preferences',
			keywords: ['settings']
		});
		expect(scoreCommand(preferences, 'settings')).not.toBeNull();
	});

	it('keeps a keyword match just below the same match on the label', () => {
		const byLabel = command({ id: 'a', group: 'actions', label: 'Settings' });
		const byKeyword = command({
			id: 'b',
			group: 'actions',
			label: 'Preferences',
			keywords: ['settings']
		});

		const ranked = matchCommands([byKeyword, byLabel], 'settings');
		expect(ranked.map((entry) => entry.id)).toEqual(['a', 'b']);
	});
});

describe('matchCommands', () => {
	const commands: Command[] = [
		command({ id: 'new-trip', group: 'actions', label: 'New trip' }),
		command({ id: 'porto', group: 'trips', label: 'Trip to Porto' }),
		command({ id: 'weekend', group: 'trips', label: 'Weekend trip' })
	];

	it('returns every command untouched for an empty query', () => {
		expect(matchCommands(commands, '').map((entry) => entry.id)).toEqual([
			'new-trip',
			'porto',
			'weekend'
		]);
		expect(matchCommands(commands, '  ').map((entry) => entry.id)).toEqual([
			'new-trip',
			'porto',
			'weekend'
		]);
	});

	it('puts a prefix match before a word-start match', () => {
		expect(matchCommands(commands, 'trip').map((entry) => entry.id)).toEqual([
			'porto',
			'new-trip',
			'weekend'
		]);
	});

	it('is case and accent insensitive', () => {
		const accented = [command({ id: 'sao', group: 'trips', label: 'São Paulo' })];
		expect(matchCommands(accented, 'SAO').map((entry) => entry.id)).toEqual(['sao']);
	});

	it('keeps declaration order when scores tie', () => {
		const tied = [
			command({ id: 'one', group: 'trips', label: 'Trip one' }),
			command({ id: 'two', group: 'trips', label: 'Trip two' })
		];
		expect(matchCommands(tied, 'trip').map((entry) => entry.id)).toEqual(['one', 'two']);
	});

	it('drops commands that do not match', () => {
		expect(matchCommands(commands, 'lisbon')).toEqual([]);
	});
});

describe('groupCommands', () => {
	it('uses the fixed group order and omits empty groups', () => {
		const grouped = groupCommands([
			command({ id: 'theme', group: 'actions', label: 'Toggle theme' }),
			command({ id: 'porto', group: 'trips', label: 'Porto' })
		]);

		expect(COMMAND_GROUP_ORDER).toEqual(['trips', 'trip', 'actions']);
		expect(grouped.map((section) => section.group)).toEqual(['trips', 'actions']);
	});

	it('preserves match rank inside each group', () => {
		const ranked = matchCommands(
			[
				command({ id: 'weekend', group: 'trips', label: 'Weekend trip' }),
				command({ id: 'porto', group: 'trips', label: 'Trip to Porto' })
			],
			'trip'
		);
		const grouped = groupCommands(ranked);
		expect(grouped[0].commands.map((entry) => entry.id)).toEqual(['porto', 'weekend']);
	});
});

describe('orderByRecents', () => {
	const commands: Command[] = [
		command({ id: 'a', group: 'actions', label: 'A' }),
		command({ id: 'b', group: 'actions', label: 'B' }),
		command({ id: 'c', group: 'actions', label: 'C' })
	];

	it('moves recent commands to the front in recency order', () => {
		expect(orderByRecents(commands, ['c', 'a']).map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
	});

	it('leaves everything alone with no recents', () => {
		expect(orderByRecents(commands, []).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
	});

	it('ignores recents that are no longer in the list', () => {
		expect(orderByRecents(commands, ['gone', 'b']).map((entry) => entry.id)).toEqual([
			'b',
			'a',
			'c'
		]);
	});
});

describe('command builders', () => {
	it('builds a trip command with the stable id the palette remembers', () => {
		const built = tripCommands(
			[{ id: 'abc', title: 'Porto', hint: '12-19 Sep', keywords: ['Portugal'] }],
			(id) => `/trip/${id}/overview`
		);

		expect(built).toEqual([
			{
				id: 'trip:abc',
				group: 'trips',
				label: 'Porto',
				hint: '12-19 Sep',
				keywords: ['Portugal'],
				href: '/trip/abc/overview'
			}
		]);
		expect(tripCommandId('abc')).toBe('trip:abc');
	});

	it('builds this-trip section commands scoped to the trip', () => {
		const built = tripSectionCommands('abc', [
			{ id: 'costs', label: 'Costs', href: '/trip/abc/costs', keywords: ['costs'] }
		]);

		expect(built).toEqual([
			{
				id: 'section:abc:costs',
				group: 'trip',
				label: 'Costs',
				keywords: ['costs'],
				href: '/trip/abc/costs'
			}
		]);
	});
});
