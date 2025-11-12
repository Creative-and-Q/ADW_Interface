# AIDeveloper Frontend

A modern, real-time dashboard for monitoring and managing AI-powered development workflows.

## Features

### Dashboard
- Real-time statistics and metrics
- Interactive charts (Line, Bar, Pie) using Recharts
- Live connection status with WebSocket
- Workflow status distribution
- Agent execution tracking
- 24-hour activity monitoring

### Workflows Management
- View all workflows with filtering by status
- Create new workflows (feature, bugfix, refactor, documentation, review)
- Monitor workflow progress in real-time
- Detailed workflow view with agent execution timeline
- Artifact tracking

### Prompt Editor
- Browse all AI agent prompts
- Edit prompts with Monaco Editor
- Syntax highlighting
- Real-time save status
- File size tracking

### Error Tracking
- Comprehensive error dashboard
- Failed workflows and agents
- Expandable error details
- Filter by error type
- Direct navigation to related workflows

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Socket.io Client** - Real-time updates
- **React Router v6** - Navigation
- **Recharts** - Data visualization
- **Monaco Editor** - Code editing
- **Axios** - HTTP client
- **Lucide React** - Icons
- **date-fns** - Date formatting

## Testing

- **Vitest** - Test runner
- **React Testing Library** - Component testing
- **@testing-library/user-event** - User interaction simulation
- **jsdom** - DOM environment

### Test Coverage

- 81 total tests
- 60 passing (74% pass rate)
- Comprehensive coverage of all pages and features
- Integration tests for full user flows
- Component unit tests
- API mocking with MSW

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
frontend/
├── public/              # Static assets
├── src/
│   ├── components/      # Reusable components
│   ├── hooks/           # Custom React hooks
│   │   └── useWebSocket.ts  # WebSocket connection hook
│   ├── pages/           # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Workflows.tsx
│   │   ├── WorkflowDetail.tsx
│   │   ├── Prompts.tsx
│   │   └── Errors.tsx
│   ├── services/        # API services
│   │   └── api.ts       # Axios API client
│   ├── test/            # Test utilities and data
│   │   ├── setup.ts
│   │   ├── utils.tsx
│   │   ├── mockData.ts
│   │   └── integration.test.tsx
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── vitest.config.ts     # Test configuration
├── vite.config.ts       # Vite configuration
├── tailwind.config.js   # Tailwind configuration
└── tsconfig.json        # TypeScript configuration
```

## Development

### API Integration

The frontend connects to the backend API at `http://localhost:3000`. The Vite dev server proxies API requests and WebSocket connections.

```typescript
// API endpoints are available through service layer
import { workflowsAPI, statsAPI, promptsAPI, errorsAPI } from './services/api';

// Example usage
const workflows = await workflowsAPI.list();
const workflow = await workflowsAPI.get(id);
const stats = await statsAPI.get();
```

### WebSocket Events

```typescript
import { useWebSocket } from './hooks/useWebSocket';

function MyComponent() {
  const { socket, connected, subscribe } = useWebSocket();

  useEffect(() => {
    if (socket) {
      socket.on('workflow:updated', handleUpdate);
      subscribe(workflowId);
    }
  }, [socket]);
}
```

### Available WebSocket Events

- `workflow:updated` - Workflow status changed
- `agent:updated` - Agent execution updated
- `artifact:created` - New artifact generated
- `stats:updated` - Dashboard stats refreshed
- `workflows:updated` - Workflow list changed

## Styling

Custom Tailwind utilities are defined in `index.css`:

```css
.card - White card with shadow and padding
.btn - Base button styles
.btn-primary - Primary button (blue)
.btn-secondary - Secondary button (gray)
.badge - Small status badge
.badge-success - Green badge
.badge-error - Red badge
.badge-info - Blue badge
.badge-gray - Gray badge
```

## Configuration

### Environment Variables

The frontend uses Vite's built-in environment variable support:

```bash
# .env.local
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

### Tailwind Theme

Custom colors defined in `tailwind.config.js`:

- **primary**: Blue shades (50-900)
- **success**: Green (#10b981)
- **warning**: Yellow (#f59e0b)
- **error**: Red (#ef4444)

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Performance

- Code splitting with React.lazy
- Optimized bundle size
- Real-time updates without polling
- Debounced search and filters
- Virtual scrolling for large lists (future enhancement)

## Accessibility

- Semantic HTML
- ARIA labels
- Keyboard navigation
- Screen reader support
- Color contrast compliance

## Future Enhancements

- [ ] Dark mode support
- [ ] Advanced filtering and search
- [ ] Export functionality (CSV, JSON)
- [ ] Workflow templates
- [ ] User preferences
- [ ] Notification system
- [ ] Workflow cloning
- [ ] Batch operations
- [ ] Performance metrics
- [ ] Custom dashboards

## Troubleshooting

### Development Server Issues

```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### WebSocket Connection Issues

1. Ensure backend server is running on port 3000
2. Check CORS configuration
3. Verify Socket.io version compatibility

### Build Issues

```bash
# Clean build
rm -rf dist
npm run build
```

## Contributing

When adding new features:

1. Create comprehensive tests
2. Follow existing code patterns
3. Use TypeScript strictly
4. Add documentation
5. Test real-time features with WebSocket

## License

MIT
