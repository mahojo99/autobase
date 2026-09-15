import type { Bot, ContextRecord, Message, Task } from '../shared/contracts';
import type { Store } from './store';

export function conversationContext(store: Store, botId: string, limit = 12) {
  const bot = store.need<Bot>('bots', botId);
  const messages = store
    .all<Message>('messages')
    .filter((message) => {
      const source = store.get<ContextRecord>('context', message.id);
      return message.botId === botId && message.indexed && source && !source.excluded;
    })
    .slice(-limit)
    .map((message) => ({
      role: message.role,
      text: message.text.slice(0, 1800),
      sourceId: message.id,
      taskId: message.taskId,
      kind: message.kind,
      createdAt: message.createdAt,
    }));
  return { bot: { id: bot.id, name: bot.name, role: bot.role }, messages };
}

export function workspaceContext(store: Store) {
  const records = store.all<ContextRecord>('context');
  const messages = store.all<Message>('messages');
  return {
    bots: store
      .all<Bot>('bots')
      .filter((bot) => !bot.archived)
      .map((bot) => ({ id: bot.id, name: bot.name, role: bot.role })),
    recentWork: store
      .all<Task>('tasks')
      .slice(-12)
      .map((task) => {
        const request = messages.find(
          (message) => message.taskId === task.id && message.role === 'user' && !message.kind,
        );
        const sharedRequest =
          !request ||
          (request.indexed &&
            records.some((record) => record.id === request.id && !record.excluded));
        const result = records.find(
          (record) => record.sourceId === task.id && record.kind === 'result' && !record.excluded,
        );
        return {
          id: task.id,
          botId: task.botId,
          parentId: task.parentId,
          state: task.state,
          title: sharedRequest ? task.title : '[Excluded by owner]',
          result: result ? { text: result.text.slice(0, 600), sourceId: result.id } : null,
        };
      }),
    recentConversations: store
      .all<Bot>('bots')
      .filter((bot) => bot.id !== 'orchestrator')
      .slice(-6)
      .map((bot) => conversationContext(store, bot.id, 2)),
  };
}
