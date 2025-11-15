# Quick Start Guide - React Frontend

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment

Create a `.env.local` file (if not already created):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_APP_NAME=Smart Vehicle Repairs
```

### 3. Start Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

### 4. Start Django Backend

In a separate terminal, make sure your Django backend is running:

```bash
cd /home/dev/smart_vehicle_repairs_system
python manage.py runserver
```

The backend should be running at `http://localhost:8000`

## 🔐 First Login

1. Navigate to `http://localhost:3000`
2. You'll be redirected to `/login`
3. Use your Django superuser credentials:
   - Email: (your superuser email)
   - Password: (your superuser password)

## 📁 Project Structure

```
frontend/
├── app/                    # Next.js pages
│   ├── (dashboard)/       # Protected routes
│   │   ├── dashboard/     # Dashboard page
│   │   ├── customers/     # Customer management
│   │   └── layout.tsx     # Dashboard layout wrapper
│   ├── login/             # Login page
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/               # Base UI components
│   └── layout/           # Layout components
├── lib/                  # Utilities
│   ├── api/             # API clients
│   └── utils/           # Helper functions
└── store/               # Zustand stores
```

## 🎨 Available Pages

- `/` - Redirects to dashboard
- `/login` - Login page
- `/dashboard` - Main dashboard
- `/customers` - Customer list
- More pages coming soon...

## 🔧 Development Tips

### Adding a New Page

1. Create a new file in `app/(dashboard)/your-page/page.tsx`
2. It will automatically be protected by the dashboard layout
3. Add a link in `components/layout/Sidebar.tsx`

### Adding API Endpoints

1. Create a new file in `lib/api/your-feature.ts`
2. Use the `apiClient` from `lib/api/client.ts`
3. Use React Query hooks in your components

### Styling

- Use Tailwind CSS classes
- Reusable components in `components/ui/`
- Utility function `cn()` for conditional classes

## 🐛 Troubleshooting

### CORS Errors

Make sure your Django backend has CORS configured in `settings.py`:

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]
```

### Authentication Issues

- Check that tokens are being stored in localStorage
- Verify API URL in `.env.local`
- Check browser console for errors

### API Connection Issues

- Ensure Django backend is running on port 8000
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Verify API endpoints in Django admin

## 📚 Next Steps

1. ✅ Project setup complete
2. ✅ Authentication working
3. ✅ Dashboard structure ready
4. 🚧 Build out feature pages (customers, vehicles, etc.)
5. 🚧 Add charts and visualizations
6. 🚧 Implement real-time updates
7. 🚧 Add error boundaries
8. 🚧 Write tests

## 🆘 Need Help?

- Check the main `README.md` for detailed documentation
- Review the Django backend API at `http://localhost:8000/api/docs/`
- Check browser console for errors
- Review Next.js documentation: https://nextjs.org/docs

