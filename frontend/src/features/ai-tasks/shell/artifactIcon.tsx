import { Csv, Document, DocumentSubject } from "@carbon/icons-react";

interface ArtifactIconProps {
  filename: string;
  size?: number;
  className?: string;
}

export function ArtifactFileIcon({ filename, size = 16, className }: ArtifactIconProps) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return <Csv size={size} className={className} aria-hidden />;
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return <DocumentSubject size={size} className={className} aria-hidden />;
  }
  return <Document size={size} className={className} aria-hidden />;
}
