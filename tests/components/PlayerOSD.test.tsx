import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PlayerOSD } from '../../src/components/osd/PlayerOSD';

describe('PlayerOSD', () => {
  it('renders title, player state, and formatted timecodes when visible', () => {
    const { getByText } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="playing"
        positionMs={65000} // 1:05
        durationMs={600000} // 10:00
        visible={true}
      />
    );

    expect(getByText('Big Buck Bunny')).toBeInTheDocument();
    expect(getByText('playing')).toBeInTheDocument();
    expect(getByText('1:05')).toBeInTheDocument();
    expect(getByText('10:00')).toBeInTheDocument();
  });

  it('renders nothing or hides when visible is false', () => {
    const { queryByText } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="playing"
        positionMs={65000}
        durationMs={600000}
        visible={false}
      />
    );

    expect(queryByText('Big Buck Bunny')).not.toBeInTheDocument();
  });

  it('correctly calculates progress bar percentage', () => {
    const { container } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="buffering"
        positionMs={30000}
        durationMs={120000} // 25%
        visible={true}
      />
    );

    const progressBar = container.querySelector('.bg-sky-400');
    expect(progressBar).toHaveStyle({ width: '25%' });
  });

  it('handles 0 duration gracefully without division by zero NaN', () => {
    const { container, getAllByText } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="idle"
        positionMs={0}
        durationMs={0}
        visible={true}
      />
    );

    const progressBar = container.querySelector('.bg-sky-400');
    expect(progressBar).toHaveStyle({ width: '0%' });
    expect(getAllByText('0:00')).toHaveLength(2);
  });
});
