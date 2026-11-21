// 和大廚聊聊的資料：最近一段（首頁的「接著聊」）、某一段、送出一則
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatInput } from '@zhusha/core';
import { getChatConversation, getLatestChatConversation, isResumable, sendChat, type ChatConversation } from '../../data/ai.ts';

export const chatKeys = {
  latest: ['chat', 'latest'] as const,
  conversation: (id: string) => ['chat', 'conversation', id] as const,
};

// 最近一段對話。首頁每次打開都重新問（對話可能在別的裝置上有新的一則）
export function useLatestChat() {
  return useQuery({ queryKey: chatKeys.latest, queryFn: getLatestChatConversation, staleTime: 0, retry: false });
}

// 6 小時內、同一個廚房才能「接著聊」
export function useResumableChat(kitchenId: string | undefined): ChatConversation | null {
  const latest = useLatestChat();
  return isResumable(latest.data, kitchenId) ? latest.data : null;
}

export function useChatConversation(id: string | null) {
  return useQuery({
    queryKey: chatKeys.conversation(id ?? ''),
    queryFn: () => getChatConversation(id as string),
    enabled: !!id,
    staleTime: Infinity,
    retry: false,
  });
}

// 送出一則話。成功後等對話重新讀回來才結束（畫面上等待的泡泡才換成存下來的）；失敗時什麼都沒存
export function useSendChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChatInput) => sendChat(input),
    onSuccess: async (result) => {
      if (result.status !== 'ok') return;
      await queryClient.fetchQuery({ queryKey: chatKeys.conversation(result.conversationId), queryFn: () => getChatConversation(result.conversationId), staleTime: 0 });
      await queryClient.invalidateQueries({ queryKey: chatKeys.latest });
    },
  });
}
