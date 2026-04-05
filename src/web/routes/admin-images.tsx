import { useState, useEffect, useContext } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";
import { trpc } from "../trpc.js";
import { AuthContext } from "../auth.js";
import { ImageCard } from "./admin-image-card.js";
import type { WorldImageRecord } from "./admin-image-card.js";

export const adminImagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/images/$gameId",
  component: AdminImagesPage,
});

interface ImageSettings {
  gameId: string;
  imagesEnabled: boolean;
  imageStyleRoom: string | null;
  imageStyleNpc: string | null;
  updatedAt: string;
}

interface GameSummary {
  slug: string;
  title: string;
}

function AdminImagesPage() {
  const { gameId } = adminImagesRoute.useParams();
  const auth = useContext(AuthContext);
  const isAdmin = auth.user && auth.user.roles && auth.user.roles.includes("admin");

  const [games, setGames] = useState<GameSummary[]>([]);
  const [settings, setSettings] = useState<ImageSettings | null>(null);
  const [images, setImages] = useState<WorldImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomStyle, setRoomStyle] = useState("");
  const [npcStyle, setNpcStyle] = useState("");

  const [defaults, setDefaults] = useState<{
    imageStyleRoom: string | null;
    imageStyleNpc: string | null;
  }>({
    imageStyleRoom: null,
    imageStyleNpc: null,
  });

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      trpc.games.query(),
      trpc.adminImageSettings.query({ gameId }),
      trpc.adminImageDefaults.query({ gameId }),
      trpc.adminListWorldImages.query({ gameId }),
    ])
      .then(([gameList, settingsData, defaultsData, imageList]) => {
        setGames(gameList as GameSummary[]);
        setSettings(settingsData as ImageSettings | null);
        setDefaults(
          defaultsData as { imageStyleRoom: string | null; imageStyleNpc: string | null },
        );
        setImages(imageList as WorldImageRecord[]);
        const s = settingsData as ImageSettings | null;
        const d = defaultsData as { imageStyleRoom: string | null; imageStyleNpc: string | null };
        setRoomStyle((s && s.imageStyleRoom) || d.imageStyleRoom || "");
        setNpcStyle((s && s.imageStyleNpc) || d.imageStyleNpc || "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
      });
  }, [isAdmin, gameId]);

  if (!isAdmin) {
    return <div className="p-8 text-content/50">Admin access required.</div>;
  }
  if (loading) return <div className="p-8 text-content/50">Loading...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;

  const currentGame = games.find((g) => g.slug === gameId);
  const roomImage = images.find((i) => i.imageType === "room-reference");
  const npcImage = images.find((i) => i.imageType === "npc-reference");

  function handleImageGenerated(record: WorldImageRecord) {
    setImages((prev) => {
      const filtered = prev.filter((i) => i.imageType !== record.imageType);
      return [...filtered, record];
    });
  }

  function handleImageDeleted(imageType: string) {
    setImages((prev) => prev.filter((i) => i.imageType !== imageType));
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link to="/admin" className="text-sm text-content/50 hover:text-content/80">
          &larr; Admin Dashboard
        </Link>
      </div>
      <h1 className="mb-2 text-2xl font-bold">
        Images: {currentGame ? currentGame.title : gameId}
      </h1>
      <GameNav games={games} currentGameId={gameId} />
      <SettingsSection
        gameId={gameId}
        settings={settings}
        defaults={defaults}
        roomStyle={roomStyle}
        npcStyle={npcStyle}
        onRoomStyleChange={setRoomStyle}
        onNpcStyleChange={setNpcStyle}
        onSettingsUpdated={(s) => {
          setSettings(s);
          if (!s || !s.imageStyleRoom) setRoomStyle(defaults.imageStyleRoom || "");
          if (!s || !s.imageStyleNpc) setNpcStyle(defaults.imageStyleNpc || "");
        }}
      />
      <section className="space-y-6">
        <h2 className="text-lg font-bold">Reference Images</h2>
        <ImageCard
          gameId={gameId}
          imageType="room-reference"
          label="Room Reference"
          defaultPrompt="A generic room in this world, establishing the visual style and atmosphere."
          stylePrompt={roomStyle}
          existing={roomImage}
          onGenerated={handleImageGenerated}
          onDeleted={handleImageDeleted}
        />
        <ImageCard
          gameId={gameId}
          imageType="npc-reference"
          label="NPC Reference"
          defaultPrompt="A generic NPC character in this world, establishing the visual style for characters."
          stylePrompt={npcStyle}
          existing={npcImage}
          onGenerated={handleImageGenerated}
          onDeleted={handleImageDeleted}
        />
      </section>
    </div>
  );
}

function GameNav({ games, currentGameId }: { games: GameSummary[]; currentGameId: string }) {
  return (
    <div className="mb-4 flex gap-2 text-sm">
      {games.map((g) => (
        <Link
          key={g.slug}
          to="/admin/images/$gameId"
          params={{ gameId: g.slug }}
          className={`rounded px-2 py-1 ${g.slug === currentGameId ? "bg-content/20 text-content" : "text-content/50 hover:text-content/80"}`}
        >
          {g.title}
        </Link>
      ))}
    </div>
  );
}

interface ImageDefaults {
  imageStyleRoom: string | null;
  imageStyleNpc: string | null;
}

function SettingsSection({
  gameId,
  settings,
  defaults,
  roomStyle,
  npcStyle,
  onRoomStyleChange,
  onNpcStyleChange,
  onSettingsUpdated,
}: {
  gameId: string;
  settings: ImageSettings | null;
  defaults: ImageDefaults;
  roomStyle: string;
  npcStyle: string;
  onRoomStyleChange: (v: string) => void;
  onNpcStyleChange: (v: string) => void;
  onSettingsUpdated: (s: ImageSettings | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(settings ? settings.imagesEnabled : false);
  const [error, setError] = useState<string | null>(null);

  const hasRoomOverride = settings && settings.imageStyleRoom !== null;
  const hasNpcOverride = settings && settings.imageStyleNpc !== null;
  const hasAnyOverride = hasRoomOverride || hasNpcOverride;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const roomOverride = roomStyle && roomStyle !== defaults.imageStyleRoom ? roomStyle : null;
      const npcOverride = npcStyle && npcStyle !== defaults.imageStyleNpc ? npcStyle : null;
      await trpc.adminUpdateImageSettings.mutate({
        gameId,
        imagesEnabled: enabled,
        imageStyleRoom: roomOverride,
        imageStyleNpc: npcOverride,
      });
      const updated = await trpc.adminImageSettings.query({ gameId });
      onSettingsUpdated(updated as ImageSettings | null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert() {
    setSaving(true);
    setError(null);
    try {
      await trpc.adminRevertImageSettings.mutate({ gameId });
      onSettingsUpdated(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-8 rounded border border-content/20 p-4">
      <h2 className="mb-4 text-lg font-bold">Settings</h2>
      <label className="mb-4 flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Images enabled</span>
      </label>
      <div className="mb-4">
        <label className="mb-1 block text-sm font-bold">
          Room Style Prompt
          {hasRoomOverride ? (
            <span className="ml-2 text-xs text-content/40">(overridden)</span>
          ) : null}
        </label>
        <textarea
          className="w-full rounded border border-content/20 bg-surface p-2 text-sm text-content"
          rows={3}
          value={roomStyle}
          onChange={(e) => onRoomStyleChange(e.target.value)}
          placeholder={defaults.imageStyleRoom || "Describe the visual style for room images..."}
        />
      </div>
      <div className="mb-4">
        <label className="mb-1 block text-sm font-bold">
          NPC Style Prompt
          {hasNpcOverride ? (
            <span className="ml-2 text-xs text-content/40">(overridden)</span>
          ) : null}
        </label>
        <textarea
          className="w-full rounded border border-content/20 bg-surface p-2 text-sm text-content"
          rows={3}
          value={npcStyle}
          onChange={(e) => onNpcStyleChange(e.target.value)}
          placeholder={defaults.imageStyleNpc || "Describe the visual style for NPC images..."}
        />
      </div>
      {error ? <div className="mb-2 text-sm text-red-400">{error}</div> : null}
      <div className="flex items-center gap-3">
        <button
          className="rounded bg-content/20 px-4 py-2 text-sm hover:bg-content/30 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {hasAnyOverride ? (
          <button
            className="rounded border border-content/20 px-4 py-2 text-sm text-content/50 hover:bg-content/10 hover:text-content/70 disabled:opacity-50"
            onClick={handleRevert}
            disabled={saving}
          >
            Revert to defaults
          </button>
        ) : null}
        {settings ? (
          <span className="text-xs text-content/40">
            Last updated: {new Date(settings.updatedAt).toLocaleString()}
          </span>
        ) : null}
      </div>
    </section>
  );
}
