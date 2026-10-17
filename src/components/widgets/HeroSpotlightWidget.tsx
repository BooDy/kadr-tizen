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

  const cleanServer = serverUrl.replace(/\/+$/, '');
  const formatUrl = (path?: string, fallbackEndpoint?: string) => {
    const p = path || fallbackEndpoint;
    if (!p) return undefined;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    return `${cleanServer}${p.startsWith('/') ? '' : '/'}${p}`;
  };

  const backdrop = formatUrl(
    item.backdrop_url || item.poster_url,
    item.id ? `/api/v1/artwork/${item.id}/backdrop` : undefined
  );
  const poster = formatUrl(
    item.poster_url || item.backdrop_url,
    item.id ? `/api/v1/artwork/${item.id}/poster` : undefined
  );

  const hasResume = (item.playback_progress ?? 0) > 0;
  // Convert float progress to milliseconds placeholder if duration is unknown (or let player seek)
  const resumeMs = hasResume ? Math.round(item.playback_progress! * 100) : 0;

  return (
    <div className="relative w-full h-[520px] rounded-3xl overflow-hidden mb-10 bg-[#3B1111] border border-[rgba(245,229,229,0.08)] shadow-2xl">
      {backdrop && (
        <img
          src={backdrop}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#2A0A0A] via-[#2A0A0A]/70 to-transparent p-12 flex items-end justify-between">
        <div className="flex flex-col justify-end max-w-3xl flex-1 pr-6">
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

          <h2 className="text-5xl font-black text-[#F5E5E5] mb-4 tracking-tight drop-shadow-md">
            {item.title}
          </h2>
          {item.subtitle && (
            <p className="text-[#F5E5E5]/80 text-lg line-clamp-3 mb-6 leading-relaxed">
              {item.subtitle}
            </p>
          )}

          <div className="flex gap-4">
            <TVButton
              id={`hero-play-${widget.id}`}
              groupId="hero"
              variant="primary"
              onEnter={() => onPlay(item.id, resumeMs)}
              onClick={() => onPlay(item.id, resumeMs)}
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

        {poster && (
          <div className="hidden md:flex items-center justify-center shrink-0 self-center">
            <div className="w-[210px] h-[315px] rounded-2xl overflow-hidden shadow-2xl border-2 border-[rgba(245,229,229,0.15)] bg-[#2A0A0A]">
              <img
                src={poster}
                alt={`${item.title} poster`}
                data-testid="hero-poster"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
