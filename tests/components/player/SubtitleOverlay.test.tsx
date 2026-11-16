import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubtitleOverlay } from '../../../src/components/player/SubtitleOverlay';
import { DEFAULT_SUBTITLE_SETTINGS } from '../../../src/player/subtitleSettings';

describe('SubtitleOverlay', () => {
  it('renders nothing when there is no active cue', () => {
    const { container } = render(<SubtitleOverlay text="" settings={DEFAULT_SUBTITLE_SETTINGS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applies font size and color from settings', () => {
    render(
      <SubtitleOverlay
        text="Hello"
        settings={{ fontSize: 'large', color: 'yellow', placement: 'bottom' }}
      />
    );
    const text = screen.getByTestId('subtitle-overlay-text');
    expect(text.textContent).toBe('Hello');
    expect(text.style.fontSize).toBe('52px');
    expect(text.style.color).toBe('rgb(255, 225, 77)');
  });

  it('places subtitles at the top, raised or bottom, and lifts them above the OSD', () => {
    const { rerender } = render(
      <SubtitleOverlay text="Hi" settings={{ ...DEFAULT_SUBTITLE_SETTINGS, placement: 'top' }} />
    );
    let wrapper = screen.getByTestId('subtitle-overlay');
    expect(wrapper.style.top).toBe('64px');
    expect(wrapper.style.bottom).toBe('');

    rerender(
      <SubtitleOverlay text="Hi" settings={{ ...DEFAULT_SUBTITLE_SETTINGS, placement: 'bottom' }} />
    );
    wrapper = screen.getByTestId('subtitle-overlay');
    expect(wrapper.style.bottom).toBe('64px');

    rerender(
      <SubtitleOverlay
        text="Hi"
        osdVisible
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS, placement: 'bottom' }}
      />
    );
    expect(screen.getByTestId('subtitle-overlay').style.bottom).toBe('250px');

    rerender(
      <SubtitleOverlay
        text="Hi"
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS, placement: 'raised' }}
      />
    );
    expect(screen.getByTestId('subtitle-overlay').style.bottom).toBe('200px');
  });

  it('scales sizes for the miniature preview', () => {
    render(
      <SubtitleOverlay text="Hi" scale={0.25} settings={{ ...DEFAULT_SUBTITLE_SETTINGS, fontSize: 'xlarge' }} />
    );
    expect(screen.getByTestId('subtitle-overlay-text').style.fontSize).toBe('16px');
  });

  it('sets dir="auto" and unicode-bidi: plaintext for RTL Arabic/Hebrew punctuation ordering', () => {
    render(
      <SubtitleOverlay
        text="مرحبا بالعالم!"
        settings={{ fontSize: 'medium', color: 'white', placement: 'bottom' }}
      />
    );
    const el = screen.getByTestId('subtitle-overlay-text');
    expect(el).toHaveAttribute('dir', 'auto');
    expect(el.style.unicodeBidi).toBe('plaintext');
  });
});
