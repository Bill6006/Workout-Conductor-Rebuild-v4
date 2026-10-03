import { act, render, screen, within } from '@testing-library/react';
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
    expect(screen.getByTestId('loading-summary')).toHaveTextContent(
      'Not set yet, so targets move by 10 lb with no upper limit.',
    );
    expect(screen.getByTestId('loading-edit')).toHaveTextContent('Set this machine');
    await user.click(screen.getByTestId('loading-edit'));
    // Each box sits under its own word, and the result is read back as it is typed.
    const row = screen.getByTestId('loading-row-0');
    expect(row).toHaveTextContent('Lightest (lb)');
    expect(row).toHaveTextContent('Heaviest (lb)');
    expect(row).toHaveTextContent('Jump (lb)');
    await user.clear(screen.getByLabelText('Lightest'));
    await user.type(screen.getByLabelText('Lightest'), '10');
    await user.clear(screen.getByLabelText('Heaviest'));
    await user.type(screen.getByLabelText('Heaviest'), '100');
    await user.clear(screen.getByLabelText('Jump'));
    await user.type(screen.getByLabelText('Jump'), '10');
    expect(screen.getByTestId('loading-readback')).toHaveTextContent('10 to 100 lb in 10 lb jumps');
    await user.click(screen.getByRole('button', { name: 'The jump changes higher up' }));
    await user.type(screen.getByLabelText('Lightest, range 2'), '120');
    await user.type(screen.getByLabelText('Heaviest, range 2'), '280');
    await user.type(screen.getByLabelText('Jump, range 2'), '20');
    expect(screen.getByTestId('loading-readback')).toHaveTextContent(
      '10 to 100 lb in 10 lb jumps, then 120 to 280 lb in 20 lb jumps',
    );
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
    await user.clear(screen.getByLabelText('Heaviest'));
    await user.type(screen.getByLabelText('Heaviest'), '5');
    expect(screen.getByTestId('loading-readback')).toHaveTextContent('Fill in all three');
    await user.click(screen.getByTestId('loading-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at or above it/);
  });

  // Maintenance 25, item 8: two modes always in view, each tap applied at once.
  it('on a bar offers Today and Default side by side, Today first, with no Done to tap', () => {
    const exercise = requireExercise('barbell-bench-press');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor(undefined, { missingPlates: [] }, exercise, 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSave={vi.fn(() => Promise.resolve())}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
      />,
    );
    const editor = screen.getByTestId('loading-editor');
    expect(editor).toHaveAttribute('data-kind', 'plates');
    expect(editor).toHaveAttribute('data-mode', 'today');
    const modes = screen.getByRole('group', { name: 'Which plates to change' });
    expect(
      within(modes)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Today', 'Default']);
    expect(screen.getByTestId('plates-mode-today')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('plates-mode-default')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /^(Done|Edit rack)$/ })).toBeNull();
    expect(screen.queryByTestId('rack-edit')).toBeNull();
  });

  it('Today marks a plate missing for this workout only, and never touches the saved rack', async () => {
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
    expect(screen.getByTestId('loading-editor')).toHaveTextContent('Missing a plate today? Tap it');
    expect(screen.getByTestId('loading-note')).toHaveTextContent('The bar moves by 5 lb.');
    // Only the rack's own plates can go missing today: here, all six, and none of Default's.
    expect(
      within(screen.getByTestId('plate-buttons'))
        .getAllByRole('button')
        .map((button) => button.dataset.testid),
    ).toEqual(['missing-45', 'missing-35', 'missing-25', 'missing-10', 'missing-5', 'missing-2.5']);
    await user.click(screen.getByTestId('missing-2.5'));
    expect(onSetMissingPlates).toHaveBeenCalledWith([2.5]);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Default saves the plates this place keeps, and never touches today’s', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const onSetMissingPlates = vi.fn(() => Promise.resolve());
    const exercise = requireExercise('barbell-bench-press');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor(undefined, { missingPlates: [2.5] }, exercise, 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[2.5]}
        onSave={onSave}
        onSetMissingPlates={onSetMissingPlates}
      />,
    );
    await user.click(screen.getByTestId('plates-mode-default'));
    const editor = screen.getByTestId('loading-editor');
    expect(editor).toHaveAttribute('data-mode', 'default');
    expect(screen.getByTestId('plates-mode-default')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('plates-mode-today')).toHaveAttribute('aria-pressed', 'false');
    expect(editor).toHaveTextContent('Plates at Gym');
    expect(screen.getByTestId('loading-note')).toHaveTextContent(
      'Saved for Gym: tap a plate it never has.',
    );
    // Every plate the app knows, each as the place has it; today's missing 2.5 is still on the rack.
    expect(screen.getByTestId('plate-2.5')).toHaveAttribute('data-state', 'on');
    expect(screen.queryByTestId('rack-all')).toBeNull();
    await user.click(screen.getByTestId('plate-35'));
    expect(onSave).toHaveBeenCalledWith({ kind: 'plates', perSide: [45, 25, 10, 5, 2.5] });
    expect(onSetMissingPlates).not.toHaveBeenCalled();

    // Back to Today: the switch moves, nothing else is asked of it.
    await user.click(screen.getByTestId('plates-mode-today'));
    expect(editor).toHaveAttribute('data-mode', 'today');
    expect(screen.getByTestId('missing-2.5')).toHaveAttribute('data-state', 'off');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSetMissingPlates).not.toHaveBeenCalled();
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
    // All plates changes what the place keeps, so it belongs to Default alone.
    expect(screen.queryByTestId('rack-all')).toBeNull();
    await user.click(screen.getByTestId('plates-mode-default'));
    expect(screen.getByTestId('plate-45')).toHaveAttribute('data-state', 'off');
    await user.click(screen.getByTestId('rack-all'));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('with every plate missing today, says the bar stays empty, never that it moves', () => {
    const exercise = requireExercise('barbell-bench-press');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor(
          { plates: { kind: 'plates', perSide: [10, 2.5] } },
          { missingPlates: [10, 2.5] },
          exercise,
          'lb',
        )}
        spec={{ kind: 'plates', perSide: [10, 2.5] }}
        placeName="Gym"
        missingPlates={[10, 2.5]}
        onSave={vi.fn(() => Promise.resolve())}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
      />,
    );
    const note = screen.getByTestId('loading-note');
    expect(note).toHaveTextContent('No plates today: the bar stays empty. Back next workout.');
    expect(note).not.toHaveTextContent(/moves by/);
  });

  it('holds every plate button while a tap saves, so the next tap starts from what was saved', async () => {
    const user = userEvent.setup();
    let finish = () => {};
    const onSetMissingPlates = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const exercise = requireExercise('barbell-bench-press');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor(undefined, { missingPlates: [] }, exercise, 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSave={vi.fn(() => Promise.resolve())}
        onSetMissingPlates={onSetMissingPlates}
      />,
    );
    await user.click(screen.getByTestId('missing-2.5'));
    const buttons = within(screen.getByTestId('plate-buttons')).getAllByRole('button');
    for (const button of buttons) expect(button).toBeDisabled();
    await act(async () => finish());
    for (const button of buttons) expect(button).toBeEnabled();
    expect(onSetMissingPlates).toHaveBeenCalledTimes(1);
  });
});
