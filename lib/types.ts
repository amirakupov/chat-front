export type Role = "USER" | "CREATOR" | "AGENCY" | "ADMIN";
export type AssetType = "IMAGE" | "VIDEO" | "AUDIO" | "TEXT";
export type AssetStatus = "DRAFT" | "UPLOADING" | "PROCESSING" | "ACTIVE" | "ARCHIVED";
export type ModerationState = "CLEAN" | "FLAGGED" | "BLOCKED";
export type SenderType = "USER" | "AI" | "SYSTEM";
export type SwipeDirection = "SAVE" | "SKIP";

export type UserDto = {
  id: number;
  name: string | null;
  email: string;
  age: number | null;
  location: string | null;
  role: Role;
};

export type AssetResponse = {
  id: number;
  creatorId: number;
  type: AssetType;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  duration: number | null;
  status: AssetStatus;
  title: string | null;
  description: string | null;
  tags: string | null;
  aiContext: string | null;
  creatorDisplayName: string | null;
  creatorAvatarUrl: string | null;
  policyFlags: string | null;
  ageGateRequired: boolean;
  moderationState: ModerationState;
  createdAt: string;
  updatedAt: string | null;
};

export type ConversationResponse = {
  id: number;
  partnerId: number;
  partnerName: string | null;
  partnerDisplayName: string | null;
  partnerAvatarUrl: string | null;
  personaEnabled: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
};

export type MessageResponse = {
  id: number;
  conversationId: number;
  senderId: number | null;
  senderType: SenderType;
  type: "TEXT";
  body: string;
  contextAssetId: number | null;
  readAt: string | null;
  createdAt: string;
};

export type PersonaRequest = {
  displayName: string;
  description?: string | null;
  tonality?: string | null;
  topics?: string | null;
  boundaries?: string | null;
  greeting?: string | null;
  avatarAssetId?: number | null;
  enabled?: boolean | null;
};

export type PersonaResponse = PersonaRequest & {
  id: number;
  creatorId: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export type PresignedPart = { partNumber: number; url: string };

export type UploadInitResponse = {
  assetId: number;
  /** null for a single-shot upload: the file fits one plain PUT */
  uploadId: string | null;
  contentType: string;
  partSize: number;
  partCount: number;
  parts: PresignedPart[];
};

export type InterestResponse = { id: number; name: string };
export type FavoriteCreatorResponse = { creatorId: number; creatorEmail: string; favoritedAt: string };
export type SwipeResponse = { assetId: number; direction: SwipeDirection; creatorFavorited: boolean };

/** Spring Data page, trimmed to the fields the harness reads. */
export type Page<T> = {
  content: T[];
  number: number;
  totalPages: number;
  totalElements: number;
};
