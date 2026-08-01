import type { ChecklistTemplate } from './schemas';
import { getLanguage } from '$lib/i18n.svelte';

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

export const BUILTIN_TEMPLATES_EN: BuiltinTemplate[] = [
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
      { text: 'Passport / ID Card', group: 'Documents', important: true, note: 'Check expiry date (must have 6 months remaining)' },
      { text: 'Visa / ESTA Confirmation', group: 'Documents', important: true },
      { text: 'Travel Insurance Documents', group: 'Documents', important: true },
      { text: 'Flight / Train Tickets & Boarding Passes', group: 'Documents', important: true },
      { text: 'Hotel / Booking Confirmations', group: 'Documents' },
      { text: 'Credit / Debit Cards', group: 'Money', important: true, note: 'Notify bank of international travel' },
      { text: 'Local Currency (Cash)', group: 'Money' },
      { text: 'Emergency Phone Numbers & Contacts', group: 'Documents' },

      { text: 'Online Flight Check-in', group: 'Pre-trip', important: true },
      { text: 'Hold / Pause Mail & Subscriptions', group: 'Pre-trip' },
      { text: 'Share Itinerary with Family or Friends', group: 'Pre-trip' },
      { text: 'Water plants & turn off main valves', group: 'Pre-trip' },
      { text: 'Empty fridge / dispose of perishable food', group: 'Pre-trip' },
      { text: 'Lock all doors and windows', group: 'Pre-trip', important: true },

      { text: 'Daily Outfits & Underwear', group: 'Clothes & Gear', quantity: 5 },
      { text: 'Comfortable Walking Shoes', group: 'Clothes & Gear', important: true },
      { text: 'Pajamas / Sleepwear', group: 'Clothes & Gear' },
      { text: 'Light Jacket / Sweater', group: 'Clothes & Gear' },

      { text: 'Toothbrush & Toothpaste', group: 'Health & Toiletries', important: true },
      { text: 'Shampoo & Conditioner', group: 'Health & Toiletries' },
      { text: 'Personal Medications & Prescriptions', group: 'Health & Toiletries', important: true },
      { text: 'First-aid kit & Painkillers (Paracetamol/Ibuprofen)', group: 'Health & Toiletries' },
      { text: 'Sunscreen & Lip Balm', group: 'Health & Toiletries' },

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

export const BUILTIN_TEMPLATES_PT_BR: BuiltinTemplate[] = [
  {
    ...BASE_META,
    _id: 'tpl:builtin:essentials',
    type: 'checklistTemplate',
    name: 'Essenciais de Viagem',
    description: 'Um checklist completo para qualquer destino ou estilo de viagem.',
    iconName: 'Luggage',
    isDefault: true,
    isBuiltin: true,
    items: [
      { text: 'Passaporte / RG', group: 'Documentos', important: true, note: 'Verifique a validade (deve ter no mínimo 6 meses restantes)' },
      { text: 'Confirmação de Visto / ESTA', group: 'Documentos', important: true },
      { text: 'Documentos de Seguro Viagem', group: 'Documentos', important: true },
      { text: 'Passagens de Voo / Trem e Cartões de Embarque', group: 'Documentos', important: true },
      { text: 'Comprovantes de Hotel / Reservas', group: 'Documentos' },
      { text: 'Cartões de Crédito / Débito', group: 'Dinheiro', important: true, note: 'Avise o banco sobre viagem internacional' },
      { text: 'Moeda Local (Dinheiro vivo)', group: 'Dinheiro' },
      { text: 'Números de Emergência e Contatos', group: 'Documentos' },

      { text: 'Check-in Online do Voo', group: 'Pré-viagem', important: true },
      { text: 'Pausar Correspondências e Assinaturas', group: 'Pré-viagem' },
      { text: 'Compartilhar Roteiro com Família ou Amigos', group: 'Pré-viagem' },
      { text: 'Regar plantas e fechar registros de água', group: 'Pré-viagem' },
      { text: 'Esvaziar geladeira / descartar perecíveis', group: 'Pré-viagem' },
      { text: 'Trancar todas as portas e janelas', group: 'Pré-viagem', important: true },

      { text: 'Roupas Diárias e Peças Íntimas', group: 'Roupas e Acessórios', quantity: 5 },
      { text: 'Sapatos Confortáveis para Caminhada', group: 'Roupas e Acessórios', important: true },
      { text: 'Pijamas / Roupas de Dormir', group: 'Roupas e Acessórios' },
      { text: 'Casaco Leve / Suéter', group: 'Roupas e Acessórios' },

      { text: 'Escova e Pasta de Dente', group: 'Saúde e Higiene', important: true },
      { text: 'Xampu e Condicionador', group: 'Saúde e Higiene' },
      { text: 'Medicamentos Pessoais e Receitas', group: 'Saúde e Higiene', important: true },
      { text: 'Kit de Primeiros Socorros e Analgésicos', group: 'Saúde e Higiene' },
      { text: 'Protetor Solar e Protetor Labial', group: 'Saúde e Higiene' },

      { text: 'Smartphone e Carregador', group: 'Eletrônicos e Cabos', important: true },
      { text: 'Adaptador de Tomada Universal', group: 'Eletrônicos e Cabos', important: true },
      { text: 'Power Bank / Bateria Portátil', group: 'Eletrônicos e Cabos' },
      { text: 'Fones de Ouvido', group: 'Eletrônicos e Cabos' }
    ]
  },
  {
    ...BASE_META,
    _id: 'tpl:builtin:beach',
    type: 'checklistTemplate',
    name: 'Praia e Litoral',
    description: 'Tudo o que você precisa para dias ensolarados, banhos de mar e relaxar no litoral.',
    iconName: 'Sun',
    isDefault: false,
    isBuiltin: true,
    items: [
      { text: 'Roupas de Banho / Sunga / Biquíni', group: 'Roupas e Acessórios', important: true, quantity: 2 },
      { text: 'Toalha de Praia / Microfibra', group: 'Roupas e Acessórios' },
      { text: 'Chinelos / Calçados Aquáticos', group: 'Roupas e Acessórios' },
      { text: 'Óculos de Sol (Proteção UV)', group: 'Roupas e Acessórios', important: true },
      { text: 'Chapéu de Sol / Boné', group: 'Roupas e Acessórios' },
      { text: 'Protetor Solar FPS Alto e Pós-Sol', group: 'Saúde e Higiene', important: true },
      { text: 'Repelente de Insetos', group: 'Saúde e Higiene' },
      { text: 'Capa Impermeável para Celular', group: 'Eletrônicos e Cabos' },
      { text: 'Bolsa de Praia', group: 'Roupas e Acessórios' },
      { text: 'Garrafa de Água Reutilizável', group: 'Roupas e Acessórios' },
      { text: 'Snorkel e Óculos de Natação', group: 'Roupas e Acessórios' },
      { text: 'Livro / e-Reader', group: 'Entretenimento' }
    ]
  },
  {
    ...BASE_META,
    _id: 'tpl:builtin:winter',
    type: 'checklistTemplate',
    name: 'Viagem de Inverno e Montanha',
    description: 'Prepare-se para o frio, atividades na neve e estadias aconchegantes nas montanhas.',
    iconName: 'Snowflake',
    isDefault: false,
    isBuiltin: true,
    items: [
      { text: 'Segunda Pele Térmica (Blusa e Calça)', group: 'Roupas e Acessórios', important: true, quantity: 2 },
      { text: 'Casaco Pesado de Inverno / Jaqueta de Esqui', group: 'Roupas e Acessórios', important: true },
      { text: 'Luvas Impermeáveis', group: 'Roupas e Acessórios', important: true },
      { text: 'Gorro / Touca Térmica e Cachecol', group: 'Roupas e Acessórios' },
      { text: 'Meias Grossas de Lã', group: 'Roupas e Acessórios', quantity: 4 },
      { text: 'Botas Impermeáveis para Neve', group: 'Roupas e Acessórios', important: true },
      { text: 'Aquecedores de Mão e Pé', group: 'Saúde e Higiene' },
      { text: 'Protetor Labial Hidratante e Creme para Frio', group: 'Saúde e Higiene', important: true },
      { text: 'Óculos de Esqui / Óculos de Sol', group: 'Roupas e Acessórios' }
    ]
  },
  {
    ...BASE_META,
    _id: 'tpl:builtin:backpacker',
    type: 'checklistTemplate',
    name: 'Mochilão e Trilha',
    description: 'Essenciais leves para trilhas, trekking e hospedagem em hostels.',
    iconName: 'Compass',
    isDefault: false,
    isBuiltin: true,
    items: [
      { text: 'Mochila Ergonômica com Capa de Chuva', group: 'Roupas e Acessórios', important: true },
      { text: 'Botas de Trilha / Tênis de Caminhada', group: 'Roupas e Acessórios', important: true },
      { text: 'Camisetas e Bermudas de Secagem Rápida', group: 'Roupas e Acessórios', quantity: 3 },
      { text: 'Saco de Dormir Compacto / Liner', group: 'Roupas e Acessórios' },
      { text: 'Lanterna de Cabeça e Pilhas Extras', group: 'Eletrônicos e Cabos', important: true },
      { text: 'Canivete / Multi-ferramenta', group: 'Roupas e Acessórios' },
      { text: 'Mochila / Garrafa de Hidratação', group: 'Roupas e Acessórios', important: true },
      { text: 'Curativos para Bolhas e Fita Médica', group: 'Saúde e Higiene', important: true },
      { text: 'Toalha Compacta de Microfibra', group: 'Saúde e Higiene' },
      { text: 'Cadeado para Armários de Hostel', group: 'Documentos', important: true }
    ]
  },
  {
    ...BASE_META,
    _id: 'tpl:builtin:business',
    type: 'checklistTemplate',
    name: 'Viagem de Negócios',
    description: 'Sob medida para viagens de trabalho, conferências e eventos corporativos.',
    iconName: 'Briefcase',
    isDefault: false,
    isBuiltin: true,
    items: [
      { text: 'Notebook e Carregador', group: 'Eletrônicos e Cabos', important: true },
      { text: 'Cartões de Visita', group: 'Documentos' },
      { text: 'Adaptador HDMI / Apresentador de Slides', group: 'Eletrônicos e Cabos' },
      { text: 'Traje Esporte Fino / Terno e Gravata', group: 'Roupas e Acessórios', important: true },
      { text: 'Sapatos Sociais e Acessórios', group: 'Roupas e Acessórios' },
      { text: 'Fones com Cancelamento de Ruído', group: 'Eletrônicos e Cabos' },
      { text: 'Bloco de Notas e Caneta', group: 'Documentos' },
      { text: 'Spray Desamassador de Roupas / Passador a Vapor', group: 'Saúde e Higiene' },
      { text: 'Cartão Corporativo / Porta-Comprovantes de Despesas', group: 'Dinheiro', important: true }
    ]
  }
];

export function getBuiltinTemplates(): BuiltinTemplate[] {
  return getLanguage() === 'pt-BR' ? BUILTIN_TEMPLATES_PT_BR : BUILTIN_TEMPLATES_EN;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = new Proxy([], {
  get(_target, prop) {
    const list = getBuiltinTemplates();
    const val = (list as any)[prop];
    return typeof val === 'function' ? val.bind(list) : val;
  }
});
