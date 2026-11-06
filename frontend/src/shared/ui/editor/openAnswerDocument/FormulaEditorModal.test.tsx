import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormulaEditorModal } from './FormulaEditorModal';
describe('formula editor actions', () => {
  it('inserts templates at the cursor without replacing existing work', () => {
    const submit = vi.fn();
    render(<FormulaEditorModal open initialLatex="a=4+" onSubmit={submit} onClose={() => {}} />);
    const field = screen.getByRole('textbox', {name:'公式內容'}) as HTMLInputElement;
    field.setSelectionRange(4, 4);
    fireEvent.click(screen.getByText('公式輔助'));
    fireEvent.click(screen.getByRole('button', {name:'分式'}));
    expect(field.value).toBe('a=4+\\frac{}{}');
    fireEvent.keyDown(field, {key:'Enter'});
    expect(submit).toHaveBeenCalledWith(field.value);
  });
  it('cancels via Escape without saving the edited draft', () => {
    const close = vi.fn(), submit = vi.fn();
    render(<FormulaEditorModal open initialLatex="x" onSubmit={submit} onClose={close} />);
    fireEvent.change(screen.getByRole('textbox'), {target:{value:'y'}});
    fireEvent.keyDown(screen.getByRole('textbox'), {key:'Escape'});
    expect(close).toHaveBeenCalledOnce(); expect(submit).not.toHaveBeenCalled();
  });
});
