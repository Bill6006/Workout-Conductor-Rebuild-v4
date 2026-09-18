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
    const editor = screen.getByTestId('loading-editor');
    expect(editor).toHaveAttribute('data-kind', 'plates');
    // Every day: one row, and a tap means "I cannot find this plate today".
    expect(editor).toHaveAttribute('data-mode', 'today');
    expect(editor).toHaveTextContent('Missing a plate today? Tap it');
    expect(screen.getByTestId('loading-note')).toHaveTextContent('The bar moves by 5 lb.');
    expect(screen.queryByTestId('plate-35')).toBeNull();
    await user.click(screen.getByTestId('missing-2.5'));
    expect(onSetMissingPlates).toHaveBeenCalledWith([2.5]);
    expect(onSave).not.toHaveBeenCalled();

    // Once per place: Edit rack, and a tap means "this place never has it".
    await user.click(screen.getByTestId('rack-edit'));
    expect(editor).toHaveAttribute('data-mode', 'rack');
    expect(editor).toHaveTextContent('Plates at Gym');
    expect(screen.getByTestId('loading-note')).toHaveTextContent('Tap a plate Gym does not have.');
    expect(screen.queryByTestId('rack-all')).toBeNull();
    await user.click(screen.getByTestId('plate-35'));
    expect(onSave).toHaveBeenCalledWith({ kind: 'plates', perSide: [45, 25, 10, 5, 2.5] });
    await user.click(screen.getByTestId('rack-edit'));
    expect(editor).toHaveAttribute('data-mode', 'today');
  });

  it('shows a plate missing today struck through, says what it does, and puts every plate back in one tap', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const exercise = requireExercise('barbell-bench-press');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor(
          { plates: { kind: 'plates', perSide: [10, 2.5] } },
          { missingPlates: [2.5] },
          exercise,
          'lb',
        )}
        spec={{ kind: 'plates', perSide: [10, 2.5] }}
        placeName="Gym"
        missingPlates={[2.5]}
        onSave={onSave}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
      />,
    );
    // Only the plates this place has can go missing, and the missing one reads as off.
    expect(screen.queryByTestId('missing-45')).toBeNull();
    expect(screen.getByTestId('missing-2.5')).toHaveAttribute('data-state', 'off');
    expect(screen.getByTestId('missing-10')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('loading-note')).toHaveTextContent(
      'No 2.5 today: the bar moves by 20 lb. Back next workout.',
    );
    await user.click(screen.getByTestId('rack-edit'));
    expect(screen.getByTestId('plate-45')).toHaveAttribute('data-state', 'off');
    await user.click(screen.getByTestId('rack-all'));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
