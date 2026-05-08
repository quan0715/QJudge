import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AttendancePhotoKind,
  AttendancePhotoPolicy,
} from "@/core/entities/contest.entity";

import {
  getPhotoRequirementsByPolicy,
  type AttendancePhotoRequirement,
  type AttendanceTranslate,
} from "../lib/photoRequirements";

export interface UseAttendancePhotosOptions {
  tr: AttendanceTranslate;
  photoPolicy: AttendancePhotoPolicy;
  hasScan: boolean;
}

export interface UseAttendancePhotosResult {
  photoRequirements: AttendancePhotoRequirement[];
  currentPhoto: AttendancePhotoRequirement;
  photoIndex: number;
  photoBlobs: Partial<Record<AttendancePhotoKind, Blob>>;
  photoUrls: Partial<Record<AttendancePhotoKind, string>>;
  reviewPhotoRequirement: AttendancePhotoRequirement | null;
  reviewPhotoUrl: string | undefined;
  completedPhotoCount: number;
  allPhotosCaptured: boolean;
  hasNextPhoto: boolean;
  nextPhotoIndex: number;
  applyCapture: (blob: Blob) => void;
  acceptPhoto: () => void;
  retakePhoto: () => void;
  reset: () => void;
}

export function useAttendancePhotos({
  tr,
  photoPolicy,
  hasScan,
}: UseAttendancePhotosOptions): UseAttendancePhotosResult {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<
    Partial<Record<AttendancePhotoKind, string>>
  >({});
  const [photoBlobs, setPhotoBlobs] = useState<
    Partial<Record<AttendancePhotoKind, Blob>>
  >({});
  const [reviewPhotoKind, setReviewPhotoKind] =
    useState<AttendancePhotoKind | null>(null);

  const photoUrlsRef = useRef(photoUrls);
  useEffect(() => {
    photoUrlsRef.current = photoUrls;
  }, [photoUrls]);

  const photoRequirements = useMemo(
    () => getPhotoRequirementsByPolicy(tr)[photoPolicy],
    [photoPolicy, tr],
  );
  const currentPhoto =
    photoRequirements[Math.min(photoIndex, photoRequirements.length - 1)];
  const reviewPhotoRequirement =
    photoRequirements.find((r) => r.id === reviewPhotoKind) || null;
  const allPhotosCaptured = photoRequirements.every((r) => !!photoBlobs[r.id]);
  const reviewPhotoUrl = reviewPhotoRequirement
    ? photoUrls[reviewPhotoRequirement.id]
    : undefined;
  const completedPhotoCount = photoRequirements.filter(
    (r) => !!photoBlobs[r.id],
  ).length;
  const nextPhotoIndex = reviewPhotoRequirement
    ? photoRequirements.findIndex((r) => r.id === reviewPhotoRequirement.id) + 1
    : -1;
  const hasNextPhoto =
    nextPhotoIndex > 0 && nextPhotoIndex < photoRequirements.length;

  useEffect(() => {
    if (!hasScan || allPhotosCaptured || reviewPhotoRequirement) return;
    const nextMissing = photoRequirements.findIndex((r) => !photoBlobs[r.id]);
    if (nextMissing >= 0 && nextMissing !== photoIndex) {
      setPhotoIndex(nextMissing);
    }
  }, [
    hasScan,
    allPhotosCaptured,
    photoBlobs,
    photoIndex,
    photoRequirements,
    reviewPhotoRequirement,
  ]);

  useEffect(() => {
    return () => {
      Object.values(photoUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const applyCapture = useCallback(
    (blob: Blob) => {
      const targetId = currentPhoto.id;
      const existingUrl = photoUrlsRef.current[targetId];
      if (existingUrl) URL.revokeObjectURL(existingUrl);
      setPhotoBlobs((prev) => ({ ...prev, [targetId]: blob }));
      setPhotoUrls((prev) => ({ ...prev, [targetId]: URL.createObjectURL(blob) }));
      setReviewPhotoKind(targetId);
    },
    [currentPhoto.id],
  );

  const acceptPhoto = useCallback(() => {
    if (!reviewPhotoRequirement) return;
    const acceptedIndex = photoRequirements.findIndex(
      (r) => r.id === reviewPhotoRequirement.id,
    );
    setReviewPhotoKind(null);
    if (acceptedIndex >= 0 && acceptedIndex < photoRequirements.length - 1) {
      setPhotoIndex(acceptedIndex + 1);
    }
  }, [photoRequirements, reviewPhotoRequirement]);

  const retakePhoto = useCallback(() => {
    let lastCaptured = reviewPhotoRequirement
      ? photoRequirements.findIndex((r) => r.id === reviewPhotoRequirement.id)
      : 0;
    if (lastCaptured < 0) lastCaptured = 0;
    if (!reviewPhotoRequirement) {
      photoRequirements.forEach((r, i) => {
        if (photoBlobs[r.id]) lastCaptured = i;
      });
    }
    const requirement = photoRequirements[lastCaptured];
    const existingUrl = photoUrlsRef.current[requirement.id];
    if (existingUrl) URL.revokeObjectURL(existingUrl);
    setPhotoBlobs((prev) => {
      const next = { ...prev };
      delete next[requirement.id];
      return next;
    });
    setPhotoUrls((prev) => {
      const next = { ...prev };
      delete next[requirement.id];
      return next;
    });
    setPhotoIndex(lastCaptured);
    setReviewPhotoKind(null);
  }, [photoBlobs, photoRequirements, reviewPhotoRequirement]);

  const reset = useCallback(() => {
    Object.values(photoUrlsRef.current).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    setPhotoBlobs({});
    setPhotoUrls({});
    setPhotoIndex(0);
    setReviewPhotoKind(null);
  }, []);

  return {
    photoRequirements,
    currentPhoto,
    photoIndex,
    photoBlobs,
    photoUrls,
    reviewPhotoRequirement,
    reviewPhotoUrl,
    completedPhotoCount,
    allPhotosCaptured,
    hasNextPhoto,
    nextPhotoIndex,
    applyCapture,
    acceptPhoto,
    retakePhoto,
    reset,
  };
}
