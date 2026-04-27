import type {
  CompletionRequest,
  CompletionResponse,
  IProvider,
  ModelId,
} from "../types/provider";

export abstract class BaseProvider implements IProvider {
  abstract readonly id: string;
  abstract readonly displayName: string;

  abstract complete(req: CompletionRequest): Promise<CompletionResponse>;

  async completeMany(
    requests: CompletionRequest[],
  ): Promise<CompletionResponse[]> {
    return Promise.all(requests.map((r) => this.complete(r)));
  }

  abstract listModels(): Promise<ModelId[]>;
  abstract validateConfig(): Promise<void>;
}
