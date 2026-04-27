export type ModelId = string;

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface CompletionRequest {
  model: ModelId;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  metadata?: Record<string, string>;
}

export interface CompletionResponse {
  content: string;
  model: ModelId;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "length" | "error";
  rawResponse?: unknown;
}

export interface IProvider {
  readonly id: string;
  readonly displayName: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  completeMany(requests: CompletionRequest[]): Promise<CompletionResponse[]>;
  listModels(): Promise<ModelId[]>;
  validateConfig(): Promise<void>;
}
