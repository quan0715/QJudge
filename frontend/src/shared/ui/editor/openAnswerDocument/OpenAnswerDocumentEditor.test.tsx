import { render } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { OpenAnswerDocumentEditor } from './OpenAnswerDocumentEditor';

it('does not report an answer change when opening an empty document or changing read-only state', () => {
  const onChange = vi.fn();
  const { rerender } = render(<OpenAnswerDocumentEditor onChange={onChange}/>);
  expect(onChange).not.toHaveBeenCalled();
  rerender(<OpenAnswerDocumentEditor onChange={onChange} readOnly/>);
  expect(onChange).not.toHaveBeenCalled();
});
