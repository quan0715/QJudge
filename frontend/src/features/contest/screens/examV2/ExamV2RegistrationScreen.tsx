import React, { useState } from "react";
import { Button, InlineNotification, Stack, Tag, TextInput } from "@carbon/react";
import ExamFlowTemplateScreen from "./ExamFlowTemplateScreen";
import { useExamV2Flow } from "./useExamV2Flow";

const ExamV2RegistrationScreen: React.FC = () => {
  const { contest, loading, error, clearError, register, refreshContest } =
    useExamV2Flow();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");

  const isPrivateContest = contest?.visibility === "private";
  const isRegistered = !!contest?.isRegistered;

  const handleRegister = async () => {
    const success = await register({
      nickname: nickname.trim() || undefined,
      password: isPrivateContest ? password : undefined,
    });
    if (success) {
      setPassword("");
    }
  };

  return (
    <ExamFlowTemplateScreen
      stepKey="registration"
      title="Exam v2：報名確認"
      description="先確認報名是否成功、是否在可取消區間，以及是否符合進場資格。"
      bullets={[
        "先讀取 contest API 的 is_registered / visibility / exam_status。",
        "私人競賽會要求輸入密碼；公開競賽可直接報名。",
        "報名成功後直接可進入下一步考前檢查。",
      ]}
      notice="此頁已接上 `/contests/:id/register/`，報名完成會即時刷新 contest 狀態。"
      actionPanel={
        <Stack gap={4}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type={isRegistered ? "green" : "gray"}>
              {isRegistered ? "已報名" : "尚未報名"}
            </Tag>
            <Tag type={isPrivateContest ? "purple" : "blue"}>
              {isPrivateContest ? "私人競賽" : "公開競賽"}
            </Tag>
            <Tag type="teal">{`Exam 狀態：${contest?.examStatus || "not_started"}`}</Tag>
          </div>

          {error ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="報名失敗"
              subtitle={error}
              onCloseButtonClick={clearError}
            />
          ) : null}

          <TextInput
            id="exam-v2-registration-nickname"
            labelText="顯示名稱（可選）"
            placeholder="不填則使用帳號名稱"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            disabled={isRegistered}
          />

          {isPrivateContest ? (
            <TextInput
              id="exam-v2-registration-password"
              labelText="競賽密碼"
              type="password"
              placeholder="輸入私人競賽密碼"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isRegistered}
            />
          ) : null}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button
              kind={isRegistered ? "tertiary" : "primary"}
              disabled={loading || (isPrivateContest && !password && !isRegistered)}
              onClick={isRegistered ? refreshContest : handleRegister}
            >
              {isRegistered ? "重新整理狀態" : "確認報名"}
            </Button>
          </div>
        </Stack>
      }
    />
  );
};

export default ExamV2RegistrationScreen;
