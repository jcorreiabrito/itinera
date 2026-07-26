import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES } from './builtin-templates';
import { CHECKLIST_PRESET_GROUPS } from './constants';

describe('Builtin Templates', () => {
  it('defines valid built-in templates', () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    
    for (const tpl of BUILTIN_TEMPLATES) {
      expect(tpl._id).toMatch(/^tpl:builtin:/);
      expect(tpl.type).toBe('checklistTemplate');
      expect(tpl.name).toBeTruthy();
      expect(tpl.description).toBeTruthy();
      expect(tpl.items.length).toBeGreaterThan(0);

      // Verify each item has text and group
      for (const item of tpl.items) {
        expect(item.text).toBeTruthy();
        expect(item.group).toBeTruthy();
      }
    }
  });

  it('includes default universal essentials template', () => {
    const def = BUILTIN_TEMPLATES.find((t) => t.isDefault);
    expect(def).toBeDefined();
    expect(def?.name).toContain('Universal Travel Essentials');
  });

  it('CHECKLIST_PRESET_GROUPS contains expanded preset categories', () => {
    expect(CHECKLIST_PRESET_GROUPS).toContain('Documents');
    expect(CHECKLIST_PRESET_GROUPS).toContain('Pre-trip');
    expect(CHECKLIST_PRESET_GROUPS).toContain('Packing');
    expect(CHECKLIST_PRESET_GROUPS).toContain('Health & Toiletries');
    expect(CHECKLIST_PRESET_GROUPS).toContain('Electronics & Cables');
    expect(CHECKLIST_PRESET_GROUPS).toContain('Money');
  });
});
