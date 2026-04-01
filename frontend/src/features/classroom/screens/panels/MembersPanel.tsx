import { useCallback, useMemo, useState } from "react";
import { Search } from "@carbon/react";
import { UserMultiple } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomDetail } from "@/core/entities/classroom.entity";
import { MemberGrid, type MemberCardData } from "../../components/MemberTable";
import { EmptyBlock } from "../../components/EmptyBlock";

interface MembersPanelProps {
  classroom: ClassroomDetail;
}

export const MembersPanel: React.FC<MembersPanelProps> = ({ classroom }) => {
  const { t } = useTranslation("classroom");
  const [keyword, setKeyword] = useState("");

  const managers: MemberCardData[] = useMemo(() => {
    const owner: MemberCardData = { key: "owner", username: classroom.ownerUsername, role: "owner" };
    const adminCards: MemberCardData[] = classroom.admins
      .filter((a) => a.username !== classroom.ownerUsername)
      .map((a) => ({ key: `admin-${a.id}`, username: a.username, role: "manager" }));
    const taCards: MemberCardData[] = classroom.members
      .filter((m) => m.role === "ta")
      .map((m) => ({ key: `ta-${m.userId}`, username: m.username, email: m.email, avatarUrl: m.avatarUrl, role: "manager" as const }));
    return [owner, ...adminCards, ...taCards];
  }, [classroom.ownerUsername, classroom.admins, classroom.members]);

  const reservedUserIds = useMemo(
    () => new Set(classroom.admins.map((a) => a.id)),
    [classroom.admins],
  );

  const members: MemberCardData[] = useMemo(
    () =>
      classroom.members
        .filter(
          (m) =>
            m.role === "student" &&
            !reservedUserIds.has(m.userId) &&
            m.username !== classroom.ownerUsername,
        )
        .map((m) => ({ key: `student-${m.userId}`, username: m.username, email: m.email, avatarUrl: m.avatarUrl, role: "member" as const })),
    [classroom.members, classroom.ownerUsername, reservedUserIds],
  );

  const filterList = useCallback(
    (list: MemberCardData[]) => {
      const q = keyword.trim().toLowerCase();
      if (!q) return list;
      return list.filter(
        (m) => m.username.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q),
      );
    },
    [keyword],
  );

  const groups = [
    { key: "manager", label: t("memberGroupTeacher", "教師"), members: filterList(managers) },
    { key: "member", label: t("memberGroupStudent", "學生"), members: filterList(members) },
  ];

  const totalVisible = groups.reduce((sum, g) => sum + g.members.length, 0);

  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <h3>{t("membersTitle", "成員列表")}</h3>
        </div>
      </div>
      <div className="classroom-admin-member-search">
        <Search
          id="classroom-member-search"
          labelText={t("memberSearch", "搜尋成員")}
          placeholder={t("memberSearchPlaceholder", "搜尋 username 或 email")}
          size="md"
          value={keyword}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setKeyword(event.target.value)}
        />
      </div>
      {totalVisible === 0 ? (
        <EmptyBlock icon={UserMultiple} message={t("memberNoResult", "找不到符合篩選條件的成員")} compact />
      ) : (
        <div className="classroom-admin-member-groups">
          {groups.map((group) =>
            group.members.length > 0 ? (
              <div key={group.key} className="classroom-admin-member-group">
                <h4 className="classroom-admin-member-group__title">{group.label}</h4>
                <MemberGrid members={group.members} />
              </div>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
};
