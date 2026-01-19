/**
 * Export contest results as CSV file download
 */
export const exportContestResults = async (
  contestId: string
): Promise<void> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/v1/contests/${contestId}/export_results/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("權限不足");
    }
    throw new Error("匯出失敗");
  }

  // Create download
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contest_${contestId}_results.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

/**
 * Download contest file in specified format (PDF or Markdown)
 * @param scale - PDF scale factor (0.5 to 2.0), only applies to PDF format
 * @param layout - PDF layout mode ('normal' or 'compact'), only applies to PDF format
 */
export const downloadContestFile = async (
  contestId: string,
  format: "pdf" | "markdown" = "markdown",
  language: string = "zh-TW",
  scale: number = 1.0,
  layout: "normal" | "compact" = "normal"
): Promise<Blob> => {
  const token = localStorage.getItem("token");

  // Build query params
  const params = new URLSearchParams({
    file_format: format,
    language: language,
  });

  // Only add scale and layout params for PDF format
  if (format === "pdf") {
    if (scale !== 1.0) {
      if (scale < 0.5 || scale > 2.0) {
        throw new Error("Scale must be between 0.5 and 2.0");
      }
      params.append("scale", scale.toString());
    }
    if (layout !== "normal") {
      params.append("layout", layout);
    }
  }

  // Use direct fetch instead of httpClient to set correct Accept header for binary downloads
  const res = await fetch(
    `/api/v1/contests/${contestId}/download/?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        // Use */* to bypass DRF content negotiation (DRF doesn't have renderers for text/markdown or application/pdf)
        Accept: "*/*",
      },
    }
  );

  if (!res.ok) {
    // Try to parse error response
    try {
      const errorData = await res.json();
      // Handle nested error format: { success: false, error: { code, message } }
      const message =
        errorData.error?.message ||
        errorData.message ||
        errorData.detail ||
        "Failed to download contest file";
      throw new Error(message);
    } catch (parseError) {
      // If can't parse JSON, throw generic error with status
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
  }

  return res.blob();
};

/**
 * Download current user's own exam report as PDF (Student only, after submission)
 * @param contestId - Contest ID
 * @param language - Report language (default: zh-TW)
 * @param scale - PDF scale factor (0.5 to 2.0, default 1.0)
 */
export const downloadMyReport = async (
  contestId: string,
  language: string = "zh-TW",
  scale: number = 1.0
): Promise<void> => {
  const token = localStorage.getItem("token");

  const params = new URLSearchParams({
    language: language,
  });

  if (scale !== 1.0) {
    if (scale < 0.5 || scale > 2.0) {
      throw new Error("Scale must be between 0.5 and 2.0");
    }
    params.append("scale", scale.toString());
  }

  const res = await fetch(
    `/api/v1/contests/${contestId}/my_report/?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        Accept: "*/*",
      },
    }
  );

  if (!res.ok) {
    try {
      const errorData = await res.json();
      const message =
        errorData.error?.message ||
        errorData.error ||
        errorData.message ||
        errorData.detail ||
        "Failed to download report";
      throw new Error(message);
    } catch {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
  }

  // Download the file
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  // Extract filename from Content-Disposition header or use default
  const contentDisposition = res.headers.get("Content-Disposition");
  let filename = `my_report_${contestId}.pdf`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?(.+)"?/);
    if (match) {
      filename = match[1].replace(/"/g, "");
    }
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
