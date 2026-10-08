import { HeroBannerWidgetNode } from '../../types/ast';
import { TVButton } from '../tv/TVButton';
import { Play, Info, Star } from 'lucide-react';

export interface HeroSpotlightProps {
  widget: HeroBannerWidgetNode;
  serverUrl: string;
  onPlay: (itemId: number, resumeMs?: number) => void;
  onDetails: (itemId: number) => void;
}

export function HeroSpotlightWidget({ widget, serverUrl, onPlay, onDetails }: HeroSpotlightProps) {
  const item = widget.data;
  if (!item) return null;

  const backdrop = item.backdrop_url
    ? item.backdrop_url.startsWith('http')
      ? item.backdrop_url
      : `${serverUrl.replace(/\/+$/, '')}${item.backdrop_url.startsWith('/') ? '' : '/'}${item.backdrop_url}`
    : undefined;

  const hasResume = (item.playback_progress ?? 0) > 0;
  // Convert float progress to milliseconds placeholder if duration is unknown (or let player seek)
  const resumeMs = hasResume ? Math.round(item.playback_progress! * 100) : 0;

  return (
    <div className="relative w-full h-[520px] rounded-3xl overflow-hidden mb-10 bg-[#3B1111] border border-[rgba(245,229,229,0.08)]">
      {backdrop && (
        <img
          src={backdrop}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#2A0A0A] via-[#2A0A0A]/60 to-transparent p-12 flex flex-col justify-end">
        <div className="flex items-center gap-3 mb-3">
          {item.badge && (
            <span className="px-2.5 py-1 bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/30 text-xs font-bold rounded">
              {item.badge}
            </span>
          )}
          {item.rating && (
            <span className="flex items-center gap-1 text-[#FFB800] text-sm font-semibold bg-[#2A0A0A]/80 px-2 py-0.5 rounded border border-[rgba(245,229,229,0.08)]">
              <Star className="w-3.5 h-3.5 fill-current" /> {item.rating.toFixed(1)}
            </span>
          )}
          {item.release_year && (
            <span className="text-[#F5E5E5]/70 text-sm font-medium">{item.release_year}</span>
          )}
        </div>

        <h2 className="text-5xl font-black text-[#F5E5E5] max-w-3xl mb-4 tracking-tight drop-shadow-md">
          {item.title}
        </h2>
        {item.subtitle && (
          <p className="text-[#F5E5E5]/80 text-lg max-w-2xl line-clamp-3 mb-6 leading-relaxed">
            {item.subtitle}
          </p>
        )}

        <div className="flex gap-4">
          <TVButton
            id={`hero-play-${widget.id}`}
            groupId="hero"
            variant="primary"
            onEnter={() => onPlay(item.id, resumeMs)}
            autoFocus
          >
            <Play className="w-6 h-6 fill-current" />
            {hasResume ? 'Resume' : 'Play'}
          </TVButton>
          <TVButton
            id={`hero-details-${widget.id}`}
            groupId="hero"
            variant="secondary"
            onEnter={() => onDetails(item.id)}
          >
            <Info className="w-6 h-6" /> Details
          </TVButton>
        </div>
      </div>
    </div>
  );
}
