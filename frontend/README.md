# Smart Vehicle Repairs - Frontend

Modern React/Next.js frontend for the Smart Vehicle Repairs Management System.

## 🚀 Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **API Client:** Axios with React Query
- **Forms:** React Hook Form + Zod
- **Icons:** Lucide React
- **Charts:** Recharts

## 📦 Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🔧 Configuration

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_APP_NAME=Smart Vehicle Repairs
```

## 📁 Project Structure

```
frontend/
├── app/                    # Next.js app directory
│   ├── (dashboard)/       # Dashboard routes (protected)
│   │   ├── dashboard/     # Dashboard page
│   │   ├── customers/     # Customer management
│   │   ├── vehicles/      # Vehicle management
│   │   └── layout.tsx     # Dashboard layout
│   ├── login/             # Login page
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page (redirects)
│   └── providers.tsx      # React Query provider
├── components/
│   ├── ui/                # Base UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── input.tsx
│   └── layout/            # Layout components
│       ├── Navbar.tsx
│       ├── Sidebar.tsx
│       └── DashboardLayout.tsx
├── lib/
│   ├── api/               # API client and endpoints
│   │   ├── client.ts      # Axios instance
│   │   ├── auth.ts        # Auth API
│   │   └── customers.ts   # Customers API
│   └── utils/             # Utility functions
│       └── cn.ts          # Class name utility
└── store/                 # Zustand stores
    └── authStore.ts       # Authentication store
```

## 🔐 Authentication

The app uses JWT authentication with automatic token refresh:

1. User logs in via `/login`
2. Tokens are stored in localStorage
3. API client automatically adds Bearer token to requests
4. Token refresh happens automatically on 401 errors
5. User is redirected to login if refresh fails

## 🎨 UI Components

Reusable components are in `components/ui/`:

- `Button` - Various button styles
- `Card` - Card container with header, content, footer
- `Input` - Form input field

## 📡 API Integration

API calls are made through React Query hooks:

```typescript
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";

function CustomerList() {
  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list(),
  });
  
  // ...
}
```

## 🛣️ Routing

- `/` - Redirects to dashboard
- `/login` - Login page
- `/dashboard` - Main dashboard (protected)
- `/customers` - Customer management (protected)
- `/vehicles` - Vehicle management (protected)
- `/appointments` - Appointment scheduling (protected)
- `/workorders` - Work order management (protected)
- `/inventory` - Inventory management (protected)
- `/billing` - Billing & invoicing (protected)
- `/inspections` - Vehicle inspections (protected)
- `/reports` - Reports & analytics (protected)
- `/notifications` - Notifications center (protected)

## 🚧 Development Status

### ✅ Completed
- Project setup with Next.js 16
- Authentication flow (login, token management)
- Base layout (Navbar, Sidebar)
- Dashboard page structure
- API client with auto token refresh
- UI components (Button, Card, Input)

### 🚧 In Progress
- Customer management pages
- Vehicle management pages
- Appointment scheduling
- Work order management

### 📋 TODO
- Complete all feature pages
- Add charts and visualizations
- Implement real-time updates
- Add error boundaries
- Add loading states
- Mobile responsiveness improvements
- Add tests

## 🔗 Backend API

The frontend connects to the Django REST API at `http://localhost:8000/api`.

Make sure the Django backend is running before starting the frontend.

## 📝 Notes

- The app uses the App Router (Next.js 13+)
- All API calls go through React Query for caching and state management
- Authentication state is managed with Zustand
- Components are client-side by default (use "use client" directive)
