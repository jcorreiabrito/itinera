import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import DensityControl from './DensityControl.svelte';

/*
 * jest-dom is installed but never registered in `src/test/setup.ts`, so the
 * checked state is read straight off the inputs rather than through
 * `toBeChecked`.
 */
const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

describe('DensityControl', () => {
	it('marks the current value and reports a pick', async () => {
		const onchange = vi.fn();
		render(DensityControl, { value: 'comfortable', onchange });

		expect(radio('Comfortable').checked).toBe(true);
		expect(radio('Compact').checked).toBe(false);

		await userEvent.click(radio('Compact'));
		expect(onchange).toHaveBeenCalledWith('compact');
	});
});
