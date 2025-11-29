import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { workflowsAPI } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Play,
  BarChart3,
  List,
  GitBranch,
  Calendar,
  RotateCcw,
  MessageCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getStatusColor } from '../utils/workflowChartUtils';
import WorkflowDetailMetrics from '../components/WorkflowDetailMetrics';
import AgentExecutionChart from '../components/AgentExecutionChart';
import AgentExecutionTimeline from '../components/AgentExecutionTimeline';
import ArtifactsList from '../components/ArtifactsList';
import ExecutionLogs from '../components/ExecutionLogs';
import WorkflowTreeExplorer from '../components/WorkflowTreeExplorer';
import ConversationThread from '../components/ConversationThread';

type ViewMode = 'overview' | 'timeline' | 'conversation';

export default function WorkflowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [workflow, setWorkflow] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [subWorkflows, setSubWorkflows] = useState<any[]>([]);
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [selectedAgentLogs, setSelectedAgentLogs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumeState, setResumeState] = useState<any>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [messages, setMessages] = useState<any[]>([]);
  const [rootWorkflowId, setRootWorkflowId] = useState<number | null>(null);
  const [isSubWorkflow, setIsSubWorkflow] = useState(false);
  const { socket, subscribe } = useWebSocket();

  useEffect(() => {
    if (id) {
      loadWorkflow();
      subscribe(parseInt(id));
    }
    // Check for view query parameter
    const view = searchParams.get('view');
    if (view === 'conversation') {
      setViewMode('conversation');
    }
  }, [id, searchParams]);

  useEffect(() => {
    if (socket && id) {
      socket.on('workflow:updated', (data) => {
        if (data.workflowId === parseInt(id!)) {
          loadWorkflow();
        }
      });
      socket.on('agent:updated', () => {
        loadWorkflow();
      });
      socket.on('artifact:created', () => {
        loadWorkflow();
      });
      // Handle new messages in real-time
      socket.on('message:new', (data) => {
        if (data.workflowId === parseInt(id!)) {
          setMessages(prev => [...prev, data.message]);
        }
      });
      // Handle pause/unpause events
      socket.on('workflow:paused', (data) => {
        if (data.workflowId === parseInt(id!)) {
          toast('Workflow paused', { icon: '⏸️' });
          loadWorkflow();
        }
      });
      socket.on('workflow:unpaused', (data) => {
        if (data.workflowId === parseInt(id!)) {
          toast('Workflow resumed', { icon: '▶️' });
          loadWorkflow();
        }
      });
    }
  }, [socket, id]);

  const loadWorkflow = async () => {
    try {
      const { data } = await workflowsAPI.get(parseInt(id!));
      setWorkflow(data.workflow);
      setAgents(data.agents);
      setArtifacts(data.artifacts);
      // Sub-workflows are now included directly in the API response
      if (data.subWorkflows && data.subWorkflows.length > 0) {
        setSubWorkflows(data.subWorkflows);
      }
      await loadLogs();
      await loadQueueStatus();
      await loadMessages();
      // Load resume state if workflow failed
      if (data.workflow.status === 'failed') {
        await loadResumeState();
      }
    } catch (error) {
      console.error('Failed to load workflow:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const { data } = await workflowsAPI.getMessages(parseInt(id!));
      setMessages(data.data?.messages || []);
      setRootWorkflowId(data.data?.rootWorkflowId || null);
      setIsSubWorkflow(data.data?.isSubWorkflow || false);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleSendMessage = async (content: string, actionType: string, metadata?: any) => {
    try {
      await workflowsAPI.sendMessage(parseInt(id!), content, actionType, metadata);
      // Message will be added via WebSocket event
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  };

  const handlePauseWorkflow = async () => {
    try {
      await workflowsAPI.pauseWorkflow(parseInt(id!), 'User requested pause');
      toast.success('Pause requested');
    } catch (error) {
      console.error('Failed to pause workflow:', error);
      toast.error('Failed to pause workflow');
    }
  };

  const handleResumeFromPause = async () => {
    try {
      await workflowsAPI.unpauseWorkflow(parseInt(id!));
      toast.success('Workflow resumed');
    } catch (error) {
      console.error('Failed to resume workflow:', error);
      toast.error('Failed to resume workflow');
    }
  };

  const handleCancelWorkflow = async () => {
    try {
      await workflowsAPI.sendMessage(parseInt(id!), 'User cancelled workflow', 'cancel');
      toast.success('Cancel requested');
    } catch (error) {
      console.error('Failed to cancel workflow:', error);
      toast.error('Failed to cancel workflow');
    }
  };

  const loadQueueStatus = async () => {
    try {
      const queueResponse = await fetch(`/api/workflows/${id}/queue-status`);
      if (queueResponse.ok) {
        const queueData = await queueResponse.json();
        if (queueData.success) {
          setQueueStatus(queueData.data);
        }
      }
    } catch (error) {
      // Queue status not available
      console.debug('No queue status for this workflow');
    }
  };

  const loadResumeState = async () => {
    try {
      const { data } = await workflowsAPI.getResumeState(parseInt(id!));
      setResumeState(data);
    } catch (error) {
      console.error('Failed to load resume state:', error);
    }
  };

  const handleResume = async () => {
    try {
      setIsResuming(true);
      await workflowsAPI.resumeWorkflow(parseInt(id!));
      toast.success('Workflow resumption started');
      // Reload workflow after short delay
      setTimeout(() => {
        loadWorkflow();
        setIsResuming(false);
      }, 1000);
    } catch (error: any) {
      toast.error(`Failed to resume workflow: ${error.message}`);
      setIsResuming(false);
    }
  };

  const handleRestart = async () => {
    try {
      setIsRestarting(true);
      await workflowsAPI.retryWorkflow(parseInt(id!));
      toast.success('Workflow restart initiated');
      // Reload workflow after short delay
      setTimeout(() => {
        loadWorkflow();
        setIsRestarting(false);
      }, 1000);
    } catch (error: any) {
      toast.error(`Failed to restart workflow: ${error.message}`);
      setIsRestarting(false);
    }
  };

  const loadLogs = async (agentExecutionId?: number) => {
    try {
      const { data } = await workflowsAPI.getLogs(
        parseInt(id!),
        agentExecutionId
      );
      setLogs(data.logs);
      setSelectedAgentLogs(agentExecutionId || null);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  // Get task description from payload
  const getTaskDescription = () => {
    if (!workflow) return '';
    try {
      if (typeof workflow.payload === 'string') {
        const parsed = JSON.parse(workflow.payload);
        return parsed.customData?.taskDescription || parsed.description || workflow.task_description || '';
      }
      return workflow.payload?.customData?.taskDescription || workflow.payload?.description || workflow.task_description || '';
    } catch {
      return workflow.task_description || '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!workflow) {
    return <div className="text-center text-gray-500">Workflow not found</div>;
  }

  const statusColor = getStatusColor(workflow.status);
  const taskDescription = getTaskDescription();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-4">
            <button
              onClick={() => navigate('/workflows')}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </button>
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">
                  Workflow #{workflow.id}
                </h1>
                <span
                  className="px-3 py-1.5 text-sm font-semibold rounded-full"
                  style={{
                    backgroundColor: statusColor + '20',
                    color: statusColor,
                  }}
                >
                  {workflow.status.charAt(0).toUpperCase() + workflow.status.slice(1)}
                </span>
              </div>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span className="flex items-center space-x-1 capitalize">
                  <GitBranch className="h-4 w-4" />
                  <span>{workflow.workflow_type}</span>
                </span>
                <span className="text-gray-400">•</span>
                <span className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4" />
                  <span>Created {format(parseISO(workflow.created_at), 'MMM d, yyyy HH:mm')}</span>
                </span>
                {workflow.branch_name && (
                  <>
                    <span className="text-gray-400">•</span>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                      {workflow.branch_name}
                    </code>
                  </>
                )}
              </div>
            </div>
          </div>
          {resumeState?.canResume && (
            <button
              onClick={handleResume}
              disabled={isResuming}
              className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Resume workflow from last checkpoint"
            >
              <Play className="h-4 w-4 mr-2" />
              {isResuming ? 'Resuming...' : 'Resume Workflow'}
            </button>
          )}
          {workflow.status === 'failed' && !resumeState?.canResume && (
            <button
              onClick={handleRestart}
              disabled={isRestarting}
              className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Restart workflow from the beginning"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {isRestarting ? 'Restarting...' : 'Restart Workflow'}
            </button>
          )}
        </div>

        {/* Task Description */}
        {taskDescription && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Task Description</h3>
            <p className="text-gray-900 leading-relaxed">{taskDescription}</p>
          </div>
        )}
      </div>

      {/* Resume Info Banner */}
      {resumeState?.canResume && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <Play className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Workflow Can Be Resumed
              </h3>
              <p className="text-sm text-blue-700 mb-3">
                This workflow failed but can be resumed from its last checkpoint.
                {resumeState.completedAgents.length} agent(s) completed successfully and will be skipped.
              </p>
              <div className="text-sm text-blue-600">
                <strong>Resume from:</strong> {resumeState.failedAgent ?
                  `${resumeState.failedAgent.agentType} (failed)` :
                  `Agent ${resumeState.resumeFromIndex + 1}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restart Info Banner for failed workflows that can't be resumed */}
      {workflow.status === 'failed' && resumeState && !resumeState.canResume && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <RotateCcw className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-orange-900 mb-2">
                Workflow Failed - Restart Required
              </h3>
              <p className="text-sm text-orange-700 mb-3">
                This workflow failed before completing any agents. Click "Restart Workflow" to try again from the beginning.
              </p>
              {resumeState.failedAgent && (
                <div className="text-sm text-orange-600">
                  <strong>Failed at:</strong> {resumeState.failedAgent.agentType}
                  {resumeState.failedAgent.errorMessage && (
                    <span className="block mt-1 text-red-600">{resumeState.failedAgent.errorMessage}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metrics */}
      <WorkflowDetailMetrics
        workflow={workflow}
        agents={agents}
        artifacts={artifacts}
        logs={logs}
      />

      {/* View Mode Tabs */}
      <div className="flex items-center border-b border-gray-200 bg-white rounded-t-lg">
        <button
          onClick={() => setViewMode('overview')}
          className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'overview'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Overview & Analytics
        </button>
        <button
          onClick={() => setViewMode('timeline')}
          className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'timeline'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <List className="h-4 w-4 mr-2" />
          Detailed Timeline
        </button>
        <button
          onClick={() => setViewMode('conversation')}
          className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'conversation'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          Conversation
          {messages.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full">
              {messages.length}
            </span>
          )}
        </button>
      </div>

      {/* Sub-Workflows Hierarchy - Always show Tree Explorer */}
      <WorkflowTreeExplorer
        workflowId={workflow.id}
        className="mb-6"
      />

      {/* Content based on view mode */}
      {viewMode === 'overview' && (
        <div className="space-y-6">
          {/* Agent Execution Chart */}
          <AgentExecutionChart agents={agents} />

          {/* Artifacts and Logs in grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ArtifactsList artifacts={artifacts} />

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Total Agents</span>
                  <span className="text-lg font-bold text-gray-900">{agents.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="text-sm font-medium text-green-700">Completed</span>
                  <span className="text-lg font-bold text-green-900">
                    {agents.filter(a => a.status === 'completed').length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium text-red-700">Failed</span>
                  <span className="text-lg font-bold text-red-900">
                    {agents.filter(a => a.status === 'failed').length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span className="text-sm font-medium text-blue-700">Running</span>
                  <span className="text-lg font-bold text-blue-900">
                    {agents.filter(a => a.status === 'running').length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Execution Logs */}
          <ExecutionLogs
            logs={logs}
            agents={agents}
            selectedAgentLogs={selectedAgentLogs}
            onLoadLogs={loadLogs}
          />
        </div>
      )}

      {viewMode === 'timeline' && (
        <div className="space-y-6">
          {/* Detailed Timeline */}
          <AgentExecutionTimeline agents={agents} />

          {/* Artifacts */}
          <ArtifactsList artifacts={artifacts} />

          {/* Execution Logs */}
          <ExecutionLogs
            logs={logs}
            agents={agents}
            selectedAgentLogs={selectedAgentLogs}
            onLoadLogs={loadLogs}
          />
        </div>
      )}

      {viewMode === 'conversation' && (
        isSubWorkflow && rootWorkflowId ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Conversation Thread on Master Workflow
            </h3>
            <p className="text-gray-600 mb-4">
              All conversation messages are managed at the master workflow level to keep
              communications unified across the entire workflow tree.
            </p>
            <button
              onClick={() => navigate(`/workflows/${rootWorkflowId}?view=conversation`)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Go to Master Workflow Conversation
            </button>
          </div>
        ) : (
          <ConversationThread
            workflowId={workflow.id}
            messages={messages}
            workflowStatus={workflow.status}
            isPaused={workflow.is_paused || false}
            onSendMessage={handleSendMessage}
            onPause={handlePauseWorkflow}
            onResume={handleResumeFromPause}
            onCancel={handleCancelWorkflow}
            rootWorkflowId={rootWorkflowId || workflow.id}
          />
        )
      )}
    </div>
  );
}
