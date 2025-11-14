import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { workflowsAPI } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  FileText,
  Code,
  TestTube,
  Search,
  FileCode,
  Play,
} from 'lucide-react';
import { format } from 'date-fns';

export default function WorkflowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedAgentLogs, setSelectedAgentLogs] = useState<number | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [resumeState, setResumeState] = useState<any>(null);
  const [isResuming, setIsResuming] = useState(false);
  const { socket, subscribe } = useWebSocket();

  useEffect(() => {
    if (id) {
      loadWorkflow();
      subscribe(parseInt(id));
    }
  }, [id]);

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
    }
  }, [socket, id]);

  const loadWorkflow = async () => {
    try {
      const { data } = await workflowsAPI.get(parseInt(id!));
      setWorkflow(data.workflow);
      setAgents(data.agents);
      setArtifacts(data.artifacts);
      await loadLogs();
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

  const getAgentIcon = (type: string) => {
    const icons: any = {
      plan: FileText,
      code: Code,
      test: TestTube,
      review: Search,
      document: FileCode,
    };
    return icons[type] || FileText;
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      completed: 'text-green-600 bg-green-100',
      failed: 'text-red-600 bg-red-100',
      running: 'text-blue-600 bg-blue-100',
      pending: 'text-gray-600 bg-gray-100',
    };
    return colors[status] || colors.pending;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!workflow) {
    return <div className="text-center text-gray-500">Workflow not found</div>;
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/workflows')}
            className="btn btn-secondary flex items-center"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </button>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              Workflow #{workflow.id}
            </h2>
            <p className="mt-1 text-sm text-gray-500 capitalize">
              {workflow.workflow_type} • Created{' '}
              {format(new Date(workflow.created_at), 'MMM d, yyyy HH:mm')}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {resumeState?.canResume && (
            <button
              onClick={handleResume}
              disabled={isResuming}
              className="btn btn-primary flex items-center"
              title="Resume workflow from last checkpoint"
            >
              <Play className="h-4 w-4 mr-2" />
              {isResuming ? 'Resuming...' : 'Resume Workflow'}
            </button>
          )}
          <div className={`px-4 py-2 rounded-full font-medium ${getStatusColor(workflow.status)}`}>
            {workflow.status}
          </div>
        </div>
      </div>

      {/* Resume Info Banner */}
      {resumeState?.canResume && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start space-x-3">
            <Play className="h-5 w-5 text-blue-600 mt-0.5" />
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

      {/* Task Description */}
      {workflow.task_description && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Task Description</h3>
          <p className="text-gray-700">{workflow.task_description}</p>
        </div>
      )}

      {/* Agents Timeline */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Executions</h3>
        <div className="space-y-4">
          {agents.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No agent executions yet</p>
          ) : (
            agents.map((agent, index) => {
              const Icon = getAgentIcon(agent.agent_type);
              return (
                <div key={agent.id} className="flex items-start space-x-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`p-3 rounded-full ${
                        agent.status === 'completed'
                          ? 'bg-green-100'
                          : agent.status === 'failed'
                          ? 'bg-red-100'
                          : agent.status === 'running'
                          ? 'bg-blue-100'
                          : 'bg-gray-100'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {index < agents.length - 1 && (
                      <div className="w-0.5 h-12 bg-gray-200 my-2"></div>
                    )}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 capitalize">
                          {agent.agent_type} Agent
                        </h4>
                        <p className="text-sm text-gray-500">
                          {agent.started_at
                            ? `Started ${format(new Date(agent.started_at), 'HH:mm:ss')}`
                            : 'Not yet started'
                          }
                        </p>
                      </div>
                      <span className={`badge ${getStatusColor(agent.status)}`}>
                        {agent.status}
                      </span>
                    </div>
                    {agent.summary && (
                      <p className="mt-2 text-sm text-gray-700">{agent.summary}</p>
                    )}
                    {agent.error && (
                      <p className="mt-2 text-sm text-red-600">Error: {agent.error}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Generated Artifacts ({artifacts.length})
          </h3>
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <div
                key={artifact.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 capitalize">
                      {artifact.artifact_type}
                    </p>
                    {artifact.file_path && (
                      <p className="text-sm text-gray-500">{artifact.file_path}</p>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-500">
                  {format(new Date(artifact.created_at), 'HH:mm:ss')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution Logs */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Execution Logs ({logs.length})
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => loadLogs()}
              className={`px-3 py-1 text-sm rounded-md ${
                selectedAgentLogs === null
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All Logs
            </button>
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => loadLogs(agent.id)}
                className={`px-3 py-1 text-sm rounded-md capitalize ${
                  selectedAgentLogs === agent.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {agent.agent_type}
              </button>
            ))}
          </div>
        </div>

        {logs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No logs available yet</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {logs.map((log) => {
              const isExpanded = expandedLogs.has(log.id);
              const levelColors = {
                debug: 'bg-gray-100 text-gray-700 border-gray-300',
                info: 'bg-blue-50 text-blue-700 border-blue-200',
                warn: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                error: 'bg-red-50 text-red-700 border-red-200',
              };

              return (
                <div
                  key={log.id}
                  className={`border-l-4 p-3 rounded-r-lg ${
                    levelColors[log.level as keyof typeof levelColors]
                  }`}
                >
                  <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => {
                      const newExpanded = new Set(expandedLogs);
                      if (isExpanded) {
                        newExpanded.delete(log.id);
                      } else {
                        newExpanded.add(log.id);
                      }
                      setExpandedLogs(newExpanded);
                    }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-semibold uppercase">
                          {log.level}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs text-gray-600">
                          {log.eventType}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs text-gray-500">
                          {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{log.message}</p>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600">
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      {log.data && (
                        <div className="bg-white bg-opacity-50 p-2 rounded text-xs font-mono overflow-x-auto">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.stackTrace && (
                        <div className="bg-red-100 p-2 rounded text-xs font-mono overflow-x-auto">
                          <pre className="whitespace-pre-wrap text-red-800">
                            {log.stackTrace}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
