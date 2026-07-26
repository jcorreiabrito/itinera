import type { ChecklistTemplate } from './schemas';

export interface BuiltinTemplate extends ChecklistTemplate {
  description?: string;
  iconName?: string;
  isBuiltin?: boolean;
}

const BASE_META = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  schemaVersion: 1
};

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    ...BASE_META,
    _id: 'tpl:builtin:essentials',
    type: 'checklistTemplate',
    name: 'Universal Travel Essentials',
    description: 'A comprehensive checklist for any destination or trip style.',
    iconName: 'Luggage',
    isDefault: true,
    isBuiltin: true,
    items: [
      // Documents & Money
      { text: 'Passport / ID Card', group: 'Documents', important: true, note: 'Check expiry date (must have 6 months remaining)' },
      { text: 'Visa / ESTA Confirmation', group: 'Documents', important: true },
      { text: 'Travel Insurance Documents', group: 'Documents', important: true },
      { text: 'Flight / Train Tickets & Boarding Passes', group: 'Documents', important: true },
      { text: 'Hotel / Booking Confirmations', group: 'Documents' },
      { text: 'Credit / Debit Cards', group: 'Money', important: true, note: 'Notify bank of international travel' },
      { text: 'Local Currency (Cash)', group: 'Money' },
      { text: 'Emergency Phone Numbers & Contacts', group: 'Documents' },

      // Pre-Trip Tasks
      { text: 'Online Flight Check-in', group: 'Pre-trip', important: true },
      { text: 'Hold / Pause Mail & Subscriptions', group: 'Pre-trip' },
      { text: 'Share Itinerary with Family or Friends', group: 'Pre-trip' },
      { text: 'Water plants & turn off main valves', group: 'Pre-trip' },
      { text: 'Empty fridge / dispose of perishable food', group: 'Pre-trip' },
      { text: 'Lock all doors and windows', group: 'Pre-trip', important: true },

      // Packing - Clothes
      { text: 'Daily Outfits & Underwear', group: 'Clothes & Gear', quantity: 5 },
      { text: 'Comfortable Walking Shoes', group: 'Clothes & Gear', important: true },
      { text: 'Pajamas / Sleepwear', group: 'Clothes & Gear' },
      { text: 'Light Jacket / Sweater', group: 'Clothes & Gear' },

      // Toiletries & Health
      { text: 'Toothbrush & Toothpaste', group: 'Health & Toiletries', important: true },
      { text: 'Shampoo & Conditioner', group: 'Health & Toiletries' },
      { text: 'Personal Medications & Prescriptions', group: 'Health & Toiletries', important: true },
      { text: 'First-aid kit & Painkillers (Paracetamol/Ibuprofen)', group: 'Health & Toiletries' },
      { text: 'Sunscreen & Lip Balm', group: 'Health & Toiletries' },

      // Electronics
      { text: 'Smartphone & Charger', group: 'Electronics & Cables', important: true },
      { text: 'Universal Power Adapter', group: 'Electronics & Cables', important: true },
      { text: 'Power Bank / Portable Battery', group: 'Electronics & Cables' },
      { text: 'Earphones / Headphones', group: 'Electronics & Cables' }
    ]
  },
  {
    ...BASE_META,
    _id: 'tpl:builtin:beach',
    type: 'checklistTemplate',
    name: 'Beach & Coastal Getaway',
    description: 'Everything you need for sunny days, swimming, and relaxing by the ocean.',
    iconName: 'Sun',
    isDefault: false,
    isBuiltin: true,
    items: [
      { text: 'Swimsuits / Swim Trunks', group: 'Clothes & Gear', important: true, quantity: 2 },
      { text: 'Beach Towel / Microfiber Towel', group: 'Clothes & Gear' },
      { text: 'Flip-flops / Water Shoes', group: 'Clothes & Gear' },
      { text: 'Sunglasses (UV Protection)', group: 'Clothes & Gear', important: true },
      { text: 'Sun Hat / Baseball Cap', group: 'Clothes & Gear' },
      { text: 'High SPF Sunscreen & After-Sun Lotion', group: 'Health & Toiletries', important: true },
      { text: 'Insect Repellent', group: 'Health & Toiletries' },
      { text: 'Waterproof Phone Pouch', group: 'Electronics & Cables' },
      { text: 'Beach Bag / Tote', group: 'Clothes & Gear' },
      { text: 'Reusable Water Bottle', group: 'Clothes & Gear' },
      { text: 'Snorkel Gear & Goggles', group: 'Clothes & Gear' },
      { text: 'Book / e-Reader', group: 'Entertainment' }
    ]
  },
  {
    ...BASE_META,
    _id: 'tpl:builtin:winter',
    type: 'checklistTemplate',
    name: 'Winter & Alpine Trip',
    description: 'Gear up for freezing weather, snow activities, and cozy mountain stays.',
    iconName: 'Snowflake',
    isDefault: false,
    isBuiltin: true,
    items: [
      { text: 'Thermal Base Layers (Top & Bottom)', group: 'Clothes & Gear', important: true, quantity: 2 },
      { text: 'Heavy Winter Coat / Ski Jacket', group: 'Clothes & Gear', important: true },
      { text: 'Waterproof Gloves or Mittens', group: 'Clothes & Gear', important: true },
      { text: 'Beanie / Warm Hat & Neck Gaiter', group: 'Clothes & Gear' },
      { text: 'Thick Wool Socks', group: 'Clothes & Gear', quantity: 4 },
      { text: 'Waterproof Snow Boots', group: 'Clothes & Gear', important: true },
      { text: 'Hand & Foot Warmers (Packets)', group: 'Health & Toiletries' },
      { text: 'Heavy Duty Lip Balm & Cold Cream Moisturizer', group: 'Health & Toiletries', important: true },
      { text: 'Ski Goggles / Sunglasses', group: 'Clothes & Gear' }
    ]
  },
  {
    ...BASE_META,
    _id: 'tpl:builtin:backpacker',
    type: 'checklistTemplate',
    name: 'Backpack & Hiking Expedition',
    description: 'Lightweight essentials for active trails, trekking, and hosteling.',
    iconName: 'Compass',
    isDefault: false,
    isBuiltin: true,
    items: [
      { text: 'Ergonomic Backpack & Rain Cover', group: 'Clothes & Gear', important: true },
      { text: 'Break-in Hiking Boots / Trail Runners', group: 'Clothes & Gear', important: true },
      { text: 'Quick-dry Shirts & Shorts', group: 'Clothes & Gear', quantity: 3 },
      { text: 'Compact Sleeping Bag Liner', group: 'Clothes & Gear' },
      { text: 'Headlamp & Extra Batteries', group: 'Electronics & Cables', important: true },
      { text: 'Multi-tool / Pocket Knife', group: 'Clothes & Gear' },
      { text: 'Hydration Bladder / Flask', group: 'Clothes & Gear', important: true },
      { text: 'Blister Plasters & Medical Tape', group: 'Health & Toiletries', important: true },
      { text: 'Compact Microfiber Towel', group: 'Health & Toiletries' },
      { text: 'Padlock for Hostel Lockers', group: 'Documents', important: true }
    ]
  },
  {
    ...BASE_META,
    _id: 'tpl:builtin:business',
    type: 'checklistTemplate',
    name: 'Business Travel',
    description: 'Tailored for work trips, conferences, and executive travel.',
    iconName: 'Briefcase',
    isDefault: false,
    isBuiltin: true,
    items: [
      { text: 'Laptop & Charger', group: 'Electronics & Cables', important: true },
      { text: 'Business Cards', group: 'Documents' },
      { text: 'HDMI / Presentation Adapter & Clicker', group: 'Electronics & Cables' },
      { text: 'Formal Business Attire / Suit & Tie', group: 'Clothes & Gear', important: true },
      { text: 'Dress Shoes & Matching Accessories', group: 'Clothes & Gear' },
      { text: 'Noise-Canceling Headphones', group: 'Electronics & Cables' },
      { text: 'Notepad & Pen', group: 'Documents' },
      { text: 'Wrinkle-Release Spray / Steamer', group: 'Health & Toiletries' },
      { text: 'Company Credit Card / Expense Receipts Pouch', group: 'Money', important: true }
    ]
  }
];
