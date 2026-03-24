import { httpClient, requestJson } from "@/infrastructure/api/http.client";

export interface MarkdownImageUploadResponse {
  url: string;
  markdown: string;
  content_type: string;
  size: number;
}

export const uploadMarkdownImage = async (
  file: File
): Promise<MarkdownImageUploadResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  return requestJson<MarkdownImageUploadResponse>(
    httpClient.request("/api/v1/markdown/images/", {
      method: "POST",
      body: formData,
    }),
    "Failed to upload markdown image"
  );
};
