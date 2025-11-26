# Frontend Testing Guide

This document explains the testing setup and how to write and run tests for the Smart Vehicle Repairs frontend application.

## Testing Stack

- **Test Runner**: [Vitest](https://vitest.dev/) - Fast, Vite-native unit test framework
- **Testing Library**: [@testing-library/react](https://testing-library.com/react) - For component testing
- **Mocking**: Vitest's built-in mocking capabilities
- **Environment**: jsdom for DOM simulation

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with UI interface
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Test Structure

Tests are organized in the `__tests__` directory:

```
__tests__/
├── api/              # API client tests
│   └── auth.test.ts
├── components/       # Component integration tests
│   └── Navbar.test.tsx
└── ...
```

## Writing Tests

### API Client Tests

API tests mock axios and verify that API functions make correct HTTP requests:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authApi } from '@/lib/api/auth';

describe('Auth API', () => {
  it('should login successfully', async () => {
    // Test implementation
  });
});
```

### Component Tests

Component tests use React Testing Library to test user interactions:

```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Mocking

The test setup automatically mocks:
- Next.js `useRouter`, `usePathname`, `useSearchParams`
- Next.js `Link` component
- Environment variables

To mock additional modules:

```typescript
vi.mock('@/lib/api/myApi', () => ({
  myApi: {
    getData: vi.fn(() => Promise.resolve({ data: 'test' })),
  },
}));
```

## Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the user sees and does
2. **Use Data Test IDs Sparingly**: Prefer querying by role, label, or text
3. **Mock External Dependencies**: API calls, third-party libraries
4. **Keep Tests Isolated**: Each test should be independent
5. **Use Descriptive Test Names**: Clearly describe what is being tested

## Coverage Goals

- **Unit Tests**: Aim for 80%+ coverage on utility functions and API clients
- **Integration Tests**: Cover critical user flows (login, dashboard, CRUD operations)
- **Component Tests**: Test all interactive components

## Continuous Integration

Tests run automatically on every push and pull request via GitHub Actions. See `.github/workflows/frontend-ci.yml` for the CI configuration.

## Troubleshooting

### Tests Fail Locally But Pass in CI
- Ensure you're using the same Node version (20.x)
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### Async Tests Timeout
- Increase timeout in vitest.config.ts
- Use `waitFor` for async operations

### Mock Not Working
- Ensure mocks are defined before imports
- Use `vi.clearAllMocks()` in `beforeEach`

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
