import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  Clock,
  Play,
  ChevronDown,
  ChevronRight,
  GitBranch,
  AlertTriangle,
  BarChart3,
  Search,
  Loader2,
  FolderTree,
  Home,
  RefreshCw,
  Expand,
  List,
  TreePine,
} from 'lucide-react';
import clsx from 'clsx';

type ViewMode = 'lazy' | 'full';

interface TreeStats {
  workflowId: number;
  totalDescendants: number;
  maxDepth: number;
  statusCounts: {
    completed: number;
    failed: number;
    pending: number;
    inProgress: number;
  };
  completionPercentage: number;
  levelBreakdown: Array<{
    level: number;
    count: number;
    completed: number;
    failed: number;
    pending: number;
  }>;
  typeDistribution: Array<{
    type: string;
    count: number;
  }>;
}

interface WorkflowChild {
  id: number;
  workflow_type: string;
  status: string;
  task_description?: string;
  target_module?: string;
  execution_order: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  hasChildren: boolean;
  childCount: number;
}

interface Ancestor {
  id: number;
  parent_workflow_id: number | null;
  workflow_type: string;
  status: string;
  task_description?: string;
  target_module?: string;
  depth: number;
}

interface FullTreeNode {
  id: number;
  parent_workflow_id: number | null;
  workflow_type: string;
  status: string;
  task_description?: string;
  target_module?: string;
  execution_order: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  depth: number;
  children: FullTreeNode[];
}

interface WorkflowTreeExplorerProps {
  workflowId: number;
  className?: string;
}

const statusConfig = {
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
    borderColor: 'border-green-500',
    lightBg: 'bg-green-50',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500',
    borderColor: 'border-red-500',
    lightBg: 'bg-red-50',
    label: 'Failed',
  },
  running: {
    icon: Play,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    borderColor: 'border-blue-500',
    lightBg: 'bg-blue-50',
    label: 'Running',
  },
  in_progress: {
    icon: Play,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    borderColor: 'border-blue-500',
    lightBg: 'bg-blue-50',
    label: 'In Progress',
  },
  planning: {
    icon: Play,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500',
    borderColor: 'border-purple-500',
    lightBg: 'bg-purple-50',
    label: 'Planning',
  },
  pending: {
    icon: Clock,
    color: 'text-gray-400',
    bgColor: 'bg-gray-400',
    borderColor: 'border-gray-400',
    lightBg: 'bg-gray-50',
    label: 'Pending',
  },
  pending_fix: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
    borderColor: 'border-yellow-500',
    lightBg: 'bg-yellow-50',
    label: 'Pending Fix',
  },
};

function getStatusConfig(status: string) {
  return statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
}

// Lazy-loading tree node component
function LazyTreeNode({
  workflowId,
  child,
  depth = 0,
  isLast,
}: {
  workflowId: number;
  child: WorkflowChild;
  depth?: number;
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<WorkflowChild[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const config = getStatusConfig(child.status);
  const StatusIcon = config.icon;
  const isRunning = child.status === 'running' || child.status === 'in_progress' || child.status === 'planning';

  const loadChildren = useCallback(async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const response = await fetch(`/api/workflows/${child.id}/children?limit=20&offset=${currentOffset}`);
      const result = await response.json();
      if (result.success) {
        if (reset) {
          setChildren(result.data.children);
        } else {
          setChildren(prev => [...prev, ...result.data.children]);
        }
        setHasMore(result.data.hasMore);
        setOffset(currentOffset + result.data.children.length);
      }
    } catch (error) {
      console.error('Failed to load children:', error);
    } finally {
      setLoading(false);
    }
  }, [child.id, offset, loading]);

  const handleExpand = () => {
    if (!isExpanded && children.length === 0 && child.hasChildren) {
      loadChildren(true);
    }
    setIsExpanded(!isExpanded);
  };

  const description = child.task_description || 'Sub-task';

  return (
    <div className="relative">
      {/* Vertical line from parent */}
      {depth > 0 && (
        <div
          className={clsx(
            'absolute left-4 w-0.5 bg-gray-300',
            isLast ? 'h-6' : 'h-full'
          )}
          style={{ top: '-12px' }}
        />
      )}

      {/* Horizontal connector line */}
      {depth > 0 && (
        <div className="absolute left-4 top-6 w-4 h-0.5 bg-gray-300" />
      )}

      {/* Node content */}
      <div className={clsx('relative', depth > 0 && 'ml-8')}>
        <div
          className={clsx(
            'rounded-lg border-2 p-3 transition-all hover:shadow-md',
            config.borderColor,
            config.lightBg,
            isRunning && 'ring-2 ring-blue-300 ring-offset-1'
          )}
        >
          <div className="flex items-start gap-3">
            {/* Expand/collapse button */}
            {child.hasChildren ? (
              <button
                onClick={handleExpand}
                className="flex-shrink-0 p-1 hover:bg-white rounded"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                ) : isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}

            {/* Status indicator */}
            <div className="relative flex-shrink-0">
              <div
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center',
                  config.bgColor,
                  isRunning && 'animate-pulse'
                )}
              >
                <StatusIcon className="h-4 w-4 text-white" />
              </div>
            </div>

            {/* Content */}
            <Link
              to={`/workflows/${child.id}`}
              className="flex-1 min-w-0 hover:underline"
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">
                  #{child.id}
                </span>
                <span
                  className={clsx(
                    'text-xs font-semibold uppercase px-1.5 py-0.5 rounded',
                    config.lightBg,
                    config.color
                  )}
                >
                  {child.workflow_type}
                </span>
                {child.target_module && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    {child.target_module}
                  </span>
                )}
                {child.hasChildren && (
                  <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                    {child.childCount} children
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-900 line-clamp-1">
                {description}
              </p>
            </Link>

            {/* Time info */}
            <div className="flex-shrink-0 text-right text-xs text-gray-500">
              {child.completed_at ? (
                <span className="text-green-600">
                  {format(parseISO(child.completed_at), 'HH:mm')}
                </span>
              ) : (
                <span>
                  {formatDistanceToNow(parseISO(child.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        {isExpanded && children.length > 0 && (
          <div className="mt-2 space-y-2">
            {children.map((childNode, index) => (
              <LazyTreeNode
                key={childNode.id}
                workflowId={workflowId}
                child={childNode}
                depth={depth + 1}
                isLast={index === children.length - 1 && !hasMore}
              />
            ))}
            {hasMore && (
              <button
                onClick={() => loadChildren(false)}
                disabled={loading}
                className="ml-8 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Stats panel component
function TreeStatsPanel({ stats, onRefresh }: { stats: TreeStats | null; onRefresh: () => void }) {
  if (!stats) return null;

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          <h4 className="font-semibold text-gray-900">Tree Statistics</h4>
        </div>
        <button
          onClick={onRefresh}
          className="p-1 hover:bg-white rounded"
          title="Refresh stats"
        >
          <RefreshCw className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-indigo-600">{stats.totalDescendants}</div>
          <div className="text-xs text-gray-500">Total Workflows</div>
        </div>
        <div className="bg-white rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.maxDepth}</div>
          <div className="text-xs text-gray-500">Max Depth</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Completion</span>
          <span>{stats.completionPercentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${stats.completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <div className="font-bold text-green-600">{stats.statusCounts.completed}</div>
          <div className="text-gray-500">Done</div>
        </div>
        <div>
          <div className="font-bold text-blue-600">{stats.statusCounts.inProgress}</div>
          <div className="text-gray-500">Active</div>
        </div>
        <div>
          <div className="font-bold text-gray-500">{stats.statusCounts.pending}</div>
          <div className="text-gray-500">Pending</div>
        </div>
        <div>
          <div className="font-bold text-red-600">{stats.statusCounts.failed}</div>
          <div className="text-gray-500">Failed</div>
        </div>
      </div>

      {/* Level breakdown (collapsible) */}
      {stats.levelBreakdown.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs font-medium text-gray-700 cursor-pointer hover:text-indigo-600">
            Level breakdown ({stats.levelBreakdown.length} levels)
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto">
            {stats.levelBreakdown.map((level) => (
              <div key={level.level} className="flex items-center gap-2 text-xs py-1 border-b border-gray-100">
                <span className="w-12 text-gray-500">L{level.level}</span>
                <span className="flex-1 font-medium">{level.count} workflows</span>
                <span className="text-green-600">{level.completed}✓</span>
                <span className="text-red-600">{level.failed}✗</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Breadcrumb navigation
function BreadcrumbNav({
  ancestors,
  currentId,
}: {
  ancestors: Ancestor[];
  currentId: number;
}) {
  if (!ancestors || ancestors.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 text-sm overflow-x-auto pb-2">
      <Home className="h-4 w-4 text-gray-400 flex-shrink-0" />
      {ancestors.map((ancestor, index) => (
        <div key={ancestor.id} className="flex items-center gap-1 flex-shrink-0">
          {index > 0 && <ChevronRight className="h-3 w-3 text-gray-300" />}
          {ancestor.id === currentId ? (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
              #{ancestor.id}
            </span>
          ) : (
            <Link
              to={`/workflows/${ancestor.id}`}
              className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs"
            >
              #{ancestor.id}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

// Recursive full tree node component (shows all at once)
function FullTreeNodeView({
  node,
  depth = 0,
  isLast = false,
  collapsedNodes,
  toggleCollapse,
}: {
  node: FullTreeNode;
  depth?: number;
  isLast?: boolean;
  collapsedNodes: Set<number>;
  toggleCollapse: (id: number) => void;
}) {
  const config = getStatusConfig(node.status);
  const StatusIcon = config.icon;
  const isRunning = node.status === 'running' || node.status === 'in_progress' || node.status === 'planning';
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsedNodes.has(node.id);

  return (
    <div className="relative">
      {/* Vertical line from parent */}
      {depth > 0 && (
        <div
          className={clsx(
            'absolute left-4 w-0.5 bg-gray-300',
            isLast ? 'h-5' : 'h-full'
          )}
          style={{ top: '-8px' }}
        />
      )}

      {/* Horizontal connector line */}
      {depth > 0 && (
        <div className="absolute left-4 top-5 w-3 h-0.5 bg-gray-300" />
      )}

      {/* Node content - compact version */}
      <div className={clsx('relative', depth > 0 && 'ml-7')}>
        <div
          className={clsx(
            'rounded border p-2 transition-all hover:shadow-sm flex items-center gap-2',
            config.borderColor,
            config.lightBg,
            isRunning && 'ring-1 ring-blue-300'
          )}
        >
          {/* Expand/collapse button for nodes with children */}
          {hasChildren ? (
            <button
              onClick={() => toggleCollapse(node.id)}
              className="flex-shrink-0 p-0.5 hover:bg-white rounded"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3 text-gray-400" />
              ) : (
                <ChevronDown className="h-3 w-3 text-gray-400" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}

          {/* Status indicator */}
          <div
            className={clsx(
              'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
              config.bgColor,
              isRunning && 'animate-pulse'
            )}
          >
            <StatusIcon className="h-3 w-3 text-white" />
          </div>

          {/* Content */}
          <Link
            to={`/workflows/${node.id}`}
            className="flex-1 min-w-0 hover:underline flex items-center gap-2 flex-wrap"
          >
            <span className="text-xs font-mono bg-white px-1 py-0.5 rounded border border-gray-200">
              #{node.id}
            </span>
            <span
              className={clsx(
                'text-xs font-semibold uppercase px-1 py-0.5 rounded',
                config.lightBg,
                config.color
              )}
            >
              {node.workflow_type}
            </span>
            {node.target_module && (
              <span className="text-xs text-gray-500 bg-gray-100 px-1 py-0.5 rounded truncate max-w-[120px]">
                {node.target_module}
              </span>
            )}
            {hasChildren && (
              <span className="text-xs text-purple-600 bg-purple-50 px-1 py-0.5 rounded">
                {node.children.length}
              </span>
            )}
          </Link>

          {/* Depth indicator */}
          <span className="text-xs text-gray-400 flex-shrink-0">
            L{node.depth}
          </span>
        </div>

        {/* Children - recursively render */}
        {hasChildren && !isCollapsed && (
          <div className="mt-1 space-y-1">
            {node.children.map((child, index) => (
              <FullTreeNodeView
                key={child.id}
                node={child}
                depth={depth + 1}
                isLast={index === node.children.length - 1}
                collapsedNodes={collapsedNodes}
                toggleCollapse={toggleCollapse}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowTreeExplorer({
  workflowId,
  className = '',
}: WorkflowTreeExplorerProps) {
  const [stats, setStats] = useState<TreeStats | null>(null);
  const [children, setChildren] = useState<WorkflowChild[]>([]);
  const [ancestors, setAncestors] = useState<Ancestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Full tree view mode
  const [viewMode, setViewMode] = useState<ViewMode>('lazy');
  const [fullTree, setFullTree] = useState<FullTreeNode | null>(null);
  const [loadingFullTree, setLoadingFullTree] = useState(false);
  const [fullTreeError, setFullTreeError] = useState<string | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<number>>(new Set());

  const toggleCollapse = useCallback((id: number) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    if (!fullTree) return;
    const allIds = new Set<number>();
    const collectIds = (node: FullTreeNode) => {
      if (node.children && node.children.length > 0) {
        allIds.add(node.id);
        node.children.forEach(collectIds);
      }
    };
    collectIds(fullTree);
    setCollapsedNodes(allIds);
  }, [fullTree]);

  const expandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/tree-stats`);
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Failed to load tree stats:', error);
    }
  }, [workflowId]);

  const loadChildren = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    try {
      const response = await fetch(`/api/workflows/${workflowId}/children?limit=30&offset=${currentOffset}`);
      const result = await response.json();
      if (result.success) {
        if (reset) {
          setChildren(result.data.children);
        } else {
          setChildren(prev => [...prev, ...result.data.children]);
        }
        setHasMore(result.data.hasMore);
        setOffset(currentOffset + result.data.children.length);
      }
    } catch (error) {
      console.error('Failed to load children:', error);
    }
  }, [workflowId, offset]);

  const loadAncestors = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/ancestors`);
      const result = await response.json();
      if (result.success) {
        setAncestors(result.data.ancestors);
      }
    } catch (error) {
      console.error('Failed to load ancestors:', error);
    }
  }, [workflowId]);

  const loadFullTree = useCallback(async () => {
    setLoadingFullTree(true);
    setFullTreeError(null);
    try {
      const response = await fetch(`/api/workflows/${workflowId}/full-tree?maxDepth=25&maxNodes=10000`);
      const result = await response.json();
      if (result.success) {
        setFullTree(result.data.tree);
        setViewMode('full');
      } else {
        setFullTreeError(result.error || 'Failed to load full tree');
      }
    } catch (error) {
      console.error('Failed to load full tree:', error);
      setFullTreeError('Failed to load full tree');
    } finally {
      setLoadingFullTree(false);
    }
  }, [workflowId]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`/api/workflows/${workflowId}/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
      const result = await response.json();
      if (result.success) {
        setSearchResults(result.data.results);
      }
    } catch (error) {
      console.error('Failed to search:', error);
    } finally {
      setSearching(false);
    }
  }, [workflowId, searchQuery]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadStats(), loadChildren(true), loadAncestors()]);
      setLoading(false);
    };
    loadData();
  }, [workflowId]);

  if (loading) {
    return (
      <div className={clsx('bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center', className)}>
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Don't show if no children
  if (children.length === 0 && !stats?.totalDescendants) {
    return null;
  }

  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden', className)}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <FolderTree className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Workflow Tree Explorer
              </h3>
              <p className="text-sm text-indigo-200">
                {stats?.totalDescendants || 0} workflows across {stats?.maxDepth || 0} levels
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex bg-white/10 rounded-lg p-1">
              <button
                onClick={() => setViewMode('lazy')}
                className={clsx(
                  'px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1',
                  viewMode === 'lazy'
                    ? 'bg-white text-indigo-600'
                    : 'text-white/80 hover:text-white'
                )}
              >
                <List className="h-4 w-4" />
                Lazy
              </button>
              <button
                onClick={() => {
                  if (!fullTree && !loadingFullTree) {
                    loadFullTree();
                  } else {
                    setViewMode('full');
                  }
                }}
                disabled={loadingFullTree}
                className={clsx(
                  'px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1',
                  viewMode === 'full'
                    ? 'bg-white text-indigo-600'
                    : 'text-white/80 hover:text-white'
                )}
              >
                {loadingFullTree ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TreePine className="h-4 w-4" />
                )}
                Full Tree
              </button>
            </div>

            {stats && (
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{stats.completionPercentage}%</div>
                <div className="text-xs text-indigo-200">Complete</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Breadcrumb */}
        <BreadcrumbNav ancestors={ancestors} currentId={workflowId} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          {/* Main tree view */}
          <div className="lg:col-span-2">
            {/* Search bar */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by ID, module, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </button>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-yellow-800">
                    {searchResults.length} results found
                  </span>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="text-xs text-yellow-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {searchResults.map((result) => (
                    <Link
                      key={result.id}
                      to={`/workflows/${result.id}`}
                      className="block p-2 bg-white rounded hover:bg-yellow-100 text-sm"
                    >
                      <span className="font-mono text-xs">#{result.id}</span>
                      <span className="mx-2 text-gray-400">•</span>
                      <span className={getStatusConfig(result.status).color}>{result.status}</span>
                      <span className="mx-2 text-gray-400">•</span>
                      <span className="text-gray-600">{result.target_module || result.task_description?.slice(0, 50)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Tree - conditional rendering based on view mode */}
            {viewMode === 'lazy' ? (
              <div className="space-y-2">
                {children.map((child, index) => (
                  <LazyTreeNode
                    key={child.id}
                    workflowId={workflowId}
                    child={child}
                    depth={0}
                    isLast={index === children.length - 1 && !hasMore}
                  />
                ))}

                {hasMore && (
                  <button
                    onClick={() => loadChildren(false)}
                    className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 flex items-center justify-center gap-2"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Load more workflows
                  </button>
                )}
              </div>
            ) : (
              <div>
                {/* Full tree controls */}
                {fullTree && (
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={expandAll}
                      className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
                    >
                      <Expand className="h-3 w-3" />
                      Expand All
                    </button>
                    <button
                      onClick={collapseAll}
                      className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
                    >
                      <ChevronRight className="h-3 w-3" />
                      Collapse All
                    </button>
                    <button
                      onClick={loadFullTree}
                      disabled={loadingFullTree}
                      className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
                    >
                      <RefreshCw className={clsx('h-3 w-3', loadingFullTree && 'animate-spin')} />
                      Refresh
                    </button>
                  </div>
                )}

                {/* Error state */}
                {fullTreeError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{fullTreeError}</p>
                    <p className="text-xs text-red-500 mt-1">Try using Lazy mode for large trees.</p>
                  </div>
                )}

                {/* Loading state */}
                {loadingFullTree && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                    <span className="ml-3 text-gray-500">Loading full tree...</span>
                  </div>
                )}

                {/* Full tree view */}
                {fullTree && !loadingFullTree && (
                  <div className="space-y-1 max-h-[600px] overflow-y-auto pr-2">
                    {fullTree.children && fullTree.children.length > 0 ? (
                      fullTree.children.map((child, index) => (
                        <FullTreeNodeView
                          key={child.id}
                          node={child}
                          depth={0}
                          isLast={index === fullTree.children.length - 1}
                          collapsedNodes={collapsedNodes}
                          toggleCollapse={toggleCollapse}
                        />
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm py-4 text-center">No sub-workflows found</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats sidebar */}
          <div className="lg:col-span-1">
            <TreeStatsPanel stats={stats} onRefresh={loadStats} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
        <p className="text-xs text-gray-500 flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          {viewMode === 'lazy'
            ? 'Click expand arrows to lazy-load children. Click workflow IDs to navigate.'
            : 'Full tree view loaded. Use Expand/Collapse All to navigate. Click workflow IDs to view details.'}
        </p>
      </div>
    </div>
  );
}
