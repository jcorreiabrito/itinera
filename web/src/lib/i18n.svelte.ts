import { settings } from '$lib/db';

export type Language = 'en' | 'pt-BR';

// Reactive language state using Svelte 5 runes (requires .svelte.ts extension to compile)
let currentLanguage = $state<Language>('en');

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language) {
  currentLanguage = lang;
}

/** Automatically load language from settings */
export async function initLanguage() {
  try {
    const s = await settings.get();
    if (s.language === 'pt-BR') {
      currentLanguage = 'pt-BR';
    } else {
      currentLanguage = 'en';
    }
  } catch (e) {
    console.error('Failed to load language', e);
  }
}

const DICTIONARY: Record<Language, Record<string, string>> = {
  en: {
    'trips': 'Trips',
    'new_trip': 'New trip',
    'search_placeholder': 'Search by name, place, or tag',
    'active_now': 'Active now',
    'upcoming': 'Upcoming',
    'past': 'Past',
    'archived': 'Archived',
    'settings': 'Settings',
    'back_to_trips': 'Back to trips',
    'trip_not_found': 'Trip not found',
    'trip_not_found_desc': 'It may have been deleted on another device.',
    'all_trips': 'All trips',
    'offline_ready': 'Offline-ready',
    'overview': 'Overview',
    'itinerary': 'Itinerary',
    'checklist': 'Checklist',
    'bookings': 'Bookings',
    'flights': 'Flights',
    'reservations': 'Reservations',
    'costs': 'Costs',
    'delete_trip_title': 'Delete this trip?',
    'delete_trip_desc': 'Deleting moves the trip and its plans to Trash – nothing is permanently removed yet.',
    'cancel': 'Cancel',
    'delete': 'Delete',
    'no_trips_found': 'No trips match "{search}".',
    'plan_first_trip': 'Plan your first trip',
    'empty_description': 'Itinera keeps every itinerary, packing list, booking, and budget in one cozy place – and it all works offline.',
    'packed': 'packed',
    'spent': 'spent',
    'checklist_not_started': 'Checklist not started',
    'budget_used': 'Budget used',
    'checklist_progress': 'Checklist progress',
    'open': 'Open',
    'edit': 'Edit',
    'duplicate': 'Duplicate',
    'unarchive': 'Unarchive',
    'archive': 'Archive',
    'settings_title': 'Settings',
    'home_currency': 'Home Currency',
    'home_currency_desc': 'Default currency for new budgets and manual conversions.',
    'first_day': 'First Day of Week',
    'theme': 'Theme',
    'theme_system': 'System default',
    'theme_light': 'Light paper',
    'theme_dark': 'Dark night (not supported)',
    'language': 'Language / Idioma',
    'language_desc': 'App language preference.',
    'back': 'Back',
    'save': 'Save',
    'saving': 'Saving...',
    'settings_saved': 'Settings saved.',
    'night': 'night',
    'nights': 'nights',
    'actions_for': 'Actions for',
    'today': 'today',
    'in_days': 'in {days}',
    'ended_ago': 'ended {days} ago',
    'day_of': 'Day {dayNo} of {total}',
    'day': '1 day',
    'days_plural': '{n} days',
    'weeks_plural': '{n} weeks',
    'months_plural': '{n} months',
    'year_plural': '1 year',
    'years_plural': '{n} years'
  },
  'pt-BR': {
    'trips': 'Viagens',
    'new_trip': 'Nova viagem',
    'search_placeholder': 'Buscar por nome, local ou marcador',
    'active_now': 'Ativas agora',
    'upcoming': 'Próximas',
    'past': 'Anteriores',
    'archived': 'Arquivadas',
    'settings': 'Configurações',
    'back_to_trips': 'Voltar para viagens',
    'trip_not_found': 'Viagem não encontrada',
    'trip_not_found_desc': 'Ela pode ter sido excluída em outro dispositivo.',
    'all_trips': 'Todas as viagens',
    'offline_ready': 'Pronto para usar offline',
    'overview': 'Visão geral',
    'itinerary': 'Roteiro',
    'checklist': 'Checklist',
    'bookings': 'Reservas',
    'flights': 'Voos',
    'reservations': 'Hospedagens',
    'costs': 'Custos',
    'delete_trip_title': 'Excluir esta viagem?',
    'delete_trip_desc': 'A exclusão move a viagem e seus planos para a Lixeira – nada é removido definitivamente ainda.',
    'cancel': 'Cancelar',
    'delete': 'Excluir',
    'no_trips_found': 'Nenhuma viagem corresponde a "{search}".',
    'plan_first_trip': 'Planeje sua primeira viagem',
    'empty_description': 'O Itinera guarda cada roteiro, lista de bagagem, reservas e orçamento em um único lugar aconchegante – e tudo funciona offline.',
    'packed': 'embalados',
    'spent': 'gastos',
    'checklist_not_started': 'Checklist não iniciado',
    'budget_used': 'Orçamento utilizado',
    'checklist_progress': 'Progresso do checklist',
    'open': 'Abrir',
    'edit': 'Editar',
    'duplicate': 'Duplicar',
    'unarchive': 'Desarquivar',
    'archive': 'Arquivar',
    'settings_title': 'Configurações',
    'home_currency': 'Moeda padrão',
    'home_currency_desc': 'Moeda padrão para novos orçamentos e conversões manuais.',
    'first_day': 'Primeiro dia da semana',
    'theme': 'Tema',
    'theme_system': 'Padrão do sistema',
    'theme_light': 'Papel claro',
    'theme_dark': 'Noite escura (não suportado)',
    'language': 'Idioma / Language',
    'language_desc': 'Preferência de idioma do aplicativo.',
    'back': 'Voltar',
    'save': 'Salvar',
    'saving': 'Salvando...',
    'settings_saved': 'Configurações salvas.',
    'night': 'noite',
    'nights': 'noites',
    'actions_for': 'Ações para',
    'today': 'hoje',
    'in_days': 'em {days}',
    'ended_ago': 'terminou há {days}',
    'day_of': 'Dia {dayNo} de {total}',
    'day': '1 dia',
    'days_plural': '{n} dias',
    'weeks_plural': '{n} semanas',
    'months_plural': '{n} meses',
    'year_plural': '1 ano',
    'years_plural': '{n} anos'
  }
};

/**
 * Translate a key into the active language.
 * Accepts optional replacements like `{search}`.
 */
export function t(key: string, replacements?: Record<string, string>): string {
  const dict = DICTIONARY[currentLanguage] || DICTIONARY['en'];
  let val = dict[key] || DICTIONARY['en'][key] || key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      val = val.replace(`{${k}}`, v);
    }
  }
  return val;
}
