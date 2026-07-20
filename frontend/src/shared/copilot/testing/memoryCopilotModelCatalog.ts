import type {
  CopilotModel,
  CopilotModelCatalog,
} from "@/core/copilot";

export class MemoryCopilotModelCatalog implements CopilotModelCatalog {
  private models: readonly CopilotModel[];
  private failure: unknown = null;

  constructor(models: readonly CopilotModel[] = []) {
    this.models = [...models];
  }

  replace(models: readonly CopilotModel[]): void {
    this.models = [...models];
    this.failure = null;
  }

  fail(error: unknown): void {
    this.failure = error;
  }

  async list(): Promise<readonly CopilotModel[]> {
    if (this.failure) throw this.failure;
    return [...this.models];
  }
}
