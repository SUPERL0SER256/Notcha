import { useContext, useRef } from "react";
import { AnimatePresence, useTransform } from "motion/react";
import { useNowPlaying } from "../platform/media";
import { LiveActivity } from "../features/now-playing/LiveActivity";
import { LiveGaming } from "../features/system/LiveGaming";
import { useGamingLive } from "../features/system/gaming";
import { geometry } from "./geometry";
import { LiveSpread, ShapeWidth } from "./liveEdges";

/**
 * Which live activity the closed notch shows. Exactly one, by priority:
 * gaming mode (turned on deliberately) before background (music).
 * Add new activities here. The ID is also the tool that opens.
 */
export function useLiveActivity(): { id: string | null } {
  const gaming = useGamingLive();
  const np = useNowPlaying();
  if (gaming) return { id: "system" };
  if (np?.isPlaying) return { id: "media" };
  return { id: null };
}

/**
 * The activity sits in a fixed box the size of the closed live notch, centered. Its two
 * sides (LiveEdge) follow the shape's edges by transform as it opens, closes or peeks.
 * Pinned to the edges by layout instead, they crept in pixel steps (issue #3).
 */
export function LiveSlot({ id }: { id: string | null }) {
  const np = useNowPlaying();
  // Keep the last size while an activity fades out (id is null when the notch opens).
  const last = useRef(id);
  if (id) last.current = id;
  const box = last.current === "system" ? geometry.gaming : geometry.live;
  const boxW = useRef(box.w);
  boxW.current = box.w;
  const spread = useTransform(useContext(ShapeWidth), (w) =>
    Math.max(0, (w - boxW.current) / 2),
  );
  return (
    <LiveSpread.Provider value={spread}>
      <div
        className="absolute top-0 left-1/2"
        style={{ width: box.w, height: box.h, marginLeft: -box.w / 2 }}
      >
        <AnimatePresence initial={false}>
          {id === "system" && <LiveGaming key="system" />}
          {id === "media" && np && <LiveActivity key="media" np={np} />}
        </AnimatePresence>
      </div>
    </LiveSpread.Provider>
  );
}
