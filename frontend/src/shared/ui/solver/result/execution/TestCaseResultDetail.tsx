import React from "react";
import {
  Accordion,
  AccordionItem,
  CodeSnippet,
  Layer,
  SkeletonText,
  Stack,
} from "@carbon/react";
import type { CaseResultDisplay } from "./utils";

interface TestCaseResultDetailProps {
  result?: CaseResultDisplay;
  isPending: boolean;
}

export const TestCaseResultDetail: React.FC<TestCaseResultDetailProps> = ({
  result,
  isPending,
}) => {
  // Empty state
  if (!result && !isPending) {
    return (
      <div style={{ 
        flex: 1, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        color: "var(--cds-text-secondary)",
        padding: "var(--cds-spacing-05)"
      }}>
        <div style={{ textAlign: "center" }}>
          Select a test case to view details
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto"}}>
      <Layer level={0}>
        <Stack gap={7} style={{ padding: "var(--cds-spacing-05)" }}>
          
          {/* Error Section */}
          {/* {result?.error && (
            <Stack gap={3}>
              <span style={{ 
                fontSize: "0.75rem", 
                fontWeight: 600,
                textTransform: "uppercase",
                color: "var(--cds-text-error)"
              }}>Error
              </span>
              <div style={{ 
                padding: "var(--cds-spacing-03)",
                backgroundColor: "var(--cds-background-error)",
                color: "var(--cds-text-error)",
                borderLeft: "4px solid var(--cds-support-error)"
              }}>
                {result.error}
              </div>
            </Stack>
          )} */}

          {/* Results Accordion */}
          <Layer level={1}>
            <Accordion align="start" size="md">
              <InputOutputAccordionCode title="Input" content={result?.input || "(Hidden/Empty)"} isPending={isPending} level={2} />

              <InputOutputAccordionCode title="Your Output" content={result?.actualOutput || "(None)"} isPending={isPending} level={2} />

              <InputOutputAccordionCode title="Expected Output" content={result?.expectedOutput || "(Hidden/Empty)"} isPending={isPending} level={2} />
            </Accordion>
          </Layer>
        </Stack>
      </Layer>
    </div>
  );
};

function InputOutputAccordionCode({
  title,
  content,
  isPending,
  level,
}: {
  title: string;
  content: string;
  isPending: boolean;
  level: number;
}) {
  return (
    <AccordionItem title={title} open>
      {isPending ? (
        <SkeletonText paragraph />
      ) : (
        <Layer level={level}>
          <CodeSnippet type="multi" feedback="Copied">
            {content}
          </CodeSnippet>
        </Layer>
      )}
    </AccordionItem>
  );
}

export default TestCaseResultDetail;
