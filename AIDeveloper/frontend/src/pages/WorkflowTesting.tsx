import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface TestResult {
  moduleName: string;
  testName: string;
  status: 'running' | 'passed' | 'failed' | 'pending';
  duration?: number;
  error?: string;
  output?: string;
}

interface AgentModule {
  name: string;
  category: string;
  tests: string[];
}

const AGENT_MODULES: AgentModule[] = [
  {
    name: 'CodeDocumentationAgent',
    category: 'AI Agents',
    tests: ['execute', 'parseInput', 'generateDocs'],
  },
  {
    name: 'CodePlannerAgent',
    category: 'AI Agents',
    tests: ['execute', 'parseInput', 'generatePlan'],
  },
  {
    name: 'CodeReviewAgent',
    category: 'AI Agents',
    tests: ['execute', 'parseInput', 'reviewCode'],
  },
  {
    name: 'CodeTestingAgent',
    category: 'AI Agents',
    tests: ['execute', 'parseInput', 'generateTests'],
  },
  {
    name: 'CodingAgent',
    category: 'AI Agents',
    tests: ['execute', 'parseInput', 'generateCode'],
  },
  {
    name: 'ModuleImportAgent',
    category: 'Agents',
    tests: ['execute', 'analyzeModule', 'generateConfig'],
  },
  {
    name: 'WorkflowOrchestrator',
    category: 'Workflow Management',
    tests: ['execute', 'parseInput', 'orchestrate'],
  },
];

export default function WorkflowTesting() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string>('all');

  const runTests = async (moduleName: string) => {
    const module = AGENT_MODULES.find((m) => m.name === moduleName);
    if (!module) return;

    // Set all tests for this module to running
    const newResults: TestResult[] = module.tests.map((testName) => ({
      moduleName,
      testName,
      status: 'running' as const,
    }));

    setTestResults((prev) => [
      ...prev.filter((r) => r.moduleName !== moduleName),
      ...newResults,
    ]);

    // Run each test
    for (const testName of module.tests) {
      try {
        const startTime = Date.now();
        const response = await axios.post(`/api/modules/${moduleName}/test/${testName}`);
        const duration = Date.now() - startTime;

        setTestResults((prev) =>
          prev.map((r) =>
            r.moduleName === moduleName && r.testName === testName
              ? {
                  ...r,
                  status: response.data.success ? 'passed' : 'failed',
                  duration,
                  output: response.data.output,
                  error: response.data.error,
                }
              : r
          )
        );
      } catch (error: any) {
        const duration = Date.now() - Date.now();
        setTestResults((prev) =>
          prev.map((r) =>
            r.moduleName === moduleName && r.testName === testName
              ? {
                  ...r,
                  status: 'failed',
                  duration,
                  error: error.message || 'Test failed',
                }
              : r
          )
        );
      }
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setTestResults([]);

    for (const module of AGENT_MODULES) {
      if (selectedModule !== 'all' && selectedModule !== module.name) {
        continue;
      }
      await runTests(module.name);
    }

    setIsRunning(false);
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return 'text-blue-600 bg-blue-100';
      case 'passed':
        return 'text-green-600 bg-green-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return '⏳';
      case 'passed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '⏸️';
    }
  };

  const groupedResults = testResults.reduce((acc, result) => {
    if (!acc[result.moduleName]) {
      acc[result.moduleName] = [];
    }
    acc[result.moduleName].push(result);
    return acc;
  }, {} as Record<string, TestResult[]>);

  const totalTests = testResults.length;
  const passedTests = testResults.filter((r) => r.status === 'passed').length;
  const failedTests = testResults.filter((r) => r.status === 'failed').length;
  const runningTests = testResults.filter((r) => r.status === 'running').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Workflow Agent Testing
        </h1>
        <p className="text-gray-600">
          Run unit tests for all workflow agent modules
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <label className="text-sm font-medium text-gray-700">
            Select Module:
          </label>
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isRunning}
          >
            <option value="all">All Modules</option>
            {AGENT_MODULES.map((module) => (
              <option key={module.name} value={module.name}>
                {module.name}
              </option>
            ))}
          </select>

          <button
            onClick={runAllTests}
            disabled={isRunning}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              isRunning
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isRunning ? 'Running Tests...' : 'Run Tests'}
          </button>

          {testResults.length > 0 && (
            <button
              onClick={() => setTestResults([])}
              disabled={isRunning}
              className="px-4 py-2 rounded-md font-medium bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
            >
              Clear Results
            </button>
          )}
        </div>

        {/* Stats */}
        {testResults.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{totalTests}</div>
              <div className="text-sm text-gray-600">Total Tests</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{passedTests}</div>
              <div className="text-sm text-green-600">Passed</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{failedTests}</div>
              <div className="text-sm text-red-600">Failed</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{runningTests}</div>
              <div className="text-sm text-blue-600">Running</div>
            </div>
          </div>
        )}
      </div>

      {/* Test Results */}
      {Object.keys(groupedResults).length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedResults).map(([moduleName, results]) => (
            <div key={moduleName} className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">{moduleName}</h2>
                <p className="text-sm text-gray-600">
                  {results.filter((r) => r.status === 'passed').length} / {results.length} tests passed
                </p>
              </div>
              <div className="divide-y divide-gray-200">
                {results.map((result, idx) => (
                  <div key={idx} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getStatusIcon(result.status)}</span>
                        <div>
                          <div className="font-medium text-gray-900">{result.testName}</div>
                          {result.duration !== undefined && (
                            <div className="text-sm text-gray-500">{result.duration}ms</div>
                          )}
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                          result.status
                        )}`}
                      >
                        {result.status.toUpperCase()}
                      </span>
                    </div>
                    {result.error && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                        <div className="text-sm font-medium text-red-800 mb-1">Error:</div>
                        <div className="text-sm text-red-700 font-mono">{result.error}</div>
                      </div>
                    )}
                    {result.output && (
                      <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                        <div className="text-sm font-medium text-gray-800 mb-1">Output:</div>
                        <div className="text-sm text-gray-700 font-mono whitespace-pre-wrap">
                          {result.output}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {testResults.length === 0 && !isRunning && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">🧪</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Tests Run Yet</h3>
          <p className="text-gray-600">
            Select a module and click "Run Tests" to begin testing
          </p>
        </div>
      )}
    </div>
  );
}
