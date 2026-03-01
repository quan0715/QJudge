import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Grid,
  Column,
  Stack,
  SkeletonText,
  Button,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@carbon/react";
import { Add, Education } from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { getClassrooms, createClassroom } from "@/infrastructure/api/repositories/classroom.repository";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import type { Classroom } from "@/core/entities/classroom.entity";
import { PageHeader } from "@/shared/layout/PageHeader";
import { ClassroomCard } from "../components/ClassroomCard";
import { JoinClassroomModal } from "../components/JoinClassroomModal";
import { CreateClassroomModal } from "../components/CreateClassroomModal";
import "./ClassroomListScreen.scss";

const ClassroomListScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const isTeacherOrAdmin =
    user?.role === "teacher" || user?.role === "admin";

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await getClassrooms();
      setClassrooms(data);
    } catch (error) {
      console.error("Failed to fetch classrooms", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const managed = classrooms.filter(
    (c) => c.currentUserRole === "admin" || c.currentUserRole === "teacher"
  );
  const enrolled = classrooms.filter(
    (c) => c.currentUserRole === "student" || c.currentUserRole === "ta"
  );

  const handleCreate = async (name: string, description: string) => {
    await createClassroom({ name, description });
    setCreateOpen(false);
    fetchData();
  };

  const renderGrid = (items: Classroom[]) => {
    if (loading) {
      return (
        <div className="classroom-list__skeleton-grid">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="classroom-list__skeleton-card">
              <SkeletonText heading width="60%" />
              <SkeletonText width="40%" />
              <SkeletonText width="50%" />
            </div>
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="classroom-list__empty">
          <Education size={48} className="classroom-list__empty-icon" />
          <p>{t("classroom.empty", "沒有教室")}</p>
        </div>
      );
    }

    return (
      <div className="classroom-list__card-grid">
        {items.map((c) => (
          <ClassroomCard
            key={c.id}
            classroom={c}
            onClick={() => navigate(`/classrooms/${c.id}`)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="classroom-list">
      <Grid fullWidth className="classroom-list__grid">
        <Column lg={16} md={8} sm={4}>
          <PageHeader
            title={t("classroom.title", "教室")}
            subtitle={t("classroom.subtitle", "管理你的教室與課程")}
            action={
              <Stack orientation="horizontal" gap={4}>
                <Button
                  kind="tertiary"
                  size="sm"
                  onClick={() => setJoinOpen(true)}
                >
                  {t("classroom.join", "加入教室")}
                </Button>
                {isTeacherOrAdmin && (
                  <Button
                    kind="primary"
                    size="sm"
                    renderIcon={Add}
                    onClick={() => setCreateOpen(true)}
                  >
                    {t("classroom.create", "建立教室")}
                  </Button>
                )}
              </Stack>
            }
          />
        </Column>
        <Column lg={16} md={8} sm={4}>
          {isTeacherOrAdmin ? (
            <Tabs>
              <TabList aria-label="Classroom tabs">
                <Tab>{t("classroom.managed", "我管理的")}</Tab>
                <Tab>{t("classroom.enrolled", "已加入的")}</Tab>
              </TabList>
              <TabPanels>
                <TabPanel>{renderGrid(managed)}</TabPanel>
                <TabPanel>{renderGrid(enrolled)}</TabPanel>
              </TabPanels>
            </Tabs>
          ) : (
            renderGrid(enrolled)
          )}
        </Column>
      </Grid>

      <JoinClassroomModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={() => {
          setJoinOpen(false);
          fetchData();
        }}
      />

      {isTeacherOrAdmin && (
        <CreateClassroomModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
};

export default ClassroomListScreen;
