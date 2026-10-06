import { ASTHeroWidget } from '../../types/ast';
import { TVButton } from '../tv/TVButton';
import { Play, Info } from 'lucide-react';

export interface HeroSpotlightProps {
  widget: ASTHeroWidget;
  serverUrl: string;
  onPlay: (itemId: string, resumeMs?: number) => void;
  onDetails: (itemId: string) => void;
}

export function HeroSpotlightWidget({ widget, serverUrl, onPlay, onDetails }: HeroSpotlightProps) {
  const backdrop = widget.backdrop_url
    ? widget.backdrop_url.startsWith('http://') || widget.backdrop_url.startsWith('https://')
      ? widget.backdrop_url
      : `${serverUrl.replace(/\/+$/, '')}${widget.backdrop_url.startsWith('/') ? widget.backdrop_url : `/${widget.backdrop_url}`}`
    : undefined;

  return (
    <div className="relative w-full h-[520px] rounded-3xl overflow-hidden mb-10 bg-zinc-900 border border-zinc-800">
      {backdrop && (
        <img
          src={backdrop}
          alt={widget.title}
          className="absolute inset-0 w-full h-full object-cover opacity-40 mask-radial"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent p-12 flex flex-col justify-end">
        {widget.badges && widget.badges.length > 0 && (
          <div className="flex gap-2 mb-3">
            {widget.badges.map((b) => (
              <span
                key={b}
                className="px-2.5 py-1 bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold rounded"
              >
                {b}
              </span>
            ))}
          </div>
        )}
        <h2 className="text-5xl font-black text-white max-w-3xl mb-4 tracking-tight drop-shadow-md">
          {widget.title}
        </h2>
        {widget.synopsis && (
          <p className="text-zinc-300 text-lg max-w-2xl line-clamp-3 mb-6 leading-relaxed">
            {widget.synopsis}
          </p>
        )}
        <div className="flex gap-4">
          <TVButton
            id={`hero-play-${widget.id}`}
            groupId="hero"
            order={1}
            variant="primary"
            onEnter={() => onPlay(widget.item_id, widget.resume_position_ms)}
            autoFocus
          >
            <Play className="w-6 h-6 fill-current" />
            {widget.resume_position_ms && widget.resume_position_ms > 0 ? 'Resume' : 'Play'}
          </TVButton>
          <TVButton
            id={`hero-details-${widget.id}`}
            groupId="hero"
            order={2}
            variant="secondary"
            onEnter={() => onDetails(widget.item_id)}
          >
            <Info className="w-6 h-6" /> Details
          </TVButton>
        </div>
      </div>
    </div>
  );
}
