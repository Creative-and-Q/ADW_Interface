import { useState, useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import {
  MessageCircle,
  Send,
  Pause,
  Play,
  XCircle,
  Bot,
  User,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';

interface Message {
  id: number;
  workflow_id: number;
  agent_execution_id: number | null;
  message_type: 'user' | 'agent' | 'system';
  agent_type: string | null;
  content: string;
  metadata: any;
  action_type: string;
  action_status: string;
  created_at: string;
  // Added for sub-workflow context
  workflow_type?: string;
  target_module?: string;
  parent_workflow_id?: number | null;
}

interface ConversationThreadProps {
  workflowId: number;
  messages: Message[];
  workflowStatus: string;
  isPaused: boolean;
  onSendMessage: (content: string, actionType: string, metadata?: any) => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  className?: string;
  rootWorkflowId?: number;
}

export default function ConversationThread({
  workflowId,
  messages,
  workflowStatus,
  isPaused,
  onSendMessage,
  onPause,
  onResume,
  onCancel,
  className = '',
  rootWorkflowId,
}: ConversationThreadProps) {
  const [inputValue, setInputValue] = useState('');
  const [actionType, setActionType] = useState<'comment' | 'instruction'>('comment');
  const [showActionMenu, setShowActionMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim(), actionType);
    setInputValue('');
    setActionType('comment');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getMessageIcon = (message: Message) => {
    if (message.message_type === 'user') {
      return <User className="h-4 w-4" />;
    }
    if (message.message_type === 'system') {
      return <AlertCircle className="h-4 w-4" />;
    }
    return <Bot className="h-4 w-4" />;
  };

  const getMessageStyle = (message: Message) => {
    if (message.message_type === 'user') {
      return 'bg-blue-50 border-blue-200 text-blue-900';
    }
    if (message.message_type === 'system') {
      if (message.action_type === 'pause') {
        return 'bg-amber-50 border-amber-200 text-amber-900';
      }
      if (message.action_type === 'cancel') {
        return 'bg-red-50 border-red-200 text-red-900';
      }
      if (message.action_type === 'resume') {
        return 'bg-green-50 border-green-200 text-green-900';
      }
      return 'bg-gray-50 border-gray-200 text-gray-900';
    }
    // Agent messages
    return 'bg-white border-gray-200 text-gray-900';
  };

  const getAgentColor = (agentType: string | null) => {
    const colors: Record<string, string> = {
      plan: 'text-purple-600',
      code: 'text-blue-600',
      test: 'text-green-600',
      review: 'text-orange-600',
      document: 'text-teal-600',
      scaffold: 'text-indigo-600',
    };
    return colors[agentType || ''] || 'text-gray-600';
  };

  const isWorkflowActive = ['pending', 'running', 'planning', 'coding', 'testing', 'reviewing', 'documenting'].includes(workflowStatus);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col ${className}`} style={{ height: '600px' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Conversation</h3>
            <p className="text-xs text-gray-500">
              {messages.length} message{messages.length !== 1 ? 's' : ''} • Master Workflow #{rootWorkflowId || workflowId}
              {messages.some(m => m.parent_workflow_id) && ' (includes sub-workflows)'}
            </p>
          </div>
        </div>

        {/* Control buttons */}
        {isWorkflowActive && (
          <div className="flex items-center space-x-2">
            {isPaused ? (
              <button
                onClick={onResume}
                className="flex items-center px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
              >
                <Play className="h-4 w-4 mr-1" />
                Resume
              </button>
            ) : (
              <button
                onClick={onPause}
                className="flex items-center px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 rounded-md hover:bg-amber-200 transition-colors"
              >
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </button>
            )}
            <button
              onClick={onCancel}
              className="flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Paused banner */}
      {isPaused && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center">
          <Pause className="h-4 w-4 text-amber-600 mr-2" />
          <span className="text-sm font-medium text-amber-800">
            Workflow is paused. Click Resume to continue.
          </span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageCircle className="h-12 w-12 mb-3" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Agent comments and your messages will appear here</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={clsx(
                'rounded-lg border p-3 transition-all',
                getMessageStyle(message),
                message.message_type === 'user' ? 'ml-8' : 'mr-8'
              )}
            >
              <div className="flex items-start space-x-2">
                <div className={clsx(
                  'flex-shrink-0 p-1 rounded',
                  message.message_type === 'agent' && getAgentColor(message.agent_type)
                )}>
                  {getMessageIcon(message)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-1 mb-1">
                    <span className="text-xs font-semibold uppercase">
                      {message.message_type === 'agent' && message.agent_type
                        ? `${message.agent_type} Agent`
                        : message.message_type.charAt(0).toUpperCase() + message.message_type.slice(1)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(parseISO(message.created_at), 'HH:mm:ss')}
                    </span>
                    {message.action_type !== 'comment' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                        {message.action_type}
                      </span>
                    )}
                    {/* Show sub-workflow context if message is from a sub-workflow */}
                    {message.parent_workflow_id && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                        #{message.workflow_id}
                        {message.target_module && ` • ${message.target_module}`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center space-x-2">
          {/* Action type selector */}
          <div className="relative">
            <button
              onClick={() => setShowActionMenu(!showActionMenu)}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {actionType === 'instruction' ? 'Instruction' : 'Comment'}
              <ChevronDown className="h-4 w-4 ml-1" />
            </button>
            {showActionMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                <button
                  onClick={() => { setActionType('comment'); setShowActionMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  <span className="font-medium">Comment</span>
                  <p className="text-xs text-gray-500">General message</p>
                </button>
                <button
                  onClick={() => { setActionType('instruction'); setShowActionMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  <span className="font-medium">Instruction</span>
                  <p className="text-xs text-gray-500">Guidance for agents</p>
                </button>
              </div>
            )}
          </div>

          {/* Message input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              actionType === 'instruction'
                ? 'Enter instruction for agents...'
                : 'Type a message...'
            }
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!isWorkflowActive}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || !isWorkflowActive}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              inputValue.trim() && isWorkflowActive
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>

        {!isWorkflowActive && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            Workflow is {workflowStatus}. Messages can only be sent to active workflows.
          </p>
        )}
      </div>
    </div>
  );
}
