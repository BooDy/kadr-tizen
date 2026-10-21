import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { HeroSpotlightWidget } from '../../src/components/widgets/HeroSpotlightWidget';
import { HeroBannerWidgetNode } from '../../src/types/ast';

describe('HeroSpotlightWidget', () => {
  it('renders hero spotlight action buttons with enlarged padding, gap-8 spacing, and text-3xl font size', () => {
    const mockWidget: HeroBannerWidgetNode = {
      type: 'hero_banner',
      id: 'spotlight-1',
      data: {
        id: 101,
        title: 'Interstellar',
        subtitle: 'Mankind was born on Earth',
        backdrop_url: '/backdrop.jpg',
        poster_url: '/poster.jpg',
        media_type: 'movie',
        playback_progress: 0.5,
      },
    };

    render(
      <FocusProvider>
        <HeroSpotlightWidget
          widget={mockWidget}
          serverUrl="http://localhost:8096"
          onPlay={vi.fn()}
          onDetails={vi.fn()}
        />
      </FocusProvider>
    );

    const resumeBtn = screen.getByRole('button', { name: /resume/i });
    const detailsBtn = screen.getByRole('button', { name: /details/i });

    expect(resumeBtn.className).toContain('!py-6');
    expect(resumeBtn.className).toContain('!px-12');
    expect(resumeBtn.className).toContain('!text-3xl');
    expect(resumeBtn.className).toContain('font-extrabold');
    expect(resumeBtn.parentElement?.className).toContain('gap-8');

    expect(detailsBtn.className).toContain('!py-6');
    expect(detailsBtn.className).toContain('!px-12');
    expect(detailsBtn.className).toContain('!text-3xl');
    expect(detailsBtn.className).toContain('font-extrabold');
  });
});
