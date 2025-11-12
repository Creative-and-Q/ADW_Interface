import { Link } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';

export default function ChainBuilder() {
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
            <h2 className="text-3xl font-bold text-gray-900">Chain Builder</h2>
            <p className="mt-1 text-sm text-gray-500">
              Visual chain editor and execution interface
            </p>
          </div>
        </div>
      </div>

      {/* Coming Soon Card */}
      <div className="card text-center py-12">
        <Construction className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-2xl font-semibold text-gray-900 mb-2">
          Chain Builder Coming Soon
        </h3>
        <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
          The Chain Builder is a complex component currently being migrated from Vue.js to React.
          This powerful visual editor will allow you to create, edit, and execute chains with an
          intuitive drag-and-drop interface.
        </p>
        <div className="space-y-2 text-left max-w-2xl mx-auto">
          <h4 className="font-semibold text-gray-900 mb-2">Planned Features:</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
            <li>Visual step editor with drag-and-drop reordering</li>
            <li>Module endpoint browser and selection</li>
            <li>Variable templating with auto-completion</li>
            <li>Conditional routing rule builder</li>
            <li>Output template designer</li>
            <li>Real-time chain validation</li>
            <li>Chain execution with live progress tracking</li>
            <li>Step-by-step execution results</li>
          </ul>
        </div>
        <div className="mt-8">
          <Link to="/chains/list" className="btn btn-primary inline-flex items-center">
            View Existing Chains
          </Link>
        </div>
      </div>
    </div>
  );
}
