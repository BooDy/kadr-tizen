import { useState, useEffect } from 'react';
import { ScreenLayout } from '../types/ast';
import { ApiClient } from '../api/client';
import { fetchScreenLayout } from '../api/screens';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { TVButton } from '../components/tv/TVButton';
import { Home, Film, Tv, Users } from 'lucide-react';

export interface BrowseScreenProps {
  client: ApiClient;
  serverUrl: string;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string, resumeMs?: number) => void;
  onSwitchProfile: () => void;
  initialTab?: 'home' | 'movies' | 'shows';
}

export function BrowseScreen({
  client,
  serverUrl,
  onSelectItem,
  onPlayItem,
  onSwitchProfile,
  initialTab = 'home',
}: BrowseScreenProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'movies' | 'shows'>(initialTab);
  const [layout, setLayout] = useState<ScreenLayout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchScreenLayout(client, activeTab)
      .then((data) => {
        if (!cancelled) {
          setLayout(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLayout(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, activeTab]);

  return (
    <div className="w-full h-full flex bg-zinc-950 overflow-hidden">
      {/* Collapsible Left TV Sidebar */}
      <nav className="group w-28 hover:w-64 focus-within:w-64 transition-all duration-200 bg-zinc-900/90 border-r border-zinc-800/80 p-4 flex flex-col justify-between z-40">
        <div className="flex flex-col gap-4">
          <div className="h-16 flex items-center justify-center font-black text-2xl text-sky-400">
            KADR
          </div>
          <TVButton
            id="nav-home"
            groupId="sidebar"
            order={1}
            variant={activeTab === 'home' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('home')}
            className="w-full justify-start px-4"
          >
            <Home className="w-6 h-6 shrink-0" />
            <span className="hidden group-hover:inline group-focus-within:inline ml-2 text-lg">Home</span>
          </TVButton>
          <TVButton
            id="nav-movies"
            groupId="sidebar"
            order={2}
            variant={activeTab === 'movies' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('movies')}
            className="w-full justify-start px-4"
          >
            <Film className="w-6 h-6 shrink-0" />
            <span className="hidden group-hover:inline group-focus-within:inline ml-2 text-lg">Movies</span>
          </TVButton>
          <TVButton
            id="nav-shows"
            groupId="sidebar"
            order={3}
            variant={activeTab === 'shows' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('shows')}
            className="w-full justify-start px-4"
          >
            <Tv className="w-6 h-6 shrink-0" />
            <span className="hidden group-hover:inline group-focus-within:inline ml-2 text-lg">Shows</span>
          </TVButton>
        </div>

        <TVButton
          id="nav-switch-profile"
          groupId="sidebar"
          order={4}
          variant="secondary"
          onEnter={onSwitchProfile}
          className="w-full justify-start px-4"
        >
          <Users className="w-6 h-6 shrink-0" />
          <span className="hidden group-hover:inline group-focus-within:inline ml-2 text-lg">Profiles</span>
        </TVButton>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto p-12 scrollbar-none">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-2xl">
            Loading {activeTab}...
          </div>
        ) : layout ? (
          <WidgetRenderer
            layout={layout}
            serverUrl={serverUrl}
            onSelectItem={onSelectItem}
            onPlayItem={onPlayItem}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-rose-400 text-2xl">
            Failed to load screen layout.
          </div>
        )}
      </main>
    </div>
  );
}
