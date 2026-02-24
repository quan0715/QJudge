import React from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Grid,
  Column,
  ProgressIndicator,
  ProgressStep,
  Stack,
  Tag,
  Tile,
  InlineNotification,
} from "@carbon/react";
import { ArrowLeft, ArrowRight } from "@carbon/icons-react";

import { HeroBase } from "@/shared/layout/HeroBase";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import {
  EXAM_FLOW_STEPS,
  getExamFlowStepIndex,
  type ExamFlowStepKey,
} from "./examFlowSteps";

interface ExamFlowTemplateScreenProps {
  stepKey: ExamFlowStepKey;
  title: string;
  description: string;
  bullets: string[];
  notice?: string;
  actionPanel?: ReactNode;
}

const ExamFlowTemplateScreen: React.FC<ExamFlowTemplateScreenProps> = ({
  stepKey,
  title,
  description,
  bullets,
  notice,
  actionPanel,
}) => {
  const navigate = useNavigate();
  const { contestId } = useParams<{ contestId: string }>();

  const currentIndex = getExamFlowStepIndex(stepKey);
  const currentStep = EXAM_FLOW_STEPS[currentIndex];
  const previousStep = currentIndex > 0 ? EXAM_FLOW_STEPS[currentIndex - 1] : null;
  const nextStep =
    currentIndex < EXAM_FLOW_STEPS.length - 1
      ? EXAM_FLOW_STEPS[currentIndex + 1]
      : null;

  const goToStep = (path: string) => {
    if (!contestId) return;
    navigate(`/contests/${contestId}/exam-v2/${path}`);
  };

  return (
    <>
      <HeroBase
        title={title}
        description={description}
        badges={
          <>
            <Tag type="red">Exam Module v2</Tag>
            <Tag type="green">API Connected</Tag>
          </>
        }
        metadata={
          <>
            <div>
              <div style={{ marginBottom: "0.25rem" }}>目前步驟</div>
              <div style={{ color: "var(--cds-text-primary)", fontWeight: 600 }}>
                {currentStep?.title}
              </div>
            </div>
            <div>
              <div style={{ marginBottom: "0.25rem" }}>路由</div>
              <div style={{ color: "var(--cds-text-secondary)" }}>
                {`/contests/${contestId || ":contestId"}/exam-v2/${currentStep?.path}`}
              </div>
            </div>
          </>
        }
        maxWidth="1056px"
      />

      <SurfaceSection maxWidth="1056px">
        <Grid fullWidth>
          <Column lg={16} md={8} sm={4}>
            <Stack gap={6} style={{ marginBlock: "1.5rem" }}>
              <ProgressIndicator currentIndex={currentIndex} spaceEqually>
                {EXAM_FLOW_STEPS.map((step) => (
                  <ProgressStep
                    key={step.key}
                    label={step.title}
                    secondaryLabel={step.subtitle}
                  />
                ))}
              </ProgressIndicator>

              {notice ? (
                <InlineNotification
                  kind="info"
                  lowContrast
                  hideCloseButton
                  title="實作說明"
                  subtitle={notice}
                />
              ) : null}

              <Tile>
                <h4 style={{ marginTop: 0 }}>{currentStep?.subtitle}</h4>
                <ul style={{ marginBottom: 0 }}>
                  {bullets.map((item) => (
                    <li key={item} style={{ marginBottom: "0.5rem" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </Tile>

              {actionPanel ? <Tile>{actionPanel}</Tile> : null}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                {previousStep ? (
                  <Button
                    kind="secondary"
                    renderIcon={ArrowLeft}
                    onClick={() => goToStep(previousStep.path)}
                  >
                    上一步
                  </Button>
                ) : (
                  <div />
                )}

                {nextStep ? (
                  <Button
                    kind="primary"
                    renderIcon={ArrowRight}
                    iconDescription="下一步"
                    onClick={() => goToStep(nextStep.path)}
                  >
                    下一步
                  </Button>
                ) : (
                  <Button
                    kind="primary"
                    onClick={() => navigate(`/contests/${contestId || ""}`)}
                  >
                    返回 Contest 首頁
                  </Button>
                )}
              </div>
            </Stack>
          </Column>
        </Grid>
      </SurfaceSection>
    </>
  );
};

export default ExamFlowTemplateScreen;
