import { useState } from "react";
import { Button } from "@carbon/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageViewer } from "./ImageViewer";

const meta: Meta<typeof ImageViewer> = {
  title: "shared/ui/image/ImageViewer",
  component: ImageViewer,
};

export default meta;
type Story = StoryObj<typeof meta>;

const sampleImages = [
  {
    url: "https://picsum.photos/id/180/1280/720",
    label: "Screen capture 1",
    alt: "Laptop on a desk",
  },
  {
    url: "https://picsum.photos/id/1062/1280/720",
    label: "Screen capture 2",
    alt: "Mountain landscape",
  },
];

export const Default: Story = {
  render: function ImageViewerStory() {
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Open image viewer</Button>
        {open ? (
          <ImageViewer
            images={sampleImages}
            index={index}
            onIndexChange={setIndex}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    );
  },
};
