# Auto-Fix Monitoring Guide

Comprehensive guide for monitoring auto-fix operations in real-time from your frontend application.

## Overview

The auto-fix monitoring system provides complete visibility into:
- **Active auto-fix operations** with real-time progress
- **Historical attempts** with success/failure metrics
- **Detailed diagnostics** for each fix attempt
- **WebSocket updates** for live status changes

## Quick Start

### 1. Add the AutoFixMonitor Component

```tsx
import AutoFixMonitor from './components/AutoFixMonitor';

function App() {
  return (
    <div>
      <AutoFixMonitor />
    </div>
  );
}
```

### 2. Access the Monitor

Navigate to the auto-fix monitor page in your application. The monitor will automatically:
- Fetch current status every 5 seconds (when auto-refresh is enabled)
- Display active auto-fixes with progress bars
- Show recent history with success/failure indicators
- Update in real-time via WebSocket events

## API Endpoints

### Get Summary Statistics

```bash
GET /api/auto-fix/summary
```

**Response:**
```json
{
  "totalAttempts": 10,
  "activeAttempts": 2,
  "successfulAttempts": 7,
  "failedAttempts": 1,
  "recentAttempts": [...]
}
```

### Get Active Auto-Fixes

```bash
GET /api/auto-fix/active
```

**Response:**
```json
{
  "count": 2,
  "attempts": [
    {
      "id": "autofix-104-1700000000000",
      "workflowId": 104,
      "status": "investigating",
      "progress": {
        "stage": "Analyzing failure",
        "percentage": 35,
        "message": "Reading logs and error messages..."
      },
      "startedAt": "2025-11-16T10:00:00.000Z",
      "pid": 12345
    }
  ]
}
```

### Get Auto-Fix History

```bash
GET /api/auto-fix/history?limit=20
```

**Response:**
```json
{
  "count": 20,
  "attempts": [...]
}
```

### Get Specific Attempt

```bash
GET /api/auto-fix/autofix-104-1700000000000
```

**Response:**
```json
{
  "attempt": {
    "id": "autofix-104-1700000000000",
    "workflowId": 104,
    "status": "success",
    "rootCause": "Missing dompurify dependency",
    "fixDescription": "Added dompurify to package.json",
    "commitHash": "a1b2c3d",
    "newWorkflowId": 105,
    "duration": 45000,
    ...
  }
}
```

### Get Auto-Fix for Specific Workflow

```bash
GET /api/workflows/104/auto-fix/status
```

**Response:**
```json
{
  "workflowId": 104,
  "attempts": [...],
  "totalAttempts": 3
}
```

## WebSocket Events

The monitor subscribes to these real-time events:

### `autofix:started`

Fired when an auto-fix process starts.

```javascript
{
  "attemptId": "autofix-104-1700000000000",
  "workflowId": 104,
  "timestamp": "2025-11-16T10:00:00.000Z"
}
```

### `autofix:progress`

Fired when progress is made.

```javascript
{
  "attemptId": "autofix-104-1700000000000",
  "workflowId": 104,
  "progress": {
    "stage": "Generating fix",
    "percentage": 60,
    "message": "Applying code changes..."
  },
  "status": "fixing"
}
```

### `autofix:completed`

Fired when auto-fix succeeds.

```javascript
{
  "attemptId": "autofix-104-1700000000000",
  "workflowId": 104,
  "status": "success",
  "duration": 45000
}
```

### `autofix:failed`

Fired when auto-fix fails.

```javascript
{
  "attemptId": "autofix-104-1700000000000",
  "workflowId": 104,
  "error": "Failed to apply fix",
  "duration": 30000
}
```

### `autofix:updated`

Fired when attempt status is updated.

```javascript
{
  "attemptId": "autofix-104-1700000000000",
  "workflowId": 104,
  "commitHash": "a1b2c3d",
  "newWorkflowId": 105
}
```

## Component Features

### Summary Dashboard

Displays high-level metrics:
- Total attempts (all time)
- Active auto-fixes (currently running)
- Successful attempts
- Failed attempts

### Active Auto-Fixes

Shows real-time status for running auto-fixes:
- **Progress bars** with percentage complete
- **Stage indicators** (investigating, fixing, testing, etc.)
- **Live updates** via WebSocket
- **Process ID** for debugging
- **Click to view** detailed information

### History Table

Browse all previous auto-fix attempts:
- Workflow ID and status
- Start time and duration
- Success/failure outcome
- Links to new workflows created
- View details button for full diagnostics

### Details Panel

Click any attempt to see:
- Complete timeline
- Root cause analysis
- Fix description
- Commit hash
- Link to new workflow
- Error messages (if failed)
- Process information

## Usage Examples

### Basic Monitoring

```tsx
import AutoFixMonitor from './components/AutoFixMonitor';

function MonitoringPage() {
  return (
    <div className="page">
      <h1>Auto-Fix Operations</h1>
      <AutoFixMonitor />
    </div>
  );
}
```

### Embed in Workflow Page

```tsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function WorkflowPage({ workflowId }) {
  const [autoFixStatus, setAutoFixStatus] = useState([]);

  useEffect(() => {
    const fetchStatus = async () => {
      const response = await axios.get(
        `/api/workflows/${workflowId}/auto-fix/status`
      );
      setAutoFixStatus(response.data.attempts);
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [workflowId]);

  return (
    <div>
      <h2>Workflow #{workflowId}</h2>

      {autoFixStatus.length > 0 && (
        <div className="auto-fix-status">
          <h3>Auto-Fix Attempts</h3>
          {autoFixStatus.map(attempt => (
            <div key={attempt.id}>
              Status: {attempt.status}
              {attempt.progress && (
                <div>Progress: {attempt.progress.percentage}%</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Real-Time WebSocket Integration

```tsx
import { useEffect } from 'react';
import io from 'socket.io-client';

function useAutoFixSocket() {
  useEffect(() => {
    const socket = io('http://localhost:3000');

    socket.on('autofix:started', (data) => {
      console.log('Auto-fix started:', data);
      // Update UI
    });

    socket.on('autofix:progress', (data) => {
      console.log('Progress update:', data);
      // Update progress bar
    });

    socket.on('autofix:completed', (data) => {
      console.log('Auto-fix completed:', data);
      // Show success notification
    });

    socket.on('autofix:failed', (data) => {
      console.log('Auto-fix failed:', data);
      // Show error notification
    });

    return () => {
      socket.disconnect();
    };
  }, []);
}
```

## Status Indicators

| Status | Color | Meaning |
|--------|-------|---------|
| `pending` | Yellow | Queued, waiting to start |
| `running` | Blue | Process spawned, initializing |
| `investigating` | Blue (pulsing) | Analyzing failure logs |
| `fixing` | Blue (pulsing) | Generating and applying fix |
| `testing` | Blue (pulsing) | Running tests on fix |
| `success` | Green | Fix applied successfully |
| `failed` | Red | Fix attempt failed |

## Troubleshooting

### Monitor Not Showing Active Auto-Fixes

1. Check auto-fix is enabled:
   ```bash
   curl http://localhost:3000/api/auto-fix/config
   ```

2. Verify auto-fix process is running:
   ```bash
   ps aux | grep auto-fix
   ```

3. Check logs:
   ```bash
   tail -f AIDeveloper/logs/combined-*.log | grep auto-fix
   ```

### WebSocket Not Connecting

1. Verify Socket.IO server is running
2. Check browser console for connection errors
3. Ensure CORS is configured correctly
4. Try connecting manually:
   ```javascript
   const socket = io('http://localhost:3000');
   socket.on('connect', () => console.log('Connected!'));
   ```

### No History Showing

History is stored in memory and will be lost on server restart. For persistent history, consider implementing database storage.

## Performance Considerations

- **Auto-refresh**: 5-second polling interval (adjustable)
- **WebSocket**: Real-time updates (no polling needed for active fixes)
- **History limit**: Default 50 items (configurable via API)
- **Memory usage**: In-memory storage clears on restart

## Future Enhancements

- [ ] Database persistence for history
- [ ] Export history to CSV
- [ ] Filter by status/date range
- [ ] Email/Slack notifications
- [ ] Metrics dashboard with charts
- [ ] Auto-fix success rate analytics

## Support

For issues or questions:
- Check logs: `AIDeveloper/logs/`
- Review documentation: `docs/AUTO_FIX_SYSTEM.md`
- Open an issue on GitHub
