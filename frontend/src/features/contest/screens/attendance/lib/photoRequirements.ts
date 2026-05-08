import type {
  AttendancePhotoKind,
  AttendancePhotoPolicy,
} from "@/core/entities/contest.entity";

export type AttendancePhotoRequirement = {
  id: AttendancePhotoKind;
  label: string;
  title: string;
  description: string;
  facingMode: VideoFacingModeEnum;
};

export type AttendanceTranslate = (
  key: string,
  defaultValue: string,
  values?: Record<string, string | number>,
) => string;

const defaultTranslate: AttendanceTranslate = (_key, defaultValue, values) =>
  defaultValue.replace(/{{(\w+)}}/g, (_, name) =>
    String(values?.[name] ?? ""),
  );

export const getPhotoRequirementsByPolicy = (
  tr: AttendanceTranslate = defaultTranslate,
): Record<AttendancePhotoPolicy, AttendancePhotoRequirement[]> => ({
  room: [
    {
      id: "room",
      label: tr("attendance.photo.room.label", "現場照片"),
      title: tr("attendance.photo.room.title", "拍攝現場照片"),
      description: tr(
        "attendance.photo.room.description",
        "請拍攝教室環境與考試裝置畫面。",
      ),
      facingMode: "environment",
    },
  ],
  room_and_selfie: [
    {
      id: "room",
      label: tr("attendance.photo.room.label", "現場照片"),
      title: tr("attendance.photo.room.title", "拍攝現場照片"),
      description: tr(
        "attendance.photo.room.rearDescription",
        "請使用後鏡頭拍攝教室環境與考試裝置畫面。",
      ),
      facingMode: "environment",
    },
    {
      id: "selfie",
      label: tr("attendance.photo.selfie.label", "本人照片"),
      title: tr("attendance.photo.selfie.title", "拍攝本人到場照片"),
      description: tr(
        "attendance.photo.selfie.description",
        "請使用前鏡頭拍攝本人到場照片。",
      ),
      facingMode: "user",
    },
  ],
});
