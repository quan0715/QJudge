import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

import type {
  LiveGrant,
  LiveSource,
  LiveState,
} from "@/core/entities/liveMonitoring.entity";
import { cloneVideoTrack } from "./ownedVideoTrack";

export interface LiveTransport {
  connect: (grant: LiveGrant) => Promise<void>;
  publishSources: (
    sources: Partial<Record<LiveSource, MediaStream | null>>,
  ) => Promise<void>;
  selectTarget: (identity: string | null) => void;
  bindVideo: (source: LiveSource, element: HTMLVideoElement | null) => void;
  onState: (listener: (state: LiveState) => void) => () => void;
  close: () => Promise<void>;
}

interface PublishedVideo {
  originalTrackId: string;
  owned: MediaStreamTrack;
  publication: unknown;
}

const sourceToSdkSource: Record<LiveSource, Track.Source> = {
  screen_share: Track.Source.ScreenShare,
  webcam: Track.Source.Camera,
};

const sdkSourceToSource: Partial<Record<Track.Source, LiveSource>> = {
  [Track.Source.ScreenShare]: "screen_share",
  [Track.Source.Camera]: "webcam",
};

const sourceFromPublication = (
  publication: RemoteTrackPublication,
): LiveSource | null => sdkSourceToSource[publication.source] ?? null;

export function createLiveKitTransport(): LiveTransport {
  let room: Room | null = null;
  let grant: LiveGrant | null = null;
  let closed = false;
  let generation = 0;
  let connectPromise: Promise<void> | null = null;
  let closePromise: Promise<void> | null = null;
  let publishQueue = Promise.resolve();
  let selectedIdentity: string | null = null;
  const stateListeners = new Set<(state: LiveState) => void>();
  const videoElements: Partial<Record<LiveSource, HTMLVideoElement | null>> = {};
  const published = new Map<LiveSource, PublishedVideo>();
  const sourceStreams = new Map<LiveSource, MediaStream>();
  const attachedTracks = new Map<LiveSource, RemoteTrack>();
  let republishCurrentSources: (() => Promise<void>) | null = null;

  const emitState = (state: LiveState) => {
    for (const listener of stateListeners) listener(state);
  };

  const attachTrack = (source: LiveSource, track: RemoteTrack) => {
    const element = videoElements[source];
    if (!element) return;
    const previous = attachedTracks.get(source);
    if (previous && previous !== track) {
      previous.detach(element);
    }
    track.attach(element);
    attachedTracks.set(source, track);
  };

  const detachTrack = (source: LiveSource, track?: RemoteTrack) => {
    const attached = attachedTracks.get(source);
    const target = track ?? attached;
    const element = videoElements[source];
    if (target && element) target.detach(element);
    if (!track || attached === track) attachedTracks.delete(source);
  };

  const participantPublications = (participant: RemoteParticipant) =>
    Array.from(participant.videoTrackPublications.values());

  const updateSubscriptions = () => {
    if (!room || !grant || grant.role !== "subscriber") return;
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participantPublications(participant)) {
        const source = sourceFromPublication(publication);
        publication.setSubscribed(
          participant.identity === selectedIdentity && source !== null,
        );
        if (
          participant.identity !== selectedIdentity &&
          source !== null &&
          publication.track
        ) {
          detachTrack(source, publication.track);
        }
      }
    }
  };

  const handleTrackSubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => {
    const source = sourceFromPublication(publication);
    if (source && participant.identity === selectedIdentity) {
      attachTrack(source, track);
    }
  };

  const handleTrackUnsubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
  ) => {
    const source = sourceFromPublication(publication);
    if (source) detachTrack(source, track);
  };

  const bindRoomEvents = (nextRoom: Room) => {
    nextRoom.on(RoomEvent.Reconnecting, () => {
      if (!closed) emitState("reconnecting");
    });
    nextRoom.on(RoomEvent.Reconnected, () => {
      if (!closed) {
        emitState("connected");
        updateSubscriptions();
        const republish = republishCurrentSources;
        if (republish) {
          const operation = publishQueue.then(republish);
          publishQueue = operation.catch(() => undefined);
          void operation.catch(() => {
            if (!closed) emitState("unavailable");
          });
        }
      }
    });
    nextRoom.on(RoomEvent.Disconnected, () => {
      if (!closed) emitState("unavailable");
    });
    nextRoom.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    nextRoom.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    nextRoom.on(RoomEvent.TrackPublished, (publication, participant) => {
      const source = sourceFromPublication(publication);
      if (source) {
        publication.setSubscribed(
          participant.identity === selectedIdentity,
        );
      }
    });
    nextRoom.on(RoomEvent.TrackUnpublished, (publication) => {
      const source = sourceFromPublication(publication);
      if (source) detachTrack(source, publication.track);
    });
    nextRoom.on(RoomEvent.ParticipantConnected, updateSubscriptions);
    nextRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      for (const publication of participantPublications(participant)) {
        const source = sourceFromPublication(publication);
        if (source && publication.track) detachTrack(source, publication.track);
      }
      updateSubscriptions();
    });
  };

  const connect = (nextGrant: LiveGrant): Promise<void> => {
    if (closed) return Promise.reject(new Error("LiveKit transport is closed"));
    if (connectPromise) return connectPromise;
    if (grant?.token === nextGrant.token && room) return Promise.resolve();

    const attemptGeneration = ++generation;
    grant = nextGrant;
    room = new Room({
      adaptiveStream: true,
      dynacast: false,
      stopLocalTrackOnUnpublish: false,
      disconnectOnPageLeave: false,
      publishDefaults: { simulcast: false, backupCodec: false },
    });
    bindRoomEvents(room);
    emitState("connecting");

    const nextRoom = room;
    const pending = nextRoom
      .connect(nextGrant.serverUrl, nextGrant.token, { autoSubscribe: false })
      .then(() => {
        if (closed || attemptGeneration !== generation || room !== nextRoom) {
          return nextRoom.disconnect(false);
        }
        emitState("connected");
        updateSubscriptions();
      })
      .catch((error) => {
        if (!closed && attemptGeneration === generation) emitState("unavailable");
        throw error;
      })
      .finally(() => {
        if (connectPromise === pending) connectPromise = null;
      });
    connectPromise = pending;
    return pending;
  };

  const removePublished = async (source: LiveSource) => {
    const current = published.get(source);
    if (!current) return;
    published.delete(source);
    try {
      if (room) {
        await room.localParticipant.unpublishTrack(current.owned, false);
      }
    } finally {
      current.owned.stop();
    }
  };

  const publishSource = async (
    source: LiveSource,
    stream: MediaStream,
    force = false,
  ) => {
    if (!room || !grant || grant.role !== "publisher") {
      throw new Error("LiveKit publisher is not connected");
    }
    if (!grant.allowedSources.includes(source)) {
      await removePublished(source);
      return;
    }

    const track = stream.getVideoTracks()[0];
    if (!track || track.kind !== "video" || track.readyState !== "live") {
      sourceStreams.delete(source);
      await removePublished(source);
      return;
    }
    const current = published.get(source);
    if (!force && current?.originalTrackId === track.id) return;
    await removePublished(source);

    const owned = cloneVideoTrack(track);
    try {
      const publication = await room.localParticipant.publishTrack(owned, {
        source: sourceToSdkSource[source],
        name: `qjudge-${source}`,
        simulcast: false,
      });
      if (closed) {
        await room.localParticipant.unpublishTrack(owned, false);
        owned.stop();
        return;
      }
      published.set(source, {
        originalTrackId: track.id,
        owned,
        publication,
      });
    } catch (error) {
      owned.stop();
      throw error;
    }
  };

  republishCurrentSources = async () => {
    if (!room || !grant || grant.role !== "publisher") return;
    for (const source of Object.keys(sourceToSdkSource) as LiveSource[]) {
      const stream = sourceStreams.get(source);
      if (stream) await publishSource(source, stream, true);
    }
  };

  const publishSources = (
    sources: Partial<Record<LiveSource, MediaStream | null>>,
  ): Promise<void> => {
    const operation = publishQueue.then(async () => {
      if (closed) throw new Error("LiveKit transport is closed");
      if (connectPromise) await connectPromise;
      if (!room || !grant || grant.role !== "publisher") {
        throw new Error("LiveKit publisher is not connected");
      }

      for (const source of Object.keys(sources) as LiveSource[]) {
        const stream = sources[source];
        if (stream === null || stream === undefined) {
          sourceStreams.delete(source);
          await removePublished(source);
          continue;
        }
        sourceStreams.set(source, stream);
        await publishSource(source, stream);
      }
    });
    publishQueue = operation.catch(() => undefined);
    return operation;
  };

  const selectTarget = (identity: string | null) => {
    if (selectedIdentity !== identity) {
      for (const source of Object.keys(sourceToSdkSource) as LiveSource[]) {
        detachTrack(source);
      }
    }
    selectedIdentity = identity;
    updateSubscriptions();
    if (!room || !identity) return;
    const participant = room.remoteParticipants.get(identity);
    if (!participant) return;
    for (const publication of participantPublications(participant)) {
      const source = sourceFromPublication(publication);
      if (source && publication.track) attachTrack(source, publication.track);
    }
  };

  const bindVideo = (source: LiveSource, element: HTMLVideoElement | null) => {
    const previousElement = videoElements[source];
    const attached = attachedTracks.get(source);
    if (attached && previousElement && previousElement !== element) {
      attached.detach(previousElement);
      attachedTracks.delete(source);
    }
    videoElements[source] = element;
    if (!element || !room || !selectedIdentity) return;
    const participant = room.remoteParticipants.get(selectedIdentity);
    const publication = participant
      ? participantPublications(participant).find(
          (candidate) => sourceFromPublication(candidate) === source,
        )
      : undefined;
    if (publication?.track) attachTrack(source, publication.track);
  };

  const onState = (listener: (state: LiveState) => void) => {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  };

  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closed = true;
    generation += 1;
    emitState("closed");
    for (const [source, track] of attachedTracks) detachTrack(source, track);
    for (const current of published.values()) current.owned.stop();
    published.clear();
    sourceStreams.clear();
    const nextRoom = room;
    closePromise = nextRoom ? nextRoom.disconnect(false).then(() => undefined) : Promise.resolve();
    return closePromise;
  };

  return {
    connect,
    publishSources,
    selectTarget,
    bindVideo,
    onState,
    close,
  };
}

export type LiveKitTransport = LiveTransport;
