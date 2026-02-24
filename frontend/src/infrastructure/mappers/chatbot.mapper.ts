import type { ChatMessage, ChatSession } from "@/core/types/chatbot.types";

export interface ChatMessageDto {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  message_type?: "text" | "options" | "preview" | "error";
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ChatSessionDto {
  id: number;
  stage?: string;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
  message_count?: number;
  title: string;
  messages?: ChatMessageDto[];
}

export const mapChatMessageDto = (dto: ChatMessageDto): ChatMessage => ({
  id: String(dto.id),
  role: dto.role as ChatMessage["role"],
  content: dto.content,
  timestamp: new Date(dto.created_at),
});

export const mapChatSessionDto = (dto: ChatSessionDto): ChatSession => ({
  id: String(dto.id),
  title: dto.title || `對話 ${dto.id}`,
  messages: (dto.messages || [])
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map(mapChatMessageDto),
  createdAt: new Date(dto.created_at),
  updatedAt: new Date(dto.updated_at),
});
