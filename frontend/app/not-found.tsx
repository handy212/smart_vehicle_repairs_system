"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-gray-300">404</h1>
          <h2 className="text-3xl font-bold text-gray-900 mt-4">Page Not Found</h2>
          <p className="text-gray-600 mt-2">
            Sorry, we couldn't find the page you're looking for.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm p-6 text-left">
            <p className="text-sm text-gray-600 mb-4">
              The page you're trying to access doesn't exist or has been moved.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                Check the URL for typos
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                The page may have been deleted or moved
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                You may not have permission to access this page
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => window.history.back()} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Link href="/dashboard">
              <Button>
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Button>
            </Link>
          </div>

          <div className="pt-4">
            <Link
              href="/dashboard"
              className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center"
            >
              <Search className="w-4 h-4 mr-1" />
              Or search for what you need
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

