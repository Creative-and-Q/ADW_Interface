import { Link } from 'react-router-dom';
import { ArrowLeft, Bot } from 'lucide-react';

export default function AIAgent() {
  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/chains" className="btn btn-secondary btn-sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Chains
          </Link>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">AI Agent</h2>
            <p className="mt-1 text-sm text-gray-500">
              Natural language chain creation assistant
            </p>
          </div>
        </div>
      </div>

      {/* Coming Soon Card */}
      <div className="card text-center py-12">
        <Bot className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-2xl font-semibold text-gray-900 mb-2">
          AI Agent Coming Soon
        </h3>
        <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
          The AI Agent is an intelligent assistant that will help you create chains using natural
          language. Simply describe what you want to accomplish, and the AI will build the chain
          for you automatically.
        </p>
        <div className="space-y-2 text-left max-w-2xl mx-auto">
          <h4 className="font-semibold text-gray-900 mb-2">Planned Features:</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
            <li>Natural language chain creation from descriptions</li>
            <li>Interactive chat interface for refinement</li>
            <li>Automatic module endpoint selection</li>
            <li>Smart variable mapping and templating</li>
            <li>Suggested conditional routing rules</li>
            <li>Chain optimization recommendations</li>
            <li>Test data generation</li>
            <li>Documentation generation</li>
          </ul>
        </div>
        <div className="mt-8 space-x-4">
          <Link to="/chains/builder" className="btn btn-primary inline-flex items-center">
            Try Manual Chain Builder
          </Link>
          <Link to="/chains/list" className="btn btn-secondary inline-flex items-center">
            View Existing Chains
          </Link>
        </div>
      </div>
    </div>
  );
}
