import { describe, expect, it } from 'vitest';
import { fieldEntries, parseConfirmation } from './parse-confirmation';

/**
 * Ten confirmations of the shapes people actually forward to themselves: two
 * hotel chains, an Airbnb, an airline e-ticket and a restaurant, plus the
 * ambiguous and negative cases where guessing would do damage.
 */

const HOTEL_EMAIL = `Subject: Your stay at Hotel Artemide is confirmed

Hotel: Hotel Artemide
Address:   Via   Nazionale   22,   00184 Roma, Italy
Phone: +39 06 4815 1234
Confirmation number: HTL-884213

Check-in: 12 Sep 2026
Check-out: 15 Sep 2026
Check-in time: 3:00 PM
Check-out time: 11:00 AM
We look forward to welcoming you.`;

const BOOKING_COM = `Booking.com
Booking confirmation
Property: Hotel Colosseum
Address: Via Sforza 10, 00184 Rome, Italy
Check-in: 12 September 2026
Check-out: 15 September 2026
Confirmation number: 48219305
Phone: +39 06 487 2749
Total: €420
Free cancellation until 5 Sep 2026.`;

const AIRBNB = `Airbnb
Reservation confirmed
Listing: Sunny loft in Trastevere
Address revealed: Via della Lungaretta 45, 00153 Roma, Italy
Check-in: Sep 12, 2026
Check-out: Sep 15, 2026
Check-in time: 3:00 PM
Check-out time: 11:00 AM
Confirmation code: HM8K2P`;

const ETICKET = `e-Ticket Itinerary
Airline: TAP Air Portugal
Passenger: Jane Doe
Flight: TP1234
From: Lisbon (LIS)
To: Rome Fiumicino (FCO)
Date: 12 Sep 2026
Departure: 08:25
Arrival: 11:10
Booking reference: QX7T2M`;

const RESTAURANT = `Restaurant: Osteria da Enzo
Reservation for 4 on 12 Sep 2026 at 7:30 PM
Address: Via dei Vascellari 12, 00153 Roma
Phone: +39 06 588 0123`;

describe('parseConfirmation', () => {
	it('reads a hotel email: dates, times, address, phone and confirmation code', () => {
		const parsed = parseConfirmation(HOTEL_EMAIL);

		expect(parsed.name).toEqual({ value: 'Hotel Artemide', confidence: 'high' });
		expect(parsed.address).toEqual({
			value: 'Via Nazionale 22, 00184 Roma, Italy',
			confidence: 'high'
		});
		expect(parsed.phone).toEqual({ value: '+39 06 4815 1234', confidence: 'high' });
		expect(parsed.bookingRef).toEqual({ value: 'HTL-884213', confidence: 'high' });
		expect(parsed.startDate).toEqual({ value: '2026-09-12', confidence: 'high' });
		expect(parsed.endDate).toEqual({ value: '2026-09-15', confidence: 'high' });
		expect(parsed.startTime).toEqual({ value: '15:00', confidence: 'high' });
		expect(parsed.endTime).toEqual({ value: '11:00', confidence: 'high' });
		expect(parsed.unparsed).toEqual(['We look forward to welcoming you.']);
	});

	it('reads a Booking.com confirmation and leaves marketing lines unparsed', () => {
		const parsed = parseConfirmation(BOOKING_COM);

		expect(parsed.name).toEqual({ value: 'Hotel Colosseum', confidence: 'high' });
		expect(parsed.address).toEqual({
			value: 'Via Sforza 10, 00184 Rome, Italy',
			confidence: 'high'
		});
		expect(parsed.phone).toEqual({ value: '+39 06 487 2749', confidence: 'high' });
		expect(parsed.bookingRef).toEqual({ value: '48219305', confidence: 'high' });
		expect(parsed.startDate).toEqual({ value: '2026-09-12', confidence: 'high' });
		expect(parsed.endDate).toEqual({ value: '2026-09-15', confidence: 'high' });
		expect(parsed.startTime).toBeUndefined();
		expect(parsed.endTime).toBeUndefined();
		// The "cancel until" date is unlabelled: ignored, not guessed into a field.
		expect(parsed.unparsed).toEqual([
			'Booking.com',
			'Booking confirmation',
			'Total: €420',
			'Free cancellation until 5 Sep 2026.'
		]);
	});

	it('reads an Airbnb confirmation with a revealed address and 12h times', () => {
		const parsed = parseConfirmation(AIRBNB);

		expect(parsed.name).toEqual({ value: 'Sunny loft in Trastevere', confidence: 'high' });
		expect(parsed.address).toEqual({
			value: 'Via della Lungaretta 45, 00153 Roma, Italy',
			confidence: 'high'
		});
		expect(parsed.startDate).toEqual({ value: '2026-09-12', confidence: 'high' });
		expect(parsed.endDate).toEqual({ value: '2026-09-15', confidence: 'high' });
		expect(parsed.startTime).toEqual({ value: '15:00', confidence: 'high' });
		expect(parsed.endTime).toEqual({ value: '11:00', confidence: 'high' });
		expect(parsed.bookingRef).toEqual({ value: 'HM8K2P', confidence: 'high' });
		expect(parsed.unparsed).toEqual(['Airbnb', 'Reservation confirmed']);
	});

	it('reads an airline e-ticket: flight number, airports, times and passenger', () => {
		const parsed = parseConfirmation(ETICKET);

		expect(parsed.flightNumber).toEqual({ value: 'TP1234', confidence: 'high' });
		expect(parsed.departureAirport).toEqual({ value: 'LIS', confidence: 'high' });
		expect(parsed.arrivalAirport).toEqual({ value: 'FCO', confidence: 'high' });
		expect(parsed.passenger).toEqual({ value: 'Jane Doe', confidence: 'high' });
		expect(parsed.bookingRef).toEqual({ value: 'QX7T2M', confidence: 'high' });
		expect(parsed.startDate).toEqual({ value: '2026-09-12', confidence: 'high' });
		expect(parsed.startTime).toEqual({ value: '08:25', confidence: 'high' });
		expect(parsed.endTime).toEqual({ value: '11:10', confidence: 'high' });
		expect(parsed.unparsed).toEqual(['e-Ticket Itinerary', 'Airline: TAP Air Portugal']);
	});

	it('reads a restaurant reservation: party size, date and time', () => {
		const parsed = parseConfirmation(RESTAURANT);

		expect(parsed.name).toEqual({ value: 'Osteria da Enzo', confidence: 'high' });
		expect(parsed.partySize).toEqual({ value: 4, confidence: 'high' });
		expect(parsed.startDate).toEqual({ value: '2026-09-12', confidence: 'medium' });
		expect(parsed.startTime).toEqual({ value: '19:30', confidence: 'medium' });
		expect(parsed.address).toEqual({
			value: 'Via dei Vascellari 12, 00153 Roma',
			confidence: 'high'
		});
		expect(parsed.phone).toEqual({ value: '+39 06 588 0123', confidence: 'high' });
		expect(parsed.unparsed).toEqual([]);
	});

	it('returns no dates for ambiguous slash dates rather than guessing the order', () => {
		const parsed = parseConfirmation(`Hotel: Pensione Roma
Check-in: 12/09/2026
Check-out: 09/12/2026
Confirmation: PEN-55110`);

		expect(parsed.startDate).toBeUndefined();
		expect(parsed.endDate).toBeUndefined();
		expect(parsed.name).toEqual({ value: 'Pensione Roma', confidence: 'high' });
		expect(parsed.bookingRef).toEqual({ value: 'PEN-55110', confidence: 'high' });
		// The date lines were not consumed, so the caller keeps them in the notes.
		expect(parsed.unparsed).toEqual(['Check-in: 12/09/2026', 'Check-out: 09/12/2026']);
	});

	it('reads slash dates when the text states day-first or month-first', () => {
		const dmy = parseConfirmation(`Hotel: Hotel Aurora
Check-in: 12/09/2026 (DD/MM/YYYY)
Check-out: 15/09/2026 (DD/MM/YYYY)`);
		expect(dmy.startDate).toEqual({ value: '2026-09-12', confidence: 'high' });
		expect(dmy.endDate).toEqual({ value: '2026-09-15', confidence: 'high' });

		const mdy = parseConfirmation(`Hotel: Hotel Aurora
Check-in: 09/12/2026 (MM/DD/YYYY)
Check-out: 09/15/2026 (MM/DD/YYYY)`);
		expect(mdy.startDate).toEqual({ value: '2026-09-12', confidence: 'high' });
		expect(mdy.endDate).toEqual({ value: '2026-09-15', confidence: 'high' });
	});

	it('returns nothing for a newsletter with no booking content', () => {
		const text = `Thanks for signing up to our newsletter.
We will send you the best travel deals every week.
See you soon!`;

		expect(parseConfirmation(text)).toEqual({ unparsed: text.split('\n') });
	});

	it('does not mine a flight-sale email for guesses', () => {
		const text = `Your flight to Rome is now cheaper!
Book today and save 20% on your next trip.`;

		expect(parseConfirmation(text)).toEqual({ unparsed: text.split('\n') });
	});

	it('reads ISO dates and attaches a "from" time to check-in', () => {
		const parsed = parseConfirmation(`Hotel: Hotel Gaudi
Check-in: 2026-10-12 from 15:00
Check-out: 2026-10-15
Confirmation: GDI-7712`);

		expect(parsed.name).toEqual({ value: 'Hotel Gaudi', confidence: 'high' });
		expect(parsed.startDate).toEqual({ value: '2026-10-12', confidence: 'high' });
		expect(parsed.startTime).toEqual({ value: '15:00', confidence: 'high' });
		expect(parsed.endDate).toEqual({ value: '2026-10-15', confidence: 'high' });
		expect(parsed.bookingRef).toEqual({ value: 'GDI-7712', confidence: 'high' });
		expect(parsed.unparsed).toEqual([]);
	});

	it('lists fields in display order with numeric party size as text', () => {
		const entries = fieldEntries(parseConfirmation(RESTAURANT));
		expect(entries.map((entry) => entry.key)).toEqual([
			'name',
			'address',
			'phone',
			'startDate',
			'startTime',
			'partySize'
		]);
		expect(entries.find((entry) => entry.key === 'partySize')).toEqual({
			key: 'partySize',
			value: '4',
			confidence: 'high'
		});
	});
});
