-- Additive: remembers videos the user removed from an imported playlist so sync never re-adds them.
CREATE TABLE "PlaylistExclusion" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaylistExclusion_playlistId_youtubeVideoId_key" ON "PlaylistExclusion"("playlistId", "youtubeVideoId");

ALTER TABLE "PlaylistExclusion" ADD CONSTRAINT "PlaylistExclusion_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
