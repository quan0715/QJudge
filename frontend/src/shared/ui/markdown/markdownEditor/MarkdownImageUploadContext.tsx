import React, { createContext, useContext } from "react";
import type { ReactNode } from "react";

export interface MarkdownImageUploadResult {
  url: string;
  markdown: string;
  contentType: string;
  size: number;
}

export type MarkdownImageUploadHandler = (
  file: File
) => Promise<MarkdownImageUploadResult>;

const MarkdownImageUploadContext = createContext<MarkdownImageUploadHandler | null>(null);

interface MarkdownImageUploadProviderProps {
  children: ReactNode;
  uploadImage: MarkdownImageUploadHandler;
}

export const MarkdownImageUploadProvider: React.FC<
  MarkdownImageUploadProviderProps
> = ({ children, uploadImage }) => {
  return (
    <MarkdownImageUploadContext.Provider value={uploadImage}>
      {children}
    </MarkdownImageUploadContext.Provider>
  );
};

export const useMarkdownImageUpload = (): MarkdownImageUploadHandler | null => {
  return useContext(MarkdownImageUploadContext);
};
