import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { loadingFor } from '../../engine/loading/loading';
import { LoadingEditor } from './LoadingEditor';

describe('recording what a place can load', () => {
  it('records a machine stack as ranges and saves them for the place', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const exercise = requireExercise('leg-curl');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor(undefined, undefined, exercise, 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSave={onSave}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
      />,
    );
    expect(screen.getByTestId('loading-summary')).toHaveTextContent('Not recorded yet');
    await user.click(screen.getByTestId('loading-edit'));
    await user.clear(screen.getByLabelText('Range 1 from'));
    await user.type(screen.getByLabelText('Range 1 from'), '10');
    await user.clear(screen.getByLabelText('Range 1 to'));
    await user.type(screen.getByLabelText('Range 1 to'), '100');
    await user.clear(screen.getByLabelText('Range 1 step'));
    await user.type(screen.getByLabelText('Range 1 step'), '10');
    await user.click(screen.getByRole('button', { name: 'Then a second range' }));
    await user.type(screen.getByLabelText('Range 2 from'), '120');
    await user.type(screen.getByLabelText('Range 2 to'), '280');
    await user.type(screen.getByLabelText('Range 2 step'), '20');
    await user.click(screen.getByTestId('loading-save'));
    expect(onSave).toHaveBeenCalledWith({
      kind: 'stack',
      ranges: [
        { from: 10, to: 100, step: 10 },
        { from: 120, to: 280, step: 20 },
      ],
    });
  });

  it('refuses a range that goes backwards or has no step', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const exercise = requireExercise('leg-curl');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor(undefined, undefined, exercise, 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSave={onSave}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
      />,
    );
    await user.click(screen.getByTestId('loading-edit'));
    await user.clear(screen.getByLabelText('Range 1 to'));
    await user.type(screen.getByLabelText('Range 1 to'), '5');
    await user.click(screen.getByTestId('loading-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at or above it/);
  });

  it('on a bar the rack is chips for the place and a Not today row for the session', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const onSetMissingPlates = vi.fn(() => Promise.resolve());
    const exercise = requireExercise('barbell-bench-press');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor(undefined, { missingPlates: [] }, exercise, 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSave={onSave}
        onSetMissingPlates={onSetMissingPlates}
      />,
    );
    expect(screen.getByTestId('loading-editor')).toHaveAttribute('data-kind', 'plates');
    await user.click(screen.getByTestId('missing-2.5'));
    expect(onSetMissingPlates).toHaveBeenCalledWith([2.5]);
    await user.click(screen.getByTestId('plate-35'));
    expect(onSave).toHaveBeenCalledWith({ kind: 'plates', perSide: [45, 25, 10, 5, 2.5] });
  });
});
