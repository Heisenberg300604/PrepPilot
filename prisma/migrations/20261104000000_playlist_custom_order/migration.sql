-- Additive: remembers that the user reordered a playlist so sync keeps their order.
ALTER TABLE "Playlist" ADD COLUMN "customOrder" BOOLEAN NOT NULL DEFAULT false;
