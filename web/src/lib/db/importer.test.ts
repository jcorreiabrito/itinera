import { describe, expect, it } from 'vitest';
import { parseAndPrepareTripImport, parseAndPrepareTripUpdateDocs } from './importer';

describe('parseAndPrepareTripImport', () => {
  it('successfully parses and re-IDs the user provided Mexico 2027 trip JSON', () => {
    const userJson = {
      schema: 'itinera.trip-export',
      version: 1,
      exportedAt: '2026-07-22T10:00:00.000Z',
      db: 'itinera',
      tripId: 'trip:MEX2027',
      trip: {
        _id: 'trip:MEX2027',
        type: 'trip',
        title: 'Viagem para o México com a Ana',
        startDate: '2027-03-13',
        endDate: '2027-03-21',
        homeCurrency: 'BRL',
        primaryTimezone: 'America/Mexico_City',
        destinations: [
          {
            name: 'Cidade do México',
            country: 'México',
            lat: 19.4326,
            lng: -99.1332,
            arriveDate: '2027-03-13',
            departDate: '2027-03-21'
          }
        ],
        budget: {
          total: 12000,
          byCategory: {
            transport: 4500,
            lodging: 4000,
            food: 2000,
            activities: 1000,
            other: 500
          }
        },
        tags: ['cultura', 'gastronomia', 'arte'],
        notes: 'Roteiro focado em galerias de arte, explorar livrarias independentes e cinema na Cidade do México.',
        archived: false
      },
      documents: {
        tripDay: [
          {
            _id: 'day:MEX2027:2027-03-14',
            type: 'tripDay',
            tripId: 'trip:MEX2027',
            date: '2027-03-14',
            title: 'Cultura e Arte no Centro',
            notes: 'Dia de explorar a arquitetura, o Palacio de Bellas Artes e livrarias locais.'
          }
        ],
        itineraryItem: [
          {
            _id: 'itin:MEX2027:ITEM1',
            type: 'itineraryItem',
            tripId: 'trip:MEX2027',
            date: '2027-03-14',
            allDay: false,
            startTime: '10:00',
            endTime: '13:00',
            title: 'Palacio de Bellas Artes e Livrarias de Rua',
            category: 'sightseeing',
            location: {
              name: 'Palacio de Bellas Artes',
              address: 'Av. Juárez S/N, Centro Histórico, CDMX',
              lat: 19.4352,
              lng: -99.1412
            },
            notes: 'Visitar as exposições de arte e depois caminhar pelas ruas próximas buscando livrarias independentes.',
            estCost: 150,
            currency: 'MXN'
          },
          {
            _id: 'itin:MEX2027:ITEM2',
            type: 'itineraryItem',
            tripId: 'trip:MEX2027',
            date: '2027-03-15',
            allDay: false,
            startTime: '19:00',
            endTime: '22:00',
            title: 'Cineteca Nacional',
            category: 'activities',
            location: {
              name: 'Cineteca Nacional',
              address: 'Av. México Coyoacán 389, Xoco, CDMX',
              lat: 19.3607,
              lng: -99.1636
            },
            notes: 'Assistir a um filme e aproveitar os cafés e o ambiente cultural do local.',
            estCost: 120,
            currency: 'MXN'
          }
        ],
        flight: [
          {
            _id: 'flt:MEX2027:FLT1',
            type: 'flight',
            tripId: 'trip:MEX2027',
            bookingRef: 'PENDING',
            checkInUrl: 'https://latam.com/checkin',
            segments: [
              {
                airline: 'LATAM Airlines',
                flightNumber: 'LA8112',
                from: {
                  code: 'GRU',
                  name: 'Aeroporto Internacional de Guarulhos',
                  city: 'São Paulo',
                  tz: 'America/Sao_Paulo'
                },
                to: {
                  code: 'MEX',
                  name: 'Aeroporto Internacional Benito Juárez',
                  city: 'Cidade do México',
                  tz: 'America/Mexico_City'
                },
                departLocal: '2027-03-13T23:55:00',
                arriveLocal: '2027-03-14T06:30:00',
                seat: 'TBD',
                terminal: '3'
              }
            ],
            cost: 2500,
            currency: 'BRL',
            attachmentIds: []
          }
        ],
        reservation: [
          {
            _id: 'res:MEX2027:RES1',
            type: 'reservation',
            tripId: 'trip:MEX2027',
            kind: 'lodging',
            name: 'Hotel em Roma Norte',
            location: {
              name: 'Bairro Roma Norte',
              address: 'Roma Norte, Cuauhtémoc, CDMX',
              lat: 19.4194,
              lng: -99.1596
            },
            start: '2027-03-14T14:00:00',
            end: '2027-03-21T11:00:00',
            confirmation: 'PENDING',
            cost: 15000,
            currency: 'MXN',
            contact: {
              phone: '',
              email: '',
              url: ''
            },
            notes: 'Bairro com excelente caminhabilidade, galerias de arte, cafés e opções gastronômicas variadas.',
            attachmentIds: []
          }
        ],
        expense: [
          {
            _id: 'exp:MEX2027:EXP1',
            type: 'expense',
            tripId: 'trip:MEX2027',
            date: '2027-03-14',
            category: 'food',
            description: 'Jantar em Roma Norte',
            amountEstimate: 800,
            amountActual: null,
            currency: 'MXN',
            paid: false
          }
        ],
        checklistItem: [
          {
            _id: 'chk:MEX2027:CHK1',
            type: 'checklistItem',
            tripId: 'trip:MEX2027',
            text: 'Verificar validade dos passaportes',
            group: 'Documentos',
            done: false,
            important: true
          },
          {
            _id: 'chk:MEX2027:CHK2',
            type: 'checklistItem',
            tripId: 'trip:MEX2027',
            text: 'Garantir restaurantes com opções sem feijão, abacate, carne moída, cenoura ou melancia',
            group: 'Alimentação',
            done: false,
            important: true
          }
        ],
        attachment: []
      },
      counts: {
        tripDay: 1,
        itineraryItem: 2,
        flight: 1,
        reservation: 1,
        expense: 1,
        checklistItem: 2,
        attachment: 0
      },
      attachments: []
    };

    const { newTripId, tripDoc, preparedDocs } = parseAndPrepareTripImport(userJson);

    expect(newTripId).toMatch(/^trip:[0-9A-Z]{26}$/);
    expect(tripDoc.title).toBe('Viagem para o México com a Ana');
    expect(preparedDocs.length).toBe(9); // 1 trip + 1 day + 2 itin + 1 flt + 1 res + 1 exp + 2 chk

    for (const doc of preparedDocs) {
      expect(doc._id).not.toContain('MEX2027');
      if (doc.type !== 'trip') {
        expect(doc.tripId).toBe(newTripId);
      }
    }
  });

  it('handles hand-crafted or un-nested JSON payloads gracefully', () => {
    const simplePayload = {
      title: 'Simple Trip',
      startDate: '2027-05-01',
      endDate: '2027-05-10',
      documents: [
        {
          _id: 'itin:OLD:1',
          type: 'itineraryItem',
          title: 'Walk in park',
          date: '2027-05-02'
        }
      ]
    };

    const { newTripId, tripDoc, preparedDocs } = parseAndPrepareTripImport(simplePayload);

    expect(newTripId).toMatch(/^trip:[0-9A-Z]{26}$/);
    expect(tripDoc.title).toBe('Simple Trip');
    expect(preparedDocs.length).toBe(2);
  });
});

describe('parseAndPrepareTripUpdateDocs', () => {
  it('preserves existing document IDs and remaps trip IDs to targetTripId', () => {
    const payload = {
      schema: 'itinera.trip-export',
      version: 1,
      exportedAt: '2026-07-22T10:00:00.000Z',
      db: 'itinera',
      tripId: 'trip:ORIGINAL',
      trip: {
        _id: 'trip:ORIGINAL',
        type: 'trip',
        title: 'Original Title Updated',
        startDate: '2027-03-13',
        endDate: '2027-03-21'
      },
      documents: {
        itineraryItem: [
          {
            _id: 'itin:ORIGINAL:ITEM1',
            type: 'itineraryItem',
            tripId: 'trip:ORIGINAL',
            title: 'Updated Item Title'
          }
        ]
      }
    };

    const targetTripId = 'trip:TARGET123';
    const { tripDoc, preparedDocs } = parseAndPrepareTripUpdateDocs(payload, targetTripId);

    expect(tripDoc._id).toBe('trip:TARGET123');
    expect(tripDoc.title).toBe('Original Title Updated');

    const itinItem = preparedDocs.find((d) => d.type === 'itineraryItem');
    expect(itinItem).toBeDefined();
    expect(itinItem?._id).toBe('itin:TARGET123:ITEM1');
    expect(itinItem?.tripId).toBe('trip:TARGET123');
  });
});
