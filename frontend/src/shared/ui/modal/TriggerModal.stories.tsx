import { Button, Modal } from "@carbon/react";
import type { StoryModule } from "@/shared/types/story.types";
import TriggerModal, { type TriggerModalProps } from "./TriggerModal";

const TriggerModalDemo = ({ initialOpen }: { initialOpen?: boolean }) => (
  <TriggerModal
    initialOpen={initialOpen}
    renderTrigger={({ open }) => (
      <Button kind="primary" onClick={open}>
        開啟 Modal
      </Button>
    )}
    renderModal={({ open, onClose }) => (
      <Modal
        open={open}
        modalHeading="TriggerModal Demo"
        primaryButtonText="確定"
        secondaryButtonText="取消"
        onRequestSubmit={onClose}
        onRequestClose={onClose}
      >
        這是一個透過 TriggerModal 控制的示範 Modal。
      </Modal>
    )}
  />
);

const TriggerModalGhostDemo = () => (
  <TriggerModal
    trigger={<Button kind="ghost">使用 trigger props</Button>}
    renderModal={({ open, onClose }) => (
      <Modal
        open={open}
        modalHeading="TriggerModal + trigger"
        primaryButtonText="好的"
        onRequestSubmit={onClose}
        onRequestClose={onClose}
      >
        這個範例使用 trigger props 傳入按鈕。
      </Modal>
    )}
  />
);

const storyModule: StoryModule<TriggerModalProps> = {
  meta: {
    title: "shared/ui/modal/TriggerModal",
    component: TriggerModal,
    category: "shared",
    description: "控制 Modal 開關的小型 wrapper，可用 renderTrigger 或 trigger props。",
    defaultArgs: {
      initialOpen: false,
    },
    argTypes: {
      initialOpen: {
        control: "boolean",
        description: "初始是否開啟",
        defaultValue: false,
      },
    },
  },
  stories: [
    {
      name: "Playground",
      description: "透過 renderTrigger 觸發 Modal。",
      render: (args) => <TriggerModalDemo initialOpen={args.initialOpen} />,
    },
    {
      name: "With trigger",
      description: "使用 trigger props 直接傳入按鈕。",
      render: () => <TriggerModalGhostDemo />,
    },
  ],
};

export default storyModule;
