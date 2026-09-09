import type { Message } from '../message'

export const SYNTHETIC_CONVERSATION_ID = 'synthetic-conversation-xiaolin'

/** Synthetic / 合成测试数据。内容与人物均为虚构，不来自真实微信。 */
export const syntheticConversation = [
  {
    id: 'synthetic-001',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'xiaolin-synthetic',
    senderName: '小林（虚构）',
    direction: 'incoming',
    timestamp: '2026-09-08T18:02:00+08:00',
    type: 'text',
    text: '今天工作好累。'
  },
  {
    id: 'synthetic-002',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'self-synthetic',
    senderName: '我（虚构）',
    direction: 'outgoing',
    timestamp: '2026-09-08T18:03:00+08:00',
    type: 'text',
    text: '怎么了？今天特别忙吗？'
  },
  {
    id: 'synthetic-003',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'xiaolin-synthetic',
    senderName: '小林（虚构）',
    direction: 'incoming',
    timestamp: '2026-09-08T18:04:00+08:00',
    type: 'text',
    text: '开了一下午的会，脑子已经转不动了。'
  },
  {
    id: 'synthetic-004',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'self-synthetic',
    senderName: '我（虚构）',
    direction: 'outgoing',
    timestamp: '2026-09-08T18:05:00+08:00',
    type: 'text',
    text: '辛苦啦，今晚先别想工作的事。'
  },
  {
    id: 'synthetic-005',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'xiaolin-synthetic',
    senderName: '小林（虚构）',
    direction: 'incoming',
    timestamp: '2026-09-08T18:07:00+08:00',
    type: 'text',
    text: '嗯，准备回去煮面。'
  },
  {
    id: 'synthetic-006',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'self-synthetic',
    senderName: '我（虚构）',
    direction: 'outgoing',
    timestamp: '2026-09-08T18:08:00+08:00',
    type: 'text',
    text: '冰箱里还有青菜吗？记得加一点。'
  },
  {
    id: 'synthetic-007',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'xiaolin-synthetic',
    senderName: '小林（虚构）',
    direction: 'incoming',
    timestamp: '2026-09-08T18:10:00+08:00',
    type: 'text',
    text: '有的。你吃饭了吗？'
  },
  {
    id: 'synthetic-008',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'self-synthetic',
    senderName: '我（虚构）',
    direction: 'outgoing',
    timestamp: '2026-09-08T18:11:00+08:00',
    type: 'text',
    text: '刚吃完，今天做了番茄炒蛋。'
  },
  {
    id: 'synthetic-009',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'xiaolin-synthetic',
    senderName: '小林（虚构）',
    direction: 'incoming',
    timestamp: '2026-09-08T18:12:00+08:00',
    type: 'text',
    text: '听起来不错，下次也教教我。'
  },
  {
    id: 'synthetic-010',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'self-synthetic',
    senderName: '我（虚构）',
    direction: 'outgoing',
    timestamp: '2026-09-08T18:13:00+08:00',
    type: 'text',
    text: '好呀，其实十分钟就能做好。'
  },
  {
    id: 'synthetic-011',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'xiaolin-synthetic',
    senderName: '小林（虚构）',
    direction: 'incoming',
    timestamp: '2026-09-08T18:15:00+08:00',
    type: 'text',
    text: '那周末试试。'
  },
  {
    id: 'synthetic-012',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'self-synthetic',
    senderName: '我（虚构）',
    direction: 'outgoing',
    timestamp: '2026-09-08T18:16:00+08:00',
    type: 'text',
    text: '说定了。今晚早点休息。'
  },
  {
    id: 'synthetic-013',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'xiaolin-synthetic',
    senderName: '小林（虚构）',
    direction: 'incoming',
    timestamp: '2026-09-08T18:17:00+08:00',
    type: 'text',
    text: '你也是，别忙太晚。'
  },
  {
    id: 'synthetic-014',
    conversationId: SYNTHETIC_CONVERSATION_ID,
    senderId: 'self-synthetic',
    senderName: '我（虚构）',
    direction: 'outgoing',
    timestamp: '2026-09-08T18:18:00+08:00',
    type: 'text',
    text: '收到，回家路上注意安全。'
  }
] as const satisfies readonly Message[]

